/**
 * cashTransactionRoutes.js
 *
 * مسارات API لحركات النقدية.
 */

import express from 'express';
import * as cashTransactionController from '../controllers/cashTransactionController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';
import { validate } from '../middlewares/validateMiddleware.js';
import {
  createCashTransactionSchema,
  listCashTransactionsSchema,
  cashSummarySchema,
} from '../validators/cashTransactionValidator.js';
import { reverseEntrySchema } from '../validators/accountingEntryValidator.js';

const router = express.Router();

router.use(requireAuth);

/* ─────────────────────────────────────────────────────────────
 * القراءة
 * ───────────────────────────────────────────────────────────── */
router.get(
  '/',
  requirePermissions('finance.transactions.view'),
  validate(listCashTransactionsSchema, 'query'),
  cashTransactionController.listCashTransactions
);

router.get(
  '/summary',
  requirePermissions('finance.transactions.view'),
  validate(cashSummarySchema, 'query'),
  cashTransactionController.getCashSummary
);

router.get(
  '/:id',
  requirePermissions('finance.transactions.view'),
  cashTransactionController.getCashTransaction
);

/* ─────────────────────────────────────────────────────────────
 * الكتابة
 * ───────────────────────────────────────────────────────────── */
router.post(
  '/',
  requirePermissions('finance.manage'),
  validate(createCashTransactionSchema),
  cashTransactionController.createCashTransaction
);

router.post(
  '/:id/reverse',
  requirePermissions('finance.manage'),
  validate(reverseEntrySchema),
  cashTransactionController.reverseCashTransaction
);

export default router;