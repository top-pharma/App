/**
 * @file invoiceValidator.js
 * @description
 * مخططات Zod للتحقق من مدخلات فواتير المبيعات — Phase 2.5.
 *
 * ⚠️ إضافة Phase 2.5:
 * - createInvoiceSchema: + overrideReason (اختياري، إلزامي عند التجاوز).
 * - finalizeInvoiceSchema: + overrideReason (اختياري).
 * - createDraftInvoiceSchema: بدون overrideReason (لأن المسودة لا تُحقق).
 */

import { z } from 'zod';

// ============================================================
// قواعد مشتركة
// ============================================================

const objectIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'المُعرّف غير صالح.');
const optionalObjectIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'المُعرّف غير صالح.').optional().or(z.literal('').transform(() => undefined));
const dateSchema = z.coerce.date({ invalid_type_error: 'تاريخ غير صالح.' });
const optionalDateSchema = z.union([z.coerce.date({ invalid_type_error: 'تاريخ غير صالح.' }), z.null()]).optional();
const nonNegativeNumberSchema = (defaultValue = 0) => z.coerce.number().min(0, 'القيمة لا يمكن أن تكون سالبة.').default(defaultValue);
const optionalTextSchema = (max) => z.string().trim().max(max, 'النص طويل جداً.').optional().or(z.literal(''));
const queryBooleanSchema = z.enum(['true', 'false']).transform((v) => v === 'true').optional();

// ============================================================
// العناصر الفرعية
// ============================================================

const invoiceItemSchema = z.object({
  item: objectIdSchema,
  batch: z.string({ required_error: 'رقم الدفعة مطلوب.' }).trim().toUpperCase().min(1, 'رقم الدفعة مطلوب.').max(50, 'رقم الدفعة طويل جداً.'),
  expiry: optionalDateSchema,
  quantity: z.coerce.number().min(0.0001, 'الكمية يجب أن تكون أكبر من صفر.'),
  unit: z.string().trim().max(50, 'اسم الوحدة طويل جداً.').optional().or(z.literal('')),
  unitPrice: z.coerce.number().min(0, 'السعر لا يمكن أن يكون سالباً.'),
  total: z.coerce.number().min(0, 'الإجمالي لا يمكن أن يكون سالباً.'),
  unitCost: z.coerce.number().min(0, 'التكلفة لا يمكن أن تكون سالبة.').default(0),
});

const freeItemSchema = z.object({
  item: objectIdSchema,
  batch: z.string().trim().toUpperCase().max(50).optional().or(z.literal('')),
  quantity: z.coerce.number().min(0.0001, 'الكمية يجب أن تكون أكبر من صفر.'),
  reason: z.string().trim().max(200).optional().or(z.literal('')),
});

const discountSchema = z.object({
  type: z.enum(['percentage', 'fixed', 'free_items'], { errorMap: () => ({ message: 'نوع الخصم غير معتمد.' }) }).nullable().optional(),
  value: z.coerce.number().min(0).default(0),
  reason: z.string().trim().max(300).optional().or(z.literal('')),
  computedAmount: z.coerce.number().min(0).default(0),
  freeItems: z.array(freeItemSchema).default([]),
});

// ============================================================
// الهيكل الأساسي
// ============================================================

const invoiceBaseSchema = z.object({
  pharmacy: objectIdSchema,
  salesRep: objectIdSchema,
  deliveryNote: optionalObjectIdSchema,
  warehouse: optionalObjectIdSchema,
  items: z.array(invoiceItemSchema).min(1, 'الفاتورة يجب أن تحتوي على بند واحد على الأقل.'),
  subtotal: nonNegativeNumberSchema(0),
  discount: discountSchema.optional(),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  taxAmount: nonNegativeNumberSchema(0),
  total: nonNegativeNumberSchema(0),
  paymentType: z.enum(['cash', 'credit', 'installments'], { errorMap: () => ({ message: 'نوع الدفع غير معتمد.' }) }),
  dueDate: optionalDateSchema,
  totalInstallments: z.coerce.number().int().min(0).default(0),
  paidAmount: nonNegativeNumberSchema(0),
  paymentMethod: z.string().trim().max(50).optional().or(z.literal('')),
  invoiceDate: optionalDateSchema,
  notes: optionalTextSchema(1000),
});

// ============================================================
// الإنشاء المباشر (فاتورة نهائية)
// ============================================================

