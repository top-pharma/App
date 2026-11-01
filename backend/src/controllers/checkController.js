/**
 * @file checkController.js
 * @description
 * Controllers للشيكات — النسخة المبسطة (Phase 3).
 *  - listChecks / getCheck
 *  - createCheck (تسجيل فقط)
 *  - settleCheck (الحدث الوحيد المؤثر)
 *  - bounceCheck / cancelCheck
 *  - getUpcomingChecks / getOverdueChecks
 */

import Check from '../models/Check.js';
import checkService from '../services/checkService.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { AUDIT_ACTIONS } from '../utils/constants.js';

/* ─────────────────────────────────────────────────────────────
 * GET /api/checks
 * ───────────────────────────────────────────────────────────── */
export const listChecks = async (req, res, next) => {
  try {
    const { page, limit, type, status, from, to, search } = req.query;

    const filter = {};
    if (type !== 'all') filter.type = type;
    if (status !== 'all') filter.status = status;
    if (from || to) {
      filter.dueDate = {};
      if (from) filter.dueDate.$gte = new Date(from);
      if (to) filter.dueDate.$lte = new Date(to);
    }
    if (search) {
      filter.$or = [
        { checkNumber: { $regex: search, $options: 'i' } },
        { bankName: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [checks, total] = await Promise.all([
      Check.find(filter)
        .populate('customerId', 'name phone')
        .populate('supplierId', 'name phone')
        .populate('invoiceId', 'invoiceNumber')
        .populate('cashFundId', 'name')
        .populate('bankAccountId', 'bankName accountNumber')
        .sort({ dueDate: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Check.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: checks,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/checks/:id
 * ───────────────────────────────────────────────────────────── */
export const getCheck = async (req, res, next) => {
  try {
    const check = await Check.findById(req.params.id)
      .populate('customerId', 'name phone code')
      .populate('supplierId', 'name phone code')
      .populate('invoiceId', 'invoiceNumber total status')
      .populate('bankAccountId', 'bankName accountNumber')
      .populate('cashFundId', 'name code')
      .populate('createdBy', 'fullName')
      .populate('paidBy', 'fullName');

    if (!check) {
      throw new AppError('الشيك غير موجود', 404, 'CHECK_NOT_FOUND');
    }
    res.status(200).json({ success: true, data: check });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/checks — تسجيل شيك (بلا تأثير مالي)
 * ───────────────────────────────────────────────────────────── */
export const createCheck = async (req, res, next) => {
  try {
    const check = await checkService.createCheck({
      ...req.body,
      user: req.user,
    });

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.CREATE,
      resource: 'Check',
      resourceId: check._id,
      description: `تسجيل شيك ${check.type}: ${check.checkNumber} — ${check.amount} SDG`,
      success: true,
      meta: { after: check.toObject() },
    });

    res.status(201).json({
      success: true,
      message: 'تم تسجيل الشيك (بانتظار الصرف — لم يؤثر على الأرصدة)',
      data: check,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/checks/:id/settle — تسجيل الصرف (يؤثر على الأرصدة)
 * ───────────────────────────────────────────────────────────── */
export const settleCheck = async (req, res, next) => {
  try {
    const { paymentMethod, cashFundId, bankAccountId, paymentDate } = req.body;
    const check = await checkService.settleCheck({
      checkId: req.params.id,
      paymentMethod,
      cashFundId,
      bankAccountId,
      paymentDate,
      user: req.user,
    });

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'Check',
      resourceId: check._id,
      description: `صرف شيك: ${check.checkNumber} — ${check.amount} SDG (${paymentMethod})`,
      success: true,
    });

    res.status(200).json({
      success: true,
      message: 'تم تسجيل صرف الشيك — تم تحديث الأرصدة والقيود',
      data: check,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/checks/:id/bounce
 * ───────────────────────────────────────────────────────────── */
export const bounceCheck = async (req, res, next) => {
  try {
    const { bounceReason } = req.body;
    const check = await checkService.bounceCheck({
      checkId: req.params.id,
      bounceReason,
      user: req.user,
    });

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'Check',
      resourceId: check._id,
      description: `ارتداد شيك: ${check.checkNumber} — السبب: ${bounceReason}`,
      success: true,
    });

    res.status(200).json({
      success: true,
      message: 'تم تسجيل ارتداد الشيك — تم عكس الحركة والأرصدة',
      data: check,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/checks/:id/cancel
 * ───────────────────────────────────────────────────────────── */
export const cancelCheck = async (req, res, next) => {
  try {
    const { cancelReason } = req.body;
    const check = await checkService.cancelCheck({
      checkId: req.params.id,
      cancelReason,
      user: req.user,
    });

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'Check',
      resourceId: check._id,
      description: `إلغاء شيك: ${check.checkNumber} — السبب: ${cancelReason}`,
      success: true,
    });

    res.status(200).json({
      success: true,
      message: 'تم إلغاء الشيك',
      data: check,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/checks/upcoming
 * ───────────────────────────────────────────────────────────── */
export const getUpcomingChecks = async (req, res, next) => {
  try {
    const { days = 7 } = req.query;
    const checks = await checkService.getUpcomingChecks({
      thresholdDays: parseInt(days, 10) || 7,
    });
    res.status(200).json({ success: true, data: checks });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/checks/overdue
 * ───────────────────────────────────────────────────────────── */
export const getOverdueChecks = async (req, res, next) => {
  try {
    const checks = await checkService.getOverdueChecks();
    res.status(200).json({ success: true, data: checks });
  } catch (error) {
    next(error);
  }
};