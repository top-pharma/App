/**
 * @file salesRepTransactionController.js
 * @description
 * واجهات التحكم لحركات المندوب — 6 دوال.
 *
 * ✅ v10.9 (2026-11-16) — جديد.
 */

import { AUDIT_ACTIONS } from '../models/AuditLog.js';
import SalesRepTransaction, {
  SALES_REP_TRANSACTION_TYPES,
  SALES_REP_DIRECTIONS,
  SALES_REP_TRANSACTION_STATUSES,
} from '../models/SalesRepTransaction.js';
import User from '../models/User.js';
import cashService from '../services/cashService.js';
import accountingService from '../services/accountingService.js';
import { AppError, asyncHandler } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { logger } from '../utils/logger.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/* ─────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

async function generateTransactionNumber() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `SRT-${dateStr}-`;

  const lastTx = await SalesRepTransaction.findOne({
    transactionNumber: { $regex: `^${prefix}` },
  })
    .sort({ transactionNumber: -1 })
    .select('transactionNumber')
    .lean();

  let seq = 1;
  if (lastTx?.transactionNumber) {
    const parts = lastTx.transactionNumber.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

const buildPayload = (tx) => ({
  id: tx._id,
  transactionNumber: tx.transactionNumber,
  salesRep: tx.salesRep,
  type: tx.type,
  direction: tx.direction,
  amount: round2(tx.amount),
  balanceAfter: round2(tx.balanceAfter || 0),
  description: tx.description,
  reason: tx.reason || '',
  referenceType: tx.referenceType || '',
  referenceId: tx.referenceId || null,
  transactionDate: tx.transactionDate,
  status: tx.status,
  approvedBy: tx.approvedBy || null,
  approvedAt: tx.approvedAt || null,
  paidAt: tx.paidAt || null,
  paidBy: tx.paidBy || null,
  paymentTransaction: tx.paymentTransaction || null,
  cancelledAt: tx.cancelledAt || null,
  cancelledBy: tx.cancelledBy || null,
  cancelReason: tx.cancelReason || '',
  notes: tx.notes || '',
  createdAt: tx.createdAt,
  updatedAt: tx.updatedAt,
});

/* ─────────────────────────────────────────────────────────────
 * 1) listTransactions
 * ───────────────────────────────────────────────────────────── */

export const listTransactions = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const { page, limit, search, salesRep, type, direction, status, dateFrom, dateTo, sortBy, sortOrder } = q;

  const filter = {};

  // scope: sales_rep يرى حركاته فقط
  if (req.user.role === 'sales_rep') {
    filter.salesRep = req.user._id;
  } else if (salesRep) {
    filter.salesRep = salesRep;
  }

  if (type) filter.type = type;
  if (direction) filter.direction = direction;
  if (status) filter.status = status;

  if (dateFrom || dateTo) {
    filter.transactionDate = {};
    if (dateFrom) filter.transactionDate.$gte = dateFrom;
    if (dateTo) filter.transactionDate.$lte = dateTo;
  }

  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ transactionNumber: rx }, { description: rx }, { notes: rx }];
  }

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;
  const skip = (pageNum - 1) * limitNum;
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [items, total] = await Promise.all([
    SalesRepTransaction.find(filter)
      .populate('salesRep', 'name email')
      .sort({ [sortBy]: sortDirection, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    SalesRepTransaction.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      items: items.map(buildPayload),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasNext: skip + items.length < total,
        hasPrev: pageNum > 1,
      },
    },
  });
});

/* ─────────────────────────────────────────────────────────────
 * 2) getTransaction
 * ───────────────────────────────────────────────────────────── */

export const getTransaction = asyncHandler(async (req, res) => {
  const tx = await SalesRepTransaction.findById(req.params.id)
    .populate('salesRep', 'name email phone')
    .populate('approvedBy', 'name')
    .populate('paidBy', 'name')
    .populate('cancelledBy', 'name')
    .populate('paymentTransaction', 'transactionNumber amount');

  if (!tx) throw new AppError('الحركة غير موجودة.', 404, 'TRANSACTION_NOT_FOUND');

  // scope: sales_rep يرى حركاته فقط
  if (req.user.role === 'sales_rep' && String(tx.salesRep?._id) !== String(req.user._id)) {
    throw new AppError('غير مصرح.', 403, 'FORBIDDEN');
  }

  return res.status(200).json({ success: true, data: buildPayload(tx) });
});

/* ─────────────────────────────────────────────────────────────
 * 3) createTransaction (يدوي)
 * ───────────────────────────────────────────────────────────── */

export const createTransaction = asyncHandler(async (req, res) => {
  const data = req.body;

  // التحقق من المندوب
  const rep = await User.findOne({ _id: data.salesRep, role: 'sales_rep', isActive: true })
    .select('_id name email')
    .lean();
  if (!rep) throw new AppError('المندوب غير موجود أو غير نشط.', 400, 'SALES_REP_NOT_FOUND');

  // sales_rep لا يمكنه إنشاء حركات — فقط admin/accountant
  if (req.user.role === 'sales_rep') {
    throw new AppError('غير مصرح بإنشاء حركات مالية.', 403, 'FORBIDDEN');
  }

  const transactionNumber = await generateTransactionNumber();

  const tx = await SalesRepTransaction.create({
    transactionNumber,
    salesRep: data.salesRep,
    type: data.type,
    direction: data.direction,
    amount: round2(data.amount),
    description: data.description,
    reason: data.reason || '',
    referenceType: data.referenceType || '',
    referenceId: data.referenceId || null,
    transactionDate: data.transactionDate || new Date(),
    notes: data.notes || '',
    status: 'pending',
    createdBy: req.user._id,
  });

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.CREATE,
    resource: 'SalesRepTransaction',
    resourceId: tx._id,
    description: `إنشاء حركة مندوب: ${tx.transactionNumber} — ${tx.type} — ${tx.amount} SDG`,
    success: true,
    meta: { after: buildPayload(tx) },
  });

  return res.status(201).json({ success: true, data: buildPayload(tx) });
});

