/**
 * @file priceValidationService.js
 * @description
 * خدمة التحقق من أسعار البيع — Phase 2.5.
 *
 * لماذا هذا الملف؟
 * - تحمي الشركة من البيع بخسارة أو بخصم مفرط.
 * - تطبق ثلاث سياسات:
 *     1. حد أدنى مطلق = التكلفة × (1 + minMarginPercent).
 *     2. حد أدنى موصى به = سعر القائمة × (1 - maxDiscountPercent).
 *     3. استثناء الدفعات القاربة على الانتهاء = خصم أعلى.
 * - تدعم تجاوز الحدود لمن لديه صلاحية `invoices.override_price_limit`.
 * - كل تجاوز يُسجَّل في AuditLog ويُنبَّه الأدمن.
 *
 * المبدأ:
 * - لا بيع تحت التكلفة أبداً (absoluteMin).
 * - البيع بين absoluteMin و recommendedMin = يحتاج تجاوز + سبب.
 * - البيع فوق recommendedMin = مسموح (طبيعي).
 */

import { AppError } from '../middlewares/errorMiddleware.js';
import { Settings } from '../models/Settings.js';
import { Stock } from '../models/Stock.js';
import { Item } from '../models/Item.js';
import { logger } from '../utils/logger.js';

// ============================================================
// 1. قراءة الحدود الفعّالة
// ============================================================

/**
 * حساب الحدود الفعّالة لصنف ودفعة محددة.
 * الأولوية: Item override → Settings default.
 *
 * @async
 * @param {string} itemId
 * @param {string} batch - رقم الدفعة
 * @param {string} warehouseId
 * @returns {Promise<{
 *   cost: number,
 *   listPrice: number,
 *   minMarginPercent: number,
 *   maxDiscountPercent: number,
 *   nearExpiryThresholdDays: number,
 *   nearExpiryMaxDiscountPercent: number,
 *   isNearExpiry: boolean,
 *   daysUntilExpiry: number|null,
 *   absoluteMin: number,
 *   recommendedMin: number,
 *   effectiveMaxDiscountPercent: number,
 *   stockId: string,
 * }>}
 */
