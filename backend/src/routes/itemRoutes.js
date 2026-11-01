/**
 * @file itemRoutes.js
 * @description مسارات الأصناف (/api/items).
 */

import express from 'express';

import {
  listItems, getItem, getItemByBarcode,
  createItem, updateItem, deleteItem,
} from '../controllers/itemController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';
import {
  createItemSchema, updateItemSchema, listItemsQuerySchema,
  itemIdParamsSchema, itemBarcodeParamsSchema,
} from '../validators/itemValidator.js';
import { validateBody, validateQuery, validateParams } from '../middlewares/validateMiddleware.js';
import { auditAction } from '../middlewares/auditLogMiddleware.js';
import { AUDIT_ACTIONS } from '../models/AuditLog.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', requirePermissions('items.read'), validateQuery(listItemsQuerySchema), listItems);

// ⚠️ ثابت قبل :id
router.get(
  '/barcode/:barcode',
  requirePermissions('items.read'),
  validateParams(itemBarcodeParamsSchema),
  getItemByBarcode
);

router.post(
  '/',
  requirePermissions('items.create'),
  validateBody(createItemSchema),
  auditAction({ action: AUDIT_ACTIONS.CREATE, resource: 'Item', description: 'إنشاء صنف جديد' }),
  createItem
);

router.get('/:id', requirePermissions('items.read'), validateParams(itemIdParamsSchema), getItem);

router.patch(
  '/:id',
  requirePermissions('items.update'),
  validateParams(itemIdParamsSchema),
  validateBody(updateItemSchema),
  auditAction({ action: AUDIT_ACTIONS.UPDATE, resource: 'Item', description: 'تعديل صنف' }),
  updateItem
);

router.delete(
  '/:id',
  requirePermissions('items.delete'),
  validateParams(itemIdParamsSchema),
  auditAction({ action: AUDIT_ACTIONS.DELETE, resource: 'Item', description: 'تعطيل صنف' }),
  deleteItem
);

export default router;