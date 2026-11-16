/**
 * @file salesRepTransactionValidator.js
 * @description مخططات Zod لحركات المندوب.
 *
 * ✅ v10.9 (2026-11-16) — جديد.
 */

import { z } from 'zod';

const objectIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'المُعرّف غير صالح.');
const optionalObjectIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'المُعرّف غير صالح.').optional().or(z.literal('').transform(() => undefined));
const optionalDateSchema = z.union([z.coerce.date({ invalid_type_error: 'تاريخ غير صالح.' }), z.null()]).optional();

const nonNegativeNumberSchema = (defaultValue = 0) => z.coerce.number().min(0, 'القيمة لا يمكن أن تكون سالبة.').default(defaultValue);
const optionalTextSchema = (max) => z.string().trim().max(max, 'النص طويل جداً.').optional().or(z.literal(''));

const transactionTypes = ['commission', 'expense', 'bonus', 'advance', 'settlement', 'salary'];
const transactionDirections = ['credit', 'debit'];
const transactionStatuses = ['pending', 'approved', 'paid', 'cancelled'];

// ═══════════════════════════════════════════════
// 1) الإنشاء
// ═══════════════════════════════════════════════
export const createTransactionSchema = z.object({
  salesRep: objectIdSchema,
  type: z.enum(transactionTypes, { errorMap: () => ({ message: 'نوع الحركة غير معتمد.' }) }),
  direction: z.enum(transactionDirections, { errorMap: () => ({ message: 'الاتجاه غير معتمد.' }) }),
  amount: z.coerce.number().min(0.0001, 'المبلغ يجب أن يكون أكبر من صفر.'),
  description: z.string({ required_error: 'الوصف مطلوب.' }).trim().min(3, 'الوصف قصير جداً.').max(500, 'الوصف طويل جداً.'),
  reason: optionalTextSchema(500),
  referenceType: optionalTextSchema(50),
  referenceId: optionalObjectIdSchema,
  transactionDate: optionalDateSchema,
  notes: optionalTextSchema(1000),
});

// ═══════════════════════════════════════════════
// 2) التعديل (pending فقط)
// ═══════════════════════════════════════════════
export const updateTransactionSchema = createTransactionSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'لا توجد حقول للتعديل.' });

// ═══════════════════════════════════════════════
// 3) الموافقة
// ═══════════════════════════════════════════════
export const approveTransactionSchema = z.object({
  notes: optionalTextSchema(500),
});

// ═══════════════════════════════════════════════
// 4) الدفع (approved → paid)
// ═══════════════════════════════════════════════
export const payTransactionSchema = z.object({
  cashFundId: optionalObjectIdSchema,
  bankAccountId: optionalObjectIdSchema,
  paymentMethod: z.enum(['cash', 'bank'], { errorMap: () => ({ message: 'طريقة الدفع غير معتمدة.' }) }).default('cash'),
  notes: optionalTextSchema(500),
});

// ═══════════════════════════════════════════════
// 5) الإلغاء
// ═══════════════════════════════════════════════
export const cancelTransactionSchema = z.object({
  cancelReason: z.string({ required_error: 'سبب الإلغاء مطلوب.' }).trim().min(2, 'سبب الإلغاء قصير جداً.').max(500, 'سبب الإلغاء طويل جداً.'),
});

// ═══════════════════════════════════════════════
// 6) القائمة
// ═══════════════════════════════════════════════
export const listTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  salesRep: optionalObjectIdSchema,
  type: z.enum(transactionTypes).optional(),
  direction: z.enum(transactionDirections).optional(),
  status: z.enum(transactionStatuses).optional(),
  dateFrom: optionalDateSchema,
  dateTo: optionalDateSchema,
  sortBy: z.enum(['transactionDate', 'amount', 'createdAt']).default('transactionDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ═══════════════════════════════════════════════
// 7) Params
// ═══════════════════════════════════════════════
export const transactionIdParamsSchema = z.object({
  id: objectIdSchema,
});

export default {
  createTransactionSchema,
  updateTransactionSchema,
  approveTransactionSchema,
  payTransactionSchema,
  cancelTransactionSchema,
  listTransactionsQuerySchema,
  transactionIdParamsSchema,
};