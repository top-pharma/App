/**
 * @file jwt.js
 * @description
 * توليد والتحقق من Access و Refresh Tokens.
 *
 * لماذا هذا الملف؟
 * - نعزل `jsonwebtoken` في مكان واحد، فلا نُكرّر أسماء الحقول أو الأخطاء.
 * - نُفرّق بوضوح بين accessToken (قصير العمر) و refreshToken (طويل العمر).
 * - نُدخل `tokenVersion` في الحمولة (payload) لدعم إبطال التوكنات
 *   عند تغيير كلمة المرور (نُقارنها بالقيمة المخزنة في User).
 * - لا نُسجّل التوكنات أبداً في أي log.
 */

import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * أنواع التوكنات المدعومة.
 * @readonly
 * @enum {string}
 */
export const TOKEN_TYPES = Object.freeze({
  ACCESS: 'access',
  REFRESH: 'refresh',
});

/**
 * أخطاء JWT المعروفة التي نُترجمها لرسائل عربية واضحة.
 * @readonly
 */
const JWT_ERROR_MESSAGES = Object.freeze({
  TokenExpiredError: 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.',
  JsonWebTokenError: 'رمز الجلسة غير صالح.',
  NotBeforeError: 'رمز الجلسة غير فعّال بعد.',
});

/**
 * بناء الحمولة المشتركة بين نوعي التوكن.
 *
 * @param {Object} params
 * @param {string} params.userId - مُعرّف المستخدم.
 * @param {string} params.role - دور المستخدم (admin/storekeeper/...).
 * @param {number} params.tokenVersion - رقم نسخة التوكن (يُبطَل بتغييره).
 * @param {string} params.tokenType - access أو refresh.
 * @returns {Object}
 */
const buildPayload = ({ userId, role, tokenVersion, tokenType }) => ({
  sub: String(userId),
  role,
  tokenVersion,
  tokenType,
});

/**
 * توليد Access Token.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.role
 * @param {number} params.tokenVersion
 * @returns {string}
 */
export const generateAccessToken = ({ userId, role, tokenVersion }) => {
  const payload = buildPayload({
    userId,
    role,
    tokenVersion,
    tokenType: TOKEN_TYPES.ACCESS,
  });

  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    issuer: 'pharma-system',
    audience: 'pharma-system-client',
  });
};

/**
 * توليد Refresh Token.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.role
 * @param {number} params.tokenVersion
 * @returns {string}
 */
export const generateRefreshToken = ({ userId, role, tokenVersion }) => {
  const payload = buildPayload({
    userId,
    role,
    tokenVersion,
    tokenType: TOKEN_TYPES.REFRESH,
  });

  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    issuer: 'pharma-system',
    audience: 'pharma-system-client',
  });
};

/**
 * توليد زوج التوكنات معاً.
 * نستخدمها في تسجيل الدخول وفي تجديد الجلسة.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.role
 * @param {number} params.tokenVersion
 * @returns {{ accessToken: string, refreshToken: string }}
 */
export const generateTokenPair = ({ userId, role, tokenVersion }) => {
  const accessToken = generateAccessToken({ userId, role, tokenVersion });
  const refreshToken = generateRefreshToken({ userId, role, tokenVersion });
  return { accessToken, refreshToken };
};

/**
 * التحقق من Access Token.
 *
 * @param {string} token
 * @returns {{ valid: true, payload: Object } | { valid: false, reason: string, message: string }}
 */
export const verifyAccessToken = (token) => {
  return verifyToken(token, TOKEN_TYPES.ACCESS, env.JWT_ACCESS_SECRET);
};

/**
 * التحقق من Refresh Token.
 *
 * @param {string} token
 * @returns {{ valid: true, payload: Object } | { valid: false, reason: string, message: string }}
 */
export const verifyRefreshToken = (token) => {
  return verifyToken(token, TOKEN_TYPES.REFRESH, env.JWT_REFRESH_SECRET);
};

/**
 * الدالة الداخلية المشتركة للتحقق من أي توكن.
 *
 * @param {string} token
 * @param {'access'|'refresh'} expectedType
 * @param {string} secret
 * @returns {{ valid: true, payload: Object } | { valid: false, reason: string, message: string }}
 */
const verifyToken = (token, expectedType, secret) => {
  if (typeof token !== 'string' || token.length === 0) {
    return {
      valid: false,
      reason: 'MissingToken',
      message: 'رمز الجلسة مفقود.',
    };
  }

  try {
    const payload = jwt.verify(token, secret, {
      issuer: 'pharma-system',
      audience: 'pharma-system-client',
    });

    // نتحقق من أن نوع التوكن مطابق لما نتوقعه (access ≠ refresh).
    if (payload.tokenType !== expectedType) {
      return {
        valid: false,
        reason: 'TokenTypeMismatch',
        message: 'نوع رمز الجلسة غير متوافق.',
      };
    }

    return { valid: true, payload };
  } catch (error) {
    // لا نُسجّل التوكن نفسه، فقط اسم الخطأ.
    logger.debug(`فشل التحقق من التوكن: ${error.name}`);

    const reason = error.name || 'UnknownError';
    const message = JWT_ERROR_MESSAGES[reason] ?? 'رمز الجلسة غير صالح.';

    return { valid: false, reason, message };
  }
};

/**
 * استخراج توكن Bearer من ترويسة الطلب.
 * نستخدمها في authMiddleware لتوحيد المنطق.
 *
 * @param {string | undefined} authorizationHeader
 * @returns {string | null}
 */
export const extractBearerToken = (authorizationHeader) => {
  if (typeof authorizationHeader !== 'string') {
    return null;
  }
  const parts = authorizationHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  const token = parts[1].trim();
  return token.length > 0 ? token : null;
};

export default {
  TOKEN_TYPES,
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  extractBearerToken,
};