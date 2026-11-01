/**
 * @file notificationRoutes.js
 * @description
 * مسارات API للإشعارات الداخلية (Phase 5).
 *
 * القواعد:
 * - كل المسارات محمية بـ requireAuth.
 * - كل المسارات تتطلب notifications.view (كل الأدوار تملكها).
 * - الحماية من cross-user عبر Controller (recipient === req.user._id).
 *
 * ⚠️ الترتيب: specific paths (read-all, read, unread-count) قبل parametrized (/:id).
 */

import express from 'express';
import * as notificationController from '../controllers/notificationController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';

const router = express.Router();

router.use(requireAuth);

/* ─────────────────────────────────────────────────────────────
 * Bulk operations (specific — قبل parametrized)
 * ───────────────────────────────────────────────────────────── */
router.patch(
  '/read-all',
  requirePermissions('notifications.view'),
  notificationController.markAllAsRead
);

router.delete(
  '/read',
  requirePermissions('notifications.view'),
  notificationController.deleteAllRead
);

/* ─────────────────────────────────────────────────────────────
 * القراءة (specific قبل parametrized)
 * ───────────────────────────────────────────────────────────── */
router.get(
  '/unread-count',
  requirePermissions('notifications.view'),
  notificationController.getUnreadCount
);

router.get(
  '/',
  requirePermissions('notifications.view'),
  notificationController.listNotifications
);

/* ─────────────────────────────────────────────────────────────
 * عمليات فردية (parametrized — آخر شيء)
 * ───────────────────────────────────────────────────────────── */
router.patch(
  '/:id/read',
  requirePermissions('notifications.view'),
  notificationController.markAsRead
);

router.delete(
  '/:id',
  requirePermissions('notifications.view'),
  notificationController.deleteNotification
);

export default router;