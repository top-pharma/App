/**
 * @file authValidator.js
 * @description
 * مخططات Zod للتحقق من مدخلات المصادقة والمستخدمين.
 *
 * لماذا هذا الملف؟
 * - نتحقق من كل مدخل قبل وصوله للـ controller (مبدأ: "لا تثق بالعميل").
 * - نُوفّر رسائل خطأ عربية واضحة تُستخدم مباشرة في الواجهة.
 * - نُوحّد قواعد التحقق بين login و changePassword و resetPassword.
 * - نُصدّر schemas للـ body و query و params حيث يلزم.
 * - الجداول النصية (messages) بالعربية، والقيم بالإنجليزية (email, password).
 */

import { z } from 'zod';

import { USER_ROLES } from '../models/User.js';
import { PASSWORD_RULES } from '../utils/password.js';

// ============================================================
// قواعد مشتركة (Reusable Rules)
// ============================================================

/**
 * بريد إلكتروني صالح (lowercase + trim).
 * نستخدم قاعدة بسيطة كافية للاستخدام البشري بلا تعقيد RFC كامل.
 */
const emailSchema = z
  .string({ required_error: 'البريد الإلكتروني مطلوب.' })
  .trim()
  .toLowerCase()
  .min(1, 'البريد الإلكتروني مطلوب.')
  .max(150, 'البريد الإلكتروني طويل جداً.')
  .email('صيغة البريد الإلكتروني غير صحيحة.');

/**
 * رقم هاتف سوداني/دولي مبسّط (أرقام + رموز مسموحة).
 * نقبل: +249xxxxxxxxx أو 09xxxxxxxx أو أي مزيج منطقي.
 */
const phoneSchema = z
  .string()
  .trim()
  .max(30, 'رقم الهاتف طويل جداً.')
  .regex(/^[+\d][\d\s-]{5,29}$/, 'صيغة رقم الهاتف غير صحيحة.')
  .optional()
  .or(z.literal(''));

/**
 * كلمة مرور قوية (تطابق قواعد utils/password.js).
 * - 8..128 حرفاً.
 * - حرف كبير + حرف صغير + رقم على الأقل.
 */
const passwordSchema = z
  .string({ required_error: 'كلمة المرور مطلوبة.' })
  .min(
    PASSWORD_RULES.MIN_LENGTH,
    `كلمة المرور يجب أن تكون ${PASSWORD_RULES.MIN_LENGTH} أحرف على الأقل.`
  )
  .max(
    PASSWORD_RULES.MAX_LENGTH,
    `كلمة المرور يجب ألا تتجاوز ${PASSWORD_RULES.MAX_LENGTH} حرفاً.`
  )
  .regex(/[A-Z]/, 'كلمة المرور يجب أن تحتوي على حرف كبير واحد على الأقل.')
  .regex(/[a-z]/, 'كلمة المرور يجب أن تحتوي على حرف صغير واحد على الأقل.')
  .regex(/[0-9]/, 'كلمة المرور يجب أن تحتوي على رقم واحد على الأقل.');

/**
 * اسم شخص (2..100 حرف).
 */
const nameSchema = z
  .string({ required_error: 'الاسم مطلوب.' })
  .trim()
  .min(2, 'الاسم قصير جداً.')
  .max(100, 'الاسم طويل جداً.');

/**
 * MongoDB ObjectId (24 hex char).
 */
const objectIdSchema = z
  .string({ required_error: 'المُعرّف مطلوب.' })
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'المُعرّف غير صالح.');

/**
 * دور مستخدم (من القائمة المعتمدة).
 */
const roleSchema = z.enum(
  [
    USER_ROLES.ADMIN,
    USER_ROLES.STOREKEEPER,
    USER_ROLES.ACCOUNTANT,
    USER_ROLES.SALES_REP,
    USER_ROLES.PHARMACY,
    USER_ROLES.HR_MANAGER,
  ],
  {
    errorMap: () => ({ message: 'دور غير معتمد.' }),
  }
);

// ============================================================
// 1) المصادقة (Auth)
// ============================================================

