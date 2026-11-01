/**
 * @file inventoryReportRoutes.js
 */

import { Router } from 'express';

import {
  getStockBalances,
  getNearExpiryBatches,
  getBelowReorder,
} from '../controllers/inventoryReportController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';

const router = Router();

router.use(requireAuth);
router.use(requirePermissions('reports.view'));

router.get('/balances', getStockBalances);
router.get('/near-expiry', getNearExpiryBatches);
router.get('/below-reorder', getBelowReorder);

export default router;