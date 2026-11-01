/**
 * @file deliveryNoteRoutes.js
 * @description
 * مسارات واجهة برمجة التطبيقات (API) الخاصة بإيصالات التسليم.
 *
 * لماذا هذا الملف؟
 * - يربط طلبات HTTP بإيصالات التسليم (DeliveryNote).
 * - يطبق Scope للمندوب (يرى إيصالاته فقط) والصيدلية (ترى إيصالاتها فقط).
 * - يطبق الصلاحيات (إنشاء، قراءة، تعديل، تعليم كمُسلَّم).
 * - يطبق التحقق من المدخلات (Validators).
 * - يسجل العمليات الحساسة (AuditLog).
 */

import express from 'express';

import {
  listDeliveryNotes,
  getDeliveryNote,
  createDeliveryNote,
  updateDeliveryNote,
  markDelivered,
} from '../controllers/deliveryNoteController.js';

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
  createDeliveryNoteSchema,
  updateDeliveryNoteSchema,
  markDeliveredSchema,
  listDeliveryNotesQuerySchema,
  deliveryNoteIdParamsSchema,
} from '../validators/deliveryNoteValidator.js';

const router = express.Router();

// ============================================================
// 1) Middlewares العامة
// ============================================================

// كل مسارات الإيصالات تتطلب مصادقة (Authentication).
router.use(requireAuth);

// ============================================================
// 2) القراءة (Read)
// ============================================================

/**
 * GET /api/delivery-notes
 * قائمة إيصالات التسليم (مع Scope للمندوب والصيدلية).
 */
router.get(
  '/',
  requirePermissions('delivery_notes.read'),
  scopeSalesRepToOwnCustomers,
  scopePharmacyToOwnData,
  validateQuery(listDeliveryNotesQuerySchema),
  listDeliveryNotes
);

/**
 * GET /api/delivery-notes/:id
 * إيصال تسليم واحد (مع Scope).
 */
router.get(
  '/:id',
  requirePermissions('delivery_notes.read'),
  validateParams(deliveryNoteIdParamsSchema),
  scopeSalesRepToOwnCustomers,
  scopePharmacyToOwnData,
  getDeliveryNote
);

// ============================================================
// 3) الإنشاء (Create)
// ============================================================

/**
 * POST /api/delivery-notes
 * إنشاء إيصال تسليم جديد (يخصم المخزون فوراً).
 */
router.post(
  '/',
  requirePermissions('delivery_notes.create'),
  validateBody(createDeliveryNoteSchema),
  auditAction({
    action: AUDIT_ACTIONS.CREATE,
    resource: 'DeliveryNote',
    description: 'إنشاء إيصال تسليم جديد',
  }),
  createDeliveryNote
);

// ============================================================
// 4) التعديل (Update)
// ============================================================

/**
 * PATCH /api/delivery-notes/:id
 * تعديل بيانات الإيصال (قبل التسليم فقط).
 */
router.patch(
  '/:id',
  requirePermissions('delivery_notes.update'),
  validateParams(deliveryNoteIdParamsSchema),
  validateBody(updateDeliveryNoteSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'DeliveryNote',
    description: 'تعديل بيانات إيصال التسليم',
  }),
  updateDeliveryNote
);

// ============================================================
// 5) الإجراءات الخاصة (Actions)
// ============================================================

/**
 * PATCH /api/delivery-notes/:id/mark-delivered
 * تعليم الإيصال كمُسلَّم (تسجيل اسم المستلم والتوقيع).
 */
router.patch(
  '/:id/mark-delivered',
  requirePermissions('delivery_notes.update'),
  validateParams(deliveryNoteIdParamsSchema),
  validateBody(markDeliveredSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'DeliveryNote',
    description: 'تعليم إيصال التسليم كمُسلَّم',
  }),
  markDelivered
);

// ============================================================
// تصدير موحّد
// ============================================================

export default router;