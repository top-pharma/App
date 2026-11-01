/**
 * @file dashboardRoutes.js
 * @description
 * مسارات الداشبورد — محمية بـ requireAuth + requirePermissions('reports.read').
 */

import { Router } from 'express';

import {
  getDashboard,
  getDashboardSummary,
} from '../controllers/dashboardController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';
import { validate } from '../middlewares/validateMiddleware.js';
import { dashboardQuerySchema } from '../validators/dashboardValidator.js';

const router = Router();

router.use(requireAuth);
router.use(requirePermissions('reports.view'));

/**
 * GET /api/dashboard
 * كامل بيانات الداشبورد (KPIs + رسوم + جداول).
 */
router.get('/', validate(dashboardQuerySchema, 'query'), getDashboard);

/**
 * GET /api/dashboard/summary
 * KPIs فقط.
 */
router.get('/summary', validate(dashboardQuerySchema, 'query'), getDashboardSummary);
export default router;