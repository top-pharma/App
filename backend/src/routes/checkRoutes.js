/**
 * @file checkRoutes.js
 * @description
 * مسارات API للشيكات — النسخة المبسطة (Phase 3).
 * أُزيل /collect و /pay — استُبدلا بـ /settle.
 */

import express from 'express';
import * as checkController from '../controllers/checkController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';
import { validate } from '../middlewares/validateMiddleware.js';
import {
  createCheckSchema,
  settleCheckSchema,
  bounceCheckSchema,
  cancelCheckSchema,
  listChecksSchema,
} from '../validators/checkValidator.js';

const router = express.Router();

router.use(requireAuth);

/* ─────────────────────────────────────────────────────────────
 * القراءة
 * ───────────────────────────────────────────────────────────── */
router.get(
  '/',
  requirePermissions('finance.view'),
  validate(listChecksSchema, 'query'),
  checkController.listChecks
);

router.get(
  '/upcoming',
  requirePermissions('finance.view'),
  checkController.getUpcomingChecks
);

router.get(
  '/overdue',
  requirePermissions('finance.view'),
  checkController.getOverdueChecks
);

router.get(
  '/:id',
  requirePermissions('finance.view'),
  checkController.getCheck
);

/* ─────────────────────────────────────────────────────────────
 * الكتابة
 * ───────────────────────────────────────────────────────────── */
router.post(
  '/',
  requirePermissions('finance.checks.manage'),
  validate(createCheckSchema),
  checkController.createCheck
);

router.post(
  '/:id/settle',
  requirePermissions('finance.checks.manage'),
  validate(settleCheckSchema),
  checkController.settleCheck
);

router.post(
  '/:id/bounce',
  requirePermissions('finance.checks.manage'),
  validate(bounceCheckSchema),
  checkController.bounceCheck
);

router.post(
  '/:id/cancel',
  requirePermissions('finance.checks.manage'),
  validate(cancelCheckSchema),
  checkController.cancelCheck
);

export default router;