/**
 * accountingEntryValidator.js
 *
 * Validators للقيود المحاسبية.
 * ملاحظة: معظم القيود تُنشأ تلقائياً — هذه الـ validators للقيود اليدوية فقط.
 */

import { z } from 'zod';

/**
 * سطر واحد في القيد.
 */
const entryLineSchema = z
  .object({
    accountCode: z.string().trim().min(1, 'كود الحساب مطلوب'),
    accountName: z.string().trim().min(1, 'اسم الحساب مطلوب'),
    debit: z.coerce.number().min(0).default(0),
    credit: z.coerce.number().min(0).default(0),
    description: z.string().trim().max(300).optional().nullable(),
  })
  .refine(
    (line) => {
      const d = Number(line.debit || 0);
      const c = Number(line.credit || 0);
      return (d > 0 && c === 0) || (c > 0 && d === 0);
    },
    { message: 'السطر يحتاج مدين أو دائن (وليس الاثنين معاً)' }
  );

/**
 * مخطط إنشاء قيد يدوي.
 * (نادر — للتصحيحات أو قيود التسوية).
 */
export const createAccountingEntrySchema = z
  .object({
    entryType: z.enum(
      [
        'SALE_CASH',
        'SALE_CREDIT',
        'SALE_RETURN',
        'CUSTOMER_PAYMENT',
        'PURCHASE',
        'PURCHASE_RETURN',
        'CHECK_RECEIVED',
        'CHECK_COLLECTED',
        'CHECK_BOUNCED',
        'CHECK_ISSUED',
        'CHECK_PAID',
        'CASH_TRANSFER',
        'CASH_DEPOSIT',
        'CASH_WITHDRAWAL',
        'EXPENSE',
        'OPENING',
        'ADJUSTMENT',
      ],
      { errorMap: () => ({ message: 'نوع القيد غير صحيح' }) }
    ),
    entryDate: z.coerce.date().optional(),
    description: z.string().trim().min(3, 'الوصف قصير جداً').max(500),
    lines: z.array(entryLineSchema).min(2, 'القيد يحتاج سطرين على الأقل'),
    sourceType: z.string().trim().optional().nullable(),
    sourceId: z.string().trim().optional().nullable(),
    cashFundId: z.string().trim().optional().nullable(),
    bankAccountId: z.string().trim().optional().nullable(),
  })
  .refine(
    (data) => {
      const totalDebit = data.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
      const totalCredit = data.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
      return Math.abs(totalDebit - totalCredit) < 0.01;
    },
    { message: 'القيد غير متوازن (المدين ≠ الدائن)' }
  );

/**
 * مخطط فلترة القائمة.
 */
export const listAccountingEntriesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  entryType: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sourceType: z.string().trim().optional(),
  sourceId: z.string().trim().optional(),
  cashFundId: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

/**
 * مخطط عكس قيد.
 */
export const reverseEntrySchema = z.object({
  reason: z.string().trim().min(3, 'السبب مطلوب').max(500),
});