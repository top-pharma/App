/**
 * @file financeReportRoutes.js
 * @description
 * مسارات تقارير المالية — 5 تقارير (بعد 🅲).
 *
 * ⚠️ لا نستخدم validate() للـ GET query — Controller يتحقق بنفسه.
 *
 * ✅ 🅲 (2026-11-08):
 * - حُذف getChecksReport (Check أُلغي).
 * - حُذف route /checks.
 */

import { Router } from 'express';

import {
  getTrialBalance,
  getCashTransactionsReport,
  getFundBalancesReport,
  // ⚠️ 🅲: حُذف getChecksReport
  getExpensesReport,
  getIncomeSummaryReport,
} from '../controllers/financeReportController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';

const router = Router();

router.use(requireAuth);
router.use(requirePermissions('reports.view'));

/* ═════════════════════════════════════════════════════════════
 * 5 تقارير مالية (بعد 🅲)
 * ═════════════════════════════════════════════════════════════ */
router.get('/trial-balance', getTrialBalance);
router.get('/cash-transactions', getCashTransactionsReport);
router.get('/fund-balances', getFundBalancesReport);
// ⚠️ 🅲: حُذف route /checks
router.get('/expenses', getExpensesReport);
router.get('/income-summary', getIncomeSummaryReport);

export default router;