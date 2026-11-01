/**
 * @file stockRoutes.js
 * @description مسارات المخزون (/api/stocks) — Phase 2.5.
 *
 * ⚠️ ترتيب المسارات مهم:
 * - /by-item/:itemId قبل /:id
 * - /expiring-soon, /below-reorder, /summary, /select-fefo قبل /:id
 */

import express from 'express';

import {
  listStocks,
  getStock,
  getBatchesWithFefo,
  getExpiringSoon,
  getBelowReorder,
  getSummary,
  createStock,
  updateStock,
  deleteStock,
  selectFefoRoute,
} from '../controllers/stockController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';
import {
  createStockSchema,
  updateStockSchema,
  listStocksQuerySchema,
  selectFefoSchema,
  stockIdParamsSchema,
  batchesWithFefoParamsSchema,
  batchesWithFefoQuerySchema,
} from '../validators/stockValidator.js';
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
// ✅ Phase 2.5: Endpoint مدمج — قبل /:id
// ────────────────────────────────────────────────────────────
router.get(
  '/by-item/:itemId',
  requirePermissions('stock.read'),
  validateParams(batchesWithFefoParamsSchema),
  validateQuery(batchesWithFefoQuerySchema),
  getBatchesWithFefo
);

// ────────────────────────────────────────────────────────────
// GET /api/stocks
// ────────────────────────────────────────────────────────────
router.get(
  '/',
  requirePermissions('stock.read'),
  validateQuery(listStocksQuerySchema),
  listStocks
);

// ────────────────────────────────────────────────────────────
// GET /api/stocks/expiring-soon
// ────────────────────────────────────────────────────────────
router.get('/expiring-soon', requirePermissions('stock.read'), getExpiringSoon);

// ────────────────────────────────────────────────────────────
// GET /api/stocks/below-reorder
// ────────────────────────────────────────────────────────────
router.get('/below-reorder', requirePermissions('stock.read'), getBelowReorder);

// ────────────────────────────────────────────────────────────
// GET /api/stocks/summary
// ────────────────────────────────────────────────────────────
router.get(
  '/summary',
  requirePermissions('stock.read'),
  validateQuery(listStocksQuerySchema.partial()),
  getSummary
);

// ────────────────────────────────────────────────────────────
// POST /api/stocks/select-fefo
// ────────────────────────────────────────────────────────────
router.post(
  '/select-fefo',
  requirePermissions('stock.read'),
  validateBody(selectFefoSchema),
  selectFefoRoute
);

// ────────────────────────────────────────────────────────────
// POST /api/stocks
// ────────────────────────────────────────────────────────────
router.post(
  '/',
  requirePermissions('stock.create'),
  validateBody(createStockSchema),
  auditAction({
    action: AUDIT_ACTIONS.CREATE,
    resource: 'Stock',
    description: 'استلام دفعة جديدة',
  }),
  createStock
);

// ────────────────────────────────────────────────────────────
// GET /api/stocks/:id
// ────────────────────────────────────────────────────────────
router.get(
  '/:id',
  requirePermissions('stock.read'),
  validateParams(stockIdParamsSchema),
  getStock
);

// ────────────────────────────────────────────────────────────
// PATCH /api/stocks/:id
// ────────────────────────────────────────────────────────────
router.patch(
  '/:id',
  requirePermissions('stock.update'),
  validateParams(stockIdParamsSchema),
  validateBody(updateStockSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Stock',
    description: 'تعديل دفعة',
  }),
  updateStock
);

// ────────────────────────────────────────────────────────────
// DELETE /api/stocks/:id
// ────────────────────────────────────────────────────────────
router.delete(
  '/:id',
  requirePermissions('stock.delete'),
  validateParams(stockIdParamsSchema),
  auditAction({
    action: AUDIT_ACTIONS.DELETE,
    resource: 'Stock',
    description: 'حذف دفعة',
  }),
  deleteStock
);

export default router;