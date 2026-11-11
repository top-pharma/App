/**
 * @file purchaseReceiptValidator.js
 * @description
 * مخططات Zod للتحقق من مدخلات إيصالات استلام البضاعة من الموردين
 * (إنشاء/تعديل/تأكيد الاستلام/قائمة).
 *
 * ⚠️ إصلاح 2026-11-10 (v2):
 *  - F1: `purchaseReceiptBaseSchema` = ZodObject (بدون `.refine()`).
 *  - F2: التحقق من `supplierId`/`supplier` في `createPurchaseReceiptSchema` (وليس في `base`).
 *  - F3: `updatePurchaseReceiptSchema` = `base.omit(...)` — يعمل (لأن `base` = ZodObject).
 *  - F4: دعم `supplierId`/`supplier` + `itemId`/`item` + `initialPayment` كائن/رقم.
 */

import { z } from 'zod';

// ============================================================
// قواعد مشتركة (Reusable Rules)
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

const dateSchema = z.coerce.date({ invalid_type_error: 'تاريخ غير صالح.' });

const optionalDateSchema = z
  .union([z.coerce.date({ invalid_type_error: 'تاريخ غير صالح.' }), z.null()])
  .optional();

const nonNegativeNumberSchema = (defaultValue = 0) =>
  z.coerce
    .number()
    .min(0, 'القيمة لا يمكن أن تكون سالبة.')
    .default(defaultValue);

const optionalTextSchema = (max) =>
  z.string().trim().max(max, 'النص طويل جداً.').optional().or(z.literal(''));

const queryBooleanSchema = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

// ============================================================
// 1) العناصر الفرعية (Sub-schemas)
// ============================================================

/**
 * بند داخل إيصال الاستلام.
 *
 * ⚠️ F4: يدعم `itemId` (من Frontend) أو `item` (توافق عكسي).
 * ⚠️ ملاحظة: هذا `ZodObject` — بدون `.refine()` — للسماح بـ `.omit()` لاحقاً.
 */
const purchaseItemSchema = z.object({
  itemId: objectIdSchema.optional(),
  item: objectIdSchema.optional(),
  batch: z
    .string({ required_error: 'رقم الدفعة مطلوب.' })
    .trim()
    .toUpperCase()
    .min(1, 'رقم الدفعة مطلوب.')
    .max(50, 'رقم الدفعة طويل جداً.'),
  productionDate: optionalDateSchema,
  expiry: dateSchema,
  quantity: z.coerce.number().min(0.0001, 'الكمية يجب أن تكون أكبر من صفر.'),
  unit: z.string().trim().max(50, 'اسم الوحدة طويل جداً.').optional().or(z.literal('')),
  unitCost: z.coerce.number().min(0, 'التكلفة لا يمكن أن تكون سالبة.'),
  unitPrice: z.coerce.number().min(0, 'السعر لا يمكن أن يكون سالباً.').default(0),
  total: z.coerce.number().min(0, 'الإجمالي لا يمكن أن يكون سالباً.'),
  location: z.string().trim().max(50, 'الموقع طويل جداً.').optional().or(z.literal('')),
});

// التحقق من itemId/item — يُطبَّق في `create` (وليس في `base`)
const purchaseItemRefine = (data) => Boolean(data.itemId || data.item);

/**
 * الدفعة الأولى — كائن أو رقم.
 */
const initialPaymentSchema = z
  .union([
    z.object({
      amount: nonNegativeNumberSchema(0),
      method: z
        .enum(['cash', 'bank', 'check'], {
          errorMap: () => ({ message: 'طريقة الدفع غير معتمدة.' }),
        })
        .default('cash'),
      checkId: optionalObjectIdSchema,
    }),
    nonNegativeNumberSchema(0),
  ])
  .optional();

// ============================================================
// 2) الهيكل الأساسي (Base Schema) — ZodObject (بدون refine)
// ============================================================

