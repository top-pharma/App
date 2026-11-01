/**
 * @file itemValidator.js
 * @description مخططات Zod للتحقق من مدخلات الأصناف.
 *
 * لماذا هذا الملف؟
 * - الأصناف أعقد كيان: units ثلاثية + supportedUnits + barcode.
 * - نتحقق من الاسمين الإلزاميين + category (String) + units.base.
 * - لا نتحقق من DB هنا — يُفوَّض للـ controller (category/warehouse).
 */

import { z } from 'zod';

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'المُعرّف غير صالح.')
  .optional()
  .or(z.literal('').transform(() => undefined));

const requiredNameSchema = z
  .string({ required_error: 'هذا الحقل مطلوب.' })
  .trim()
  .min(2, 'الاسم قصير جداً.')
  .max(200, 'الاسم طويل جداً.');

const optionalTextSchema = (max = 200) =>
  z.string().trim().max(max, 'النص طويل جداً.').optional().or(z.literal(''));

const priceSchema = z.coerce.number().min(0, 'القيمة لا يمكن أن تكون سالبة.').default(0);

const containsSchema = z.coerce
  .number()
  .int('يجب أن يكون عدداً صحيحاً.')
  .min(1, 'يجب أن يكون 1 على الأقل.')
  .default(1);

const unitSubSchema = z.object({
  name: z.string().trim().max(50, 'اسم الوحدة طويل جداً.').default(''),
  contains: containsSchema,
  barcode: z.string().trim().max(50, 'الباركود طويل جداً.').default(''),
  price: priceSchema,
  cost: priceSchema,
});

const unitsSchema = z.object({
  base: unitSubSchema.extend({
    name: z
      .string({ required_error: 'اسم الوحدة الأساسية مطلوب.' })
      .trim()
      .min(1, 'اسم الوحدة الأساسية مطلوب.')
      .max(50, 'اسم الوحدة طويل جداً.'),
  }),
  packaging: unitSubSchema.optional(),
  smallest: unitSubSchema.optional(),
});

// ============================================================
// 1) الإنشاء
// ============================================================

export const createItemSchema = z.object({
  scientificName: requiredNameSchema,
  tradeName: requiredNameSchema,
  tradeNameEn: optionalTextSchema(200),
  manufacturer: optionalTextSchema(200),
  originCountry: optionalTextSchema(100),

  category: z
    .string({ required_error: 'التصنيف مطلوب.' })
    .trim()
    .toLowerCase()
    .min(2, 'التصنيف مطلوب.')
    .max(50, 'اسم التصنيف طويل جداً.'),

  barcode: z.string().trim().max(50, 'الباركود طويل جداً.').optional().or(z.literal('')),
  registrationNumber: optionalTextSchema(50),
  dosageForm: optionalTextSchema(50),
  strength: optionalTextSchema(50),

  units: unitsSchema,
  supportedUnits: z.array(z.string().trim().max(50)).default([]),
  defaultSaleUnit: optionalTextSchema(50),

  reorderLevel: z.coerce.number().min(0, 'حد الطلب لا يمكن أن يكون سالباً.').default(0),
  warehouse: objectIdSchema,

  prescriptionRequired: z.boolean().default(false),
  storageConditions: optionalTextSchema(200),
  notes: optionalTextSchema(1000),
});

// ============================================================
// 2) التعديل
// ============================================================

/**
 * PATCH /api/items/:id
 * - أضفنا `isActive` (لا يوجد في create — يُدار فقط عبر التعديل).
 * - نسمح بتعديل كل الحقول، على الأقل حقل واحد مطلوب.
 */
export const updateItemSchema = createItemSchema
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

export const listItemsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(50).optional(),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  lowStock: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  sortBy: z
    .enum(['createdAt', 'tradeName', 'scientificName', 'reorderLevel'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================
// 4) Params
// ============================================================

export const itemIdParamsSchema = z.object({
  id: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'معرّف الصنف غير صالح.'),
});

export const itemBarcodeParamsSchema = z.object({
  barcode: z.string().trim().min(1, 'الباركود مطلوب.').max(50),
});

export default {
  createItemSchema,
  updateItemSchema,
  listItemsQuerySchema,
  itemIdParamsSchema,
  itemBarcodeParamsSchema,
};