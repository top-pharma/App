/**
 * @file deliveryNoteValidator.js
 * @description
 * مخططات Zod للتحقق من مدخلات إيصالات التسليم (إنشاء/تعديل/تسليم/قائمة).
 *
 * لماذا هذا الملف؟
 * - إيصال التسليم يوثّق خروج الأدوية من المخزن إلى الصيدلية.
 * - يسبق الفاتورة في دورة العمل (يُسجَّل بند التسليم قبل تسجيل الفاتورة).
 * - يحمل `warehouse` (بخلاف Invoice) — وهو المخزن الذي ستُخصم منه الدفعات.
 * - يحمل `initialPayment` (المندوب قد يقبض نقداً عند التسليم).
 * - يدعم التوقيع كصورة (base64) أو اسم المستلم.
 * - نرفض الحقول الإدارية:
 *     • deliveryNumber (auto-generated في service).
 *     • status (يُدار عبر markDeliveredSchema).
 *     • invoices (تُضاف تلقائياً عند إنشاء الفاتورة).
 *     • deliveredAt, createdBy, receivedBy-signature (عبر markDelivered).
 * - نُجري تحققات متقاطعة:
 *     • totalAmount = مجموع البنود.
 *     • remainingAmount = totalAmount - initialPayment.amount.
 *     • initialPayment.amount <= totalAmount.
 *     • initialPayment.paymentMethod === 'check' ⇒ checkId إلزامي.
 * - نتسامح مع فروق الفاصلة العشرية (0.01).
 */

import { z } from 'zod';

// ============================================================
// قواعد مشتركة
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
 * تاريخ اختياري — يقبل null (لأن Model يسمح بـ null في expiry).
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
 * boolean من query (يقبل فقط 'true' أو 'false').
 */
const queryBooleanSchema = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

// ============================================================
// 1) العناصر الفرعية (Sub-schemas)
// ============================================================

/**
 * بند داخل إيصال التسليم (سطر واحد).
 *
 * الفروق عن Invoice بند:
 * - لا يحمل unitCost (الإيصال لا يحسب الربح؛ الفاتورة هي من تحسبه).
 * - expiry مطلوب منطقياً، لكنه اختياري هنا لأنه يُقرأ من Stock إذا لم يُمرَّر.
 * - لا يحمل reason (الإيصال بلا أسباب — التالف في المرتجع).
 */
const deliveryItemSchema = z.object({
  item: objectIdSchema,
  batch: z
    .string({ required_error: 'رقم الدفعة مطلوب.' })
    .trim()
    .toUpperCase()
    .min(1, 'رقم الدفعة مطلوب.')
    .max(50, 'رقم الدفعة طويل جداً.'),
  expiry: optionalDateSchema,
  quantity: z.coerce
    .number()
    .min(0.0001, 'الكمية يجب أن تكون أكبر من صفر.'),
  unit: z
    .string()
    .trim()
    .max(50, 'اسم الوحدة طويل جداً.')
    .optional()
    .or(z.literal('')),
  unitPrice: z.coerce.number().min(0, 'السعر لا يمكن أن يكون سالباً.'),
  total: z.coerce.number().min(0, 'الإجمالي لا يمكن أن يكون سالباً.'),
});

/**
 * الدفعة الأولى عند التسليم.
 *
 * لماذا كائن منفصل؟
 * - المندوب قد يقبض نقداً أو شيكاً عند التسليم.
 * - `paymentMethod` يحدد الحقل الإلزامي:
 *     • cash: cashFund إلزامي (لكن لا نتحقق هنا — نتحقق في controller).
 *     • bank: bankAccount إلزامي.
 *     • check: checkId إلزامي (نتحقق متقاطعاً هنا).
 * - `receivedAt` يُملأ في service.
 * - `receivedBy` (ObjectId) يُملأ في service من req.user._id.
 */
