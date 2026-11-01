/**
 * @file invoiceRoutes.js
 * @description مسارات الفواتير — Phase 2.5 (مع المسودات).
 *
 * ⚠️ ترتيب المسارات:
 * - /my-invoices قبل /:id
 * - /draft قبل /:id
 * - /:id/finalize و /:id/draft بعد /:id
 */

import express from 'express';

import {
  listInvoices,
  getInvoice,
  getMyInvoices,
  createInvoice,
  createDraft,
  finalizeInvoice,
  updateDraft,
  updateInvoice,
  cancelInvoice,
  registerPayment,
} from '../controllers/invoiceController.js';

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
  createInvoiceSchema,
  createDraftInvoiceSchema,
  updateDraftInvoiceSchema,
  finalizeInvoiceSchema,
  updateInvoiceSchema,
  listInvoicesQuerySchema,
  cancelInvoiceSchema,
  registerPaymentSchema,
  invoiceIdParamsSchema,
} from '../validators/invoiceValidator.js';

const router = express.Router();

router.use(requireAuth);

// ============================================================
// 1) القراءة
// ============================================================

router.get(
  '/',
  requirePermissions('invoices.read'),
  scopeSalesRepToOwnCustomers,
  validateQuery(listInvoicesQuerySchema),
  listInvoices
);

// ⚠️ قبل /:id
router.get(
  '/my-invoices',
  requirePermissions('invoices.read'),
  scopePharmacyToOwnData,
  validateQuery(listInvoicesQuerySchema),
  getMyInvoices
);

router.get(
  '/:id',
  requirePermissions('invoices.read'),
  validateParams(invoiceIdParamsSchema),
  scopeSalesRepToOwnCustomers,
  scopePharmacyToOwnData,
  getInvoice
);

// ============================================================
// 2) الإنشاء (فاتورة نهائية أو مسودة)
// ============================================================

/**
 * POST /api/invoices
 * فاتورة نهائية مباشرة (توافق Phase 2).
 */
router.post(
  '/',
  requirePermissions('invoices.create'),
  validateBody(createInvoiceSchema),
  auditAction({
    action: AUDIT_ACTIONS.CREATE,
    resource: 'Invoice',
    description: 'إنشاء فاتورة مبيعات جديدة',
  }),
  createInvoice
);

/**
 * POST /api/invoices/draft
 * Phase 2.5 — إنشاء مسودة (لا تأثير).
 * ⚠️ قبل /:id
 */
router.post(
  '/draft',
  requirePermissions('invoices.create'),
  validateBody(createDraftInvoiceSchema),
  auditAction({
    action: AUDIT_ACTIONS.CREATE,
    resource: 'Invoice',
    description: 'إنشاء مسودة فاتورة',
  }),
  createDraft
);

// ============================================================
// 3) التعديل
// ============================================================

/**
 * PATCH /api/invoices/:id/draft — تعديل مسودة (يسمح بتعديل البنود).
 */
router.patch(
  '/:id/draft',
  requirePermissions('invoices.update'),
  validateParams(invoiceIdParamsSchema),
  validateBody(updateDraftInvoiceSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Invoice',
    description: 'تعديل مسودة فاتورة',
  }),
  updateDraft
);

/**
 * PATCH /api/invoices/:id — تعديل بيانات وصفية فقط (نهائية).
 */
router.patch(
  '/:id',
  requirePermissions('invoices.update'),
  validateParams(invoiceIdParamsSchema),
  validateBody(updateInvoiceSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Invoice',
    description: 'تعديل بيانات الفاتورة',
  }),
  updateInvoice
);

// ============================================================
// 4) الإجراءات
// ============================================================

/**
 * POST /api/invoices/:id/finalize — اعتماد مسودة.
 */
router.post(
  '/:id/finalize',
  requirePermissions('invoices.create'), // نفس صلاحية الإنشاء
  validateParams(invoiceIdParamsSchema),
  validateBody(finalizeInvoiceSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Invoice',
    description: 'اعتماد مسودة فاتورة',
  }),
  finalizeInvoice
);

/**
 * PATCH /api/invoices/:id/cancel
 */
router.patch(
  '/:id/cancel',
  requirePermissions('invoices.cancel'),
  validateParams(invoiceIdParamsSchema),
  validateBody(cancelInvoiceSchema),
  auditAction({
    action: AUDIT_ACTIONS.DELETE,
    resource: 'Invoice',
    description: 'إلغاء فاتورة',
  }),
  cancelInvoice
);

/**
 * POST /api/invoices/:id/payments
 */
router.post(
  '/:id/payments',
  requirePermissions('invoices.update'),
  validateParams(invoiceIdParamsSchema),
  validateBody(registerPaymentSchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Invoice',
    description: 'تسجيل دفعة على فاتورة',
  }),
  registerPayment
);

export default router;