export async function getPriceLimits(itemId, batch, warehouseId) {
  // 1. قراءة الإعدادات العامة
  const settings = await Settings.getSettings();
  const salesSettings = settings.sales || {};

  const defaultMinMargin = salesSettings.minMarginPercent ?? 10;
  const defaultMaxDiscount = salesSettings.maxDiscountPercent ?? 15;
  const nearExpiryThresholdDays = salesSettings.nearExpiryThresholdDays ?? 30;
  const nearExpiryMaxDiscountPercent = salesSettings.nearExpiryMaxDiscountPercent ?? 30;

  // 2. قراءة الصنف (لتحديد overrides)
  const item = await Item.findById(itemId).select('units minMarginPercent maxDiscountPercent').lean();
  if (!item) {
    throw new AppError('الصنف غير موجود.', 404, 'ITEM_NOT_FOUND');
  }

  // 3. قراءة الدفعة (للتكلفة الفعلية + الصلاحية)
  const stock = await Stock.findOne({ item: itemId, batch: batch.toUpperCase(), warehouse: warehouseId })
    .select('unitCost unitPrice expiry quantity')
    .lean();

  if (!stock) {
    throw new AppError(`الدفعة ${batch} غير موجودة في المخزن.`, 404, 'STOCK_NOT_FOUND');
  }

  // 4. تحديد التكلفة (Stock.unitCost → Item.units.base.cost → 0)
  const cost = stock.unitCost || item.units?.base?.cost || 0;

  // 5. تحديد سعر القائمة (Stock.unitPrice → Item.units.base.price → 0)
  const listPrice = stock.unitPrice || item.units?.base?.price || 0;

  // 6. الحدود الفعّالة (Item override → Settings default)
  const minMarginPercent = item.minMarginPercent ?? defaultMinMargin;
  const maxDiscountPercent = item.maxDiscountPercent ?? defaultMaxDiscount;

  // 7. فحص الصلاحية القريبة
  const expiryTime = stock.expiry ? new Date(stock.expiry).getTime() : null;
  const daysUntilExpiry = expiryTime !== null
    ? Math.ceil((expiryTime - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const isNearExpiry = daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= nearExpiryThresholdDays;

  // 8. الحد الأدنى المطلق (لا بيع تحته — أبداً)
  const absoluteMin = cost > 0 ? cost * (1 + minMarginPercent / 100) : 0;

  // 9. الحد الأدنى الموصى به (يعتمد على حالة الانتهاء)
  const effectiveMaxDiscountPercent = isNearExpiry
    ? nearExpiryMaxDiscountPercent
    : maxDiscountPercent;
  const minByList = listPrice > 0 ? listPrice * (1 - effectiveMaxDiscountPercent / 100) : 0;
  const recommendedMin = Math.max(absoluteMin, minByList);

  return {
    cost,
    listPrice,
    minMarginPercent,
    maxDiscountPercent,
    nearExpiryThresholdDays,
    nearExpiryMaxDiscountPercent,
    isNearExpiry,
    daysUntilExpiry,
    absoluteMin: Math.round(absoluteMin * 100) / 100,
    recommendedMin: Math.round(recommendedMin * 100) / 100,
    effectiveMaxDiscountPercent,
    stockId: stock._id.toString(),
    availableQuantity: stock.quantity || 0,
  };
}

// ============================================================
// 2. التحقق من صلاحية السعر
// ============================================================

/**
 * @typedef {Object} PriceValidationResult
 * @property {'OK'|'WARN_OVERRIDE'|'BLOCKED'} status
 * @property {boolean} requiresOverride
 * @property {boolean} requiresReason
 * @property {string} [message] - رسالة عربية
 * @property {Object} limits - الحدود الفعّالة
 * @property {Object} [metrics] - المقاييس المحسوبة (خصم %، هامش %)
 */

/**
 * التحقق من صلاحية سعر بيع.
 *
 * @async
 * @param {Object} params
 * @param {string} params.itemId
 * @param {string} params.batch
 * @param {string} params.warehouseId
 * @param {number} params.proposedPrice - السعر المقترح (للوحدة)
 * @param {Object} params.req - لفحص الصلاحيات
 * @returns {Promise<PriceValidationResult>}
 */
export async function validateSalePrice({ itemId, batch, warehouseId, proposedPrice, req }) {
  const limits = await getPriceLimits(itemId, batch, warehouseId);
  const price = Number(proposedPrice) || 0;

  // ⚠️ حالة خاصة: لا توجد تكلفة معروفة → تحذير لكن ليس منعاً
  if (limits.cost === 0) {
    return {
      status: 'WARN_OVERRIDE',
      requiresOverride: true,
      requiresReason: true,
      message: 'لا توجد تكلفة معروفة لهذه الدفعة. يلزم تجاوز صريح.',
      limits,
    };
  }

  // ⚠️ حالة خاصة: لا يوجد سعر قائمة → تحذير
  if (limits.listPrice === 0) {
    return {
      status: 'WARN_OVERRIDE',
      requiresOverride: true,
      requiresReason: true,
      message: 'لا يوجد سعر قائمة. يلزم تجاوز صريح.',
      limits,
    };
  }

  // حساب المقاييس
  const discountPercent = limits.listPrice > 0
    ? ((limits.listPrice - price) / limits.listPrice) * 100
    : 0;
  const marginPercent = limits.cost > 0
    ? ((price - limits.cost) / limits.cost) * 100
    : 0;
  const metrics = {
    discountPercent: Math.round(discountPercent * 100) / 100,
    marginPercent: Math.round(marginPercent * 100) / 100,
    proposedPrice: Math.round(price * 100) / 100,
  };

  // 🚨 تحت الحد المطلق → مرفوض دائماً
  if (price < limits.absoluteMin - 0.01) {
    return {
      status: 'BLOCKED',
      requiresOverride: false,
      requiresReason: false,
      message: `السعر (${price.toFixed(2)}) أقل من التكلفة + الهامش الأدنى (${limits.absoluteMin.toFixed(2)}). لا يمكن الحفظ.`,
      limits,
      metrics,
    };
  }

  // ⚠️ بين absoluteMin و recommendedMin → تجاوز (للصلاحيات)
  if (price < limits.recommendedMin - 0.01) {
    const hasPermission = hasOverridePermission(req);
    const nearExpiryNote = limits.isNearExpiry
      ? ` (دفعة قاربة الانتهاء — ${limits.daysUntilExpiry} يوم)`
      : '';

    return {
      status: hasPermission ? 'WARN_OVERRIDE' : 'BLOCKED',
      requiresOverride: true,
      requiresReason: hasPermission,
      message: hasPermission
        ? `السعر (${price.toFixed(2)}) أقل من الحد الموصى به (${limits.recommendedMin.toFixed(2)})${nearExpiryNote}. يلزم سبب التجاوز.`
        : `السعر (${price.toFixed(2)}) أقل من الحد المسموح (${limits.recommendedMin.toFixed(2)}). لا تملك صلاحية التجاوز.`,
      limits,
      metrics,
    };
  }

  // ✅ السعر مقبول
  return {
    status: 'OK',
    requiresOverride: false,
    requiresReason: false,
    limits,
    metrics,
  };
}

// ============================================================
// 3. التحقق من صلاحية التجاوز
// ============================================================

/**
 * هل المستخدم يملك صلاحية تجاوز أسعار البيع؟
 *
 * @param {Object} req - Express request (مع req.rolePermissions من rbacMiddleware)
 * @returns {boolean}
 */
export function hasOverridePermission(req) {
  if (!req?.user) return false;
  if (req.user.role === 'admin') return true;
  if (!Array.isArray(req.rolePermissions)) return false;
  return (
    req.rolePermissions.includes('*') ||
    req.rolePermissions.includes('invoices.override_price_limit')
  );
}

// ============================================================
// 4. التحقق من سطور متعددة (للفاتورة)
// ============================================================

/**
 * التحقق من صلاحية أسعار جميع بنود الفاتورة.
 *
 * @async
 * @param {Object} params
 * @param {Array<{item, batch, unitPrice, quantity}>} params.items
 * @param {string} params.warehouseId
 * @param {Object} params.req
 * @returns {Promise<{
 *   allValid: boolean,
 *   needsOverride: boolean,
 *   results: Array<{
 *     item: string, batch: string, unitPrice: number, quantity: number,
 *     status: 'OK'|'WARN_OVERRIDE'|'BLOCKED',
 *     requiresOverride: boolean,
 *     requiresReason: boolean,
 *     message?: string,
 *     limits: Object,
 *     metrics?: Object,
 *   }>
 * }>}
 */
export async function validateInvoicePrices({ items, warehouseId, req }) {
  const results = [];
  let needsOverride = false;

  for (const line of items) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await validateSalePrice({
        itemId: line.item,
        batch: line.batch,
        warehouseId,
        proposedPrice: line.unitPrice,
        req,
      });

      results.push({
        item: line.item,
        batch: line.batch,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        ...result,
      });

      if (result.status === 'WARN_OVERRIDE') needsOverride = true;
    } catch (error) {
      // دفعة مفقودة → BLOCKED
      results.push({
        item: line.item,
        batch: line.batch,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        status: 'BLOCKED',
        requiresOverride: false,
        requiresReason: false,
        message: error.message || 'خطأ في التحقق من السعر.',
        limits: null,
      });
    }
  }

  const allValid = results.every((r) => r.status === 'OK');
  return { allValid, needsOverride, results };
}

// ============================================================
// 5. تصدير موحّد
// ============================================================

export default {
  getPriceLimits,
  validateSalePrice,
  validateInvoicePrices,
  hasOverridePermission,
};