const purchaseReceiptBaseSchema = z.object({
  // ✅ F1: دعم supplierId أو supplier
  supplierId: objectIdSchema.optional(),
  supplier: objectIdSchema.optional(),

  warehouse: objectIdSchema,
  supplierInvoiceNumber: optionalTextSchema(50),
  receiptDate: optionalDateSchema,

  items: z
    .array(purchaseItemSchema)
    .min(1, 'إيصال الاستلام يجب أن يحتوي على بند واحد على الأقل.'),

  subtotal: nonNegativeNumberSchema(0),
  discount: nonNegativeNumberSchema(0),
  taxRate: z.coerce
    .number()
    .min(0, 'نسبة الضريبة لا يمكن أن تكون سالبة.')
    .max(100, 'نسبة الضريبة لا يمكن أن تتجاوز 100.')
    .default(0),
  taxAmount: nonNegativeNumberSchema(0),
  total: nonNegativeNumberSchema(0),

  paymentType: z.enum(['cash', 'credit', 'partial'], {
    errorMap: () => ({ message: 'نوع الدفع غير معتمد.' }),
  }),
  initialPayment: initialPaymentSchema,
  initialPaymentMethod: z.enum(['cash', 'bank', 'check']).optional(),
  paidAmount: nonNegativeNumberSchema(0),
  remainingAmount: nonNegativeNumberSchema(0),
  dueDate: optionalDateSchema,

  notes: optionalTextSchema(1000),
});

// ============================================================
// 3) الإنشاء — base + refinements
// ============================================================

export const createPurchaseReceiptSchema = purchaseReceiptBaseSchema
  // 0) التحقق من supplierId/supplier + items[].itemId/item
  .refine(
    (data) => Boolean(data.supplierId || data.supplier),
    { message: 'المُعرّف مطلوب.', path: ['supplierId'] }
  )
  .refine(
    (data) => data.items.every(purchaseItemRefine),
    { message: 'المُعرّف مطلوب.', path: ['items', 0, 'itemId'] }
  )
  // 1) total = مجموع البنود
  .refine(
    (data) => {
      const itemsTotal = data.items.reduce((sum, item) => sum + (item.total || 0), 0);
      return Math.abs(itemsTotal - (data.total || 0)) < 0.01;
    },
    { message: 'الإجمالي لا يطابق مجموع البنود.', path: ['total'] }
  )
  // 2) subtotal = مجموع البنود
  .refine(
    (data) => {
      const itemsTotal = data.items.reduce((sum, item) => sum + (item.total || 0), 0);
      return Math.abs(itemsTotal - (data.subtotal || 0)) < 0.01;
    },
    { message: 'المجموع الفرعي لا يطابق مجموع البنود.', path: ['subtotal'] }
  )
  // 3) في كل بند: total = quantity × unitCost
  .refine(
    (data) =>
      data.items.every(
        (item) =>
          Math.abs((item.quantity || 0) * (item.unitCost || 0) - (item.total || 0)) < 0.01
      ),
    { message: 'إجمالي أحد البنود لا يطابق (الكمية × التكلفة).', path: ['items'] }
  )
  // 4) total = subtotal - discount + taxAmount
  .refine(
    (data) => {
      const expected = (data.subtotal || 0) - (data.discount || 0) + (data.taxAmount || 0);
      return Math.abs(expected - (data.total || 0)) < 0.01;
    },
    { message: 'الإجمالي لا يطابق (المجموع الفرعي - الخصم + الضريبة).', path: ['total'] }
  )
  // 5) paidAmount = initialPayment.amount (أو initialPayment رقم)
  .refine(
    (data) => {
      const initialAmount =
        typeof data.initialPayment === 'object' && data.initialPayment !== null
          ? Number(data.initialPayment.amount) || 0
          : Number(data.initialPayment) || 0;
      return Math.abs(initialAmount - (data.paidAmount || 0)) < 0.01;
    },
    { message: 'المبلغ المدفوع يجب أن يطابق الدفعة الأولى.', path: ['paidAmount'] }
  )
  // 6) المبلغ المدفوع لا يتجاوز الإجمالي
  .refine((data) => (data.paidAmount || 0) <= (data.total || 0) + 0.01, {
    message: 'المبلغ المدفوع لا يمكن أن يتجاوز الإجمالي.',
    path: ['paidAmount'],
  })
  // 7) remainingAmount = total - paidAmount
  .refine(
    (data) => {
      const expected = Math.max(0, (data.total || 0) - (data.paidAmount || 0));
      return Math.abs(expected - (data.remainingAmount || 0)) < 0.01;
    },
    { message: 'المتبقي لا يطابق (الإجمالي - المدفوع).', path: ['remainingAmount'] }
  )
  // 8) الآجل/الجزئي يتطلب dueDate
  .refine(
    (data) => data.paymentType === 'cash' || Boolean(data.dueDate),
    { message: 'تاريخ الاستحقاق مطلوب للدفع الآجل أو الجزئي.', path: ['dueDate'] }
  )
  // 9) الدفع بشيك يتطلب checkId
  .refine(
    (data) => {
      const method =
        typeof data.initialPayment === 'object' && data.initialPayment !== null
          ? data.initialPayment.method
          : data.initialPaymentMethod;
      const checkId =
        typeof data.initialPayment === 'object' && data.initialPayment !== null
          ? data.initialPayment.checkId
          : undefined;
      return method !== 'check' || Boolean(checkId);
    },
    { message: 'الدفع بشيك يتطلب اختيار الشيك.', path: ['initialPayment', 'checkId'] }
  )
  // 10) الدفع النقدي يتطلب paidAmount = total
  .refine(
    (data) =>
      data.paymentType !== 'cash' ||
      Math.abs((data.paidAmount || 0) - (data.total || 0)) < 0.01,
    { message: 'الدفع النقدي يتطلب سداد الإجمالي بالكامل.', path: ['paidAmount'] }
  );

