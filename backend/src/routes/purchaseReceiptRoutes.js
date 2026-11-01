/**
 * @file purchaseReceiptRoutes.js
 * @description
 * مسارات واجهة برمجة التطبيقات (API) الخاصة بإيصالات استلام البضاعة (المشتريات).
 *
 * لماذا هذا الملف؟
 * - يربط طلبات HTTP بواجهة تحكم المشتريات (PurchaseReceipt).
 * - يطبق الصلاحيات:
 *     • القراءة والإنشاء: أمين المخزن / المحاسب / المدير.
 *     • التعديل والتأكيد: أمين المخزن / المدير.
 *     • الإلغاء: المدير فقط (purchases.delete).
 * - يطبق التحقق من المدخلات (Validators).
 * - يسجل العمليات الحساسة (AuditLog).
 *
 * ⚠️ ترتيب المسارات:
 * - نضع المسارات الأساسية (GET /, POST /) أولاً.
 * - ثم المسارات التي تحتوي على `:id`، ونضع الإجراءات الخاصة (`/confirm`, `/cancel`)
 *   مباشرة بعد أو قبل `/:id` بحذر لتجنب التعارض.
 */

import express from 'express';

import {
  listPurchaseReceipts,
  getPurchaseReceipt,
  createPurchaseReceipt,
  updatePurchaseReceipt,
  confirmPurchaseReceipt,
  cancelPurchaseReceipt,
} from '../controllers/purchaseReceiptController.js';

import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';
import {
  validateBody,
  validateQuery,
  validateParams,
} from '../middlewares/validateMiddleware.js';
import { auditAction } from '../middlewares/auditLogMiddleware.js';
import { AUDIT_ACTIONS } from '../models/AuditLog.js';

import {
  createPurchaseReceiptSchema,
  updatePurchaseReceiptSchema,
  confirmPurchaseReceiptSchema,
  cancelPurchaseReceiptSchema,
  listPurchaseReceiptsQuerySchema,
  purchaseReceiptIdParamsSchema,
} from '../validators/purchaseReceiptValidator.js';

const router = express.Router();

// ============================================================
// 1) Middlewares العامة
// ============================================================

// كل مسارات إيصالات الاستلام تتطلب مصادقة.
router.use(requireAuth);

// ============================================================
// 2) القراءة والإنشاء (Read & Create)
// ============================================================

/**
 * GET /api/purchase-receipts
 * قائمة إيصالات الاستلام.
 */
router.get(
  '/',
  requirePermissions('purchases.read'),
  validateQuery(listPurchaseReceiptsQuerySchema),
  listPurchaseReceipts
);

/**
 * POST /api/purchase-receipts
 * إنشاء مسودة إيصال استلام جديد.
 */
router.post(
  '/',
  requirePermissions('purchases.create'),
  validateBody(createPurchaseReceiptSchema),
  auditAction({
    action: AUDIT_ACTIONS.CREATE,
    resource: 'PurchaseReceipt',
    description: 'إنشاء مسودة إيصال استلام',
  }),
  createPurchaseReceipt
);

// ============================================================
// 3) قراءة وتعديل إيصال واحد (Read & Update Single)
// ============================================================

/**
 * GET /api/purchase-receipts/:id
 * عرض إيصال استلام واحد.
 */
router.get(
  '/:id',
  requirePermissions('purchases.read'),
  validateParams(purchaseReceiptIdParamsSchema),
  getPurchaseReceipt
);

/**
 * PATCH /api/purchase-receipts/:id
 * تعديل المسودة (قبل التأكيد فقط).
 */
router.patch(
  '/:id',
  requirePermissions('purchases.update'),
  validateParams(purchaseReceiptIdParamsSchema),
  validateBody(updatePurchaseReceiptSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'PurchaseReceipt',
    description: 'تعديل مسودة إيصال استلام',
  }),
  updatePurchaseReceipt
);

// ============================================================
// 4) الإجراءات الخاصة (Actions)
// ============================================================

/**
 * POST /api/purchase-receipts/:id/confirm
 * تأكيد الاستلام (إدخال البضاعة لـ Stock + معالجة الدفع).
 */
router.post(
  '/:id/confirm',
  requirePermissions('purchases.update'),
  validateParams(purchaseReceiptIdParamsSchema),
  validateBody(confirmPurchaseReceiptSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'PurchaseReceipt',
    description: 'تأكيد استلام إيصال مشتريات',
  }),
  confirmPurchaseReceipt
);

/**
 * POST /api/purchase-receipts/:id/cancel
 * إلغاء المسودة.
 * يستخدم `purchases.delete` لأن الإلغاء عملية حساسة (محذوفة من المسودات).
 */
router.post(
  '/:id/cancel',
  requirePermissions('purchases.delete'),
  validateParams(purchaseReceiptIdParamsSchema),
  validateBody(cancelPurchaseReceiptSchema),
  auditAction({
    action: AUDIT_ACTIONS.DELETE,
    resource: 'PurchaseReceipt',
    description: 'إلغاء مسودة إيصال استلام',
  }),
  cancelPurchaseReceipt
);

// ============================================================
// تصدير موحّد
// ============================================================

export default router;