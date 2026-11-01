/**
 * @file supplierReturnRoutes.js
 * @description
 * مسارات واجهة برمجة التطبيقات (API) الخاصة بمرتجعات الموردين.
 *
 * لماذا هذا الملف؟
 * - يربط طلبات HTTP بواجهة تحكم مرتجعات الموردين (SupplierReturn).
 * - يطبق الصلاحيات بناءً على دورة حياة المرتجع:
 *     • أمين المخزن/المحاسب: ينشئ ويُعدّل ويُرسل.
 *     • المحاسب/المدير: يقبل أو يرفض.
 * - لا يوجد Scope (لأن هذه المرتجعات للموردين، وليست للمناديب أو الصيدليات).
 * - يسجل العمليات الحساسة (AuditLog).
 *
 * ⚠️ ترتيب المسارات:
 * - المسارات الفرعية `/:id/send` و `/:id/accept` و `/:id/reject`
 *   يتم تعريفها مباشرة بعد `/:id` (أو قبلها) لضمان عدم التعارض.
 */

import express from 'express';

import {
  listSupplierReturns,
  getSupplierReturn,
  createSupplierReturn,
  updateSupplierReturn,
  sendSupplierReturn,
  acceptSupplierReturn,
  rejectSupplierReturn,
} from '../controllers/supplierReturnController.js';

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
  createSupplierReturnSchema,
  updateSupplierReturnSchema,
  sendSupplierReturnSchema,
  acceptSupplierReturnSchema,
  rejectSupplierReturnSchema,
  listSupplierReturnsQuerySchema,
  supplierReturnIdParamsSchema,
} from '../validators/supplierReturnValidator.js';

const router = express.Router();

// ============================================================
// 1) Middlewares العامة
// ============================================================

// كل مسارات مرتجعات الموردين تتطلب مصادقة.
router.use(requireAuth);

// ============================================================
// 2) القراءة والإنشاء (Read & Create)
// ============================================================

/**
 * GET /api/supplier-returns
 * قائمة مرتجعات الموردين.
 */
router.get(
  '/',
  requirePermissions('returns.read'),
  validateQuery(listSupplierReturnsQuerySchema),
  listSupplierReturns
);

/**
 * POST /api/supplier-returns
 * إنشاء مسودة مرتجع مورد جديد.
 */
router.post(
  '/',
  requirePermissions('returns.create'),
  validateBody(createSupplierReturnSchema),
  auditAction({
    action: AUDIT_ACTIONS.CREATE,
    resource: 'SupplierReturn',
    description: 'إنشاء مرتجع مورد جديد',
  }),
  createSupplierReturn
);

// ============================================================
// 3) قراءة وتعديل مرتجع واحد (Read & Update Single)
// ============================================================

/**
 * GET /api/supplier-returns/:id
 * عرض مرتجع واحد.
 */
router.get(
  '/:id',
  requirePermissions('returns.read'),
  validateParams(supplierReturnIdParamsSchema),
  getSupplierReturn
);

/**
 * PATCH /api/supplier-returns/:id
 * تعديل المرتجع (مسودة فقط).
 */
router.patch(
  '/:id',
  requirePermissions('returns.create'), // نفس صلاحية الإنشاء (أمين المخزن)
  validateParams(supplierReturnIdParamsSchema),
  validateBody(updateSupplierReturnSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'SupplierReturn',
    description: 'تعديل مسودة مرتجع مورد',
  }),
  updateSupplierReturn
);

// ============================================================
// 4) الإجراءات الخاصة (Actions)
// ============================================================

/**
 * POST /api/supplier-returns/:id/send
 * إرسال المرتجع إلى المورد.
 */
router.post(
  '/:id/send',
  requirePermissions('returns.create'),
  validateParams(supplierReturnIdParamsSchema),
  validateBody(sendSupplierReturnSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'SupplierReturn',
    description: 'إرسال مرتجع مورد',
  }),
  sendSupplierReturn
);

/**
 * POST /api/supplier-returns/:id/accept
 * قبول المرتجع من المورد (يخصم من المخزون ويُسوّي).
 */
router.post(
  '/:id/accept',
  requirePermissions('returns.approve'),
  validateParams(supplierReturnIdParamsSchema),
  validateBody(acceptSupplierReturnSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'SupplierReturn',
    description: 'قبول مرتجع من المورد',
  }),
  acceptSupplierReturn
);

/**
 * POST /api/supplier-returns/:id/reject
 * رفض المرتجع من المورد.
 */
router.post(
  '/:id/reject',
  requirePermissions('returns.reject'),
  validateParams(supplierReturnIdParamsSchema),
  validateBody(rejectSupplierReturnSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'SupplierReturn',
    description: 'رفض مرتجع من المورد',
  }),
  rejectSupplierReturn
);

// ============================================================
// تصدير موحّد
// ============================================================

export default router;