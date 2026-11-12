/**
 * @file auditLogController.js
 * @description
 * إدارة سجل التدقيق (AuditLog) — قراءة فقط.
 *
 * لماذا هذا الملف؟
 * - متطلب صريح: "عرض سجل التدقيق" — للمدير فقط.
 * - السجلات immutable — لا إنشاء/تعديل/حذف من API.
 * - نُوفّر:
 *   1. قائمة السجلات (مع فلاتر متقدمة).
 *   2. سجل واحد (تفاصيل كاملة).
 *   3. سجلات مورد محدد (كل حركات حساب بنكي/صندوق/فاتورة).
 *   4. إحصائيات سريعة (اختياري).
 */

import AuditLog from '../models/AuditLog.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import logger from '../utils/logger.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/* ─────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

/**
 * بناء filter من query params.
 */
const buildFilter = (query) => {
  const {
    action,
    resource,
    resourceId,
    actor,
    success,
    from,
    to,
    search,
  } = query;

  const filter = {};

  if (action) filter.action = action;
  if (resource) filter.resource = resource;
  if (resourceId) filter.resourceId = resourceId;
  if (actor) filter.actor = actor;

  if (success && success !== 'all') {
    filter.success = success === 'true';
  }

  if (from || to) {
    filter.occurredAt = {};
    if (from) filter.occurredAt.$gte = new Date(from);
    if (to) filter.occurredAt.$lte = new Date(to);
  }

  if (search) {
    const re = { $regex: search, $options: 'i' };
    filter.$or = [
      { description: re },
      { actorName: re },
      { actorEmail: re },
      { path: re },
      { resource: re },
    ];
  }

  return filter;
};

/**
 * بناء sort من query params.
 */
const buildSort = (query) => {
  const sortBy = query.sortBy || 'occurredAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
  return { [sortBy]: sortOrder };
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/audit-logs
 * قائمة السجلات — مع Pagination + فلاتر.
 * ───────────────────────────────────────────────────────────── */
export const listAuditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const filter = buildFilter(req.query);
    const sort = buildSort(req.query);

    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actor', 'name email role')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: logs,
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
 * GET /api/audit-logs/:id
 * سجل واحد — تفاصيل كاملة.
 * ───────────────────────────────────────────────────────────── */
export const getAuditLog = async (req, res, next) => {
  try {
    const log = await AuditLog.findById(req.params.id)
      .populate('actor', 'name email role');

    if (!log) {
      throw new AppError('السجل غير موجود', 404, 'AUDIT_LOG_NOT_FOUND');
    }

    res.status(200).json({ success: true, data: log });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/audit-logs/resource/:resource/:resourceId
 * كل سجلات مورد محدد (مثلاً: BankAccount/6aec...).
 * ───────────────────────────────────────────────────────────── */
export const getResourceAuditLogs = async (req, res, next) => {
  try {
    const { resource, resourceId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const filter = { resource, resourceId };
    const sort = { occurredAt: -1 };
    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actor', 'name email role')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: logs,
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
 * GET /api/audit-logs/summary
 * إحصائيات سريعة (اختياري — للـ Dashboard).
 * ───────────────────────────────────────────────────────────── */
export const getAuditSummary = async (req, res, next) => {
  try {
    const { from, to } = req.query;

    const match = {};
    if (from || to) {
      match.occurredAt = {};
      if (from) match.occurredAt.$gte = new Date(from);
      if (to) match.occurredAt.$lte = new Date(to);
    }

    const byAction = await AuditLog.aggregate([
      { $match: match },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const byResource = await AuditLog.aggregate([
      { $match: match },
      { $group: { _id: '$resource', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);

    const failedCount = await AuditLog.countDocuments({ ...match, success: false });
    const totalCount = await AuditLog.countDocuments(match);

    res.status(200).json({
      success: true,
      data: {
        total: totalCount,
        failed: failedCount,
        success: totalCount - failedCount,
        byAction: byAction.map((x) => ({ action: x._id, count: x.count })),
        byResource: byResource.map((x) => ({ resource: x._id, count: x.count })),
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * التصدير الافتراضي
 * ───────────────────────────────────────────────────────────── */
export default {
  listAuditLogs,
  getAuditLog,
  getResourceAuditLogs,
  getAuditSummary,
};