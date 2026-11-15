/**
 * @file errorMiddleware.js
 * @description
 * معالجة موحّدة لكل الأخطاء في التطبيق.
 *
 * ✅ v10.2 (2026-11-14):
 * - errorHandler: sanitize — لا session/client/stack circular.
 * - safeStringify — replacer — ضد circular.
 * - res.json → res.send(safeStringify(...)).
 */

import { ZodError } from 'zod';

import { isProduction } from '../config/env.js';
import { logger } from '../utils/logger.js';

/* ─────────────────────────────────────────────────────────────
 * AppError
 * ───────────────────────────────────────────────────────────── */

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'APP_ERROR', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/* ─────────────────────────────────────────────────────────────
 * asyncHandler
 * ───────────────────────────────────────────────────────────── */

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/* ─────────────────────────────────────────────────────────────
 * notFoundHandler
 * ───────────────────────────────────────────────────────────── */

export const notFoundHandler = (req, _res, next) => {
  next(
    new AppError(
      `المسار غير موجود: ${req.method} ${req.originalUrl}`,
      404,
      'ROUTE_NOT_FOUND'
    )
  );
};

/* ─────────────────────────────────────────────────────────────
 * Normalizers
 * ───────────────────────────────────────────────────────────── */

const normalizeMongooseError = (err) => {
  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.entries(err.errors).map(([field, e]) => ({
      field,
      message: e.message,
    }));
    return new AppError('بيانات غير صالحة.', 400, 'VALIDATION_ERROR', details);
  }

  if (err.name === 'CastError') {
    return new AppError(
      `قيمة غير صالحة للحقل: ${err.path}`,
      400,
      'CAST_ERROR',
      { field: err.path, value: String(err.value) }
    );
  }

  if (err.code === 11000 && err.keyValue) {
    const fields = Object.keys(err.keyValue);
    return new AppError(
      `القيمة مستخدمة مسبقاً في: ${fields.join(', ')}`,
      409,
      'DUPLICATE_KEY',
      { fields }
    );
  }

  return null;
};

const normalizeZodError = (err) => {
  const details = err.issues.map((issue) => ({
    field: issue.path.join('.') || '_root',
    message: issue.message,
  }));
  return new AppError('بيانات غير صالحة.', 400, 'VALIDATION_ERROR', details);
};

const normalizeJwtError = (err) => {
  if (err.name === 'TokenExpiredError') {
    return new AppError('انتهت صلاحية الجلسة.', 401, 'TOKEN_EXPIRED');
  }
  if (err.name === 'JsonWebTokenError') {
    return new AppError('رمز الجلسة غير صالح.', 401, 'TOKEN_INVALID');
  }
  return null;
};

/* ─────────────────────────────────────────────────────────────
 * ✅ v10.2 — safeStringify — replacer ضد circular
 * ───────────────────────────────────────────────────────────── */

const safeStringify = (obj) => {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (
      key === 'session' ||
      key === 'client' ||
      key === 'topology' ||
      key === 's' ||
      key === '$__' ||
      key === 'sessionPool' ||
      key === 'stack'
    ) {
      // stack: نُظهره فقط في التطوير — نُعيده كـ string
      if (key === 'stack' && typeof value === 'string') {
        return value.slice(0, 2000);
      }
      return undefined;
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  });
};

/* ─────────────────────────────────────────────────────────────
 * errorHandler
 * ───────────────────────────────────────────────────────────── */

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  let appError;
  try {
    if (err instanceof AppError) {
      appError = err;
    } else if (err instanceof ZodError) {
      appError = normalizeZodError(err);
    } else {
      appError =
        normalizeMongooseError(err) ||
        normalizeJwtError(err) ||
        new AppError(
          isProduction()
            ? 'حدث خطأ غير متوقع.'
            : err.message || 'خطأ غير معروف.',
          err.statusCode && Number.isInteger(err.statusCode)
            ? err.statusCode
            : 500,
          'INTERNAL_ERROR'
        );
    }
  } catch (normalizeErr) {
    appError = new AppError('حدث خطأ غير متوقع.', 500, 'INTERNAL_ERROR');
  }

  // سجل
  try {
    if (appError.statusCode >= 500) {
      logger.error(
        `[${appError.code}] ${req.method} ${req.originalUrl} → ${appError.message}`
      );
    } else if (!isProduction()) {
      logger.debug(
        `[${appError.code}] ${req.method} ${req.originalUrl} → ${appError.message}`
      );
    }
  } catch {
    /* تجاهل */
  }

  // body آمن
  const body = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
    },
  };

  if (appError.details) {
    try {
      JSON.stringify(appError.details);
      body.error.details = appError.details;
    } catch {
      body.error.details = null;
    }
  }

  if (!isProduction() && err.stack) {
    body.error.stack = String(err.stack).slice(0, 2000);
  }

  // ✅ v10.2 — safeStringify — لا يفشل أبداً
  let jsonString;
  try {
    jsonString = safeStringify(body);
  } catch {
    jsonString = JSON.stringify({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'حدث خطأ غير متوقع.' },
    });
  }

  const statusCode =
    appError.statusCode && Number.isInteger(appError.statusCode)
      ? appError.statusCode
      : 500;

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(statusCode).send(jsonString);
};

export default {
  AppError,
  asyncHandler,
  notFoundHandler,
  errorHandler,
};