/**
 * POST /api/invoices
 *
 * ⚠️ Phase 2.5:
 * - overrideReason: إلزامي إذا اكتشف Service تجاوزاً في أي سطر.
 *   يُتحقق منه في `invoiceService` (ليس في Zod).
 */
export const createInvoiceSchema = invoiceBaseSchema
  .extend({
    overrideReason: optionalTextSchema(500),
  })
  .refine((data) => data.paymentType === 'cash' || Boolean(data.dueDate), {
    message: 'تاريخ الاستحقاق مطلوب للفواتير الآجلة أو بالأقساط.',
    path: ['dueDate'],
  })
  .refine(
    (data) => data.paymentType !== 'installments' || (Number.isInteger(data.totalInstallments) && data.totalInstallments >= 2),
    { message: 'الفواتير بالأقساط تتطلب عدد أقساط لا يقل عن 2.', path: ['totalInstallments'] }
  )
  .refine(
    (data) => {
      const itemsTotal = data.items.reduce((sum, item) => sum + (item.total || 0), 0);
      return Math.abs(itemsTotal - (data.subtotal || 0)) < 0.01;
    },
    { message: 'المجموع الفرعي لا يطابق مجموع البنود.', path: ['subtotal'] }
  )
  .refine(
    (data) => !data.discount || data.discount.type !== 'percentage' || (data.discount.value >= 0 && data.discount.value <= 100),
    { message: 'نسبة الخصم يجب أن تكون بين 0 و 100.', path: ['discount', 'value'] }
  )
  .refine(
    (data) => {
      if (!data.discount || data.discount.type !== 'percentage') return true;
      const expected = (data.subtotal || 0) * ((data.discount.value || 0) / 100);
      return Math.abs(expected - (data.discount.computedAmount || 0)) < 0.01;
    },
    { message: 'مبلغ الخصم المحسوب لا يطابق النسبة × المجموع الفرعي.', path: ['discount', 'computedAmount'] }
  )
  .refine(
    (data) => {
      if (!data.discount || data.discount.type !== 'fixed') return true;
      return Math.abs((data.discount.value || 0) - (data.discount.computedAmount || 0)) < 0.01;
    },
    { message: 'مبلغ الخصم الثابت يجب أن يطابق القيمة.', path: ['discount', 'computedAmount'] }
  )
  .refine(
    (data) => !data.discount || data.discount.type !== 'free_items' || (Array.isArray(data.discount.freeItems) && data.discount.freeItems.length > 0),
    { message: 'البونص من نوع "أصناف مجانية" يتطلب بنداً واحداً على الأقل.', path: ['discount', 'freeItems'] }
  )
  .refine(
    (data) => {
      const expectedTotal = (data.subtotal || 0) - (data.discount?.computedAmount || 0) + (data.taxAmount || 0);
      return Math.abs(expectedTotal - (data.total || 0)) < 0.01;
    },
    { message: 'الإجمالي لا يطابق (المجموع الفرعي - الخصم + الضريبة).', path: ['total'] }
  )
  .refine((data) => (data.paidAmount || 0) <= (data.total || 0) + 0.01, {
    message: 'المبلغ المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة.',
    path: ['paidAmount'],
  });

// ============================================================
// إنشاء مسودة
// ============================================================

export const createDraftInvoiceSchema = z.object({
  pharmacy: objectIdSchema,
  salesRep: objectIdSchema,
  deliveryNote: optionalObjectIdSchema,
  warehouse: objectIdSchema,
  items: z.array(invoiceItemSchema).min(1, 'المسودة يجب أن تحتوي على بند واحد على الأقل.'),
  discount: discountSchema.omit({ computedAmount: true, freeItems: true }).extend({ freeItems: z.array(freeItemSchema).default([]) }).optional(),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  invoiceDate: optionalDateSchema,
  notes: optionalTextSchema(1000),
})
  .refine(
    (data) => !data.discount || data.discount.type !== 'percentage' || (data.discount.value >= 0 && data.discount.value <= 100),
    { message: 'نسبة الخصم يجب أن تكون بين 0 و 100.', path: ['discount', 'value'] }
  )
  .refine(
    (data) => !data.discount || data.discount.type !== 'free_items' || (Array.isArray(data.discount.freeItems) && data.discount.freeItems.length > 0),
    { message: 'البونص من نوع "أصناف مجانية" يتطلب بنداً واحداً على الأقل.', path: ['discount', 'freeItems'] }
  );

// ============================================================
// تعديل مسودة
// ============================================================

