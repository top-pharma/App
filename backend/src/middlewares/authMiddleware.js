/**
 * @file authMiddleware.js
 * @description
 * التحقق من هوية المستخدم عبر JWT (Access Token) + فحص حالة الحساب.
 *
 * لماذا هذا الملف؟
 * - نقطة الدخول الوحيدة لحماية المسارات: كل route محمي يمر من هنا.
 * - نتحقق من: صحة التوكن، وجود المستخدم، أن الحساب نشط، أن tokenVersion مطابق.
 * - نُرفق المستخدم في req.user لاستخدامه في rbacMiddleware والـ controllers.
 * - نستخدم رسائل عربية موحّدة بصيغة JSON مطابقة لـ errorMiddleware.
 * - لا نثق بأي بيانات قادمة من العميل بخلاف التوكن (لا role من الـ headers).
 */

import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError } from './errorMiddleware.js';
import { extractBearerToken, verifyAccessToken } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';

/**
 * بناء استجابة خطأ موحّدة للمصادقة.
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} code
 * @param {string} message
 * @returns {import('express').Response}
 */
const respondAuthError = (res, status, code, message) =>
  res.status(status).json({
    success: false,
    error: { code, message },
  });

/**
 * Middleware: يتطلب مستخدماً مصادَقاً عليه.
 * يُستخدم كـ `router.get('/', requireAuth, handler)`.
 *
 * @type {import('express').RequestHandler}
 */
export const requireAuth = async (req, res, next) => {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      return respondAuthError(
        res,
        401,
        'AUTH_REQUIRED',
        'يجب تسجيل الدخول للوصول إلى هذا المورد.'
      );
    }

    const result = verifyAccessToken(token);

    if (!result.valid) {
      return respondAuthError(res, 401, 'TOKEN_INVALID', result.message);
    }

    const { sub: userId, tokenVersion } = result.payload;

    // نستدعي المستخدم مع كل الحقول المهمة للتحقق (بلا كلمة المرور).
    const user = await User.findById(userId).select(
      'name email role isActive tokenVersion linkedEntity lastLoginIp'
    );

    if (!user) {
      return respondAuthError(
        res,
        401,
        'USER_NOT_FOUND',
        'الحساب غير موجود أو تم حذفه.'
      );
    }

    if (!user.isActive) {
      return respondAuthError(
        res,
        403,
        'ACCOUNT_DISABLED',
        'الحساب معطّل. يرجى التواصل مع الإدارة.'
      );
    }

    // نتحقق من نسخة التوكن: أي تغيير في كلمة المرور يُبطل الجلسات القديمة.
    if (user.tokenVersion !== tokenVersion) {
      logger.debug(
        `رفض جلسة لمستخدم ${user.email}: tokenVersion غير مطابق.`
      );
      return respondAuthError(
        res,
        401,
        'SESSION_INVALIDATED',
        'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.'
      );
    }

    // نُرفق المستخدم في الطلب (بلا أي حقل حساس).
    req.user = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      tokenVersion: user.tokenVersion,
      linkedEntity: user.linkedEntity,
      lastLoginIp: user.lastLoginIp,
    };

    return next();
  } catch (error) {
    logger.error(`فشل التحقق من المصادقة: ${error.message}`);
    return next(new AppError('فشل التحقق من الجلسة.', 500, 'AUTH_CHECK_FAILED'));
  }
};

/**
 * Middleware: يتطلب أن يكون المستخدم غير مصادَق (مثل تسجيل الدخول).
 * يمنع استدعاء /login وأنت مسجّل بالفعل.
 *
 * @type {import('express').RequestHandler}
 */
export const requireGuest = (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return next();
  }

  const result = verifyAccessToken(token);
  if (!result.valid) {
    // توكن غير صالح = يعامَل كضيف، نسمح بالمرور.
    return next();
  }

  return respondAuthError(
    res,
    400,
    'ALREADY_AUTHENTICATED',
    'أنت مسجّل الدخول بالفعل.'
  );
};

/**
 * Middleware: يتحقق من أن المستخدم يطابق دوراً معيّناً (أو أحد أدوار).
 * يبقى rbacMiddleware هو المسؤول عن الصلاحيات الدقيقة.
 *
 * @param {...string} allowedRoles
 * @returns {import('express').RequestHandler}
 */
export const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return respondAuthError(
      res,
      401,
      'AUTH_REQUIRED',
      'يجب تسجيل الدخول للوصول إلى هذا المورد.'
    );
  }

  if (allowedRoles.length === 0) {
    return next();
  }

  if (!allowedRoles.includes(req.user.role)) {
    logger.warn(
      `محاولة وصول مرفوضة: ${req.user.email} (${req.user.role}) → ${req.method} ${req.originalUrl}`
    );
    return respondAuthError(
      res,
      403,
      'ROLE_FORBIDDEN',
      'لا تملك الصلاحية للوصول إلى هذا المورد.'
    );
  }

  return next();
};

/**
 * Middleware اختياري: يرفق req.user إن وُجد توكن صالح، لكن لا يفشل الطلب.
 * مفيد لمسارات تعمل للمسجّل والزائر (مثل الصفحة الرئيسية).
 *
 * @type {import('express').RequestHandler}
 */
export const optionalAuth = async (req, _res, next) => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return next();
    }

    const result = verifyAccessToken(token);
    if (!result.valid) {
      return next();
    }

    const user = await User.findById(result.payload.sub).select(
      'name email role isActive tokenVersion linkedEntity'
    );

    if (!user || !user.isActive || user.tokenVersion !== result.payload.tokenVersion) {
      return next();
    }

    req.user = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      tokenVersion: user.tokenVersion,
      linkedEntity: user.linkedEntity,
    };

    return next();
  } catch {
    return next();
  }
};

/**
 * Middleware: يتطلب أن يكون المستخدم Admin.
 * اختصار شائع (requireRole('admin')).
 *
 * @type {import('express').RequestHandler}
 */
export const requireAdmin = [requireAuth, requireRole('admin')];

export default {
  requireAuth,
  requireGuest,
  requireRole,
  optionalAuth,
  requireAdmin,
};