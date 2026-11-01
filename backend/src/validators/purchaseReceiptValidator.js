/**
 * @file purchaseReceiptValidator.js
 * @description
 * مخططات Zod للتحقق من مدخلات إيصالات استلام البضاعة من الموردين
 * (إنشاء/تعديل/تأكيد الاستلام/قائمة).
 *
 * لماذا هذا الملف؟
 * - إيصال الاستلام هو نقطة دخول البضاعة (الدواء) للنظام، ويؤسس لدفعات Stock جديدة.
 * - يمس 3 جوانب:
 *     1. المخزون: عند التأكيد، تُنشأ دفعات Stock (لكل بند).
 *     2. المالية: قد يُنشئ CashTransaction للدفعة الأولى.
 *     3. رصيد المورد: عند الآجل أو الجزئي، يزداد currentBalance للمورد.
 * - نمنع تمرير الحقول المُدارة آلياً:
 *     • receiptNumber (auto-generated).
 *     • status (يبدأ draft).
 *     • receivedAt, receivedBy (تُملأ عند التأكيد).
 *     • createdBy (من req.user).
 * - نُجري تحققات متقاطعة:
 *     • total = مجموع البنود.
 *     • subtotal = مجموع البنود.
 *     • total = subtotal - discount + taxAmount.
 *     • paidAmount = initialPayment.amount.
 *     • remainingAmount = total - paidAmount.
 *     • الدفع الآجل/الجزئي يتطلب dueDate.
 *     • الدفع بشيك يتطلب checkId.
 *     • في كل بند: total = quantity × unitCost.
 * - نتحقق من أن expiry (تاريخ الانتهاء) إلزامي في كل بند (متطلب دوائي).
 */

import { z } from 'zod';

// ============================================================
// قواعد مشتركة (Reusable Rules)
// ============================================================

/**
 * MongoDB ObjectId (24 hex char).
 */
const objectIdSchema = z
  .string({ required_error: 'المُعرّف مطلوب.' })
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'المُعرّف غير صالح.');

/**
 * ObjectId اختياري — يقبل '' ويحوّلها إلى undefined.
 */
const optionalObjectIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'المُعرّف غير صالح.')
  .optional()
  .or(z.literal('').transform(() => undefined));

/**
 * تاريخ إلزامي — يقبل string/number ويحوّله إلى Date.
 */
const dateSchema = z.coerce.date({ invalid_type_error: 'تاريخ غير صالح.' });

/**
 * تاريخ اختياري — يقبل null.
 */
const optionalDateSchema = z
  .union([z.coerce.date({ invalid_type_error: 'تاريخ غير صالح.' }), z.null()])
  .optional();

/**
 * رقم غير سالب (default = 0).
 */
const nonNegativeNumberSchema = (defaultValue = 0) =>
  z.coerce
    .number()
    .min(0, 'القيمة لا يمكن أن تكون سالبة.')
    .default(defaultValue);

/**
 * نص اختياري — يقبل '' لتمكين المسح.
 */
const optionalTextSchema = (max) =>
  z.string().trim().max(max, 'النص طويل جداً.').optional().or(z.literal(''));

/**
 * boolean من query.
 */
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
 * لماذا هذه الحقول بالضبط؟
 * - `expiry` إلزامي (لا نستقبل دواءً بدون تاريخ انتهاء).
 * - `unitCost` إلزامي (التكلفة الفعلية من المورد).
 * - `unitPrice` اختياري (سعر البيع المقترح — يمكن تحديثه لاحقاً).
 * - `location` اختياري (موقع التخزين في المخزن — رف/عمود).
 */
const purchaseItemSchema = z.object({
  item: objectIdSchema,
  batch: z
    .string({ required_error: 'رقم الدفعة مطلوب.' })
    .trim()
    .toUpperCase()
    .min(1, 'رقم الدفعة مطلوب.')
    .max(50, 'رقم الدفعة طويل جداً.'),
  productionDate: optionalDateSchema,
  expiry: dateSchema, // ⚠️ إلزامي (متطلب دوائي)
  quantity: z.coerce
    .number()
    .min(0.0001, 'الكمية يجب أن تكون أكبر من صفر.'),
  unit: z
    .string()
    .trim()
    .max(50, 'اسم الوحدة طويل جداً.')
    .optional()
    .or(z.literal('')),
  unitCost: z.coerce.number().min(0, 'التكلفة لا يمكن أن تكون سالبة.'),
  unitPrice: z.coerce.number().min(0, 'السعر لا يمكن أن يكون سالباً.').default(0),
  total: z.coerce.number().min(0, 'الإجمالي لا يمكن أن يكون سالباً.'),
  location: z
    .string()
    .trim()
    .max(50, 'الموقع طويل جداً.')
    .optional()
    .or(z.literal('')),
});

/**
 * الدفعة الأولى للمورّد.
 *
 * لماذا كائن منفصل؟
 * - قد تكون نقداً، تحويلاً بنكياً، أو شيكاً.
 * - الدفع بالشيك يتطلب `checkId` (يُتحقق منه هنا).
 * - `paidAt`, `paidBy` تُملأ في الـ service (لا تُقبل من العميل).
 */
