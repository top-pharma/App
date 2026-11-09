/**
 * @file rbacMiddleware.js
 * @description
 * فحص الصلاحيات الدقيقة (RBAC) اعتماداً على Role.permissions في قاعدة البيانات.
 *
 * ✅ 🅳 (2026-11-09) — P1:
 * - getRolePermissions: Role.findOne({ code: roleName }) بدل { name, isActive }
 * - السبب: Role لا يحتوي isActive (بعد 🅱/🅲)، و roleName = code (مثل 'admin')
 *   وليس name العربي (مثل 'مدير').
 * - الأثر: sales_rep / accountant / pharmacy كانوا يحصلون على permissions=[] → 403 على كل شيء.
 */

import { Role } from '../models/Role.js';
import { AppError } from './errorMiddleware.js';
import { logger } from '../utils/logger.js';

/**
 * بناء استجابة رفض موحّدة.
 */
const respondForbidden = (res, message) =>
  res.status(403).json({
    success: false,
    error: { code: 'PERMISSION_DENIED', message },
  });

/** @type {Map<string, { permissions: string[], expiresAt: number }>} */
const roleCache = new Map();

/** مدة صلاحية الـ cache بالمللي ثانية (60 ثانية). */
const CACHE_TTL_MS = 60 * 1000;

/**
 * إفراغ الـ cache (كلياً أو لدور واحد).
 * @param {string} [roleName] — code الدور (مثل 'admin')
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
 * ✅ 🅳 (P1): نستخدم `code` بدل `name` + `isActive`.
 * - `roleName` هنا = `req.user.role` = code الدور (مثل 'sales_rep').
 * - `Role.js` بعد 🅱/🅲 لا يحتوي `isActive` — لا نستخدمه.
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

  // ✅ 🅳: `{ code }` بدل `{ name, isActive }`
  const role = await Role.findOne({ code: roleName }).select('permissions');

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

    // Admin يملك كل الصلاحيات ضمناً.
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