// ============================================================
// 4) التعديل — base.omit(...) — يعمل (base = ZodObject)
// ============================================================

export const updatePurchaseReceiptSchema = purchaseReceiptBaseSchema
  .omit({
    supplierId: true,
    supplier: true,
    warehouse: true,
    receiptDate: true,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'لا توجد حقول للتعديل.',
  });

// ============================================================
// 5) تأكيد الاستلام (Confirm Receipt)
// ============================================================

/**
 * POST /api/purchase-receipts/:id/confirm
 *
 * ⚠️ إصلاح 2026-11-11:
 *  - إضافة `cashFundId` + `bankAccountId` — لتحديد مصدر الدفع.
 *  - إضافة `initialPayment` + `initialPaymentMethod` — لدعم تعديل الدفعة عند التأكيد.
 */
export const confirmPurchaseReceiptSchema = z.object({
  receivedAt: optionalDateSchema,
  notes: optionalTextSchema(500),

  // ✅ مصدر الدفع (إلزامي إذا paidAmount > 0)
  cashFundId: optionalObjectIdSchema,
  bankAccountId: optionalObjectIdSchema,

  // ✅ الدفعة (اختياري — إذا مُرِّر، يُحدَّث)
  initialPayment: initialPaymentSchema,
  initialPaymentMethod: z.enum(['cash', 'bank', 'check']).optional(),
});

// ============================================================
// 6) الإلغاء
// ============================================================

export const cancelPurchaseReceiptSchema = z.object({
  cancelReason: z
    .string({ required_error: 'سبب الإلغاء مطلوب.' })
    .trim()
    .min(2, 'سبب الإلغاء قصير جداً.')
    .max(500, 'سبب الإلغاء طويل جداً.'),
});

// ============================================================
// 7) القائمة
// ============================================================

export const listPurchaseReceiptsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  supplierId: optionalObjectIdSchema,
  supplier: optionalObjectIdSchema,
  warehouse: optionalObjectIdSchema,
  status: z.enum(['draft', 'received', 'cancelled']).optional(),
  paymentType: z.enum(['cash', 'credit', 'partial']).optional(),
  notReceived: queryBooleanSchema,
  hasRemaining: queryBooleanSchema,
  dateFrom: optionalDateSchema,
  dateTo: optionalDateSchema,
  sortBy: z
    .enum(['createdAt', 'receiptDate', 'total', 'remainingAmount', 'dueDate'])
    .default('receiptDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================
// 8) Params
// ============================================================

export const purchaseReceiptIdParamsSchema = z.object({
  id: objectIdSchema,
});

export default {
  createPurchaseReceiptSchema,
  updatePurchaseReceiptSchema,
  confirmPurchaseReceiptSchema,
  cancelPurchaseReceiptSchema,
  listPurchaseReceiptsQuerySchema,
  purchaseReceiptIdParamsSchema,
};