/**
 * @file jwt.js
 * @description
 * توليد والتحقق من Access و Refresh Tokens.
 *
 * ✅ v10.11 (2026-11-16):
 * - generateAccessToken: async — يقرأ sessionHours من Settings.security.
 * - generateRefreshToken: async — من Settings (أو env).
 * - generateTokenPair: async.
 */

import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { logger } from './logger.js';

export const TOKEN_TYPES = Object.freeze({
  ACCESS: 'access',
  REFRESH: 'refresh',
});

const JWT_ERROR_MESSAGES = Object.freeze({
  TokenExpiredError: 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.',
  JsonWebTokenError: 'رمز الجلسة غير صالح.',
  NotBeforeError: 'رمز الجلسة غير فعّال بعد.',
});

const buildPayload = ({ userId, role, tokenVersion, tokenType }) => ({
  sub: String(userId),
  role,
  tokenVersion,
  tokenType,
});

/**
 * ✅ v10.11 — يقرأ sessionHours من Settings (fallback: env).
 */
const getAccessExpiresIn = async () => {
  try {
    const { Settings } = await import('../models/Settings.js');
    const settings = await Settings.getSettings();
    const hours = settings.security?.sessionHours ?? 8;
    return `${hours}h`;
  } catch {
    return env.JWT_ACCESS_EXPIRES_IN || '8h';
  }
};

export const generateAccessToken = async ({ userId, role, tokenVersion }) => {
  const payload = buildPayload({
    userId,
    role,
    tokenVersion,
    tokenType: TOKEN_TYPES.ACCESS,
  });

  const expiresIn = await getAccessExpiresIn();

  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn,
    issuer: 'pharma-system',
    audience: 'pharma-system-client',
  });
};

export const generateRefreshToken = async ({ userId, role, tokenVersion }) => {
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
 * ✅ v10.11 — async.
 */
export const generateTokenPair = async ({ userId, role, tokenVersion }) => {
  const accessToken = await generateAccessToken({ userId, role, tokenVersion });
  const refreshToken = await generateRefreshToken({ userId, role, tokenVersion });
  return { accessToken, refreshToken };
};

export const verifyAccessToken = (token) => {
  return verifyToken(token, TOKEN_TYPES.ACCESS, env.JWT_ACCESS_SECRET);
};

export const verifyRefreshToken = (token) => {
  return verifyToken(token, TOKEN_TYPES.REFRESH, env.JWT_REFRESH_SECRET);
};

const verifyToken = (token, expectedType, secret) => {
  if (typeof token !== 'string' || token.length === 0) {
    return { valid: false, reason: 'MissingToken', message: 'رمز الجلسة مفقود.' };
  }

  try {
    const payload = jwt.verify(token, secret, {
      issuer: 'pharma-system',
      audience: 'pharma-system-client',
    });

    if (payload.tokenType !== expectedType) {
      return {
        valid: false,
        reason: 'TokenTypeMismatch',
        message: 'نوع رمز الجلسة غير متوافق.',
      };
    }

    return { valid: true, payload };
  } catch (error) {
    logger.debug(`فشل التحقق من التوكن: ${error.name}`);
    const reason = error.name || 'UnknownError';
    const message = JWT_ERROR_MESSAGES[reason] ?? 'رمز الجلسة غير صالح.';
    return { valid: false, reason, message };
  }
};

export const extractBearerToken = (authorizationHeader) => {
  if (typeof authorizationHeader !== 'string') return null;
  const parts = authorizationHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
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