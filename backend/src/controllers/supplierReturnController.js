/**
 * @file supplierReturnController.js
 * @description
 * واجهات التحكم لمرتجعات الموردين.
 * تدير دورة حياة المرتجع (مسودة ← مُرسل ← مقبول/مرفوض) مع تعديل المخزون.
 *
 * لماذا هذا الملف؟
 * - مرتجع المورد يعني إخراج بضاعة تالفة/قريبة الانتهاء من مخزننا وإعادتها للشركة.
 * - التأثير الفعلي على المخزون يحدث عند القبول (Accept) وليس الإرسال.
 * - عند القبول بطريقة "إشعار دائن" (Credit Note)، يُخصم المبلغ من رصيد المورد.
 * - عند القبول بطريقة "استبدال" (Replacement)، نطلب رقم مرجعي للبضاعة البديلة.
 * - لا يوجد Scope خاص (متاح فقط لـ admin / accountant / storekeeper).
 */

import { AUDIT_ACTIONS } from '../models/AuditLog.js';
import {
  SupplierReturn,
  SUPPLIER_RETURN_STATUSES,
  SUPPLIER_SETTLEMENT_TYPES,
} from '../models/SupplierReturn.js';
import { Supplier } from '../models/Supplier.js';
import { PurchaseReceipt } from '../models/PurchaseReceipt.js';
import { Stock } from '../models/Stock.js';
import { Warehouse } from '../models/Warehouse.js';
import { Settings } from '../models/Settings.js';
import { AppError, asyncHandler } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { logger } from '../utils/logger.js';

// ============================================================
// Helpers
// ============================================================

/**
 * توليد رقم مرتجع مورد فريد.
 * النمط: SRET-YYYYMMDD-XXXX
 *
 * @async
 * @returns {Promise<string>}
 */
async function generateSupplierReturnNumber() {
  const settings = await Settings.getSettings();
  const prefix = settings.sales?.prefixes?.supplierReturn || 'SRET';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const lastReturn = await SupplierReturn.findOne({
    returnNumber: new RegExp(`^${prefix}-${dateStr}-`),
  })
    .sort({ returnNumber: -1 })
    .select('returnNumber')
    .lean();

  let sequence = 1;
  if (lastReturn) {
    const parts = lastReturn.returnNumber.split('-');
    sequence = parseInt(parts[parts.length - 1], 10) + 1;
  }

  return `${prefix}-${dateStr}-${String(sequence).padStart(4, '0')}`;
}

/**
 * بناء استجابة موحّدة.
 */
const buildSupplierReturnPayload = (ret) => ({
  id: ret._id,
  returnNumber: ret.returnNumber,
  supplier: ret.supplier,
  purchaseReceipt: ret.purchaseReceipt,
  items: ret.items,
  total: ret.total,
  returnDate: ret.returnDate,
  status: ret.status,
  settlementType: ret.settlementType,
  settledAmount: ret.settledAmount,
  settledAt: ret.settledAt,
  replacementReference: ret.replacementReference,
  notes: ret.notes,
  createdAt: ret.createdAt,
  updatedAt: ret.updatedAt,
});

// ============================================================
// 1) القراءة
// ============================================================

/**
 * GET /api/supplier-returns
 */
export const listSupplierReturns = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    search,
    supplier,
    purchaseReceipt,
    status,
    settlementType,
    notSent,
    dateFrom,
    dateTo,
    sortBy,
    sortOrder,
  } = req.validatedQuery || req.query;

  const filter = {};

  if (supplier) filter.supplier = supplier;
  if (purchaseReceipt) filter.purchaseReceipt = purchaseReceipt;
  if (status) filter.status = status;
  if (settlementType) filter.settlementType = settlementType;

  if (notSent) {
    filter.status = SUPPLIER_RETURN_STATUSES.DRAFT;
  }

  if (dateFrom || dateTo) {
    filter.returnDate = {};
    if (dateFrom) filter.returnDate.$gte = dateFrom;
    if (dateTo) filter.returnDate.$lte = dateTo;
  }

  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ returnNumber: rx }, { replacementReference: rx }];
  }

  const skip = (page - 1) * limit;
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [returns, total] = await Promise.all([
    SupplierReturn.find(filter)
      .populate('supplier', 'name code phone')
      .populate('purchaseReceipt', 'receiptNumber receiptDate')
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(limit),
    SupplierReturn.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      items: returns.map(buildSupplierReturnPayload),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + returns.length < total,
        hasPrev: page > 1,
      },
    },
  });
});

