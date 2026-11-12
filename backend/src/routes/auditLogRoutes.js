/**
 * @file auditLogRoutes.js
 * @description
 * مسارات API لسجل التدقيق (AuditLog) — قراءة فقط.
 *
 * الصلاحيات:
 * - audit.view: عرض السجلات (admin فقط — أو من يملك الصلاحية).
 *
 * ⚠️ لا يوجد POST/PATCH/DELETE — السجلات immutable.
 */

import express from 'express';

import {
  listAuditLogs,
  getAuditLog,
  getResourceAuditLogs,
  getAuditSummary,
} from '../controllers/auditLogController.js';

import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';
import {
  validateQuery,
  validateParams,
} from '../middlewares/validateMiddleware.js';

import {
  listAuditLogsQuerySchema,
  auditLogIdParamsSchema,
  resourceAuditLogsParamsSchema,
} from '../validators/auditLogValidator.js';

const router = express.Router();

// كل المسارات تتطلب مصادقة
router.use(requireAuth);

/* ═══════════════════════════════════════════════════════════
 * 1) القراءة — قائمة السجلات
 * GET /api/audit-logs?page=1&limit=20&resource=BankAccount&action=update
 * ═══════════════════════════════════════════════════════════ */
router.get(
  '/',
  requirePermissions('audit.view'),
  validateQuery(listAuditLogsQuerySchema),
  listAuditLogs
);

/* ═══════════════════════════════════════════════════════════
 * 2) إحصائيات سريعة
 * GET /api/audit-logs/summary?from=...&to=...
 * ═══════════════════════════════════════════════════════════ */
router.get(
  '/summary',
  requirePermissions('audit.view'),
  getAuditSummary
);

/* ═══════════════════════════════════════════════════════════
 * 3) سجلات مورد محدد
 * GET /api/audit-logs/resource/:resource/:resourceId
 * مثال: /api/audit-logs/resource/BankAccount/6aec64dd...
 * ═══════════════════════════════════════════════════════════ */
router.get(
  '/resource/:resource/:resourceId',
  requirePermissions('audit.view'),
  validateParams(resourceAuditLogsParamsSchema),
  getResourceAuditLogs
);

/* ═══════════════════════════════════════════════════════════
 * 4) سجل واحد
 * GET /api/audit-logs/:id
 * ═══════════════════════════════════════════════════════════ */
router.get(
  '/:id',
  requirePermissions('audit.view'),
  validateParams(auditLogIdParamsSchema),
  getAuditLog
);

export default router;