/**
 * POST /api/auth/login
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ required_error: 'كلمة المرور مطلوبة.' })
    .min(1, 'كلمة المرور مطلوبة.')
    .max(PASSWORD_RULES.MAX_LENGTH, 'كلمة المرور طويلة جداً.'),
});

/**
 * POST /api/auth/refresh
 * نقبل refreshToken في الـ body (بلا Access Token).
 */
export const refreshTokenSchema = z.object({
  refreshToken: z
    .string({ required_error: 'رمز التجديد مطلوب.' })
    .min(1, 'رمز التجديد مطلوب.'),
});

/**
 * PATCH /api/auth/change-password
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ required_error: 'كلمة المرور الحالية مطلوبة.' })
      .min(1, 'كلمة المرور الحالية مطلوبة.'),
    newPassword: passwordSchema,
    confirmPassword: z
      .string({ required_error: 'تأكيد كلمة المرور مطلوب.' })
      .min(1, 'تأكيد كلمة المرور مطلوب.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين.',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'كلمة المرور الجديدة يجب أن تختلف عن الحالية.',
    path: ['newPassword'],
  });

/**
 * POST /api/auth/forgot-password
 */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

/**
 * POST /api/auth/reset-password
 */
export const resetPasswordSchema = z
  .object({
    token: z
      .string({ required_error: 'رمز إعادة التعيين مطلوب.' })
      .min(10, 'رمز إعادة التعيين غير صالح.'),
    newPassword: passwordSchema,
    confirmPassword: z
      .string({ required_error: 'تأكيد كلمة المرور مطلوب.' })
      .min(1, 'تأكيد كلمة المرور مطلوب.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين.',
    path: ['confirmPassword'],
  });

// ============================================================
// 2) المستخدمون (Users — Admin only)
// ============================================================

/**
 * POST /api/users
 */
export const createUserSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    phone: phoneSchema,
    role: roleSchema,
    password: passwordSchema.optional(),
    /**
     * إن لم تُمرَّر كلمة المرور، نُولّد واحدة عشوائية ونُعيدها في الاستجابة.
     */
    mustChangePassword: z.boolean().optional().default(true),
    /**
     * ربط اختياري بكيان (يُستخدم للصيدليات).
     */
    linkedEntity: z
      .object({
        type: z.enum(['Customer']).nullable().optional(),
        id: objectIdSchema.nullable().optional(),
      })
      .optional(),
    notes: z.string().trim().max(500, 'الملاحظات طويلة جداً.').optional(),
  })
  // الصيدلية يجب ربطها بكيان Customer.
  .refine(
    (data) => {
      if (data.role === USER_ROLES.PHARMACY) {
        return data.linkedEntity?.type === 'Customer' && Boolean(data.linkedEntity?.id);
      }
      return true;
    },
    {
      message: 'الصيدلية يجب ربطها بعميل (Customer).',
      path: ['linkedEntity', 'id'],
    }
  );

/**
 * PATCH /api/users/:id
 * لا نسمح بتعديل كلمة المرور هنا (لها endpoint مستقل).
 */
export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    phone: phoneSchema,
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
    linkedEntity: z
      .object({
        type: z.enum(['Customer']).nullable().optional(),
        id: objectIdSchema.nullable().optional(),
      })
      .optional(),
    notes: z.string().trim().max(500, 'الملاحظات طويلة جداً.').optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'لا توجد حقول للتعديل.',
  });

/**
 * PATCH /api/users/:id/reset-password
 * إعادة تعيين كلمة مرور مستخدم (Admin only).
 */
export const adminResetPasswordSchema = z.object({
  newPassword: passwordSchema.optional(),
  mustChangePassword: z.boolean().optional().default(true),
});

/**
 * GET /api/users
 * Query params للتصفية والصفحات.
 */
export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  role: roleSchema.optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  sortBy: z.enum(['createdAt', 'name', 'email', 'role']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * params لمسارات :id.
 */
export const userIdParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================
// 3) تصدير موحّد
// ============================================================

export default {
  // Auth
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,

  // Users
  createUserSchema,
  updateUserSchema,
  adminResetPasswordSchema,
  listUsersQuerySchema,
  userIdParamsSchema,
};