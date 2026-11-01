/**
 * @file validateMiddleware.js
 * @description
 * Middleware عام للتحقق من المدخلات باستخدام Zod.
 *
 * لماذا هذا الملف؟
 * - نُوحّد التحقق في مكان واحد، فلا نُكرّره في كل route.
 * - نُغلّف ZodError في AppError مع رسائل عربية واضحة.
 * - نُدعم التحقق من body و query و params.
 * - بعد التحقق نستبدل القيم الأصلية بالقيم المُحلَّلة (coerced/transformed)
 *   حتى يستفيد الـ controller من التحويلات (مثل تحويل "1" إلى 1).
 * - لا نستخدم `.parse()` مباشرة في الـ routes لتفادي try/catch مكرر.
 */

import { ZodError } from 'zod';

import { AppError } from './errorMiddleware.js';

/**
 * تنسيق أخطاء Zod إلى قائمة حقول + رسائل.
 * @param {ZodError} error
 * @returns {Array<{ field: string, message: string }>}
 */
const formatZodIssues = (error) =>
  error.issues.map((issue) => ({
    field: issue.path.join('.') || '_root',
    message: issue.message,
  }));

/**
 * Middleware للتحقق من جزء معيّن من الطلب.
 *
 * @param {import('zod').ZodTypeAny} schema
 * @param {'body'|'query'|'params'} [source='body']
 * @returns {import('express').RequestHandler}
 */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  try {
    const parsed = schema.parse(req[source]);

    // نستبدل القيم الأصلية بالقيم المُحلَّلة (بعد coercion/transform).
    // ملاحظة: لا نستطيع إعادة تعيين req.query أو req.params مباشرة في Express 4
    // (getters للقراءة فقط)، لذا نستخدم defineProperty عند الحاجة.
    if (source === 'body') {
      req.body = parsed;
    } else if (source === 'query') {
      Object.defineProperty(req, 'validatedQuery', {
        value: parsed,
        writable: false,
        configurable: true,
        enumerable: true,
      });
      // نُبقي req.query كما هو (Express 4 يمنع الكتابة)، لكن نُوفّر validatedQuery.
    } else if (source === 'params') {
      Object.defineProperty(req, 'validatedParams', {
        value: parsed,
        writable: false,
        configurable: true,
        enumerable: true,
      });
    }

    return next();
  } catch (error) {
    if (error instanceof ZodError) {
      const details = formatZodIssues(error);
      return next(
        new AppError(
          details[0]?.message || 'بيانات غير صالحة.',
          400,
          'VALIDATION_ERROR',
          details
        )
      );
    }
    return next(error);
  }
};

/**
 * Middleware للتحقق من body (اختصار).
 * @param {import('zod').ZodTypeAny} schema
 * @returns {import('express').RequestHandler}
 */
export const validateBody = (schema) => validate(schema, 'body');

/**
 * Middleware للتحقق من query.
 * @param {import('zod').ZodTypeAny} schema
 * @returns {import('express').RequestHandler}
 */
export const validateQuery = (schema) => validate(schema, 'query');

/**
 * Middleware للتحقق من params.
 * @param {import('zod').ZodTypeAny} schema
 * @returns {import('express').RequestHandler}
 */
export const validateParams = (schema) => validate(schema, 'params');

export default { validate, validateBody, validateQuery, validateParams };