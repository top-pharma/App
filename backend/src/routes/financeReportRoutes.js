/**
 * @file financeReportRoutes.js
 * @description
 * مسارات تقارير المالية — 6 تقارير.
 *
 * ⚠️ لا نستخدم validate() للـ GET query — Controller يتحقق بنفسه.
 */

import { Router } from 'express';

import {
  getTrialBalance,
  getCashTransactionsReport,
  getFundBalancesReport,
  getChecksReport,
  getExpensesReport,
  getIncomeSummaryReport,
} from '../controllers/financeReportController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';

const router = Router();

router.use(requireAuth);
router.use(requirePermissions('reports.view'));

/* ═════════════════════════════════════════════════════════════
 * 6 تقارير مالية
 * ═════════════════════════════════════════════════════════════ */
router.get('/trial-balance', getTrialBalance);
router.get('/cash-transactions', getCashTransactionsReport);
router.get('/fund-balances', getFundBalancesReport);
router.get('/checks', getChecksReport);
router.get('/expenses', getExpensesReport);
router.get('/income-summary', getIncomeSummaryReport);

export default router;