const initialPaymentSchema = z.object({
  amount: nonNegativeNumberSchema(0),
  method: z
    .enum(['cash', 'bank', 'check'], {
      errorMap: () => ({ message: 'طريقة الدفع غير معتمدة.' }),
    })
    .default('cash'),
  checkId: optionalObjectIdSchema,
});

// ============================================================
// 2) الهيكل الأساسي (Base Schema)
// ============================================================

/**
 * الهيكل الأساسي — بدون تحققات متقاطعة.
 */
const purchaseReceiptBaseSchema = z.object({
  // ─────────────────────────────────────────────
  // 1. المراجع الأساسية
  // ─────────────────────────────────────────────
  /**
   * المورّد — إلزامي.
   */
  supplier: objectIdSchema,

  /**
   * المخزن المستقبِل — إلزامي (الرئيسي عادةً).
   */
  warehouse: objectIdSchema,

  /**
   * رقم فاتورة المورّد (اختياري — للتتبع).
   */
  supplierInvoiceNumber: optionalTextSchema(50),

  /**
   * تاريخ الاستلام — اختياري (افتراضي Date.now).
   * يدعم الإدخال المتأخر (استلام أمس).
   */
  receiptDate: optionalDateSchema,

  // ─────────────────────────────────────────────
  // 2. البنود
  // ─────────────────────────────────────────────
  items: z
    .array(purchaseItemSchema)
    .min(1, 'إيصال الاستلام يجب أن يحتوي على بند واحد على الأقل.'),

  // ─────────────────────────────────────────────
  // 3. الحسابات
  // ─────────────────────────────────────────────
  subtotal: nonNegativeNumberSchema(0),
  discount: nonNegativeNumberSchema(0),
  taxRate: z.coerce
    .number()
    .min(0, 'نسبة الضريبة لا يمكن أن تكون سالبة.')
    .max(100, 'نسبة الضريبة لا يمكن أن تتجاوز 100.')
    .default(0),
  taxAmount: nonNegativeNumberSchema(0),
  total: nonNegativeNumberSchema(0),

  // ─────────────────────────────────────────────
  // 4. الدفع
  // ─────────────────────────────────────────────
  paymentType: z.enum(['cash', 'credit', 'partial'], {
    errorMap: () => ({ message: 'نوع الدفع غير معتمد.' }),
  }),
  initialPayment: initialPaymentSchema.optional(),
  paidAmount: nonNegativeNumberSchema(0),
  remainingAmount: nonNegativeNumberSchema(0),
  dueDate: optionalDateSchema,

  // ─────────────────────────────────────────────
  // 5. ملاحظات
  // ─────────────────────────────────────────────
  notes: optionalTextSchema(1000),
});

// ============================================================
// 3) الإنشاء
// ============================================================

/**
 * POST /api/purchase-receipts
 *
 * الحقول المرفوضة (تُدار داخلياً):
 * - receiptNumber (auto-generated).
 * - status (يبدأ draft).
 * - receivedAt, receivedBy (تُملأ عند التأكيد).
 * - createdBy (من req.user).
 */
