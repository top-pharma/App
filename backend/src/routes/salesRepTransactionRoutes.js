/**
 * @file salesRepTransactionRoutes.js
 * @description مسارات حركات المندوب — 6 مسارات.
 *
 * ✅ v10.9 (2026-11-16) — جديد.
 */

import express from 'express';

import {
  listTransactions,
  getTransaction,
  createTransaction,
  approveTransaction,
  payTransaction,
  cancelTransaction,
} from '../controllers/salesRepTransactionController.js';

import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';
import { validateBody, validateQuery, validateParams } from '../middlewares/validateMiddleware.js';
import { auditAction } from '../middlewares/auditLogMiddleware.js';
import { AUDIT_ACTIONS } from '../models/AuditLog.js';

import {
  createTransactionSchema,
  updateTransactionSchema,
  approveTransactionSchema,
  payTransactionSchema,
  cancelTransactionSchema,
  listTransactionsQuerySchema,
  transactionIdParamsSchema,
} from '../validators/salesRepTransactionValidator.js';

const router = express.Router();

router.use(requireAuth);

/* ═══════════════════════════════════════════════
 * 1) القراءة
 * ═══════════════════════════════════════════════ */
router.get(
  '/',
  requirePermissions('sales_rep_transactions.view'),
  validateQuery(listTransactionsQuerySchema),
  listTransactions
);

router.get(
  '/:id',
  requirePermissions('sales_rep_transactions.view'),
  validateParams(transactionIdParamsSchema),
  getTransaction
);

/* ═══════════════════════════════════════════════
 * 2) الإنشاء
 * ═══════════════════════════════════════════════ */
router.post(
  '/',
  requirePermissions('sales_rep_transactions.create'),
  validateBody(createTransactionSchema),
  auditAction({
    action: AUDIT_ACTIONS.CREATE,
    resource: 'SalesRepTransaction',
    description: 'إنشاء حركة مندوب',
  }),
  createTransaction
);

/* ═══════════════════════════════════════════════
 * 3) الموافقة / الدفع / الإلغاء
 * ═══════════════════════════════════════════════ */
router.post(
  '/:id/approve',
  requirePermissions('sales_rep_transactions.approve'),
  validateParams(transactionIdParamsSchema),
  validateBody(approveTransactionSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'SalesRepTransaction',
    description: 'موافقة على حركة مندوب',
  }),
  approveTransaction
);

router.post(
  '/:id/pay',
  requirePermissions('sales_rep_transactions.pay'),
  validateParams(transactionIdParamsSchema),
  validateBody(payTransactionSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'SalesRepTransaction',
    description: 'دفع حركة مندوب',
  }),
  payTransaction
);

router.post(
  '/:id/cancel',
  requirePermissions('sales_rep_transactions.cancel'),
  validateParams(transactionIdParamsSchema),
  validateBody(cancelTransactionSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'SalesRepTransaction',
    description: 'إلغاء حركة مندوب',
  }),
  cancelTransaction
);

export default router;