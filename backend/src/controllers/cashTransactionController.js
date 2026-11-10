/**
 * cashTransactionController.js
 *
 * إدارة حركات النقدية:
 *  - قائمة الحركات مع فلترة
 *  - إنشاء حركة يدوية
 *  - عكس حركة
 *  - ملخص الحركات (للتقارير)
 *
 * ✅ 🅳 (2026-11-09):
 * - listCashTransactions: إضافة referenceType + referenceId
 *   (لجلب دفعات فاتورة محددة)
 */

import CashTransaction from '../models/CashTransaction.js';
import cashService from '../services/cashService.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { AUDIT_ACTIONS } from '../utils/constants.js';

/* ─────────────────────────────────────────────────────────────
 * GET /api/cash-transactions
 * ───────────────────────────────────────────────────────────── */
export const listCashTransactions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      cashFundId,
      bankAccountId,
      method,
      direction,
      from,
      to,
      search,
      // ✅ 🅳: فلترة حسب المرجع (لدفعات فاتورة محددة)
      referenceType,
      referenceId,
    } = req.query;

    const filter = {};
    if (cashFundId) filter.cashFundId = cashFundId;
    if (bankAccountId) filter.bankAccountId = bankAccountId;
    if (method && method !== 'all') filter.method = method;
    if (direction && direction !== 'all') filter.direction = direction;

    // ✅ 🅳: referenceType + referenceId
    if (referenceType) filter.referenceType = referenceType;
    if (referenceId) filter.referenceId = referenceId;

    if (from || to) {
      filter.transactionDate = {};
      if (from) filter.transactionDate.$gte = new Date(from);
      if (to) filter.transactionDate.$lte = new Date(to);
    }
    if (search) {
      filter.description = { $regex: search, $options: 'i' };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [transactions, total] = await Promise.all([
      CashTransaction.find(filter)
        .populate('cashFundId', 'name code')
        .populate('bankAccountId', 'bankName accountNumber')
        .populate('createdBy', 'name email')
        .sort({ transactionDate: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      CashTransaction.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: transactions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/cash-transactions/:id
 * ───────────────────────────────────────────────────────────── */
export const getCashTransaction = async (req, res, next) => {
  try {
    const tx = await CashTransaction.findById(req.params.id)
      .populate('cashFundId', 'name code')
      .populate('bankAccountId', 'bankName accountNumber')
      .populate('createdBy', 'name email');

    if (!tx) {
      throw new AppError('الحركة غير موجودة', 404, 'TRANSACTION_NOT_FOUND');
    }
    res.status(200).json({ success: true, data: tx });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/cash-transactions
 * إنشاء حركة يدوية (إيداع / سحب / مصروف)
 * ───────────────────────────────────────────────────────────── */
export const createCashTransaction = async (req, res, next) => {
  try {
    const {
      direction,
      amount,
      method,
      cashFundId,
      bankAccountId,
      transactionDate,
      description,
      referenceType,
      referenceId,
    } = req.body;

    const tx = await cashService.createCashTransaction({
      direction,
      amount,
      method,
      cashFundId,
      bankAccountId,
      transactionDate,
      description,
      referenceType,
      referenceId,
      user: req.user,
    });

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.CREATE,
      resource: 'CashTransaction',
      resourceId: tx._id,
      description: `حركة نقدية يدوية: ${direction} ${amount} SDG (${method})`,
      success: true,
      meta: { after: tx.toObject() },
    });

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الحركة',
      data: tx,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/cash-transactions/:id/reverse
 * عكس حركة
 * ───────────────────────────────────────────────────────────── */
export const reverseCashTransaction = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const reversal = await cashService.reverseCashTransaction({
      transactionId: req.params.id,
      user: req.user,
      reason,
    });

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'CashTransaction',
      resourceId: req.params.id,
      description: `عكس حركة نقدية — السبب: ${reason || 'غير محدد'}`,
      success: true,
    });

    res.status(200).json({
      success: true,
      message: 'تم عكس الحركة',
      data: reversal,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/cash-transactions/summary
 * ملخص الحركات (للتقارير)
 * ───────────────────────────────────────────────────────────── */
export const getCashSummary = async (req, res, next) => {
  try {
    const { from, to, cashFundId, method } = req.query;
    const summary = await cashService.getCashSummary({ from, to, cashFundId, method });
    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
};