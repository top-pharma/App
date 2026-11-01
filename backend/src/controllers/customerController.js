/**
 * @file customerController.js
 * @description
 * منطق إدارة الصيدليات (CRUD + Block/Unblock + Stubs للـ Phase 2).
 *
 * لماذا هذا الملف؟
 * - كل العملاء صيدليات (لا عميل عابر).
 * - assignedSalesRep إلزامي — نتحقق من أنه User بدور sales_rep ونشط.
 * - sales_rep يرى صيدلياته فقط (عبر req.scope.salesRepId).
 * - pharmacy يرى نفسه فقط (عبر linkedEntity).
 * - getInvoices/getStatement stubs (Phase 2).
 * - getBalance يُرجع البيانات الحقيقية (موجودة في Customer).
 */

import mongoose from 'mongoose';

import { AUDIT_ACTIONS } from '../models/AuditLog.js';
import { Customer, CUSTOMER_TYPES } from '../models/Customer.js';
import { User, USER_ROLES } from '../models/User.js';
import { AppError, asyncHandler } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';

// ============================================================
// Helpers
// ============================================================

/**
 * بناء استجابة موحّدة للعميل.
 * @param {import('mongoose').Document} customer
 * @returns {Object}
 */
const buildCustomerPayload = (customer) => ({
  id: customer._id,
  name: customer.name,
  type: customer.type,
  code: customer.code,
  ownerName: customer.ownerName || '',
  phone: customer.phone || '',
  phone2: customer.phone2 || '',
  email: customer.email || '',
  address: customer.address || '',
  city: customer.city || '',
  taxNumber: customer.taxNumber || '',
  commercialRegister: customer.commercialRegister || '',
  creditLimit: customer.creditLimit || 0,
  currentBalance: customer.currentBalance || 0,
  paymentTerms: customer.paymentTerms ?? 30,
  returnGracePeriod: customer.returnGracePeriod ?? 7,
  assignedSalesRep: customer.assignedSalesRep || null,
  isActive: Boolean(customer.isActive),
  isBlocked: Boolean(customer.isBlocked),
  blockReason: customer.blockReason || '',
  notes: customer.notes || '',
  userAccount: customer.userAccount || null,
  createdAt: customer.createdAt,
  updatedAt: customer.updatedAt,
});

/**
 * التحقق من أن المندوب موجود ونشط وبدور sales_rep.
 * @param {string} salesRepId
 * @returns {Promise<import('mongoose').Document>}
 * @throws {AppError} SALES_REP_NOT_FOUND
 */
const ensureSalesRepValid = async (salesRepId) => {
  const rep = await User.findOne({
    _id: salesRepId,
    role: USER_ROLES.SALES_REP,
    isActive: true,
  })
    .select('_id name email')
    .lean();
  if (!rep) {
    throw new AppError(
      'المندوب غير موجود أو معطّل أو ليس بدور مندوب.',
      400,
      'SALES_REP_NOT_FOUND'
    );
  }
  return rep;
};

// ============================================================
// 1) القراءة
// ============================================================

/**
 * GET /api/customers
 *
 * ملاحظة: Sales_rep يرى صيدلياته فقط (عبر req.scope.salesRepId).
 *
 * @type {import('express').RequestHandler}
 */
export const listCustomers = asyncHandler(async (req, res) => {
  const { page, limit, search, city, isActive, isBlocked, assignedSalesRep, sortBy, sortOrder } =
    req.validatedQuery || req.query;

  const filter = {};

  // Sales_rep scope.
  if (req.scope?.salesRepId) {
    filter.assignedSalesRep = req.scope.salesRepId;
  } else if (assignedSalesRep) {
    filter.assignedSalesRep = assignedSalesRep;
  }

  if (city) filter.city = city;
  if (typeof isActive === 'boolean') filter.isActive = isActive;
  if (typeof isBlocked === 'boolean') filter.isBlocked = isBlocked;

  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { name: rx },
      { code: rx },
      { phone: rx },
      { ownerName: rx },
      { city: rx },
    ];
  }

  const skip = (page - 1) * limit;
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [customers, total] = await Promise.all([
    Customer.find(filter)
      .populate('assignedSalesRep', 'name email')
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(limit),
    Customer.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      items: customers.map(buildCustomerPayload),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + customers.length < total,
        hasPrev: page > 1,
      },
    },
  });
});

