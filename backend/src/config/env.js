/**
 * @file env.js
 * @description
 * تحميل والتحقق من كل متغيرات البيئة في مكان واحد.
 *
 * لماذا هذا الملف؟
 * - نمنع قراءة `process.env.X` من أي مكان آخر في الكود، لأن ذلك يجعل
 *   تتبع الأخطاء صعباً ويُخفي القيم الافتراضية.
 * - نُفشل تشغيل السيرفر فوراً إذا كان أي متغير حرج مفقود أو غير صالح،
 *   بدلاً من اكتشاف المشكلة لاحقاً أثناء معالجة طلب حقيقي.
 * - نُوحّد أسماء المتغيرات ونُصدّرها ككائن واحد (`env`)، فيسهل استبدالها
 *   في الاختبارات أو حقنها من مصادر أخرى مستقبلاً.
 *
 * ملاحظة أمنية: لا تُسجَّل قيمة أي متغير حساس في السجلات.
 */

import dotenv from 'dotenv';
import { z } from 'zod';

// نُحمّل .env مبكراً قبل أي `import` آخر يحتاج هذه القيم.
dotenv.config();

/**
 * مخطط التحقق من متغيرات البيئة.
 * كل حقل يحدد النوع + شرط الصلاحية، ورسائل الخطأ بالعربية لتسهيل التشخيص.
 */
const envSchema = z.object({
  // ------------------------------------------------------------
  // Server
  // ------------------------------------------------------------
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  PORT: z.coerce.number().int().positive().default(5000),

  API_PREFIX: z.string().startsWith('/').default('/api'),

  // ------------------------------------------------------------
  // Database
  // ------------------------------------------------------------
  MONGODB_URI: z
    .string()
    .min(1, 'MONGODB_URI مطلوب. راجع .env.example.')
    .refine(
      (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
      'MONGODB_URI يجب أن يبدأ بـ mongodb:// أو mongodb+srv://'
    ),

  // ------------------------------------------------------------
  // JWT
  // ------------------------------------------------------------
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET يجب أن يكون 32 حرفاً على الأقل.'),

  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET يجب أن يكون 32 حرفاً على الأقل.'),

  JWT_ACCESS_EXPIRES_IN: z.string().default('8h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // ------------------------------------------------------------
  // Password Hashing
  // ------------------------------------------------------------
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  // ------------------------------------------------------------
  // CORS
  // ------------------------------------------------------------
  CORS_ORIGIN: z
    .string()
    .min(1)
    .default('http://localhost:5173')
    // ندعم أكثر من أصل مفصولة بفاصلة (مثال: dev + prod preview)
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    ),

  // ------------------------------------------------------------
  // Rate Limiting
  // ------------------------------------------------------------
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),

  // ------------------------------------------------------------
  // Email (Ethereal في التطوير)
  // ------------------------------------------------------------
  EMAIL_HOST: z.string().default('smtp.ethereal.email'),
  EMAIL_PORT: z.coerce.number().int().positive().default(587),
  EMAIL_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  EMAIL_USER: z.string().default(''),
  EMAIL_PASS: z.string().default(''),
  EMAIL_FROM: z.string().default('Pharma System <noreply@pharma-system.local>'),

  // ------------------------------------------------------------
  // Frontend
  // ------------------------------------------------------------
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // ------------------------------------------------------------
  // Session
  // ------------------------------------------------------------
  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(30),

  // ------------------------------------------------------------
  // Audit Log
  // ------------------------------------------------------------
  AUDIT_LOG_TTL_DAYS: z.coerce.number().int().positive().default(365),
});

/**
 * نتيجة التحقق من المتغيرات.
 * @type {import('zod').SafeParseReturnType<unknown, z.infer<typeof envSchema>>}
 */
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // نطبع كل الأخطاء معاً ليرى المطوّر كل ما ينقصه في محاولة واحدة.
  const issues = parsed.error.issues
    .map((issue) => ` - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  // نستخدم console.error هنا لأن logger لم يُهيَّأ بعد.
  // eslint-disable-next-line no-console
  console.error('❌ فشل التحقق من متغيرات البيئة:\n' + issues);
  process.exit(1);
}

/**
 * كائن البيئة الموحّد.
 * استخدم `env.X` في كل مكان بدلاً من `process.env.X`.
 *
 * @typedef {Object} Env
 * @property {'development'|'production'|'test'} NODE_ENV
 * @property {number} PORT
 * @property {string} API_PREFIX
 * @property {string} MONGODB_URI
 * @property {string} JWT_ACCESS_SECRET
 * @property {string} JWT_REFRESH_SECRET
 * @property {string} JWT_ACCESS_EXPIRES_IN
 * @property {string} JWT_REFRESH_EXPIRES_IN
 * @property {number} BCRYPT_ROUNDS
 * @property {string[]} CORS_ORIGIN
 * @property {number} RATE_LIMIT_WINDOW_MS
 * @property {number} RATE_LIMIT_MAX_REQUESTS
 * @property {string} EMAIL_HOST
 * @property {number} EMAIL_PORT
 * @property {boolean} EMAIL_SECURE
 * @property {string} EMAIL_USER
 * @property {string} EMAIL_PASS
 * @property {string} EMAIL_FROM
 * @property {string} FRONTEND_URL
 * @property {number} SESSION_IDLE_TIMEOUT_MINUTES
 * @property {number} AUDIT_LOG_TTL_DAYS
 */

/** @type {Env} */
export const env = Object.freeze(parsed.data);

/**
 * هل نحن في بيئة الإنتاج؟
 * @returns {boolean}
 */
export const isProduction = () => env.NODE_ENV === 'production';

/**
 * هل نحن في بيئة التطوير؟
 * @returns {boolean}
 */
export const isDevelopment = () => env.NODE_ENV === 'development';

/**
 * هل نحن في بيئة الاختبار؟
 * @returns {boolean}
 */
export const isTest = () => env.NODE_ENV === 'test';

export default env;