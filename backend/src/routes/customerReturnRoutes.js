/**
 * @file customerReturnRoutes.js
 * @description
 * مسارات واجهة برمجة التطبيقات (API) الخاصة بمرتجعات العملاء.
 *
 * لماذا هذا الملف؟
 * - يربط طلبات HTTP بواجهة تحكم المرتجعات (CustomerReturn).
 * - يطبق الصلاحيات الدقيقة:
 *     • المندوب: يقرأ وينشئ فقط (returns.read, returns.create).
 *     • المحاسب/المدير: يوافق أو يرفض (returns.approve, returns.reject).
 * - يطبق Scope للمندوب (يرى مرتجعاته فقط) والصيدلية (ترى مرتجعاتها فقط).
 * - يسجل العمليات الحساسة (AuditLog).
 *
 * ⚠️ ترتيب المسارات:
 * - `/:id/approve` و `/:id/reject` يجب أن تأتي قبل أو بعد `/:id` بحذر.
 * - في Express، الأفضل وضع المسارات الأكثر تحديداً أولاً.
 */

import express from 'express';

import {
  listCustomerReturns,
  getCustomerReturn,
  createCustomerReturn,
  approveCustomerReturn,
  rejectCustomerReturn,
} from '../controllers/customerReturnController.js';

import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  requirePermissions,
  scopeSalesRepToOwnCustomers,
  scopePharmacyToOwnData,
} from '../middlewares/rbacMiddleware.js';
import {
  validateBody,
  validateQuery,
  validateParams,
} from '../middlewares/validateMiddleware.js';
import { auditAction } from '../middlewares/auditLogMiddleware.js';
import { AUDIT_ACTIONS } from '../models/AuditLog.js';

import {
  createCustomerReturnSchema,
  approveCustomerReturnSchema,
  rejectCustomerReturnSchema,
  listCustomerReturnsQuerySchema,
  customerReturnIdParamsSchema,
} from '../validators/customerReturnValidator.js';

const router = express.Router();

// ============================================================
// 1) Middlewares العامة
// ============================================================

// كل مسارات المرتجعات تتطلب مصادقة.
router.use(requireAuth);

// ============================================================
// 2) القراءة (Read)
// ============================================================

/**
 * GET /api/customer-returns
 * قائمة المرتجعات (مع Scope للمندوب والصيدلية).
 */
router.get(
  '/',
  requirePermissions('returns.read'),
  scopeSalesRepToOwnCustomers,
  scopePharmacyToOwnData,
  validateQuery(listCustomerReturnsQuerySchema),
  listCustomerReturns
);

/**
 * GET /api/customer-returns/:id
 * مرتجع واحد (مع Scope).
 */
router.get(
  '/:id',
  requirePermissions('returns.read'),
  validateParams(customerReturnIdParamsSchema),
  scopeSalesRepToOwnCustomers,
  scopePharmacyToOwnData,
  getCustomerReturn
);

// ============================================================
// 3) الإنشاء (Create)
// ============================================================

/**
 * POST /api/customer-returns
 * إنشاء مرتجع جديد (يبقى في حالة pending حتى الموافقة).
 */
router.post(
  '/',
  requirePermissions('returns.create'),
  validateBody(createCustomerReturnSchema),
  auditAction({
    action: AUDIT_ACTIONS.CREATE,
    resource: 'CustomerReturn',
    description: 'إنشاء مرتجع عميل جديد',
  }),
  createCustomerReturn
);

// ============================================================
// 4) الموافقة (Approve) — المحاسب/المدير فقط
// ============================================================

/**
 * POST /api/customer-returns/:id/approve
 * الموافقة على المرتجع (يُعيد المخزون ويُسوّي مالياً).
 */
router.post(
  '/:id/approve',
  requirePermissions('returns.approve'),
  validateParams(customerReturnIdParamsSchema),
  validateBody(approveCustomerReturnSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'CustomerReturn',
    description: 'الموافقة على مرتجع عميل',
  }),
  approveCustomerReturn
);

// ============================================================
// 5) الرفض (Reject) — المحاسب/المدير فقط
// ============================================================

/**
 * POST /api/customer-returns/:id/reject
 * رفض المرتجع (لا يُعيد المخزون، يبقى كما هو).
 */
router.post(
  '/:id/reject',
  requirePermissions('returns.reject'),
  validateParams(customerReturnIdParamsSchema),
  validateBody(rejectCustomerReturnSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'CustomerReturn',
    description: 'رفض مرتجع عميل',
  }),
  rejectCustomerReturn
);

// ============================================================
// تصدير موحّد
// ============================================================

export default router;