/**
 * GET /api/supplier-returns/:id
 */
export const getSupplierReturn = asyncHandler(async (req, res) => {
  const ret = await SupplierReturn.findById(req.params.id)
    .populate('supplier', 'name code phone currentBalance')
    .populate('purchaseReceipt', 'receiptNumber receiptDate total')
    .populate('items.item', 'tradeName scientificName');

  if (!ret) {
    throw new AppError('مرتجع المورد غير موجود.', 404, 'RETURN_NOT_FOUND');
  }

  return res.status(200).json({
    success: true,
    data: buildSupplierReturnPayload(ret),
  });
});

// ============================================================
// 2) الإنشاء
// ============================================================

/**
 * POST /api/supplier-returns
 *
 * ملاحظة: الإنشاء لا يؤثر على المخزون (الحالة draft).
 */
export const createSupplierReturn = asyncHandler(async (req, res) => {
  const data = req.body;

  // 1. التحقق من المورد
  const supplier = await Supplier.findById(data.supplier);
  if (!supplier) {
    throw new AppError('المورّد غير موجود.', 404, 'SUPPLIER_NOT_FOUND');
  }

  // 2. التحقق من إيصال الاستلام (إن وُجد)
  if (data.purchaseReceipt) {
    const receipt = await PurchaseReceipt.findById(data.purchaseReceipt);
    if (!receipt) {
      throw new AppError('إيصال الاستلام غير موجود.', 404, 'RECEIPT_NOT_FOUND');
    }
    if (String(receipt.supplier) !== String(supplier._id)) {
      throw new AppError('المورّد لا يطابق المورّد في إيصال الاستلام.', 400, 'SUPPLIER_MISMATCH');
    }
  }

  // 3. إنشاء المرتجع
  const returnNumber = await generateSupplierReturnNumber();

  const supplierReturn = await SupplierReturn.create({
    returnNumber,
    supplier: data.supplier,
    purchaseReceipt: data.purchaseReceipt || null,
    items: data.items,
    total: data.total,
    returnDate: data.returnDate || new Date(),
    status: SUPPLIER_RETURN_STATUSES.DRAFT,
    settlementType: data.settlementType,
    notes: data.notes,
    createdBy: req.user._id,
  });

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.CREATE,
    resource: 'SupplierReturn',
    resourceId: supplierReturn._id,
    description: `إنشاء مسودة مرتجع مورد ${returnNumber} للمورد ${supplier.name}`,
    success: true,
    meta: {
      after: { returnNumber, total: data.total, status: 'draft' },
    },
  });

  return res.status(201).json({
    success: true,
    data: buildSupplierReturnPayload(supplierReturn),
  });
});

// ============================================================
// 3) التعديل (مسودة فقط)
// ============================================================

/**
 * PATCH /api/supplier-returns/:id
 */
export const updateSupplierReturn = asyncHandler(async (req, res) => {
  const ret = await SupplierReturn.findById(req.params.id);

  if (!ret) {
    throw new AppError('مرتجع المورد غير موجود.', 404, 'RETURN_NOT_FOUND');
  }

  if (ret.status !== SUPPLIER_RETURN_STATUSES.DRAFT) {
    throw new AppError('لا يمكن تعديل مرتجع بعد إرساله.', 409, 'RETURN_LOCKED');
  }

  const before = {
    items: ret.items,
    total: ret.total,
    settlementType: ret.settlementType,
    notes: ret.notes,
  };

  const allowedFields = ['items', 'total', 'settlementType', 'notes'];
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      ret[field] = req.body[field];
    }
  }

  await ret.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'SupplierReturn',
    resourceId: ret._id,
    description: `تعديل مرتجع مورد ${ret.returnNumber}`,
    success: true,
    meta: { before, after: { items: ret.items, total: ret.total, settlementType: ret.settlementType } },
  });

  return res.status(200).json({
    success: true,
    data: buildSupplierReturnPayload(ret),
  });
});

