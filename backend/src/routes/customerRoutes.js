/**
 * @file customerRoutes.js
 * @description
 * مسارات الصيدليات (/api/customers).
 *
 * ملاحظة: sales_rep يرى صيدلياته فقط (عبر scopeSalesRepToOwnCustomers).
 */

import express from 'express';

import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerInvoices,
  getCustomerBalance,
  getCustomerStatement,
} from '../controllers/customerController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  requirePermissions,
  scopeSalesRepToOwnCustomers,
} from '../middlewares/rbacMiddleware.js';
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersQuerySchema,
  customerIdParamsSchema,
} from '../validators/customerValidator.js';
import {
  validateBody,
  validateQuery,
  validateParams,
} from '../middlewares/validateMiddleware.js';
import { auditAction } from '../middlewares/auditLogMiddleware.js';
import { AUDIT_ACTIONS } from '../models/AuditLog.js';

const router = express.Router();

router.use(requireAuth);

// ────────────────────────────────────────────────────────────
// GET /api/customers
// ────────────────────────────────────────────────────────────
router.get(
  '/',
  requirePermissions('customers.read'),
  scopeSalesRepToOwnCustomers,
  validateQuery(listCustomersQuerySchema),
  listCustomers
);

// ────────────────────────────────────────────────────────────
// POST /api/customers
// ────────────────────────────────────────────────────────────
router.post(
  '/',
  requirePermissions('customers.create'),
  validateBody(createCustomerSchema),
  auditAction({
    action: AUDIT_ACTIONS.CREATE,
    resource: 'Customer',
    description: 'إنشاء صيدلية جديدة',
  }),
  createCustomer
);

// ────────────────────────────────────────────────────────────
// GET /api/customers/:id
// ────────────────────────────────────────────────────────────
router.get(
  '/:id',
  requirePermissions('customers.read'),
  scopeSalesRepToOwnCustomers,
  validateParams(customerIdParamsSchema),
  getCustomer
);

// ────────────────────────────────────────────────────────────
// GET /api/customers/:id/invoices
// ────────────────────────────────────────────────────────────
router.get(
  '/:id/invoices',
  requirePermissions('customers.read'),
  scopeSalesRepToOwnCustomers,
  validateParams(customerIdParamsSchema),
  getCustomerInvoices
);

// ────────────────────────────────────────────────────────────
// GET /api/customers/:id/balance
// ────────────────────────────────────────────────────────────
router.get(
  '/:id/balance',
  requirePermissions('customers.read'),
  scopeSalesRepToOwnCustomers,
  validateParams(customerIdParamsSchema),
  getCustomerBalance
);

// ────────────────────────────────────────────────────────────
// GET /api/customers/:id/statement
// ────────────────────────────────────────────────────────────
router.get(
  '/:id/statement',
  requirePermissions('customers.read'),
  scopeSalesRepToOwnCustomers,
  validateParams(customerIdParamsSchema),
  getCustomerStatement
);

// ────────────────────────────────────────────────────────────
// PATCH /api/customers/:id
// ────────────────────────────────────────────────────────────
router.patch(
  '/:id',
  requirePermissions('customers.update'),
  validateParams(customerIdParamsSchema),
  validateBody(updateCustomerSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Customer',
    description: 'تعديل صيدلية',
  }),
  updateCustomer
);

// ────────────────────────────────────────────────────────────
// DELETE /api/customers/:id
// ────────────────────────────────────────────────────────────
router.delete(
  '/:id',
  requirePermissions('customers.delete'),
  validateParams(customerIdParamsSchema),
  auditAction({
    action: AUDIT_ACTIONS.DELETE,
    resource: 'Customer',
    description: 'تعطيل صيدلية',
  }),
  deleteCustomer
);

export default router;