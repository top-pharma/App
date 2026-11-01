/**
 * @file stockService.js
 * @description
 * طبقة الخدمات للمخزون (Stock).
 * تُغلّف منطق الصرف (Issue) والإرجاع (Return) والتحقق من التوفر (Availability).
 *
 * لماذا هذا الملف؟
 * - الـ Controllers (Invoice, CustomerReturn, PurchaseReceipt) لا يجب أن تعرف
 *   تفاصيل تعديل الكميات على الدفعات.
 * - يمنع تكرار منطق الصرف (FEFO + Stock.update) في كل Controller.
 * - يوفّر عمليات "تبدو ذرّية" (Atomic-like) رغم عدم دعم Transactions
 *   في MongoDB standalone. عند الفشل، نُسجّل الخطأ ونرميه لتتوقف العملية.
 * - يعتمد على `selectFEFO` من `stockController.js` لتفادي تكرار منطق الاختيار.
 *
 * ⚠️ ملاحظة معمارية:
 * - في Refactor مستقبلي، يُفضّل نقل `selectFEFO` إلى هذا الـ Service،
 *   وجعل `stockController` يستدعيه. حالياً نحترم كود Phase 1 المُنجز.
 */

import { Stock } from '../models/Stock.js';
import { Warehouse } from '../models/Warehouse.js';
import { selectFEFO } from '../controllers/stockController.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { logger } from '../utils/logger.js';

// ============================================================
// Helpers
// ============================================================

/**
 * التحقق من وجود المخزن ونشاطه.
 *
 * @async
 * @param {string} warehouseId
 * @returns {Promise<import('mongoose').Document>}
 * @throws {AppError} WAREHOUSE_NOT_FOUND
 */
const ensureWarehouseActive = async (warehouseId) => {
  const warehouse = await Warehouse.findOne({ _id: warehouseId, isActive: true })
    .select('_id name code')
    .lean();
  if (!warehouse) {
    throw new AppError('المخزن غير موجود أو معطّل.', 400, 'WAREHOUSE_NOT_FOUND');
  }
  return warehouse;
};

// ============================================================
// 1) الصرف (Issue) — للفواتير وإيصالات التسليم
// ============================================================

/**
 * صرف كمية من صنف واحد (سطر فاتورة واحد).
 *
 * الخطوات:
 * 1. اختيار الدفعات بـ FEFO عبر `selectFEFO` (المُصدَّرة من stockController).
 * 2. خصم الكمية من كل دفعة (بالتسلسل، بلا Transactions).
 * 3. تحديث `lastIssuedAt` لكل دفعة.
 *
 * @async
 * @param {Object} params
 * @param {string} params.itemId - معرف الصنف.
 * @param {string} params.warehouseId - معرف المخزن.
 * @param {number} params.quantity - الكمية المطلوبة (بالوحدة الأساسية).
 * @param {boolean} [params.allowExpired=false] - السماح بصرف دفعات منتهية (نادراً).
 * @returns {Promise<Array<{stockId, batch, expiry, quantity, unitCost}>>}
 *   قائمة الدفعات التي صُرفت من كل منها (تُحفظ في الفاتورة كـ items).
 * @throws {AppError} INSUFFICIENT_STOCK | WAREHOUSE_NOT_FOUND | ISSUE_FAILED
 *
 * @example
 * const issued = await issueStock({
 *   itemId: item._id,
 *   warehouseId: invoice.warehouse,
 *   quantity: 120,
 * });
 * // issued = [
 * //   { stockId, batch: 'B-001', expiry, quantity: 50, unitCost },
 * //   { stockId, batch: 'B-002', expiry, quantity: 70, unitCost },
 * // ]
 */
