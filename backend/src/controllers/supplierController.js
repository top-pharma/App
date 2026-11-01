/**
 * @file supplierController.js
 * @description
 * منطق إدارة الموردين (CRUD + Soft Delete).
 *
 * لماذا هذا الملف؟
 * - الموردون شركاء الاستيراد الرئيسيون — بيانات اتصال + شروط دفع.
 * - الكود يُولَّد آلياً عبر pre('validate') في Supplier.js.
 * - لا نحذف مورّداً له سجل استلامات — نُعطّله.
 * - currentBalance يُدار آلياً من الفواتير (لاحقاً في Phase 2).
 * - getReceipts هو stub مؤقت (Phase 2).
 */

import { AUDIT_ACTIONS } from '../models/AuditLog.js';
import { Supplier } from '../models/Supplier.js';
import { PurchaseReceipt } from '../models/PurchaseReceipt.js';
import { AppError, asyncHandler } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';

// ============================================================
// Helpers
// ============================================================

/**
 * بناء استجابة موحّدة للمورّد.
 * @param {import('mongoose').Document} supplier
 * @returns {Object}
 */
const buildSupplierPayload = (supplier) => ({
  id: supplier._id,
  name: supplier.name,
  code: supplier.code,
  contactPerson: supplier.contactPerson || '',
  phone: supplier.phone || '',
  phone2: supplier.phone2 || '',
  email: supplier.email || '',
  address: supplier.address || '',
  city: supplier.city || '',
  country: supplier.country || 'السودان',
  taxNumber: supplier.taxNumber || '',
  commercialRegister: supplier.commercialRegister || '',
  bankAccount: supplier.bankAccount || '',
  bankName: supplier.bankName || '',
  currentBalance: supplier.currentBalance || 0,
  paymentTerms: supplier.paymentTerms ?? 30,
  currency: supplier.currency || 'SDG',
  isActive: Boolean(supplier.isActive),
  notes: supplier.notes || '',
  createdAt: supplier.createdAt,
  updatedAt: supplier.updatedAt,
});

// ============================================================
// 1) القراءة
// ============================================================

/**
 * GET /api/suppliers
 *
 * @type {import('express').RequestHandler}
 */
export const listSuppliers = asyncHandler(async (req, res) => {
  const { page, limit, search, isActive, sortBy, sortOrder } =
    req.validatedQuery || req.query;

  const filter = {};

  if (typeof isActive === 'boolean') {
    filter.isActive = isActive;
  }
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { code: rx }, { phone: rx }, { contactPerson: rx }];
  }

  const skip = (page - 1) * limit;
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [suppliers, total] = await Promise.all([
    Supplier.find(filter)
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(limit),
    Supplier.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      items: suppliers.map(buildSupplierPayload),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + suppliers.length < total,
        hasPrev: page > 1,
      },
    },
  });
});

/**
 * GET /api/suppliers/:id
 *
 * @type {import('express').RequestHandler}
 */
export const getSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findById(req.params.id);

  if (!supplier) {
    throw new AppError('المورّد غير موجود.', 404, 'SUPPLIER_NOT_FOUND');
  }

  return res.status(200).json({
    success: true,
    data: buildSupplierPayload(supplier),
  });
});

/**
 * GET /api/suppliers/:id/receipts
 * سجل الاستلامات من المورّد.
 *
 * ⚠️ Phase 2: سيُستبدل بـ PurchaseReceipt.find({ supplier: id }).
 * حالياً نتحقق من وجود المورّد ثم نُعيد قائمة فارغة.
 *
 * @type {import('express').RequestHandler}
 */
export const getSupplierReceipts = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findById(req.params.id).select('_id');
  if (!supplier) {
    throw new AppError('المورّد غير موجود.', 404, 'SUPPLIER_NOT_FOUND');
  }

  // TODO: Phase 2 — سيُستبدل بالاستعلام الفعلي:
  // const receipts = await PurchaseReceipt.find({ supplier: supplier._id })
  //   .sort({ receiptDate: -1 }).skip(...).limit(...);
  // للتحقق الإحصائي: عدد إيصالات الاستلام الحالية
  const total = await PurchaseReceipt.countDocuments({ supplier: supplier._id });

  return res.status(200).json({
    success: true,
    data: {
      items: [],
      pagination: {
        page: 1,
        limit: 20,
        total,
        totalPages: Math.ceil(total / 20),
        hasNext: false,
        hasPrev: false,
      },
      note: 'سجل الاستلامات الكامل متاح في المرحلة 2.',
    },
  });
});

