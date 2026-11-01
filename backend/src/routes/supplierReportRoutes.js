/**
 * @file supplierReportRoutes.js
 */

import { Router } from 'express';

import {
  getSupplierStatement,
  getSupplierBalances,
} from '../controllers/supplierReportController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';

const router = Router();

router.use(requireAuth);
router.use(requirePermissions('reports.view'));

router.get('/statement/:supplierId', getSupplierStatement);
router.get('/balances', getSupplierBalances);

export default router;