export async function issueStock({ itemId, warehouseId, quantity, allowExpired = false }) {
  if (!itemId || !warehouseId || !quantity || quantity <= 0) {
    throw new AppError('بيانات صرف المخزون غير مكتملة.', 400, 'INVALID_ISSUE_INPUT');
  }

  // 1) التأكد من وجود المخزن.
  await ensureWarehouseActive(warehouseId);

  // 2) اختيار الدفعات بـ FEFO (يرمي INSUFFICIENT_STOCK إن لم تكفِ).
  const selectedBatches = await selectFEFO(itemId, warehouseId, quantity, {
    includeExpired: allowExpired,
  });

  // 3) خصم الكميات بالتسلسل (لأن MongoDB standalone لا يدعم Transactions).
  const now = new Date();
  const issued = [];

  for (const batch of selectedBatches) {
    try {
      // نستخدم updateOne مع شرط quantity >= take لضمان عدم الصرف المزدوج
      // في حال طلبات متزامنة (Race Condition Guard).
      const result = await Stock.updateOne(
        {
          _id: batch.stockId,
          quantity: { $gte: batch.quantity },
        },
        {
          $inc: { quantity: -batch.quantity },
          $set: { lastIssuedAt: now },
        }
      );

      if (result.modifiedCount !== 1) {
        // فشل التعديل (سباق أو تغيير خارجي).
        logger.error(
          `فشل خصم دفعة ${batch.batch}: modifiedCount=${result.modifiedCount}`
        );
        throw new AppError(
          `فشل خصم الدفعة ${batch.batch} — قد يكون هناك طلب متزامن. أعد المحاولة.`,
          409,
          'ISSUE_CONFLICT'
        );
      }

      issued.push({
        stockId: batch.stockId,
        batch: batch.batch,
        expiry: batch.expiry,
        quantity: batch.quantity,
        unitCost: batch.unitCost || 0,
      });
    } catch (error) {
      logger.error(`خطأ أثناء خصم دفعة ${batch.batch}: ${error.message}`);
      // نرمي الخطأ كـ AppError ليصل للـ Controller بشكل موحّد.
      if (error instanceof AppError) throw error;
      throw new AppError('فشل صرف المخزون. أعد المحاولة.', 500, 'ISSUE_FAILED');
    }
  }

  return issued;
}

// ============================================================
// 2) الإرجاع (Return) — للمرتجعات
// ============================================================

/**
 * إرجاع كمية إلى دفعة محددة (مرتجع عميل أو مرتجع مورد).
 *
 * المنطق:
 * 1. البحث عن الدفعة بنفس (item + batch + warehouse).
 * 2. إن وُجدت → زيادة الكمية (inc).
 * 3. إن لم توجد → إنشاء دفعة جديدة (نادر جداً — عند إرجاع بضاعة لم تُسجَّل).
 *
 * ⚠️ لماذا لا نستخدم selectFEFO هنا؟
 * - المرتجع يعرف مسبقاً الدفعة التي خرجت (من بند الفاتورة/الإيصال).
 * - لا نريد FEFO — نُعيد البضاعة لنفس المكان.
 *
 * @async
 * @param {Object} params
 * @param {string} params.itemId
 * @param {string} params.warehouseId
 * @param {string} params.batch - رقم الدفعة (إلزامي).
 * @param {number} params.quantity - الكمية المُرجعة.
 * @param {Object} [params.meta] - بيانات إضافية (expiry, unitCost) عند الإنشاء.
 * @returns {Promise<import('mongoose').Document>} الدفعة المحدّثة.
 * @throws {AppError} WAREHOUSE_NOT_FOUND | RETURN_FAILED
 */
export async function returnStock({ itemId, warehouseId, batch, quantity, meta = {} }) {
  if (!itemId || !warehouseId || !batch || !quantity || quantity <= 0) {
    throw new AppError(
      'بيانات إرجاع المخزون غير مكتملة.',
      400,
      'INVALID_RETURN_INPUT'
    );
  }

  await ensureWarehouseActive(warehouseId);

  const normalizedBatch = String(batch).trim().toUpperCase();
  const now = new Date();

  try {
    // findOneAndUpdate مع upsert: يُنشئ إن لم يوجد، ويحدّث إن وُجد.
    const updated = await Stock.findOneAndUpdate(
      { item: itemId, warehouse: warehouseId, batch: normalizedBatch },
      {
        $inc: { quantity },
        $set: { lastReceivedAt: now },
        $setOnInsert: {
          expiry: meta.expiry || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          unitCost: meta.unitCost || 0,
          unitPrice: meta.unitPrice || 0,
          isQuarantined: false,
          notes: meta.notes || 'دفعة أُنشئت تلقائياً من مرتجع',
        },
      },
      { new: true, upsert: true, runValidators: true }
    );

    return updated;
  } catch (error) {
    logger.error(`فشل إرجاع الكمية للدفعة ${normalizedBatch}: ${error.message}`);
    if (error instanceof AppError) throw error;
    throw new AppError('فشل إرجاع البضاعة للمخزون.', 500, 'RETURN_FAILED');
  }
}

