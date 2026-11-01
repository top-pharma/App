/**
 * @file categoryRoutes.js
 * @description
 * مسارات التصنيفات (/api/categories).
 *
 * لماذا هذا الملف؟
 * - نُوجّه الطلبات إلى categoryController بعد سلسلة حماية موحّدة:
 *   requireAuth → requirePermissions → validate → auditAction.
 * - نُطبّق الصلاحيات الدقيقة (categories.read/create/update/delete) التي
 *   تمنع storekeeper من الحذف (كما في Role.js).
 * - auditAction يسجّل العملية تلقائياً بعد اكتمال الاستجابة.
 */

import express from 'express';

import {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/categoryController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';
import {
  createCategorySchema,
  updateCategorySchema,
  listCategoriesQuerySchema,
  categoryIdParamsSchema,
} from '../validators/categoryValidator.js';
import {
  validateBody,
  validateQuery,
  validateParams,
} from '../middlewares/validateMiddleware.js';
import { auditAction } from '../middlewares/auditLogMiddleware.js';
import { AUDIT_ACTIONS } from '../models/AuditLog.js';

const router = express.Router();

// كل مسارات التصنيفات تتطلب مصادقة.
router.use(requireAuth);

// ────────────────────────────────────────────────────────────
// GET /api/categories
// ────────────────────────────────────────────────────────────
router.get(
  '/',
  requirePermissions('categories.read'),
  validateQuery(listCategoriesQuerySchema),
  listCategories
);

// ────────────────────────────────────────────────────────────
// POST /api/categories
// ────────────────────────────────────────────────────────────
router.post(
  '/',
  requirePermissions('categories.create'),
  validateBody(createCategorySchema),
  auditAction({
    action: AUDIT_ACTIONS.CREATE,
    resource: 'Category',
    description: 'إنشاء تصنيف جديد',
  }),
  createCategory
);

// ────────────────────────────────────────────────────────────
// GET /api/categories/:id
// ────────────────────────────────────────────────────────────
router.get(
  '/:id',
  requirePermissions('categories.read'),
  validateParams(categoryIdParamsSchema),
  getCategory
);

// ────────────────────────────────────────────────────────────
// PATCH /api/categories/:id
// ────────────────────────────────────────────────────────────
router.patch(
  '/:id',
  requirePermissions('categories.update'),
  validateParams(categoryIdParamsSchema),
  validateBody(updateCategorySchema),
  auditAction({
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Category',
    description: 'تعديل تصنيف',
  }),
  updateCategory
);

// ────────────────────────────────────────────────────────────
// DELETE /api/categories/:id
// ────────────────────────────────────────────────────────────
router.delete(
  '/:id',
  requirePermissions('categories.delete'),
  validateParams(categoryIdParamsSchema),
  auditAction({
    action: AUDIT_ACTIONS.DELETE,
    resource: 'Category',
    description: 'تعطيل تصنيف',
  }),
  deleteCategory
);

export default router;