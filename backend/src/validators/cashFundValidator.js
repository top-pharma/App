/**
 * cashFundValidator.js
 *
 * Validators لصناديق النقدية (CashFund).
 * يستخدم Zod للتحقق من صحة المدخلات قبل تمريرها للـ Controller.
 */

import { z } from 'zod';

/**
 * مخطط إنشاء صندوق.
 * - name إلزامي (2-100 حرف)
 * - code فريد (اختياري — يُولَّد تلقائياً إن لم يُمرَّر)
 * - openingBalance ≥ 0
 * - isDefault يُستخدم لتعيين الصندوق الافتراضي
 */
export const createCashFundSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'الاسم يجب أن يكون حرفين على الأقل')
    .max(100, 'الاسم يجب ألا يتجاوز 100 حرف'),
  code: z
    .string()
    .trim()
    .max(20, 'الكود يجب ألا يتجاوز 20 حرفاً')
    .optional()
    .nullable(),
  description: z.string().trim().max(500, 'الوصف طويل جداً').optional().nullable(),
  openingBalance: z
    .coerce
    .number()
    .min(0, 'الرصيد الافتتاحي لا يمكن أن يكون سالباً')
    .default(0),
  isDefault: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(true),
  notes: z.string().trim().max(1000, 'الملاحظات طويلة جداً').optional().nullable(),
});

/**
 * مخطط تحديث صندوق.
 * كل الحقول اختيارية، لكن لا يمكن تعديل openingBalance بعد الإنشاء.
 */
export const updateCashFundSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'الاسم يجب أن يكون حرفين على الأقل')
      .max(100)
      .optional(),
    code: z.string().trim().max(20).optional().nullable(),
    description: z.string().trim().max(500).optional().nullable(),
    isDefault: z.coerce.boolean().optional(),
    isActive: z.coerce.boolean().optional(),
    notes: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'يجب إرسال حقل واحد على الأقل للتحديث',
  });

/**
 * مخطط تعيين الصندوق كافتراضي.
 */
export const setDefaultCashFundSchema = z.object({
  // لا حقول — العملية تعتمد على :id في المسار
});

/**
 * مخطط إيداع/سحب نقدي من الصندوق.
 */
export const cashFundMovementSchema = z.object({
  type: z.enum(['deposit', 'withdrawal'], {
    errorMap: () => ({ message: 'النوع يجب أن يكون deposit أو withdrawal' }),
  }),
  amount: z.coerce.number().positive('المبلغ يجب أن يكون أكبر من صفر'),
  description: z.string().trim().max(500).optional().nullable(),
  referenceType: z.enum(['manual', 'transfer', 'expense', 'other']).default('manual'),
  referenceId: z.string().trim().optional().nullable(),
  date: z.coerce.date().optional(),
});

/**
 * مخطط فلترة قائمة الصناديق.
 */
export const listCashFundsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  isActive: z.enum(['true', 'false', 'all']).default('all'),
  sortBy: z.enum(['name', 'balance', 'createdAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});