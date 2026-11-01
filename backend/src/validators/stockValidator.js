/**
 * @file stockValidator.js
 * @description مخططات Zod للمخزون — Phase 2.5.
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

const batchNumberSchema = z
  .string({ required_error: 'رقم الدفعة مطلوب.' })
  .trim()
  .toUpperCase()
  .min(1, 'رقم الدفعة مطلوب.')
  .max(50, 'رقم الدفعة طويل جداً.');

const dateSchema = z.coerce.date({ invalid_type_error: 'تاريخ غير صالح.' });

// ============================================================
// 1) الإنشاء
// ============================================================

export const createStockSchema = z.object({
  item: objectIdSchema,
  batch: batchNumberSchema,
  productionDate: dateSchema.optional().nullable(),
  expiry: dateSchema,
  warehouse: objectIdSchema,
  quantity: z.coerce.number().min(0.0001, 'الكمية يجب أن تكون أكبر من صفر.'),
  location: z.string().trim().max(50, 'الموقع طويل جداً.').optional().or(z.literal('')),
  unitCost: z.coerce.number().min(0, 'التكلفة لا يمكن أن تكون سالبة.').default(0),
  unitPrice: z.coerce.number().min(0, 'السعر لا يمكن أن يكون سالباً.').default(0),
  supplier: optionalObjectIdSchema,
  notes: z.string().trim().max(500, 'الملاحظات طويلة جداً.').optional().or(z.literal('')),
});

// ============================================================
// 2) التعديل
// ============================================================

export const updateStockSchema = z
  .object({
    productionDate: dateSchema.optional().nullable(),
    expiry: dateSchema.optional(),
    quantity: z.coerce.number().min(0, 'الكمية لا يمكن أن تكون سالبة.').optional(),
    location: z.string().trim().max(50, 'الموقع طويل جداً.').optional().or(z.literal('')),
    unitCost: z.coerce.number().min(0, 'التكلفة لا يمكن أن تكون سالبة.').optional(),
    unitPrice: z.coerce.number().min(0, 'السعر لا يمكن أن يكون سالباً.').optional(),
    isQuarantined: z.boolean().optional(),
    quarantineReason: z.string().trim().max(300, 'السبب طويل جداً.').optional().or(z.literal('')),
    notes: z.string().trim().max(500, 'الملاحظات طويلة جداً.').optional().or(z.literal('')),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'لا توجد حقول للتعديل.',
  });

// ============================================================
// 3) القائمة
// ============================================================

export const listStocksQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  item: optionalObjectIdSchema,
  warehouse: optionalObjectIdSchema,
  search: z.string().trim().max(100).optional(),
  expiringIn: z.coerce.number().int().positive().max(365).optional(),
  onlyExpired: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  onlyQuarantined: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  hideZero: z.enum(['true', 'false']).transform((v) => v === 'true').default('true'),
  sortBy: z.enum(['expiry', 'createdAt', 'quantity', 'batch']).default('expiry'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// ============================================================
// 4) FEFO Selection (اختبار)
// ============================================================

export const selectFefoSchema = z.object({
  item: objectIdSchema,
  warehouse: objectIdSchema,
  quantity: z.coerce.number().positive('الكمية يجب أن تكون أكبر من صفر.'),
});

// ============================================================
// ✅ 5) Phase 2.5 — Batches with FEFO (endpoint مدمج)
// ============================================================

/**
 * params لـ GET /stocks/by-item/:itemId
 */
export const batchesWithFefoParamsSchema = z.object({
  itemId: objectIdSchema,
});

/**
 * query لـ GET /stocks/by-item/:itemId
 */
export const batchesWithFefoQuerySchema = z.object({
  warehouse: objectIdSchema,
  quantity: z.coerce.number().min(0, 'الكمية لا يمكن أن تكون سالبة.').default(0),
});

// ============================================================
// 6) Params
// ============================================================

export const stockIdParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  createStockSchema,
  updateStockSchema,
  listStocksQuerySchema,
  selectFefoSchema,
  stockIdParamsSchema,
  batchesWithFefoParamsSchema,
  batchesWithFefoQuerySchema,
};