// ============================================================
// 4) الإرسال (Send to Supplier)
// ============================================================

/**
 * POST /api/supplier-returns/:id/send
 */
export const sendSupplierReturn = asyncHandler(async (req, res) => {
  const ret = await SupplierReturn.findById(req.params.id);

  if (!ret) {
    throw new AppError('مرتجع المورد غير موجود.', 404, 'RETURN_NOT_FOUND');
  }

  if (ret.status !== SUPPLIER_RETURN_STATUSES.DRAFT) {
    throw new AppError('المرتجع ليس في حالة مسودة.', 409, 'INVALID_STATUS');
  }

  ret.status = SUPPLIER_RETURN_STATUSES.SENT;
  if (req.body.notes) ret.notes = req.body.notes;

  await ret.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'SupplierReturn',
    resourceId: ret._id,
    description: `إرسال مرتجع المورد ${ret.returnNumber} إلى المورّد`,
    success: true,
  });

  return res.status(200).json({
    success: true,
    data: buildSupplierReturnPayload(ret),
    message: 'تم إرسال المرتجع إلى المورّد.',
  });
});

// ============================================================
// 5) القبول (Accept from Supplier)
// ============================================================

/**
 * POST /api/supplier-returns/:id/accept
 *
 * التأثير الفعلي:
 * 1. خصم البضاعة من المخزون (لأنها ستُشحن للمورد).
 * 2. تسوية مالية (إشعار دائن / استرداد / استبدال).
 */