// ============================================================
// 2) الإنشاء
// ============================================================

/**
 * POST /api/suppliers
 *
 * @type {import('express').RequestHandler}
 */
export const createSupplier = asyncHandler(async (req, res) => {
  const data = req.body;

  const supplier = await Supplier.create({
    name: data.name,
    contactPerson: data.contactPerson || '',
    phone: data.phone,
    phone2: data.phone2 || '',
    email: data.email || '',
    address: data.address || '',
    city: data.city || '',
    country: data.country || 'السودان',
    taxNumber: data.taxNumber || '',
    commercialRegister: data.commercialRegister || '',
    bankAccount: data.bankAccount || '',
    bankName: data.bankName || '',
    currentBalance: 0,
    paymentTerms: data.paymentTerms ?? 30,
    currency: 'SDG',
    isActive: true,
    notes: data.notes || '',
    createdBy: req.user._id,
  });

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.CREATE,
    resource: 'Supplier',
    resourceId: supplier._id,
    description: `إنشاء مورّد: ${supplier.name} (${supplier.code})`,
    success: true,
    meta: {
      after: {
        name: supplier.name,
        code: supplier.code,
        phone: supplier.phone,
        paymentTerms: supplier.paymentTerms,
      },
    },
  });

  return res.status(201).json({
    success: true,
    data: buildSupplierPayload(supplier),
  });
});

// ============================================================
// 3) التعديل
// ============================================================

/**
 * PATCH /api/suppliers/:id
 *
 * @type {import('express').RequestHandler}
 */
export const updateSupplier = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const supplier = await Supplier.findById(id);

  if (!supplier) {
    throw new AppError('المورّد غير موجود.', 404, 'SUPPLIER_NOT_FOUND');
  }

  const before = {
    name: supplier.name,
    phone: supplier.phone,
    paymentTerms: supplier.paymentTerms,
    isActive: supplier.isActive,
  };

  const allowedFields = [
    'name',
    'contactPerson',
    'phone',
    'phone2',
    'email',
    'address',
    'city',
    'country',
    'taxNumber',
    'commercialRegister',
    'bankAccount',
    'bankName',
    'paymentTerms',
    'notes',
    'isActive',
  ];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      supplier[field] = updates[field];
    }
  }

  await supplier.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Supplier',
    resourceId: supplier._id,
    description: `تعديل مورّد: ${supplier.name}`,
    success: true,
    meta: {
      before,
      after: {
        name: supplier.name,
        phone: supplier.phone,
        paymentTerms: supplier.paymentTerms,
        isActive: supplier.isActive,
      },
    },
  });

  return res.status(200).json({
    success: true,
    data: buildSupplierPayload(supplier),
  });
});

// ============================================================
// 4) الحذف (Soft Delete)
// ============================================================

/**
 * DELETE /api/suppliers/:id
 * - نمنع التعطيل إذا يوجد سجل استلامات.
 *
 * @type {import('express').RequestHandler}
 */
export const deleteSupplier = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const supplier = await Supplier.findById(id);

  if (!supplier) {
    throw new AppError('المورّد غير موجود.', 404, 'SUPPLIER_NOT_FOUND');
  }

  if (!supplier.isActive) {
    return res.status(200).json({
      success: true,
      data: { message: 'المورّد معطّل بالفعل.' },
    });
  }

  // نمنع التعطيل إذا يوجد سجل استلامات (حفاظاً على السلامة المرجعية).
  const receiptsCount = await PurchaseReceipt.countDocuments({
    supplier: supplier._id,
    status: { $ne: 'cancelled' },
  });
  if (receiptsCount > 0) {
    throw new AppError(
      `لا يمكن تعطيل المورّد — يوجد ${receiptsCount} إيصال استلام مسجّل.`,
      409,
      'SUPPLIER_HAS_RECEIPTS'
    );
  }

  supplier.isActive = false;
  await supplier.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.DELETE,
    resource: 'Supplier',
    resourceId: supplier._id,
    description: `تعطيل مورّد: ${supplier.name}`,
    success: true,
    meta: {
      before: { name: supplier.name, code: supplier.code, isActive: true },
      after: { isActive: false },
    },
  });

  return res.status(200).json({
    success: true,
    data: { message: 'تم تعطيل المورّد.' },
  });
});

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  listSuppliers,
  getSupplier,
  getSupplierReceipts,
  createSupplier,
  updateSupplier,
  deleteSupplier,
};