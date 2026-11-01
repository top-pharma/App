/**
 * @file salesReportRoutes.js
 * @description
 * مسارات تقارير المبيعات — 7 تقارير.
 *
 * ⚠️ لا نستخدم validate() للـ GET query — Controller يتحقق عبر validateRange().
 * ⚠️ أسماء الدوال يجب أن تطابق ما يُصدّره salesReportController.js بالضبط.
 *
 * المسارات:
 *   GET /api/reports/sales/invoices
 *   GET /api/reports/sales/by-rep
 *   GET /api/reports/sales/by-item
 *   GET /api/reports/sales/commissions
 *   GET /api/reports/sales/discounts
 *   GET /api/reports/sales/reps-performance
 *   GET /api/reports/sales/sales-rep-statement/:salesRepId
 */

import { Router } from 'express';

import {
  getInvoicesReport,
  getSalesByRepReport,
  getSalesByItemReport,
  getCommissionsReport,
  getDiscountsReport,
  getRepsPerformanceReport,    // ← موجودة في Controller ✅
  getSalesRepStatement,        // ← موجودة في Controller ✅ (بدون Report)
} from '../controllers/salesReportController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';

const router = Router();

router.use(requireAuth);
router.use(requirePermissions('reports.view'));

/* ═════════════════════════════════════════════════════════════
 * 7 تقارير مبيعات
 * ═════════════════════════════════════════════════════════════ */

// 1. الفواتير
router.get('/invoices', getInvoicesReport);

// 2. حسب المندوب
router.get('/by-rep', getSalesByRepReport);

// 3. حسب الصنف
router.get('/by-item', getSalesByItemReport);

// 4. العمولات
router.get('/commissions', getCommissionsReport);

// 5. البونص
router.get('/discounts', getDiscountsReport);

// 6. أداء المناديب الشامل
router.get('/reps-performance', getRepsPerformanceReport);

// 7. كشف حساب مندوب
router.get('/sales-rep-statement/:salesRepId', getSalesRepStatement);

export default router;