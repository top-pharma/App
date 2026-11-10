/**
 * cashTransactionValidator.js
 *
 * Validators لحركات النقدية (CashTransaction).
 *
 * ✅ 🅳 (2026-11-09):
 * - listCashTransactionsSchema: إضافة referenceType + referenceId
 *   (لجلب دفعات فاتورة محددة)
 */

import { z } from 'zod';

/**
 * مخطط إنشاء حركة نقدية يدوية.
 * (الحركات التلقائية من الفواتير لا تمر من هنا).
 */
export const createCashTransactionSchema = z
  .object({
    direction: z.enum(['in', 'out'], {
      errorMap: () => ({ message: 'الاتجاه يجب أن يكون in أو out' }),
    }),
    amount: z.coerce.number().positive('المبلغ يجب أن يكون أكبر من صفر'),
    method: z.enum(['cash', 'bank']).default('cash'),
    cashFundId: z.string().trim().optional().nullable(),
    bankAccountId: z.string().trim().optional().nullable(),
    transactionDate: z.coerce.date().optional(),
    description: z.string().trim().min(3, 'الوصف قصير جداً').max(500),
    referenceType: z
      .enum([
        'manual',
        'expense',
        'invoice',
        'customer_return',
        'purchase',
        'supplier_return',
        'transfer',
      ])
      .default('manual'),
    referenceId: z.string().trim().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.method === 'cash' && !data.cashFundId) {
        return true;
      }
      if (data.method === 'bank' && !data.bankAccountId) {
        return true;
      }
      return true;
    },
    { message: 'بيانات الدفع غير مكتملة' }
  );

/**
 * مخطط فلترة قائمة الحركات.
 * ✅ 🅳: إضافة referenceType + referenceId (لجلب دفعات فاتورة محددة)
 */
export const listCashTransactionsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  cashFundId: z.string().trim().optional(),
  bankAccountId: z.string().trim().optional(),
  method: z.enum(['cash', 'bank', 'all']).default('all'),
  direction: z.enum(['in', 'out', 'all']).default('all'),
  // ✅ 🅳: فلترة حسب المرجع
  referenceType: z.string().trim().optional(),
  referenceId: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().trim().optional(),
});

/**
 * مخطط ملخص الحركات.
 */
export const cashSummarySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cashFundId: z.string().trim().optional(),
  method: z.enum(['cash', 'bank']).optional(),
});