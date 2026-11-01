/**
 * @file warehouseRoutes.js
 * @description
 * مسارات المخازن (/api/warehouses).
 *
 * لماذا هذا الملف؟
 * - نُوجّه الطلبات إلى warehouseController بعد سلسلة حماية موحّدة.
 * - setAsMain و setAsDefault يتطلبان warehouses.update (لا .delete).
 * - auditAction تلقائي للعمليات.
 */

import express from 'express';

import {
  listWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  setAsMain,
  setAsDefault,
} from '../controllers/warehouseController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';
import {
  createWarehouseSchema,
  updateWarehouseSchema,
  listWarehousesQuerySchema,
  warehouseIdParamsSchema,
} from '../validators/warehouseValidator.js';
import {
  validateBody,
  validateQuery,
  validateParams,
} from '../middlewares/validateMiddleware.js';
import { auditAction } from '../middlewares/auditLogMiddleware.js';
import { AUDIT_ACTIONS } from '../models/AuditLog.js';

const router = express.Router();

// كل مسارات المخازن تتطلب مصادقة.
router.use(requireAuth);

// ────────────────────────────────────────────────────────────
// GET /api/warehouses
// ────────────────────────────────────────────────────────────
router.get(
  '/',
  requirePermissions('warehouses.read'),
  validateQuery(listWarehousesQuerySchema),
  listWarehouses
);

// ────────────────────────────────────────────────────────────
// POST /api/warehouses
// ────────────────────────────────────────────────────────────
router.post(
  '/',
  requirePermissions('warehouses.create'),
  validateBody(createWarehouseSchema),
  auditAction({
    action: AUDIT_ACTIONS.CREATE,
    resource: 'Warehouse',
    description: 'إنشاء مخزن جديد',
  }),
  createWarehouse
);

// ────────────────────────────────────────────────────────────
// GET /api/warehouses/:id
// ────────────────────────────────────────────────────────────
router.get(
  '/:id',
  requirePermissions('warehouses.read'),
  validateParams(warehouseIdParamsSchema),
  getWarehouse
);

// ────────────────────────────────────────────────────────────
// PATCH /api/warehouses/:id
// ────────────────────────────────────────────────────────────
router.patch(
  '/:id',
  requirePermissions('warehouses.update'),
  validateParams(warehouseIdParamsSchema),
  validateBody(updateWarehouseSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Warehouse',
    description: 'تعديل مخزن',
  }),
  updateWarehouse
);

// ────────────────────────────────────────────────────────────
// DELETE /api/warehouses/:id
// ────────────────────────────────────────────────────────────
router.delete(
  '/:id',
  requirePermissions('warehouses.delete'),
  validateParams(warehouseIdParamsSchema),
  auditAction({
    action: AUDIT_ACTIONS.DELETE,
    resource: 'Warehouse',
    description: 'تعطيل مخزن',
  }),
  deleteWarehouse
);

// ────────────────────────────────────────────────────────────
// POST /api/warehouses/:id/set-main
// ────────────────────────────────────────────────────────────
router.post(
  '/:id/set-main',
  requirePermissions('warehouses.update'),
  validateParams(warehouseIdParamsSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Warehouse',
    description: 'تعيين مخزن رئيسياً',
  }),
  setAsMain
);

// ────────────────────────────────────────────────────────────
// POST /api/warehouses/:id/set-default
// ────────────────────────────────────────────────────────────
router.post(
  '/:id/set-default',
  requirePermissions('warehouses.update'),
  validateParams(warehouseIdParamsSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Warehouse',
    description: 'تعيين مخزن افتراضياً',
  }),
  setAsDefault
);

export default router;