const initialPaymentSchema = z.object({
  amount: nonNegativeNumberSchema(0),
  paymentMethod: z
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
 * نُعيد استخدامه في updateDeliveryNoteSchema.
 */
const deliveryNoteBaseSchema = z.object({
  // ─────────────────────────────────────────────
  // 1. المراجع الأساسية
  // ─────────────────────────────────────────────
  /**
   * الصيدلية المستلمة.
   */
  pharmacy: objectIdSchema,

  /**
   * المندوب المسؤول عن التسليم.
   */
  salesRep: objectIdSchema,

  /**
   * المخزن الذي خرجت منه البضاعة.
   * إلزامي في DeliveryNote (بخلاف Invoice).
   */
  warehouse: objectIdSchema,

  /**
   * تاريخ الإيصال — اختياري (افتراضي Date.now).
   */
  deliveryDate: optionalDateSchema,

  // ─────────────────────────────────────────────
  // 2. البنود
  // ─────────────────────────────────────────────
  /**
   * عناصر التسليم — عنصر واحد على الأقل.
   */
  items: z
    .array(deliveryItemSchema)
    .min(1, 'إيصال التسليم يجب أن يحتوي على بند واحد على الأقل.'),

  // ─────────────────────────────────────────────
  // 3. الحسابات
  // ─────────────────────────────────────────────
  /**
   * الإجمالي = مجموع items[].total.
   * يتحقق متقاطعاً.
   */
  totalAmount: nonNegativeNumberSchema(0),

  /**
   * الدفعة الأولى.
   */
  initialPayment: initialPaymentSchema.optional(),

  /**
   * المتبقي بعد الدفعة الأولى.
   * يتحقق متقاطعاً: remainingAmount = totalAmount - initialPayment.amount.
   */
  remainingAmount: nonNegativeNumberSchema(0),

  // ─────────────────────────────────────────────
  // 4. خطة الدفع
  // ─────────────────────────────────────────────
  /**
   * خطة الدفع المتفق عليها مع الصيدلية.
   * - cash: دفع كامل عند التسليم.
   * - credit: آجل (يُحدَّد dueDate عند الفاتورة).
   * - installments: أقساط (تُنشأ الأقساط عند الفاتورة).
   */
  paymentPlan: z
    .enum(['cash', 'credit', 'installments'], {
      errorMap: () => ({ message: 'خطة الدفع غير معتمدة.' }),
    })
    .default('cash'),

  // ─────────────────────────────────────────────
  // 5. ملاحظات
  // ─────────────────────────────────────────────
  notes: optionalTextSchema(1000),
});

// ============================================================
// 3) الإنشاء
// ============================================================

/**
 * POST /api/delivery-notes
 *
 * الحقول المرفوضة (تُدار داخلياً):
 * - deliveryNumber (auto-generated).
 * - status (يبدأ pending → in_transit → delivered).
 * - deliveredAt, receivedBy (اسم المستلم) + signature (عبر markDelivered).
 * - invoices (تُضاف عندما تُنشأ الفواتير).
 * - createdBy (من req.user).
 */
export const createDeliveryNoteSchema = deliveryNoteBaseSchema
  // 1) totalAmount = مجموع البنود.
  .refine(
    (data) => {
      const itemsTotal = data.items.reduce(
        (sum, item) => sum + (item.total || 0),
        0
      );
      return Math.abs(itemsTotal - (data.totalAmount || 0)) < 0.01;
    },
    {
      message: 'إجمالي الإيصال لا يطابق مجموع البنود.',
      path: ['totalAmount'],
    }
  )
  // 2) المبلغ المقدم لا يتجاوز الإجمالي.
  .refine(
    (data) =>
      !data.initialPayment ||
      (data.initialPayment.amount || 0) <= (data.totalAmount || 0) + 0.01,
    {
      message: 'الدفعة الأولى لا يمكن أن تتجاوز إجمالي الإيصال.',
      path: ['initialPayment', 'amount'],
    }
  )
  // 3) المتبقي = الإجمالي - الدفعة الأولى.
  .refine(
    (data) => {
      const paid = data.initialPayment?.amount || 0;
      const expected = Math.max(0, (data.totalAmount || 0) - paid);
      return Math.abs(expected - (data.remainingAmount || 0)) < 0.01;
    },
    {
      message: 'المتبقي لا يطابق (الإجمالي - الدفعة الأولى).',
      path: ['remainingAmount'],
    }
  )
  // 4) الدفع بشيك يتطلب checkId.
  .refine(
    (data) =>
      !data.initialPayment ||
      data.initialPayment.paymentMethod !== 'check' ||
      Boolean(data.initialPayment.checkId),
    {
      message: 'الدفع بشيك يتطلب اختيار الشيك.',
      path: ['initialPayment', 'checkId'],
    }
  );

// ============================================================
// 4) التعديل
// ============================================================

/**
 * PATCH /api/delivery-notes/:id
 *
 * الحقول المرفوضة كلياً (ثوابت بعد الإنشاء):
 * - deliveryNumber, pharmacy, salesRep, warehouse.
 * - status, deliveredAt, receivedBy, signature, invoices.
 * - createdBy.
 *
 * ملاحظة: controller يتحقق إضافياً أن status === 'pending' (لا يمكن تعديل
 * إيصال قيد التوصيل أو تم تسليمه). هذا لا يمكن فرضه في Zod.
 */
export const updateDeliveryNoteSchema = deliveryNoteBaseSchema
  .omit({
    pharmacy: true,
    salesRep: true,
    warehouse: true,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'لا توجد حقول للتعديل.',
  });

// ============================================================
// 5) تعليم كمُسلَّم
// ============================================================

/**
 * PATCH /api/delivery-notes/:id/mark-delivered
 *
 * لماذا endpoint منفصل؟
 * - التسليم حدث مستقل: يُحدّث status → delivered + deliveredAt + receivedBy.
 * - نطلب اسم المستلم إلزامياً (للإثبات).
 * - التوقيع اختياري (base64 من canvas أو رابط صورة).
 * - لا نقبل status في الطلب — يُضبط داخلياً.
 */
export const markDeliveredSchema = z.object({
  /**
   * اسم المستلم في الصيدلية (نص حر — قد يكون شخصاً مختلفاً عن الصيدلية).
   */
  receivedBy: z
    .string({ required_error: 'اسم المستلم مطلوب.' })
    .trim()
    .min(2, 'اسم المستلم قصير جداً.')
    .max(200, 'اسم المستلم طويل جداً.'),

  /**
   * التوقيع (base64 من canvas، أو رابط صورة خارجية).
   * اختياري — بعض الصيدليات تكتفي بالاسم.
   */
  signature: z
    .string()
    .max(500_000, 'التوقيع كبير جداً (الحد 500KB).')
    .optional()
    .or(z.literal('')),

  /**
   * وقت التسليم الفعلي — افتراضي الآن.
   */
  deliveredAt: optionalDateSchema,

  /**
   * ملاحظة تسليم اختيارية.
   */
  notes: optionalTextSchema(500),
});

// ============================================================
// 6) القائمة
// ============================================================

/**
 * GET /api/delivery-notes
 *
 * ملاحظة: sales_rep يُضاف له scope.salesRepId تلقائياً.
 * pharmacy يُضاف له scope.customerId تلقائياً.
 */
export const listDeliveryNotesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),

  /**
   * بحث نصي — deliveryNumber + pharmacy.name + receivedBy.
   */
  search: z.string().trim().max(100).optional(),

  // ─── فلاتر مرجعية ───
  pharmacy: optionalObjectIdSchema,
  salesRep: optionalObjectIdSchema,
  warehouse: optionalObjectIdSchema,

  // ─── فلاتر حالة/نوع ───
  status: z
    .enum(['pending', 'in_transit', 'delivered', 'returned'])
    .optional(),
  paymentPlan: z.enum(['cash', 'credit', 'installments']).optional(),

  // ─── فلاتر سلوكية ───
  /**
   * إيصالات لم تُسلَّم بعد (status = pending أو in_transit).
   */
  notDelivered: queryBooleanSchema,
  /**
   * إيصالات تحتوي على دفعة أولى > 0.
   */
  hasInitialPayment: queryBooleanSchema,

  // ─── نطاق تاريخي ───
  dateFrom: optionalDateSchema,
  dateTo: optionalDateSchema,

  // ─── الترتيب ───
  sortBy: z
    .enum(['createdAt', 'deliveryDate', 'totalAmount', 'deliveredAt'])
    .default('deliveryDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================
// 7) Params
// ============================================================

export const deliveryNoteIdParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  createDeliveryNoteSchema,
  updateDeliveryNoteSchema,
  markDeliveredSchema,
  listDeliveryNotesQuerySchema,
  deliveryNoteIdParamsSchema,
};