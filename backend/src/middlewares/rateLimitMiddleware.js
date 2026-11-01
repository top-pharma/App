/**
 * @file rateLimitMiddleware.js
 * @description
 * تحديد معدّل الطلبات — Phase 2.5.
 *
 * التحديثات:
 * - ✅ فصل limiter للقراءات (GET) عن الكتابة (POST/PATCH/DELETE).
 * - القراءات: 300/دقيقة (أعلى بكثير — لأنها آمنة ولا تعدّل شيئاً).
 * - الكتابة: 100/15 دقيقة (كما هو).
 * - السبب: صفحات مثل FefoSelectorModal تُجري عدة قراءات، ولا يجب أن تحجب.
 */

import rateLimit from 'express-rate-limit';

import { env, isProduction } from '../config/env.js';

/**
 * استجابة موحّدة عند تجاوز الحد.
 */
const tooManyHandler = (req, res) => {
  res.status(429).json({
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'عدد المحاولات كبير. يرجى المحاولة بعد قليل.',
    },
  });
};

const defaultKeyGenerator = (req) => req.ip || 'unknown-ip';

/**
 * ✅ Limiter للقراءات (GET) — أعلى بكثير.
 * 300 طلب / دقيقة (5/ثانية) — كافٍ لتصفح سريع بدون حجب.
 */
export const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction() ? 300 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: defaultKeyGenerator,
  handler: tooManyHandler,
  skipSuccessfulRequests: false,
});

/**
 * Limiter للكتابات — 100/15 دقيقة (أصلي).
 */
export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: defaultKeyGenerator,
  handler: tooManyHandler,
  skip: (req) => req.method === 'GET', // ← نتخطى GET (يُعالجها readLimiter)
});

/**
 * Limiter مشدّد لتسجيل الدخول.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction() ? 5 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    return `${req.ip || 'unknown'}:${email || 'no-email'}`;
  },
  handler: tooManyHandler,
  skipSuccessfulRequests: true,
});

/**
 * Limiter لاسترداد كلمة المرور.
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProduction() ? 3 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    return `${req.ip || 'unknown'}:${email || 'no-email'}`;
  },
  handler: tooManyHandler,
});

/**
 * Limiter لتجديد التوكن.
 */
export const refreshTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: defaultKeyGenerator,
  handler: tooManyHandler,
});

export default {
  globalLimiter,
  readLimiter,
  loginLimiter,
  passwordResetLimiter,
  refreshTokenLimiter,
};