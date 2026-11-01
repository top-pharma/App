/**
 * @file authRoutes.js
 * @description
 * مسارات المصادقة — كل ما يتعلق بتسجيل الدخول والجلسات.
 *
 * لماذا هذا الملف؟
 * - نُبقي الراوتس رقيقة: تحقق → controller.
 * - نُطبّق rate limiters مخصّصة (login, forgot, refresh) لحماية النقاط الحساسة.
 * - نُطبّق auditLogin/auditLogout تلقائياً لتسجيل الأحداث.
 * - نستخدم asyncHandler داخل controller (لا حاجة له هنا).
 * - لا نثق بـ body قبل التحقق منه بـ Zod.
 */

import { Router } from 'express';

import {
  changePassword,
  forgotPassword,
  login,
  logout,
  me,
  refresh,
  resetPassword,
} from '../controllers/authController.js';
import { requireAuth, requireGuest } from '../middlewares/authMiddleware.js';
import { auditLogin, auditLogout } from '../middlewares/auditLogMiddleware.js';
import { validate } from '../middlewares/validateMiddleware.js';
import {
  loginLimiter,
  passwordResetLimiter,
  refreshTokenLimiter,
} from '../middlewares/rateLimitMiddleware.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshTokenSchema,
  resetPasswordSchema,
} from '../validators/authValidator.js';

const router = Router();

/**
 * POST /api/auth/login
 * عام (لغير المسجّلين فقط).
 */
router.post(
  '/login',
  requireGuest,
  loginLimiter,
  validate(loginSchema),
  auditLogin,
  login
);

/**
 * POST /api/auth/logout
 * يحتاج مصادقة.
 */
router.post('/logout', requireAuth, auditLogout, logout);

/**
 * POST /api/auth/refresh
 * يستخدم Refresh Token (بلا Access).
 */
router.post('/refresh', refreshTokenLimiter, validate(refreshTokenSchema), refresh);

/**
 * GET /api/auth/me
 * بيانات المستخدم الحالي.
 */
router.get('/me', requireAuth, me);

/**
 * PATCH /api/auth/change-password
 * تغيير كلمة المرور (يُبطل الجلسات).
 */
router.patch('/change-password', requireAuth, validate(changePasswordSchema), changePassword);

/**
 * POST /api/auth/forgot-password
 * عام + rate limit مشدّد.
 */
router.post(
  '/forgot-password',
  passwordResetLimiter,
  validate(forgotPasswordSchema),
  forgotPassword
);

/**
 * POST /api/auth/reset-password
 * عام (يعتمد على التوكن في الـ body).
 */
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);

export default router;