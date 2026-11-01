/**
 * @file errorMiddleware.js
 * @description
 * معالجة موحّدة لكل الأخطاء في التطبيق.
 *
 * لماذا هذا الملف؟
 * - نمنع تسريب تفاصيل تقنية (stack traces, Mongo errors) إلى العميل.
 * - نُترجم أخطاء Mongoose و Zod إلى رسائل عربية واضحة + HTTP status صحيح.
 * - نُوفّر `notFoundHandler` لمسارات غير موجودة، و`errorHandler` النهائي.
 * - نُوفّر `asyncHandler` لتغليف الدوال غير المتزامنة تلقائياً، فلا نُكرّر
 *   `try/catch` في كل controller.
 * - في الإنتاج نُخفي الـ stack، وفي التطوير نُظهره لتسهيل التشخيص.
 */

import { ZodError } from 'zod';

import { isProduction } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * خطأ تطبيقي مخصّص يحمل HTTP status + رمز داخلي.
 * نستخدمه عندما نُريد رمي خطأ واضح من داخل controllers.
 *
 * @example
 * throw new AppError('البريد مستخدم مسبقاً', 409, 'EMAIL_TAKEN');
 */
export class AppError extends Error {
  /**
   * @param {string} message - رسالة عربية موجّهة للمستخدم.
   * @param {number} [statusCode=500] - HTTP status.
   * @param {string} [code='APP_ERROR'] - رمز داخلي للتمييز.
   * @param {Object} [details] - تفاصيل إضافية (اختيارية).
   */
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

/**
 * تغليف دوال async لتمرير الأخطاء إلى Express تلقائياً.
 * بلا هذا، أي `await` يفشل داخل route لن يصل إلى errorHandler.
 *
 * @template {import('express').RequestHandler} T
 * @param {T} fn
 * @returns {import('express').RequestHandler}
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * معالج المسارات غير الموجودة (404).
 * يُسجَّل بعد كل الراوتس، قبل errorHandler.
 *
 * @type {import('express').RequestHandler}
 */
export const notFoundHandler = (req, _res, next) => {
  next(
    new AppError(
      `المسار غير موجود: ${req.method} ${req.originalUrl}`,
      404,
      'ROUTE_NOT_FOUND'
    )
  );
};

/**
 * تحويل أخطاء Mongoose المعروفة إلى AppError موحّد.
 *
 * @param {Error} err
 * @returns {AppError | null}
 */
const normalizeMongooseError = (err) => {
  // خطأ تحقق من الـ Schema.
  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.entries(err.errors).map(([field, e]) => ({
      field,
      message: e.message,
    }));
    return new AppError('بيانات غير صالحة.', 400, 'VALIDATION_ERROR', details);
  }

  // خطأ Cast (مثل ObjectId غير صالح).
  if (err.name === 'CastError') {
    return new AppError(
      `قيمة غير صالحة للحقل: ${err.path}`,
      400,
      'CAST_ERROR',
      { field: err.path, value: err.value }
    );
  }

  // خطأ تكرار مفتاح فريد (unique index).
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

/**
 * تحويل أخطاء Zod إلى AppError موحّد.
 *
 * @param {ZodError} err
 * @returns {AppError}
 */
const normalizeZodError = (err) => {
  const details = err.issues.map((issue) => ({
    field: issue.path.join('.') || '_root',
    message: issue.message,
  }));
  return new AppError('بيانات غير صالحة.', 400, 'VALIDATION_ERROR', details);
};

/**
 * تحويل أخطاء JWT المعروفة.
 *
 * @param {Error} err
 * @returns {AppError | null}
 */
const normalizeJwtError = (err) => {
  if (err.name === 'TokenExpiredError') {
    return new AppError('انتهت صلاحية الجلسة.', 401, 'TOKEN_EXPIRED');
  }
  if (err.name === 'JsonWebTokenError') {
    return new AppError('رمز الجلسة غير صالح.', 401, 'TOKEN_INVALID');
  }
  return null;
};

/**
 * المعالج النهائي للأخطاء.
 * يجب أن يكون آخر middleware في السلسلة.
 *
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  // نطبّع الخطأ إلى AppError موحّد.
  let appError;
  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof ZodError) {
    appError = normalizeZodError(err);
  } else {
    appError =
      normalizeMongooseError(err) ||
      normalizeJwtError(err) ||
      new AppError(
        isProduction() ? 'حدث خطأ غير متوقع.' : err.message || 'خطأ غير معروف.',
        err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500,
        'INTERNAL_ERROR'
      );
  }

  // نُسجّل الأخطاء 5xx دائماً، و 4xx في التطوير فقط لتقليل الضجيج.
  if (appError.statusCode >= 500) {
    logger.error(
      `[${appError.code}] ${req.method} ${req.originalUrl} → ${appError.message}`,
      { stack: isProduction() ? undefined : err.stack }
    );
  } else if (!isProduction()) {
    logger.debug(
      `[${appError.code}] ${req.method} ${req.originalUrl} → ${appError.message}`
    );
  }

  const body = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
    },
  };

  if (appError.details) {
    body.error.details = appError.details;
  }

  // نُظهر stack فقط في التطوير.
  if (!isProduction() && err.stack) {
    body.error.stack = err.stack;
  }

  res.status(appError.statusCode).json(body);
};

export default {
  AppError,
  asyncHandler,
  notFoundHandler,
  errorHandler,
};