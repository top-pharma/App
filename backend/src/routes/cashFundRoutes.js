/**
 * cashFundRoutes.js
 *
 * مسارات API لصناديق النقدية.
 * كل المسارات تتطلب مصادقة + صلاحيات مالية.
 */

import express from 'express';
import * as cashFundController from '../controllers/cashFundController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';
import { validate } from '../middlewares/validateMiddleware.js';
import {
  createCashFundSchema,
  updateCashFundSchema,
  cashFundMovementSchema,
  listCashFundsSchema,
} from '../validators/cashFundValidator.js';

const router = express.Router();

// كل المسارات تتطلب تسجيل دخول
router.use(requireAuth);

/* ─────────────────────────────────────────────────────────────
 * القراءة (متاحة لكل من لديه finance.view)
 * ───────────────────────────────────────────────────────────── */
router.get(
  '/',
  requirePermissions('finance.view'),
  validate(listCashFundsSchema, 'query'),
  cashFundController.listCashFunds
);

router.get(
  '/:id',
  requirePermissions('finance.view'),
  cashFundController.getCashFund
);

router.get(
  '/:id/transactions',
  requirePermissions('finance.view'),
  cashFundController.getFundTransactions
);

/* ─────────────────────────────────────────────────────────────
 * الكتابة (تتطلب finance.manage)
 * ───────────────────────────────────────────────────────────── */
router.post(
  '/',
  requirePermissions('finance.manage'),
  validate(createCashFundSchema),
  cashFundController.createCashFund
);

router.patch(
  '/:id',
  requirePermissions('finance.manage'),
  validate(updateCashFundSchema),
  cashFundController.updateCashFund
);

router.delete(
  '/:id',
  requirePermissions('finance.manage'),
  cashFundController.deleteCashFund
);

router.post(
  '/:id/set-default',
  requirePermissions('finance.manage'),
  cashFundController.setAsDefault
);

router.post(
  '/:id/movement',
  requirePermissions('finance.manage'),
  validate(cashFundMovementSchema),
  cashFundController.cashFundMovement
);

export default router;