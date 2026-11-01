/**
 * accountingEntryController.js
 *
 * إدارة القيود المحاسبية:
 *  - قائمة القيود مع فلترة
 *  - عرض قيد
 *  - إنشاء قيد يدوي (نادر)
 *  - عكس قيد
 *  - ميزان المراجعة (Phase 4 — Stub)
 */

import AccountingEntry from '../models/AccountingEntry.js';
import accountingService from '../services/accountingService.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { AUDIT_ACTIONS } from '../utils/constants.js';

/* ─────────────────────────────────────────────────────────────
 * GET /api/accounting-entries
 * ───────────────────────────────────────────────────────────── */
export const listAccountingEntries = async (req, res, next) => {
  try {
    const { page, limit, entryType, from, to, sourceType, sourceId, cashFundId, search } = req.query;

    const filter = {};
    if (entryType) filter.entryType = entryType;
    if (sourceType) filter.sourceType = sourceType;
    if (sourceId) filter.sourceId = sourceId;
    if (cashFundId) filter.cashFundId = cashFundId;
    if (from || to) {
      filter.entryDate = {};
      if (from) filter.entryDate.$gte = new Date(from);
      if (to) filter.entryDate.$lte = new Date(to);
    }
    if (search) {
      filter.$or = [
        { entryNumber: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [entries, total] = await Promise.all([
      AccountingEntry.find(filter)
        .populate('cashFundId', 'name code')
        .populate('bankAccountId', 'bankName accountNumber')
        .populate('createdBy', 'fullName email')
        .sort({ entryDate: -1, entryNumber: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AccountingEntry.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: entries,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/accounting-entries/:id
 * ───────────────────────────────────────────────────────────── */
export const getAccountingEntry = async (req, res, next) => {
  try {
    const entry = await AccountingEntry.findById(req.params.id)
      .populate('cashFundId', 'name code')
      .populate('bankAccountId', 'bankName accountNumber')
      .populate('createdBy', 'fullName email')
      .populate('reversedBy', 'entryNumber');

    if (!entry) {
      throw new AppError('القيد غير موجود', 404, 'ENTRY_NOT_FOUND');
    }
    res.status(200).json({ success: true, data: entry });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/accounting-entries
 * إنشاء قيد يدوي (للتصحيحات فقط)
 * ───────────────────────────────────────────────────────────── */
export const createAccountingEntry = async (req, res, next) => {
  try {
    const {
      entryType,
      entryDate,
      description,
      lines,
      sourceType,
      sourceId,
      cashFundId,
      bankAccountId,
    } = req.body;

    const entry = await accountingService.createEntry({
      entryType,
      entryDate,
      description,
      lines,
      sourceType,
      sourceId,
      cashFundId,
      bankAccountId,
      user: req.user,
      meta: { manual: true },
    });

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.CREATE,
      resource: 'AccountingEntry',
      resourceId: entry._id,
      description: `قيد يدوي: ${entry.entryNumber} — ${description}`,
      success: true,
      meta: { after: entry.toObject() },
    });

    res.status(201).json({
      success: true,
      message: 'تم إنشاء القيد',
      data: entry,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/accounting-entries/:id/reverse
 * عكس قيد
 * ───────────────────────────────────────────────────────────── */
export const reverseEntry = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const reversal = await accountingService.reverseEntry({
      entryId: req.params.id,
      user: req.user,
      reason,
    });

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'AccountingEntry',
      resourceId: req.params.id,
      description: `عكس قيد — السبب: ${reason}`,
      success: true,
    });

    res.status(200).json({
      success: true,
      message: 'تم عكس القيد',
      data: reversal,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/accounting-entries/trial-balance
 * ميزان المراجعة (Phase 4 — Stub)
 * ───────────────────────────────────────────────────────────── */
export const getTrialBalance = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const result = await accountingService.getTrialBalance({ from, to });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};