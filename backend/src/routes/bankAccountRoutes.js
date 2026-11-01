/**
 * bankAccountRoutes.js
 *
 * مسارات API للحساب البنكي.
 */

import express from 'express';
import * as bankAccountController from '../controllers/bankAccountController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';
import { validate } from '../middlewares/validateMiddleware.js';
import {
  createBankAccountSchema,
  updateBankAccountSchema,
  listBankAccountsSchema,
} from '../validators/bankAccountValidator.js';

const router = express.Router();

router.use(requireAuth);

/* ─────────────────────────────────────────────────────────────
 * القراءة
 * ───────────────────────────────────────────────────────────── */
router.get(
  '/',
  requirePermissions('finance.view'),
  validate(listBankAccountsSchema, 'query'),
  bankAccountController.listBankAccounts
);

router.get(
  '/active',
  requirePermissions('finance.view'),
  bankAccountController.getActiveBankAccount
);

router.get(
  '/:id',
  requirePermissions('finance.view'),
  bankAccountController.getBankAccount
);

/* ─────────────────────────────────────────────────────────────
 * الكتابة
 * ───────────────────────────────────────────────────────────── */
router.post(
  '/',
  requirePermissions('finance.manage'),
  validate(createBankAccountSchema),
  bankAccountController.createBankAccount
);

router.patch(
  '/:id',
  requirePermissions('finance.manage'),
  validate(updateBankAccountSchema),
  bankAccountController.updateBankAccount
);

router.delete(
  '/:id',
  requirePermissions('finance.manage'),
  bankAccountController.deleteBankAccount
);

export default router;