export const createPurchaseReceiptSchema = purchaseReceiptBaseSchema
  // 1) total = مجموع البنود.
  .refine(
    (data) => {
      const itemsTotal = data.items.reduce(
        (sum, item) => sum + (item.total || 0),
        0
      );
      return Math.abs(itemsTotal - (data.total || 0)) < 0.01;
    },
    { message: 'الإجمالي لا يطابق مجموع البنود.', path: ['total'] }
  )
  // 2) subtotal = مجموع البنود (نفس المبلغ — يُخزَّن مرتين لتقارير أسرع).
  .refine(
    (data) => {
      const itemsTotal = data.items.reduce(
        (sum, item) => sum + (item.total || 0),
        0
      );
      return Math.abs(itemsTotal - (data.subtotal || 0)) < 0.01;
    },
    { message: 'المجموع الفرعي لا يطابق مجموع البنود.', path: ['subtotal'] }
  )
  // 3) في كل بند: total = quantity × unitCost.
  .refine(
    (data) =>
      data.items.every(
        (item) =>
          Math.abs((item.quantity || 0) * (item.unitCost || 0) - (item.total || 0)) < 0.01
      ),
    {
      message: 'إجمالي أحد البنود لا يطابق (الكمية × التكلفة).',
      path: ['items'],
    }
  )
  // 4) total = subtotal - discount + taxAmount.
  .refine(
    (data) => {
      const expected =
        (data.subtotal || 0) - (data.discount || 0) + (data.taxAmount || 0);
      return Math.abs(expected - (data.total || 0)) < 0.01;
    },
    { message: 'الإجمالي لا يطابق (المجموع الفرعي - الخصم + الضريبة).', path: ['total'] }
  )
  // 5) paidAmount = initialPayment.amount (إن وُجد).
  .refine(
    (data) =>
      Math.abs(
        (data.initialPayment?.amount || 0) - (data.paidAmount || 0)
      ) < 0.01,
    {
      message: 'المبلغ المدفوع يجب أن يطابق الدفعة الأولى.',
      path: ['paidAmount'],
    }
  )
  // 6) المبلغ المدفوع لا يتجاوز الإجمالي.
  .refine((data) => (data.paidAmount || 0) <= (data.total || 0) + 0.01, {
    message: 'المبلغ المدفوع لا يمكن أن يتجاوز الإجمالي.',
    path: ['paidAmount'],
  })
  // 7) remainingAmount = total - paidAmount.
  .refine(
    (data) => {
      const expected = Math.max(0, (data.total || 0) - (data.paidAmount || 0));
      return Math.abs(expected - (data.remainingAmount || 0)) < 0.01;
    },
    { message: 'المتبقي لا يطابق (الإجمالي - المدفوع).', path: ['remainingAmount'] }
  )
  // 8) الآجل/الجزئي يتطلب dueDate.
  .refine(
    (data) => data.paymentType === 'cash' || Boolean(data.dueDate),
    {
      message: 'تاريخ الاستحقاق مطلوب للدفع الآجل أو الجزئي.',
      path: ['dueDate'],
    }
  )
  // 9) الدفع بشيك يتطلب checkId.
  .refine(
    (data) =>
      !data.initialPayment ||
      data.initialPayment.method !== 'check' ||
      Boolean(data.initialPayment.checkId),
    { message: 'الدفع بشيك يتطلب اختيار الشيك.', path: ['initialPayment', 'checkId'] }
  )
  // 10) الدفع النقدي يتطلب paidAmount = total.
  .refine(
    (data) =>
      data.paymentType !== 'cash' ||
      Math.abs((data.paidAmount || 0) - (data.total || 0)) < 0.01,
    {
      message: 'الدفع النقدي يتطلب سداد الإجمالي بالكامل.',
      path: ['paidAmount'],
    }
  );

// ============================================================
// 4) التعديل
// ============================================================

/**
 * PATCH /api/purchase-receipts/:id
 *
 * الحقول المرفوضة كلياً (ثوابت بعد الإنشاء):
 * - supplier, warehouse (لا يمكن تغيير المورّد أو المخزن).
 * - receiptDate (تاريخ الاستلام ثابت).
 * - status, receivedAt, receivedBy (تُدار عبر confirm).
 *
 * ملاحظة: controller يتحقق إضافياً أن status === 'draft' قبل السماح بالتعديل.
 */
export const updatePurchaseReceiptSchema = purchaseReceiptBaseSchema
  .omit({
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
 * لماذا endpoint منفصل؟
 * - التأكيد يُنشئ دفعات Stock (دمج مع الموجود).
 * - يُنشئ CashTransaction للدفعة الأولى.
 * - يُحدّث currentBalance للمورّد (إن آجل/جزئي).
 * - يُسجّل receivedAt, receivedBy.
 */
export const confirmPurchaseReceiptSchema = z.object({
  /**
   * وقت الاستلام الفعلي — افتراضي الآن.
   */
  receivedAt: optionalDateSchema,

  /**
   * ملاحظات التأكيد.
   */
  notes: optionalTextSchema(500),
});

// ============================================================
// 6) الإلغاء (Cancel Draft)
// ============================================================

/**
 * POST /api/purchase-receipts/:id/cancel
 *
 * لماذا منفصل؟
 * - الإلغاء ممكن فقط في status = draft.
 * - إذا كان received (مؤكد)، يُدار عبر SupplierReturn (إرجاع للمورد).
 */
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

/**
 * GET /api/purchase-receipts
 */
export const listPurchaseReceiptsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),

  /**
   * بحث نصي — receiptNumber + supplier.name + supplierInvoiceNumber.
   */
  search: z.string().trim().max(100).optional(),

  // ─── فلاتر مرجعية ───
  supplier: optionalObjectIdSchema,
  warehouse: optionalObjectIdSchema,

  // ─── فلاتر حالة/نوع ───
  status: z.enum(['draft', 'received', 'cancelled']).optional(),
  paymentType: z.enum(['cash', 'credit', 'partial']).optional(),

  // ─── فلاتر سلوكية ───
  /**
   * الإيصالات غير المؤكدة (draft).
   */
  notReceived: queryBooleanSchema,
  /**
   * الإيصالات التي عليها رصيد متبقٍ للمورّد (remainingAmount > 0).
   */
  hasRemaining: queryBooleanSchema,

  // ─── نطاق تاريخي ───
  dateFrom: optionalDateSchema,
  dateTo: optionalDateSchema,

  // ─── الترتيب ───
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

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  createPurchaseReceiptSchema,
  updatePurchaseReceiptSchema,
  confirmPurchaseReceiptSchema,
  cancelPurchaseReceiptSchema,
  listPurchaseReceiptsQuerySchema,
  purchaseReceiptIdParamsSchema,
};