/**
 * @file customerValidator.js
 * @description
 * مخططات Zod للتحقق من مدخلات الصيدليات (العملاء).
 *
 * لماذا هذا الملف؟
 * - كل عملاء النظام صيدليات (لا عميل عابر).
 * - `assignedSalesRep` إلزامي — يُتحقق من وجوده ودوره في الـ controller.
 * - `returnGracePeriod` افتراضي 7 أيام (متطلب صريح).
 * - `currentBalance` لا يُقبل من العميل (يُدار آلياً).
 * - `code` auto-generated في Model.
 */

import { z } from 'zod';

// ============================================================
// قواعد مشتركة
// ============================================================

const objectIdSchema = z
  .string({ required_error: 'المُعرّف مطلوب.' })
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'المُعرّف غير صالح.');

const optionalObjectIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'المُعرّف غير صالح.')
  .optional()
  .or(z.literal('').transform(() => undefined));

const nameSchema = z
  .string({ required_error: 'اسم الصيدلية مطلوب.' })
  .trim()
  .min(2, 'الاسم قصير جداً.')
  .max(150, 'الاسم طويل جداً.');

const phoneSchema = z
  .string({ required_error: 'رقم الهاتف مطلوب.' })
  .trim()
  .max(30, 'رقم الهاتف طويل جداً.')
  .regex(/^[+\d][\d\s-]{5,29}$/, 'صيغة رقم الهاتف غير صحيحة.');

const optionalPhoneSchema = z
  .string()
  .trim()
  .max(30, 'رقم الهاتف طويل جداً.')
  .regex(/^[+\d][\d\s-]{5,29}$/, 'صيغة رقم الهاتف غير صحيحة.')
  .optional()
  .or(z.literal(''));

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(150, 'البريد الإلكتروني طويل جداً.')
  .email('صيغة البريد الإلكتروني غير صحيحة.')
  .optional()
  .or(z.literal(''));

const optionalTextSchema = (max) =>
  z.string().trim().max(max, 'النص طويل جداً.').optional().or(z.literal(''));

const nonNegativeNumberSchema = (defaultValue = 0) =>
  z.coerce.number().min(0, 'لا يمكن أن تكون سالبة.').default(defaultValue);

// ============================================================
// 1) الإنشاء
// ============================================================

/**
 * POST /api/customers
 */
export const createCustomerSchema = z.object({
  name: nameSchema,
  ownerName: optionalTextSchema(150),
  phone: phoneSchema,
  phone2: optionalPhoneSchema,
  email: emailSchema,
  address: optionalTextSchema(250),
  city: optionalTextSchema(50),
  taxNumber: optionalTextSchema(50),
  commercialRegister: optionalTextSchema(50),
  creditLimit: nonNegativeNumberSchema(0),
  paymentTerms: z.coerce
    .number()
    .int('يجب أن يكون عدداً صحيحاً.')
    .min(0, 'لا يمكن أن يكون سالباً.')
    .max(365, 'لا يمكن أن يتجاوز 365 يوماً.')
    .default(30),
  returnGracePeriod: z.coerce
    .number()
    .int('يجب أن يكون عدداً صحيحاً.')
    .min(0, 'لا يمكن أن يكون سالباً.')
    .max(90, 'لا يمكن أن يتجاوز 90 يوماً.')
    .default(7),
  assignedSalesRep: objectIdSchema,
  notes: optionalTextSchema(1000),
});

// ============================================================
// 2) التعديل
// ============================================================

/**
 * PATCH /api/customers/:id
 * - currentBalance غير قابل للتعديل.
 * - code غير قابل للتعديل.
 * - isBlocked يُدار عبر PATCH أيضاً (مع blockReason).
 */
export const updateCustomerSchema = createCustomerSchema
  .partial()
  .extend({
    isActive: z.boolean().optional(),
    isBlocked: z.boolean().optional(),
    blockReason: optionalTextSchema(500),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'لا توجد حقول للتعديل.',
  });

// ============================================================
// 3) القائمة
// ============================================================

/**
 * GET /api/customers
 */
export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  city: z.string().trim().max(50).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  isBlocked: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  assignedSalesRep: optionalObjectIdSchema,
  sortBy: z
    .enum(['createdAt', 'name', 'city', 'currentBalance', 'creditLimit'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================
// 4) Params
// ============================================================

export const customerIdParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersQuerySchema,
  customerIdParamsSchema,
};