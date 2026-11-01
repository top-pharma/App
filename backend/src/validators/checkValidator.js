/**
 * @file checkValidator.js
 * @description
 * Validators للشيكات — النسخة المبسطة (Phase 3).
 *
 * 4 حالات: pending → paid | cancelled | bounced
 * لا يوجد collected — أُلغي.
 */

import { z } from 'zod';

/**
 * مخطط إنشاء شيك (تسجيل فقط).
 */
export const createCheckSchema = z
  .object({
    type: z.enum(['incoming', 'outgoing'], {
      errorMap: () => ({ message: 'النوع يجب أن يكون incoming أو outgoing' }),
    }),
    checkNumber: z.string().trim().min(1, 'رقم الشيك مطلوب').max(50),
    bankName: z.string().trim().min(2, 'اسم البنك مطلوب').max(100),
    amount: z.coerce.number().positive('المبلغ يجب أن يكون أكبر من صفر'),
    dueDate: z.coerce.date({
      errorMap: () => ({ message: 'تاريخ الاستحقاق مطلوب' }),
    }),
    issueDate: z.coerce.date().optional(),
    customerId: z.string().trim().optional().nullable(),
    supplierId: z.string().trim().optional().nullable(),
    invoiceId: z.string().trim().optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.type === 'incoming' && !data.customerId) return false;
      if (data.type === 'outgoing' && !data.supplierId) return false;
      return true;
    },
    { message: 'الشيك الوارد يحتاج عميلاً، والصادر يحتاج مورداً' }
  );

/**
 * مخطط تسجيل صرف شيك — الحدث الوحيد المؤثر على الأرصدة.
 */
export const settleCheckSchema = z
  .object({
    paymentMethod: z.enum(['cash', 'bank'], {
      errorMap: () => ({ message: 'طريقة الصرف يجب أن تكون cash أو bank' }),
    }),
    cashFundId: z.string().trim().optional().nullable(),
    bankAccountId: z.string().trim().optional().nullable(),
    paymentDate: z.coerce.date().optional(),
  })
  .refine(
    (data) => {
      if (data.paymentMethod === 'cash' && !data.cashFundId) return false;
      if (data.paymentMethod === 'bank' && !data.bankAccountId) return false;
      return true;
    },
    { message: 'يجب تحديد الصندوق أو الحساب البنكي حسب طريقة الصرف' }
  );

/**
 * مخطط ارتداد شيك (بعد الصرف).
 */
export const bounceCheckSchema = z.object({
  bounceReason: z.string().trim().min(3, 'سبب الارتداد مطلوب').max(500),
});

/**
 * مخطط إلغاء شيك (قبل الصرف).
 */
export const cancelCheckSchema = z.object({
  cancelReason: z.string().trim().min(3, 'سبب الإلغاء مطلوب').max(500),
});

/**
 * مخطط فلترة القائمة.
 */
export const listChecksSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  type: z.enum(['incoming', 'outgoing', 'all']).default('all'),
  status: z
    .enum(['pending', 'paid', 'bounced', 'cancelled', 'all'])
    .default('all'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().trim().optional(),
});