/**
 * GET /api/customers/:id
 *
 * @type {import('express').RequestHandler}
 */
export const getCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id).populate(
    'assignedSalesRep',
    'name email'
  );

  if (!customer) {
    throw new AppError('الصيدلية غير موجودة.', 404, 'CUSTOMER_NOT_FOUND');
  }

  // Sales_rep scope: التحقق من الملكية.
  if (
    req.scope?.salesRepId &&
    String(customer.assignedSalesRep?._id) !== String(req.scope.salesRepId)
  ) {
    throw new AppError('لا تملك صلاحية الوصول لهذه الصيدلية.', 403, 'FORBIDDEN');
  }

  return res.status(200).json({
    success: true,
    data: buildCustomerPayload(customer),
  });
});

// ============================================================
// 2) الإنشاء
// ============================================================

/**
 * POST /api/customers
 *
 * @type {import('express').RequestHandler}
 */
export const createCustomer = asyncHandler(async (req, res) => {
  const data = req.body;

  // نتحقق من المندوب.
  await ensureSalesRepValid(data.assignedSalesRep);

  const customer = await Customer.create({
    name: data.name,
    type: CUSTOMER_TYPES.PHARMACY,
    ownerName: data.ownerName || '',
    phone: data.phone,
    phone2: data.phone2 || '',
    email: data.email || '',
    address: data.address || '',
    city: data.city || '',
    taxNumber: data.taxNumber || '',
    commercialRegister: data.commercialRegister || '',
    creditLimit: data.creditLimit ?? 0,
    currentBalance: 0,
    paymentTerms: data.paymentTerms ?? 30,
    returnGracePeriod: data.returnGracePeriod ?? 7,
    assignedSalesRep: data.assignedSalesRep,
    isActive: true,
    isBlocked: false,
    notes: data.notes || '',
    createdBy: req.user._id,
  });

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.CREATE,
    resource: 'Customer',
    resourceId: customer._id,
    description: `إنشاء صيدلية: ${customer.name} (${customer.code})`,
    success: true,
    meta: {
      after: {
        name: customer.name,
        code: customer.code,
        phone: customer.phone,
        assignedSalesRep: customer.assignedSalesRep,
      },
    },
  });

  const populated = await customer.populate('assignedSalesRep', 'name email');

  return res.status(201).json({
    success: true,
    data: buildCustomerPayload(populated),
  });
});

// ============================================================
// 3) التعديل
// ============================================================

/**
 * PATCH /api/customers/:id
 *
 * @type {import('express').RequestHandler}
 */
export const updateCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const customer = await Customer.findById(id);

  if (!customer) {
    throw new AppError('الصيدلية غير موجودة.', 404, 'CUSTOMER_NOT_FOUND');
  }

  const before = {
    name: customer.name,
    phone: customer.phone,
    assignedSalesRep: customer.assignedSalesRep,
    creditLimit: customer.creditLimit,
    isActive: customer.isActive,
    isBlocked: customer.isBlocked,
  };

  // إن تغيّر المندوب → نتحقق.
  if (
    updates.assignedSalesRep &&
    String(updates.assignedSalesRep) !== String(customer.assignedSalesRep)
  ) {
    await ensureSalesRepValid(updates.assignedSalesRep);
  }

  // عند الحظر، blockReason مطلوب.
  if (updates.isBlocked === true && !updates.blockReason && !customer.blockReason) {
    throw new AppError(
      'يجب إدخال سبب الحظر عند حظر الصيدلية.',
      400,
      'BLOCK_REASON_REQUIRED'
    );
  }

  // عند إلغاء الحظر → نمسح السبب.
  if (updates.isBlocked === false) {
    customer.blockReason = '';
  }

  const allowedFields = [
    'name',
    'ownerName',
    'phone',
    'phone2',
    'email',
    'address',
    'city',
    'taxNumber',
    'commercialRegister',
    'creditLimit',
    'paymentTerms',
    'returnGracePeriod',
    'assignedSalesRep',
    'isActive',
    'isBlocked',
    'blockReason',
    'notes',
  ];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      customer[field] = updates[field];
    }
  }

  await customer.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Customer',
    resourceId: customer._id,
    description: `تعديل صيدلية: ${customer.name}`,
    success: true,
    meta: {
      before,
      after: {
        name: customer.name,
        phone: customer.phone,
        assignedSalesRep: customer.assignedSalesRep,
        creditLimit: customer.creditLimit,
        isActive: customer.isActive,
        isBlocked: customer.isBlocked,
      },
    },
  });

  const populated = await customer.populate('assignedSalesRep', 'name email');

  return res.status(200).json({
    success: true,
    data: buildCustomerPayload(populated),
  });
});