export const updateDraftInvoiceSchema = z
  .object({
    salesRep: objectIdSchema.optional(),
    deliveryNote: optionalObjectIdSchema,
    warehouse: objectIdSchema.optional(),
    items: z.array(invoiceItemSchema).min(1).optional(),
    discount: discountSchema.omit({ computedAmount: true }).optional(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
    invoiceDate: optionalDateSchema,
    notes: optionalTextSchema(1000),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'لا توجد حقول للتعديل.' })
  .refine(
    (data) => !data.discount || data.discount.type !== 'percentage' || (data.discount.value >= 0 && data.discount.value <= 100),
    { message: 'نسبة الخصم يجب أن تكون بين 0 و 100.', path: ['discount', 'value'] }
  );

// ============================================================
// اعتماد مسودة
// ============================================================

/**
 * POST /api/invoices/:id/finalize
 *
 * ⚠️ Phase 2.5:
 * - overrideReason: إلزامي إذا اكتشف Service تجاوزاً.
 */
export const finalizeInvoiceSchema = z
  .object({
    paymentType: z.enum(['cash', 'credit', 'installments'], { errorMap: () => ({ message: 'نوع الدفع غير معتمد.' }) }),
    dueDate: optionalDateSchema,
    totalInstallments: z.coerce.number().int().min(0).default(0),
    paidAmount: nonNegativeNumberSchema(0),
    paymentMethod: z.string().trim().max(50).optional().or(z.literal('')),
    overrideReason: optionalTextSchema(500),
    notes: optionalTextSchema(1000),
  })
  .refine((data) => data.paymentType === 'cash' || Boolean(data.dueDate), {
    message: 'تاريخ الاستحقاق مطلوب للفواتير الآجلة أو بالأقساط.',
    path: ['dueDate'],
  })
  .refine(
    (data) => data.paymentType !== 'installments' || (Number.isInteger(data.totalInstallments) && data.totalInstallments >= 2),
    { message: 'الفواتير بالأقساط تتطلب عدد أقساط لا يقل عن 2.', path: ['totalInstallments'] }
  );

// ============================================================
// التعديل (الفواتير النهائية)
// ============================================================

export const updateInvoiceSchema = invoiceBaseSchema
  .omit({ pharmacy: true, salesRep: true, deliveryNote: true, warehouse: true, paymentType: true, totalInstallments: true, paidAmount: true })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'لا توجد حقول للتعديل.' });

// ============================================================
// القائمة
// ============================================================

export const listInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  pharmacy: optionalObjectIdSchema,
  salesRep: optionalObjectIdSchema,
  deliveryNote: optionalObjectIdSchema,
  warehouse: optionalObjectIdSchema,
  status: z.enum(['draft', 'pending', 'paid', 'partial', 'overdue', 'cancelled']).optional(),
  paymentType: z.enum(['cash', 'credit', 'installments']).optional(),
  overdue: queryBooleanSchema,
  unpaid: queryBooleanSchema,
  hasReturns: queryBooleanSchema,
  isDraft: queryBooleanSchema,
  hasPriceOverride: queryBooleanSchema,
  dateFrom: optionalDateSchema,
  dateTo: optionalDateSchema,
  sortBy: z.enum(['createdAt', 'invoiceDate', 'total', 'paidAmount', 'remainingAmount', 'dueDate']).default('invoiceDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================
// الإلغاء والدفع
// ============================================================

export const cancelInvoiceSchema = z.object({
  cancelReason: z.string({ required_error: 'سبب الإلغاء مطلوب.' }).trim().min(2, 'سبب الإلغاء قصير جداً.').max(500, 'سبب الإلغاء طويل جداً.'),
});

export const registerPaymentSchema = z.object({
  amount: z.coerce.number().min(0.0001, 'المبلغ يجب أن يكون أكبر من صفر.'),
  paymentMethod: z.enum(['cash', 'bank', 'check'], { errorMap: () => ({ message: 'طريقة الدفع غير معتمدة.' }) }),
  cashFund: optionalObjectIdSchema,
  bankAccount: optionalObjectIdSchema,
  checkId: optionalObjectIdSchema,
  externalReference: z.string().trim().max(100).optional().or(z.literal('')),
  paidAt: optionalDateSchema,
  notes: optionalTextSchema(500),
});

export const invoiceIdParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  createInvoiceSchema,
  createDraftInvoiceSchema,
  updateDraftInvoiceSchema,
  finalizeInvoiceSchema,
  updateInvoiceSchema,
  listInvoicesQuerySchema,
  cancelInvoiceSchema,
  registerPaymentSchema,
  invoiceIdParamsSchema,
};