/**
 * accountingEntryRoutes.js
 *
 * مسارات API للقيود المحاسبية.
 */

import express from 'express';
import * as accountingEntryController from '../controllers/accountingEntryController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';
import { validate } from '../middlewares/validateMiddleware.js';
import {
  createAccountingEntrySchema,
  listAccountingEntriesSchema,
  reverseEntrySchema,
} from '../validators/accountingEntryValidator.js';

const router = express.Router();

router.use(requireAuth);

/* ─────────────────────────────────────────────────────────────
 * القراءة
 * ───────────────────────────────────────────────────────────── */
router.get(
  '/',
  requirePermissions('finance.entries.view'),
  validate(listAccountingEntriesSchema, 'query'),
  accountingEntryController.listAccountingEntries
);

router.get(
  '/trial-balance',
  requirePermissions('finance.entries.view'),
  accountingEntryController.getTrialBalance
);

router.get(
  '/:id',
  requirePermissions('finance.entries.view'),
  accountingEntryController.getAccountingEntry
);

/* ─────────────────────────────────────────────────────────────
 * الكتابة (نادرة — للتصحيحات فقط)
 * ───────────────────────────────────────────────────────────── */
router.post(
  '/',
  requirePermissions('finance.entries.manage'),
  validate(createAccountingEntrySchema),
  accountingEntryController.createAccountingEntry
);

router.post(
  '/:id/reverse',
  requirePermissions('finance.entries.manage'),
  validate(reverseEntrySchema),
  accountingEntryController.reverseEntry
);

export default router;