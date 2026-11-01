/**
 * @file supplierRoutes.js
 * @description
 * مسارات الموردين (/api/suppliers).
 */

import express from 'express';

import {
  listSuppliers,
  getSupplier,
  getSupplierReceipts,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '../controllers/supplierController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';
import {
  createSupplierSchema,
  updateSupplierSchema,
  listSuppliersQuerySchema,
  supplierIdParamsSchema,
} from '../validators/supplierValidator.js';
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
// GET /api/suppliers
// ────────────────────────────────────────────────────────────
router.get(
  '/',
  requirePermissions('suppliers.read'),
  validateQuery(listSuppliersQuerySchema),
  listSuppliers
);

// ────────────────────────────────────────────────────────────
// POST /api/suppliers
// ────────────────────────────────────────────────────────────
router.post(
  '/',
  requirePermissions('suppliers.create'),
  validateBody(createSupplierSchema),
  auditAction({
    action: AUDIT_ACTIONS.CREATE,
    resource: 'Supplier',
    description: 'إنشاء مورّد جديد',
  }),
  createSupplier
);

// ────────────────────────────────────────────────────────────
// GET /api/suppliers/:id
// ────────────────────────────────────────────────────────────
router.get(
  '/:id',
  requirePermissions('suppliers.read'),
  validateParams(supplierIdParamsSchema),
  getSupplier
);

// ────────────────────────────────────────────────────────────
// GET /api/suppliers/:id/receipts
// ────────────────────────────────────────────────────────────
router.get(
  '/:id/receipts',
  requirePermissions('suppliers.read'),
  validateParams(supplierIdParamsSchema),
  getSupplierReceipts
);

// ────────────────────────────────────────────────────────────
// PATCH /api/suppliers/:id
// ────────────────────────────────────────────────────────────
router.patch(
  '/:id',
  requirePermissions('suppliers.update'),
  validateParams(supplierIdParamsSchema),
  validateBody(updateSupplierSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Supplier',
    description: 'تعديل مورّد',
  }),
  updateSupplier
);

// ────────────────────────────────────────────────────────────
// DELETE /api/suppliers/:id
// ────────────────────────────────────────────────────────────
router.delete(
  '/:id',
  requirePermissions('suppliers.delete'),
  validateParams(supplierIdParamsSchema),
  auditAction({
    action: AUDIT_ACTIONS.DELETE,
    resource: 'Supplier',
    description: 'تعطيل مورّد',
  }),
  deleteSupplier
);

export default router;