/* ─────────────────────────────────────────────────────────────
 * 4) approveTransaction
 * ───────────────────────────────────────────────────────────── */

export const approveTransaction = asyncHandler(async (req, res) => {
  const tx = await SalesRepTransaction.findById(req.params.id);
  if (!tx) throw new AppError('الحركة غير موجودة.', 404, 'TRANSACTION_NOT_FOUND');

  if (tx.status !== 'pending') {
    throw new AppError(`لا يمكن الموافقة على حركة في حالة "${tx.status}".`, 409, 'INVALID_STATUS');
  }

  tx.status = 'approved';
  tx.approvedBy = req.user._id;
  tx.approvedAt = new Date();
  if (req.body.notes) tx.notes = req.body.notes;

  await tx.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'SalesRepTransaction',
    resourceId: tx._id,
    description: `موافقة على حركة ${tx.transactionNumber}`,
    success: true,
  });

  return res.status(200).json({ success: true, data: buildPayload(tx), message: 'تمت الموافقة.' });
});

/* ─────────────────────────────────────────────────────────────
 * 5) payTransaction
 * ───────────────────────────────────────────────────────────── */

export const payTransaction = asyncHandler(async (req, res) => {
  const { cashFundId, bankAccountId, paymentMethod = 'cash' } = req.body;

  const tx = await SalesRepTransaction.findById(req.params.id);
  if (!tx) throw new AppError('الحركة غير موجودة.', 404, 'TRANSACTION_NOT_FOUND');

  if (tx.status !== 'approved') {
    throw new AppError(`لا يمكن الدفع لحركة في حالة "${tx.status}".`, 409, 'INVALID_STATUS');
  }

  // direction: debit → دفع للمندوب (خروج نقدي)
  // direction: credit → استلام من المندوب (دخول نقدي)
  // ⚠️ credit = له (المندوب استحق) — الشركة تدفع له → out
  // ⚠️ debit = عليه (المندوب مدين) — الشركة تستلم منه → in
  const cashDirection = tx.direction === 'credit' ? 'out' : 'in';

  let cashTx = null;
  try {
    cashTx = await cashService.createCashTransaction({
      direction: cashDirection,
      amount: tx.amount,
      method: paymentMethod,
      cashFundId: paymentMethod === 'cash' ? cashFundId : null,
      bankAccountId: paymentMethod === 'bank' ? bankAccountId : null,
      transactionDate: new Date(),
      description: `دفع حركة مندوب ${tx.transactionNumber} — ${tx.description}`,
      referenceType: 'sales_rep_transaction',
      referenceId: tx._id,
      user: req.user,
      skipEntry: true,
    });
  } catch (cashErr) {
    logger.error(`فشل تسجيل الدفعة النقدية: ${cashErr.message}`);
    throw new AppError(`فشل تسجيل الدفعة: ${cashErr.message}`, 500, 'CASH_TX_FAILED');
  }

  tx.status = 'paid';
  tx.paidAt = new Date();
  tx.paidBy = req.user._id;
  tx.paymentTransaction = cashTx._id;
  await tx.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'SalesRepTransaction',
    resourceId: tx._id,
    description: `دفع حركة ${tx.transactionNumber} — ${tx.amount} SDG`,
    success: true,
  });

  return res.status(200).json({ success: true, data: buildPayload(tx), message: 'تم الدفع.' });
});

/* ─────────────────────────────────────────────────────────────
 * 6) cancelTransaction
 * ───────────────────────────────────────────────────────────── */

export const cancelTransaction = asyncHandler(async (req, res) => {
  const { cancelReason } = req.body;
  const tx = await SalesRepTransaction.findById(req.params.id);
  if (!tx) throw new AppError('الحركة غير موجودة.', 404, 'TRANSACTION_NOT_FOUND');

  if (tx.status === 'cancelled') {
    throw new AppError('الحركة ملغاة مسبقاً.', 409, 'ALREADY_CANCELLED');
  }
  if (tx.status === 'paid') {
    throw new AppError('لا يمكن إلغاء حركة مدفوعة.', 409, 'ALREADY_PAID');
  }

  tx.status = 'cancelled';
  tx.cancelledAt = new Date();
  tx.cancelledBy = req.user._id;
  tx.cancelReason = cancelReason;
  await tx.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'SalesRepTransaction',
    resourceId: tx._id,
    description: `إلغاء حركة ${tx.transactionNumber}: ${cancelReason}`,
    success: true,
  });

  return res.status(200).json({ success: true, data: buildPayload(tx), message: 'تم الإلغاء.' });
});

export default {
  listTransactions,
  getTransaction,
  createTransaction,
  approveTransaction,
  payTransaction,
  cancelTransaction,
};