// ============================================================
// 4) الحذف (Soft Delete)
// ============================================================

/**
 * DELETE /api/customers/:id
 *
 * @type {import('express').RequestHandler}
 */
export const deleteCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const customer = await Customer.findById(id);

  if (!customer) {
    throw new AppError('الصيدلية غير موجودة.', 404, 'CUSTOMER_NOT_FOUND');
  }

  if (!customer.isActive) {
    return res.status(200).json({
      success: true,
      data: { message: 'الصيدلية معطّلة بالفعل.' },
    });
  }

  // رصيد غير صفري → نمنع.
  if (Math.abs(customer.currentBalance || 0) > 0.01) {
    throw new AppError(
      `لا يمكن تعطيل الصيدلية — لديها رصيد ${customer.currentBalance}.`,
      409,
      'CUSTOMER_HAS_BALANCE'
    );
  }

  customer.isActive = false;
  await customer.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.DELETE,
    resource: 'Customer',
    resourceId: customer._id,
    description: `تعطيل صيدلية: ${customer.name}`,
    success: true,
    meta: {
      before: { name: customer.name, code: customer.code, isActive: true },
      after: { isActive: false },
    },
  });

  return res.status(200).json({
    success: true,
    data: { message: 'تم تعطيل الصيدلية.' },
  });
});

// ============================================================
// 5) Stubs + Balance (Phase 2)
// ============================================================

/**
 * GET /api/customers/:id/invoices
 * TODO: Phase 2 — سيُستبدل بـ Invoice.find({ pharmacy: id }).
 *
 * @type {import('express').RequestHandler}
 */
export const getCustomerInvoices = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id).select('_id');
  if (!customer) {
    throw new AppError('الصيدلية غير موجودة.', 404, 'CUSTOMER_NOT_FOUND');
  }

  return res.status(200).json({
    success: true,
    data: {
      items: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
      note: 'قائمة الفواتير ستُفعّل في المرحلة 2.',
    },
  });
});

/**
 * GET /api/customers/:id/balance
 * يُرجع الرصيد الحقيقي + المتاح (creditLimit - currentBalance).
 *
 * @type {import('express').RequestHandler}
 */
export const getCustomerBalance = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id).select(
    'name code currentBalance creditLimit isBlocked isActive'
  );

  if (!customer) {
    throw new AppError('الصيدلية غير موجودة.', 404, 'CUSTOMER_NOT_FOUND');
  }

  const currentBalance = customer.currentBalance || 0;
  const creditLimit = customer.creditLimit || 0;
  const available = creditLimit > 0 ? Math.max(0, creditLimit - currentBalance) : 0;

  return res.status(200).json({
    success: true,
    data: {
      customer: {
        id: customer._id,
        name: customer.name,
        code: customer.code,
      },
      currentBalance,
      creditLimit,
      available,
      isBlocked: Boolean(customer.isBlocked),
      isActive: Boolean(customer.isActive),
    },
  });
});

/**
 * GET /api/customers/:id/statement
 * TODO: Phase 2 — كشف حساب كامل (فواتير + دفعات + مرتجعات).
 *
 * @type {import('express').RequestHandler}
 */
export const getCustomerStatement = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id).select('_id');
  if (!customer) {
    throw new AppError('الصيدلية غير موجودة.', 404, 'CUSTOMER_NOT_FOUND');
  }

  return res.status(200).json({
    success: true,
    data: {
      items: [],
      note: 'كشف الحساب الكامل سيُفعّل في المرحلة 2.',
    },
  });
});

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerInvoices,
  getCustomerBalance,
  getCustomerStatement,
};