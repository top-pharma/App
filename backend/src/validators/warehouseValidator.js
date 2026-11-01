/**
 * @file warehouseValidator.js
 * @description
 * مخططات Zod للتحقق من مدخلات المخازن.
 *
 * لماذا هذا الملف؟
 * - نتحقق من المدخلات قبل وصولها للـ controller.
 * - نضمن أن `code` بصيغة موحّدة (أحرف كبيرة + أرقام + شرطات).
 * - نوع المخزن `type` لا يُقبل من العميل — يُحدَّد داخلياً كـ branch افتراضياً،
 *   ثم يُرقّى إلى main فقط عبر endpoint مخصّص (setAsMain) لتفادي التعارض
 *   مع الفهرس الفريد الجزئي (مخزن رئيسي واحد فقط).
 */

import { z } from 'zod';

// ============================================================
// قواعد مشتركة
// ============================================================

/**
 * كود المخزن: يبدأ بحرف، أحرف كبيرة + أرقام + _ + -.
 * يُحوَّل تلقائياً إلى UPPERCASE.
 */
const warehouseCodeSchema = z
  .string({ required_error: 'كود المخزن مطلوب.' })
  .trim()
  .toUpperCase()
  .min(2, 'كود المخزن قصير جداً.')
  .max(20, 'كود المخزن طويل جداً.')
  .regex(
    /^[A-Z][A-Z0-9_-]{1,19}$/,
    'الكود يبدأ بحرف ويحتوي أحرفاً كبيرة وأرقاماً و _ و - فقط.'
  );

/**
 * اسم المخزن: 2..100 حرف.
 */
const warehouseNameSchema = z
  .string({ required_error: 'اسم المخزن مطلوب.' })
  .trim()
  .min(2, 'اسم المخزن قصير جداً.')
  .max(100, 'اسم المخزن طويل جداً.');

/**
 * عنوان اختياري (<= 250).
 */
const addressSchema = z
  .string()
  .trim()
  .max(250, 'العنوان طويل جداً.')
  .optional()
  .or(z.literal(''));

/**
 * مدينة اختيارية (<= 50).
 */
const citySchema = z
  .string()
  .trim()
  .max(50, 'اسم المدينة طويل جداً.')
  .optional()
  .or(z.literal(''));

/**
 * هاتف اختياري.
 */
const phoneSchema = z
  .string()
  .trim()
  .max(30, 'رقم الهاتف طويل جداً.')
  .regex(/^[+\d][\d\s-]{5,29}$/, 'صيغة رقم الهاتف غير صحيحة.')
  .optional()
  .or(z.literal(''));

/**
 * ملاحظات (<= 500).
 */
const notesSchema = z
  .string()
  .trim()
  .max(500, 'الملاحظات طويلة جداً.')
  .optional()
  .or(z.literal(''));

/**
 * MongoDB ObjectId.
 */
const objectIdSchema = z
  .string({ required_error: 'المُعرّف مطلوب.' })
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'المُعرّف غير صالح.');

// ============================================================
// 1) الإنشاء
// ============================================================

/**
 * POST /api/warehouses
 * ملاحظة: لا نقبل `type` من العميل — يُحدَّد branch افتراضياً.
 */
export const createWarehouseSchema = z.object({
  name: warehouseNameSchema,
  code: warehouseCodeSchema,
  address: addressSchema,
  city: citySchema,
  phone: phoneSchema,
  notes: notesSchema,
});

// ============================================================
// 2) التعديل
// ============================================================

/**
 * PATCH /api/warehouses/:id
 * - `type` مستثنى (يُدار عبر setAsMain).
 * - `isDefault` مستثنى (يُدار عبر setAsDefault).
 * - يجب أن يحتوي الطلب على حقل واحد على الأقل.
 */
export const updateWarehouseSchema = z
  .object({
    name: warehouseNameSchema.optional(),
    code: warehouseCodeSchema.optional(),
    address: addressSchema,
    city: citySchema,
    phone: phoneSchema,
    notes: notesSchema,
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'لا توجد حقول للتعديل.',
  });

// ============================================================
// 3) القائمة (Pagination + Filters)
// ============================================================

/**
 * GET /api/warehouses
 */
export const listWarehousesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  type: z.enum(['main', 'branch']).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  sortBy: z.enum(['createdAt', 'name', 'code', 'type']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================
// 4) Params
// ============================================================

/**
 * params لمسارات :id.
 */
export const warehouseIdParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  createWarehouseSchema,
  updateWarehouseSchema,
  listWarehousesQuerySchema,
  warehouseIdParamsSchema,
};