export const acceptSupplierReturn = asyncHandler(async (req, res) => {
  const { settledAmount, replacementReference, notes } = req.body;
  const returnId = req.params.id;

  const supplierReturn = await SupplierReturn.findById(returnId);
  if (!supplierReturn) {
    throw new AppError('مرتجع المورد غير موجود.', 404, 'RETURN_NOT_FOUND');
  }

  if (supplierReturn.status !== SUPPLIER_RETURN_STATUSES.SENT) {
    throw new AppError(
      `لا يمكن قبول مرتجع في حالة ${supplierReturn.status}. يجب أن يكون "sent".`,
      409,
      'INVALID_STATUS'
    );
  }

  // 1. خصم البضاعة من المخزون
  // نحتاج معرفة المخزن (من إيصال الاستلام المرتبط)
  if (!supplierReturn.purchaseReceipt) {
    throw new AppError('يجب ربط المرتجع بإيصال استلام لمعرفة المخزن.', 400, 'NO_RECEIPT');
  }

  const receipt = await PurchaseReceipt.findById(supplierReturn.purchaseReceipt);
  if (!receipt) {
    throw new AppError('إيصال الاستلام غير موجود.', 404, 'RECEIPT_NOT_FOUND');
  }

  const warehouseId = receipt.warehouse;
  const stockDeductionLog = [];

  try {
    for (const item of supplierReturn.items) {
      const stock = await Stock.findOne({
        item: item.item,
        batch: item.batch,
        warehouse: warehouseId,
      });

      if (!stock || stock.quantity < item.quantity) {
        throw new AppError(
          `الدفعة ${item.batch} غير موجودة أو الكمية غير كافية للخصم.`,
          400,
          'INSUFFICIENT_STOCK'
        );
      }

      stock.quantity -= item.quantity;
      stock.lastIssuedAt = new Date();
      await stock.save();

      stockDeductionLog.push({
        stockId: stock._id,
        itemId: item.item,
        batch: item.batch,
        quantity: item.quantity,
      });
    }
  } catch (error) {
    logger.error(`فشل خصم المخزون في مرتجع المورد: ${error.message}. جارٍ Rollback...`);
    // Rollback: إعادة البضاعة
    for (const log of stockDeductionLog) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await Stock.updateOne(
          { _id: log.stockId },
          { $inc: { quantity: log.quantity } }
        );
      } catch (rbErr) {
        logger.error(`فشل Rollback للدفعة ${log.batch}: ${rbErr.message}`);
      }
    }
    throw error;
  }

  // 2. التسوية المالية
  if (supplierReturn.settlementType === SUPPLIER_SETTLEMENT_TYPES.CREDIT_NOTE) {
    if (!settledAmount || settledAmount <= 0) {
      throw new AppError('يجب تحديد مبلغ التسوية (إشعار دائن).', 400, 'INVALID_SETTLED_AMOUNT');
    }

    // إشعار دائن يخصم من رصيد المورد
    await Supplier.updateOne(
      { _id: supplierReturn.supplier },
      { $inc: { currentBalance: -settledAmount } }
    );
  } else if (supplierReturn.settlementType === SUPPLIER_SETTLEMENT_TYPES.REPLACEMENT) {
    if (!replacementReference) {
      throw new AppError('يجب إدخال رقم مرجعي للاستبدال.', 400, 'NO_REPLACEMENT_REF');
    }
    // لا تأثير مالي (البضاعة ستُستبدل)
  } else if (supplierReturn.settlementType === SUPPLIER_SETTLEMENT_TYPES.CASH_REFUND) {
    if (!settledAmount || settledAmount <= 0) {
      throw new AppError('يجب تحديد مبلغ الاسترداد النقدي.', 400, 'INVALID_SETTLED_AMOUNT');
    }
    // استرداد نقدي (دخول للخزينة) - يتم تسجيله كحركة نقدية
    // ملاحظة: CashFund يتم تحديده يدوياً من المحاسب في مرحلة لاحقة
  }

  // 3. تحديث المرتجع
  supplierReturn.status = SUPPLIER_RETURN_STATUSES.ACCEPTED;
  supplierReturn.settledAmount = settledAmount || 0;
  supplierReturn.settledAt = new Date();
  if (replacementReference) supplierReturn.replacementReference = replacementReference;
  if (notes) supplierReturn.notes = notes;

  await supplierReturn.save();

  // 4. تدقيق
  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'SupplierReturn',
    resourceId: supplierReturn._id,
    description: `قبول مرتجع المورد ${supplierReturn.returnNumber} وتسويته`,
    success: true,
    meta: {
      after: { status: 'accepted', settledAmount, settlementType: supplierReturn.settlementType },
    },
  });

  return res.status(200).json({
    success: true,
    data: buildSupplierReturnPayload(supplierReturn),
    message: 'تم قبول المرتجع من المورّد وتسويته.',
  });
});

// ============================================================
// 6) الرفض (Reject from Supplier)
// ============================================================

/**
 * POST /api/supplier-returns/:id/reject
 */
export const rejectSupplierReturn = asyncHandler(async (req, res) => {
  const { rejectionReason } = req.body;
  const returnId = req.params.id;

  const supplierReturn = await SupplierReturn.findById(returnId);
  if (!supplierReturn) {
    throw new AppError('مرتجع المورد غير موجود.', 404, 'RETURN_NOT_FOUND');
  }

  if (supplierReturn.status !== SUPPLIER_RETURN_STATUSES.SENT) {
    throw new AppError(
      `لا يمكن رفض مرتجع في حالة ${supplierReturn.status}.`,
      409,
      'INVALID_STATUS'
    );
  }

  supplierReturn.status = SUPPLIER_RETURN_STATUSES.REJECTED;
  supplierReturn.notes = `${supplierReturn.notes || ''}\n[مرفوض من المورد]: ${rejectionReason}`.trim();

  await supplierReturn.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'SupplierReturn',
    resourceId: supplierReturn._id,
    description: `رفض مرتجع المورد ${supplierReturn.returnNumber}: ${rejectionReason}`,
    success: true,
    meta: { after: { status: 'rejected', rejectionReason } },
  });

  return res.status(200).json({
    success: true,
    data: buildSupplierReturnPayload(supplierReturn),
    message: 'تم رفض المرتجع من المورّد.',
  });
});

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  listSupplierReturns,
  getSupplierReturn,
  createSupplierReturn,
  updateSupplierReturn,
  sendSupplierReturn,
  acceptSupplierReturn,
  rejectSupplierReturn,
};