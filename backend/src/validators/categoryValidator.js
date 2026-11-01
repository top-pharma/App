/**
 * @file categoryValidator.js
 * @description
 * مخططات Zod للتحقق من مدخلات التصنيفات.
 *
 * لماذا هذا الملف؟
 * - نتحقق من كل مدخل قبل وصوله للـ controller (مبدأ: "لا تثق بالعميل").
 * - نمنع الأخطاء الشائعة: أسماء طويلة، حقول ناقصة، صيغ غير صالحة.
 * - نُوفّر رسائل عربية واضحة تُستخدم مباشرة في الواجهة.
 * - الاسم `name` يُحوَّل دائماً إلى lowercase لمطابقة Category.name.
 * - النظامي (isSystem) لا يُمرَّر من العميل — يُحدَّد داخلياً في seed فقط.
 */

import { z } from 'zod';

// ============================================================
// قواعد مشتركة (Reusable Rules)
// ============================================================

/**
 * اسم التصنيف بالإنجليزية (يطابق Category.name).
 * - 2..50 حرفاً.
 * - يبدأ بحرف، يحتوي أحرف صغيرة + أرقام + underscore.
 * - يُحوَّل إلى lowercase تلقائياً.
 */
const categoryNameSchema = z
  .string({ required_error: 'اسم التصنيف مطلوب.' })
  .trim()
  .toLowerCase()
  .min(2, 'اسم التصنيف قصير جداً.')
  .max(50, 'اسم التصنيف طويل جداً.')
  .regex(
    /^[a-z][a-z0-9_]*$/,
    'الاسم يجب أن يبدأ بحرف ويحتوي على أحرف صغيرة وأرقام و _ فقط.'
  );

/**
 * الاسم العربي المعروض (label).
 * - 2..100 حرف.
 */
const categoryLabelSchema = z
  .string({ required_error: 'الاسم العربي مطلوب.' })
  .trim()
  .min(2, 'الاسم العربي قصير جداً.')
  .max(100, 'الاسم العربي طويل جداً.');

/**
 * وصف اختياري (<= 300 حرف).
 * نقبل string فارغة (لتمكين المسح).
 */
const descriptionSchema = z
  .string()
  .trim()
  .max(300, 'الوصف طويل جداً.')
  .optional()
  .or(z.literal(''));

/**
 * اسم أيقونة Lucide (اختياري).
 * لا نتحقق من وجودها لأن قائمة Lucide تتغير.
 */
const iconSchema = z
  .string()
  .trim()
  .max(50, 'اسم الأيقونة طويل جداً.')
  .optional()
  .or(z.literal(''));

/**
 * ترتيب العرض (>= 0، عدد صحيح).
 * نقبل string من query/body ونحوّله إلى number تلقائياً.
 */
const orderSchema = z.coerce
  .number()
  .int('الترتيب يجب أن يكون عدداً صحيحاً.')
  .min(0, 'الترتيب لا يمكن أن يكون سالباً.');

/**
 * MongoDB ObjectId (24 hex char).
 */
const objectIdSchema = z
  .string({ required_error: 'المُعرّف مطلوب.' })
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'المُعرّف غير صالح.');

// ============================================================
// 1) الإنشاء
// ============================================================

/**
 * POST /api/categories
 * ملاحظة: isSystem لا يُقبل من العميل — يُحدَّد فقط عبر seed.
 */
export const createCategorySchema = z.object({
  name: categoryNameSchema,
  label: categoryLabelSchema,
  description: descriptionSchema,
  icon: iconSchema,
  order: orderSchema.default(0),
});

// ============================================================
// 2) التعديل
// ============================================================

/**
 * PATCH /api/categories/:id
 * - لا نسمح بتعديل isSystem (محمي).
 * - isActive يُقبل للسماح بتفعيل/تعطيل من الواجهة.
 * - يجب أن يحتوي الطلب على حقل واحد على الأقل.
 */
export const updateCategorySchema = z
  .object({
    name: categoryNameSchema.optional(),
    label: categoryLabelSchema.optional(),
    description: descriptionSchema,
    icon: iconSchema,
    order: orderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'لا توجد حقول للتعديل.',
  });

// ============================================================
// 3) القائمة (Pagination + Filters)
// ============================================================

/**
 * GET /api/categories
 * - search: يبحث في name + label + description.
 * - isActive: فلترة اختيارية.
 * - sortBy: order (افتراضي) | label | name | createdAt.
 */
export const listCategoriesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  sortBy: z.enum(['order', 'label', 'name', 'createdAt']).default('order'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// ============================================================
// 4) Params
// ============================================================

/**
 * params لمسارات :id.
 */
export const categoryIdParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  createCategorySchema,
  updateCategorySchema,
  listCategoriesQuerySchema,
  categoryIdParamsSchema,
};