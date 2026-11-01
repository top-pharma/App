/**
 * @file rbacMiddleware.js
 * @description
 * فحص الصلاحيات الدقيقة (RBAC) اعتماداً على Role.permissions في قاعدة البيانات.
 *
 * لماذا هذا الملف؟
 * - متطلب صريح: "التحقق في Backend وليس الواجهة فقط".
 * - نتحقق من الصلاحيات الفعلية من قاعدة البيانات (لا نثق بـ role وحده)،
 *   فلو غيّر الأدمن صلاحيات دور، يُطبَّق فوراً.
 * - نُخزّن صلاحيات الدور في req.rolePermissions لتفادي استعلامات متكررة.
 * - نُسجّل محاولات الرفض في AuditLog (عبر auditLogMiddleware اختيارياً).
 * - لا نفترض أن req.user موجود: نتحقق أولاً ونرمي 401 إن لزم.
 */

import { Role } from '../models/Role.js';
import { AppError } from './errorMiddleware.js';
import { logger } from '../utils/logger.js';

/**
 * بناء استجابة رفض موحّدة.
 * @param {import('express').Response} res
 * @param {string} message
 * @returns {import('express').Response}
 */
const respondForbidden = (res, message) =>
  res.status(403).json({
    success: false,
    error: { code: 'PERMISSION_DENIED', message },
  });

/**
 * جلب صلاحيات الدور (مع cache بسيط في الذاكرة لمدة قصيرة).
 * الهدف: تقليل استعلامات قاعدة البيانات على المسارات الساخنة.
 *
 * ملاحظة: cache داخلي فقط. أي تعديل على Role عبر الـ API يجب أن يُفرِّغ
 * هذا الـ cache (نستدعي clearRoleCache عند تحديث الأدوار).
 */

/** @type {Map<string, { permissions: string[], expiresAt: number }>} */
const roleCache = new Map();

/**
 * مدة صلاحية الـ cache بالمللي ثانية (60 ثانية).
 * قصيرة كفاية لتعكس التغييرات سريعاً، وطويلة كفاية لتقليل الاستعلامات.
 */
const CACHE_TTL_MS = 60 * 1000;

/**
 * إفراغ الـ cache (كلياً أو لدور واحد).
 * @param {string} [roleName]
 */
export const clearRoleCache = (roleName) => {
  if (roleName) {
    roleCache.delete(roleName);
  } else {
    roleCache.clear();
  }
};

/**
 * إرجاع صلاحيات الدور (من cache أو قاعدة البيانات).
 *
 * @async
 * @param {string} roleName
 * @returns {Promise<string[]>}
 */
const getRolePermissions = async (roleName) => {
  const now = Date.now();
  const cached = roleCache.get(roleName);
  if (cached && cached.expiresAt > now) {
    return cached.permissions;
  }

  const role = await Role.findOne({ name: roleName, isActive: true }).select(
    'permissions'
  );

  const permissions = role ? role.permissions || [] : [];

  roleCache.set(roleName, {
    permissions,
    expiresAt: now + CACHE_TTL_MS,
  });

  return permissions;
};

/**
 * فحص أن المستخدم يملك كل الصلاحيات المطلوبة.
 *
 * @param {...string} requiredPermissions
 * @returns {import('express').RequestHandler}
 */
export const requirePermissions = (...requiredPermissions) => async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'يجب تسجيل الدخول.' },
      });
    }

    // Admin يملك كل الصلاحيات ضمناً (حماية من أخطاء إعدادات).
    if (req.user.role === 'admin') {
      req.rolePermissions = ['*'];
      return next();
    }

    const permissions = await getRolePermissions(req.user.role);
    req.rolePermissions = permissions;

    const missing = requiredPermissions.filter((p) => !permissions.includes(p));

    if (missing.length > 0) {
      logger.warn(
        `رفض صلاحية: ${req.user.email} (${req.user.role}) → ${req.method} ${req.originalUrl} — ناقص: ${missing.join(', ')}`
      );
      return respondForbidden(
        res,
        'لا تملك الصلاحية لتنفيذ هذه العملية.'
      );
    }

    return next();
  } catch (error) {
    return next(
      new AppError(
        `فشل التحقق من الصلاحيات: ${error.message}`,
        500,
        'RBAC_CHECK_FAILED'
      )
    );
  }
};

/**
 * فحص أن المستخدم يملك واحدة على الأقل من الصلاحيات المطلوبة.
 *
 * @param {...string} anyOfPermissions
 * @returns {import('express').RequestHandler}
 */
export const requireAnyPermission = (...anyOfPermissions) => async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'يجب تسجيل الدخول.' },
      });
    }

    if (req.user.role === 'admin') {
      req.rolePermissions = ['*'];
      return next();
    }

    const permissions = await getRolePermissions(req.user.role);
    req.rolePermissions = permissions;

    const hasAny = anyOfPermissions.some((p) => permissions.includes(p));

    if (!hasAny) {
      logger.warn(
        `رفض صلاحية (anyOf): ${req.user.email} (${req.user.role}) → ${req.method} ${req.originalUrl}`
      );
      return respondForbidden(res, 'لا تملك الصلاحية لتنفيذ هذه العملية.');
    }

    return next();
  } catch (error) {
    return next(
      new AppError(
        `فشل التحقق من الصلاحيات: ${error.message}`,
        500,
        'RBAC_CHECK_FAILED'
      )
    );
  }
};

/**
 * فحص أن المستخدم يملك كل الصلاحيات المطلوبة (صيغة مصفوفة).
 *
 * @param {string[]} permissions
 * @returns {import('express').RequestHandler}
 */
export const requireAllPermissions = (permissions) =>
  requirePermissions(...permissions);

/**
 * Middleware: يضمن أن المندوب لا يرى إلا موارد صيدلياته.
 * نستخدمه لاحقاً في controllers العملاء/الفواتير.
 * يضع req.scope = { salesRepId } ليستعمله الـ controller في الفلترة.
 *
 * @type {import('express').RequestHandler}
 */
export const scopeSalesRepToOwnCustomers = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'يجب تسجيل الدخول.' },
    });
  }

  if (req.user.role === 'sales_rep') {
    req.scope = { ...(req.scope || {}), salesRepId: req.user._id };
  }

  return next();
};

/**
 * Middleware: يضمن أن الصيدلية لا ترى إلا مواردها.
 * @type {import('express').RequestHandler}
 */
export const scopePharmacyToOwnData = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'يجب تسجيل الدخول.' },
    });
  }

  if (req.user.role === 'pharmacy') {
    const customerId = req.user.linkedEntity?.id || null;
    req.scope = { ...(req.scope || {}), customerId };
  }

  return next();
};

/**
 * هل يملك المستخدم الحالي الصلاحية (بدون middleware)؟
 * مفيد داخل controllers لتفريعات شرطية.
 *
 * @param {import('express').Request} req
 * @param {string} permission
 * @returns {boolean}
 */
export const userHasPermission = (req, permission) => {
  if (!req.user) {
    return false;
  }
  if (req.user.role === 'admin') {
    return true;
  }
  if (!Array.isArray(req.rolePermissions)) {
    return false;
  }
  return req.rolePermissions.includes(permission);
};

export default {
  requirePermissions,
  requireAnyPermission,
  requireAllPermissions,
  scopeSalesRepToOwnCustomers,
  scopePharmacyToOwnData,
  userHasPermission,
  clearRoleCache,
};