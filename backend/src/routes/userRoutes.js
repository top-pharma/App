/**
 * @file userRoutes.js
 * @description
 * مسارات إدارة المستخدمين (Admin only).
 *
 * لماذا هذا الملف؟
 * - متطلب: "المستخدمون يُنشَؤون من داخل التطبيق بواسطة الأدمن".
 * - كل مسار محمي بـ requireAuth + requirePermissions (من rbacMiddleware).
 * - نستخدم autoAudit لتسجيل كل عملية CRUD تلقائياً (مع logAuditEvent داخل controller).
 * - الترتيب مهم: /:id/toggle-active قبل /:id لتجنّب الالتباس.
 */

import { Router } from 'express';

import {
  adminResetPassword,
  createUser,
  deleteUser,
  getUser,
  listUsers,
  toggleUserActive,
  updateUser,
} from '../controllers/userController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';
import { validate } from '../middlewares/validateMiddleware.js';
import {
  adminResetPasswordSchema,
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  userIdParamsSchema,
} from '../validators/authValidator.js';

const router = Router();

/**
 * كل مسارات هذا الملف تتطلب مصادقة.
 */
router.use(requireAuth);

/**
 * GET /api/users
 * قائمة المستخدمين (Admin فقط).
 */
router.get(
  '/',
  requirePermissions('users.view'),
  validate(listUsersQuerySchema, 'query'),
  listUsers
);

/**
 * POST /api/users
 * إنشاء مستخدم جديد (Admin فقط).
 */
router.post('/', requirePermissions('users.create'), validate(createUserSchema), createUser);

/**
 * PATCH /api/users/:id/toggle-active
 * تبديل حالة التفعيل (قبل /:id لتجنّب الالتباس).
 */
router.patch(
  '/:id/toggle-active',
  requirePermissions('users.update'),
  validate(userIdParamsSchema, 'params'),
  toggleUserActive
);

/**
 * POST /api/users/:id/reset-password
 * إعادة تعيين كلمة مرور مستخدم (Admin فقط).
 */
router.post(
  '/:id/reset-password',
  requirePermissions('users.reset_password'),
  validate(userIdParamsSchema, 'params'),
  validate(adminResetPasswordSchema),
  adminResetPassword
);

/**
 * GET /api/users/:id
 */
router.get(
  '/:id',
  requirePermissions('users.view'),
  validate(userIdParamsSchema, 'params'),
  getUser);

/**
 * PATCH /api/users/:id
 */
router.patch(
  '/:id',
  requirePermissions('users.update'),
  validate(userIdParamsSchema, 'params'),
  validate(updateUserSchema),
  updateUser
);

/**
 * DELETE /api/users/:id
 * تعطيل المستخدم (لا نحذف فعلياً).
 */
router.delete(
  '/:id',
  requirePermissions('users.delete'),
  validate(userIdParamsSchema, 'params'),
  deleteUser
);

export default router;