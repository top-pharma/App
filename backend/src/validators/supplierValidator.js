/**
 * @file supplierValidator.js
 * @description
 * مخططات Zod للتحقق من مدخلات الموردين.
 *
 * لماذا هذا الملف؟
 * - الموردون أبسط من الأصناف: بيانات اتصال + شروط دفع.
 * - الكود auto-generated في الـ Schema (لا يُمرَّر من العميل عادةً).
 * - التحقق من صيغة البريد والهاتف.
 * - التحقق من شروط الدفع (0..365 يوماً).
 */

import { z } from 'zod';

// ============================================================
// قواعد مشتركة
// ============================================================

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'المُعرّف غير صالح.');

const nameSchema = z
  .string({ required_error: 'اسم المورّد مطلوب.' })
  .trim()
  .min(2, 'الاسم قصير جداً.')
  .max(200, 'الاسم طويل جداً.');

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

const paymentTermsSchema = z.coerce
  .number()
  .int('يجب أن يكون عدداً صحيحاً.')
  .min(0, 'لا يمكن أن يكون سالباً.')
  .max(365, 'لا يمكن أن يتجاوز 365 يوماً.')
  .default(30);

// ============================================================
// 1) الإنشاء
// ============================================================

/**
 * POST /api/suppliers
 * - لا نقبل `code` (auto-generated).
 * - لا نقبل `currentBalance` (يُدار من الفواتير لاحقاً).
 */
export const createSupplierSchema = z.object({
  name: nameSchema,
  contactPerson: optionalTextSchema(150),
  phone: phoneSchema,
  phone2: optionalPhoneSchema,
  email: emailSchema,
  address: optionalTextSchema(300),
  city: optionalTextSchema(50),
  country: optionalTextSchema(50),
  taxNumber: optionalTextSchema(50),
  commercialRegister: optionalTextSchema(50),
  bankAccount: optionalTextSchema(50),
  bankName: optionalTextSchema(150),
  paymentTerms: paymentTermsSchema,
  notes: optionalTextSchema(1000),
});

// ============================================================
// 2) التعديل
// ============================================================

/**
 * PATCH /api/suppliers/:id
 * - code غير قابل للتعديل.
 * - currentBalance غير قابل للتعديل (يُدار آلياً).
 */
export const updateSupplierSchema = createSupplierSchema
  .partial()
  .extend({
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'لا توجد حقول للتعديل.',
  });

// ============================================================
// 3) القائمة
// ============================================================

/**
 * GET /api/suppliers
 * - search: name + phone + code + contactPerson.
 * - isActive: فلترة الحالة.
 */
export const listSuppliersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  sortBy: z.enum(['createdAt', 'name', 'code', 'paymentTerms']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================
// 4) Params
// ============================================================

export const supplierIdParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  createSupplierSchema,
  updateSupplierSchema,
  listSuppliersQuerySchema,
  supplierIdParamsSchema,
};