// ============================================================
// 3) التحقق من التوفر (Availability)
// ============================================================

/**
 * حساب الكمية المتاحة من صنف في مخزن (غير محجورة وغير منتهية).
 *
 * يُستخدم للتحقق السريع قبل محاولة الصرف (لتوفير استعلام selectFEFO).
 *
 * @async
 * @param {string} itemId
 * @param {string} warehouseId
 * @returns {Promise<number>} الكمية الإجمالية المتاحة.
 */
export async function getAvailableQuantity(itemId, warehouseId) {
  const result = await Stock.aggregate([
    {
      $match: {
        item: new (await import('mongoose')).Types.ObjectId(itemId),
        warehouse: new (await import('mongoose')).Types.ObjectId(warehouseId),
        isQuarantined: false,
        quantity: { $gt: 0 },
        expiry: { $gt: new Date() },
      },
    },
    { $group: { _id: null, total: { $sum: '$quantity' } } },
  ]);

  return result[0]?.total || 0;
}

// ============================================================
// 4) الصرف المتعدد (Bulk Issue) — لسطر فاتورة
// ============================================================

/**
 * صرف كمية من صنف قد تحتاج دفعات متعددة.
 *
 * ⚠️ هذه الدالة تختلف عن `issueStock` في التالي:
 * - `issueStock` تُرجع الدفعات المختارة (لتُخزَّن في الفاتورة).
 * - `bulkIssueStock` تُغلّف كل السطور في فاتورة واحدة (تستدعي `issueStock` عدة مرات).
 *
 * @async
 * @param {Object} params
 * @param {Array<{itemId, quantity}>} params.lines - سطور الفاتورة.
 * @param {string} params.warehouseId
 * @param {boolean} [params.allowExpired=false]
 * @returns {Promise<Array<{itemId, issuedBatches}>>}
 * @throws {AppError} إن فشل أي سطر (نُعيد الخطأ كاملاً).
 *
 * @example
 * const result = await bulkIssueStock({
 *   warehouseId: '...',
 *   lines: [
 *     { itemId: '...', quantity: 10 },
 *     { itemId: '...', quantity: 5 },
 *   ],
 * });
 * // result = [
 * //   { itemId: '...', issuedBatches: [{ stockId, batch, expiry, quantity, unitCost }] },
 * //   { itemId: '...', issuedBatches: [{ stockId, batch, expiry, quantity, unitCost }] },
 * // ]
 */
export async function bulkIssueStock({ warehouseId, lines, allowExpired = false }) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new AppError('لا توجد سطور لصرفها.', 400, 'NO_LINES');
  }

  await ensureWarehouseActive(warehouseId);

  const results = [];

  for (const line of lines) {
    // eslint-disable-next-line no-await-in-loop
    const issuedBatches = await issueStock({
      itemId: line.itemId,
      warehouseId,
      quantity: line.quantity,
      allowExpired,
    });

    results.push({ itemId: line.itemId, issuedBatches });
  }

  return results;
}

// ============================================================
// 5) صحة البيانات (Sanity) — للاختبارات
// ============================================================

/**
 * التحقق من سلامة دفعة (أن quantity >= 0).
 * تُستخدم من Jobs أو Scripts للتحقق من البيانات.
 *
 * @async
 * @returns {Promise<{healthy: number, corrupted: number}>}
 */
export async function healthCheck() {
  const total = await Stock.countDocuments();
  const corrupted = await Stock.countDocuments({ quantity: { $lt: 0 } });
  return { healthy: total - corrupted, corrupted };
}

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  issueStock,
  returnStock,
  getAvailableQuantity,
  bulkIssueStock,
  healthCheck,
};