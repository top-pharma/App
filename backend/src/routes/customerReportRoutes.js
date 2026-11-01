/**
 * @file customerReportRoutes.js
 */

import { Router } from 'express';

import {
  getCustomerStatement,
  getAgingReport,
} from '../controllers/customerReportController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';

const router = Router();

router.use(requireAuth);
router.use(requirePermissions('reports.view'));

router.get('/statement/:customerId', getCustomerStatement);
router.get('/aging', getAgingReport);

export default router;