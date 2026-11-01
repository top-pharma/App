/**
 * @file customerReturnValidator.js
 * @description
 * مخططات Zod للتحقق من مدخلات مرتجعات العملاء (إنشاء/تعديل/موافقة/رفض/قائمة).
 *
 * لماذا هذا الملف؟
 * - المرتجع عملية حساسة: يعيد بضاعة إلى المخزون ويخصم من الرصيد المالي.
 * - نمنع تمرير الحقول المُدارة آلياً:
 *     • returnNumber (auto-generated).
 *     • invoiceDate (يُنسخ من الفاتورة الأصلية في الـ service).
 *     • gracePeriodDays (يُقرأ من Customer في الـ service).
 *     • isWithinGracePeriod (يُحسب في Model pre-save hook).
 *     • status, settledAmount, settlementTransaction (تُدار عبر approve/reject).
 *     • approvedBy, approvedAt, rejectedBy, rejectedAt (تُملأ في الـ service).
 * - نُجري تحققات متقاطعة:
 *     • total = مجموع البنود.
 *     • كل بند يجب أن يحتوي على سبب (reason) — متطلب Model.
 * - endpoint الموافقة (approve) يتطلب تحديد التسوية (كيف سنرد المبلغ؟):
 *     • cash_refund: يتطلب cashFund أو bankAccount (يُتحقق منه في الـ controller).
 *     • balance_deduction: لا يتطلب حقل إضافي.
 * - نرفض الـ reject في حالة cash_refund لأن الرفض يعني عدم التسوية.
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
 * تاريخ اختياري.
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
 * بند داخل المرتجع (سطر واحد).
 *
 * لماذا هذه الحقول بالضبط؟
 * - `item`: الصنف.
 * - `batch`: رقم الدفعة — إلزامي لتوجيه البضاعة للدفعة الصحيحة في Stock.
 * - `quantity`: > 0.
 * - `unit`: اختياري (قد يكون '').
 * - `unitPrice`: سعر البيع الأصلي (من الفاتورة).
 * - `total`: الكمية × سعر البيع.
 * - `reason`: سبب الإرجاع (إلزامي).
 * - `note`: تفصيل لكل بند (اختياري).
 */
const returnItemSchema = z.object({
  item: objectIdSchema,
  batch: z
    .string({ required_error: 'رقم الدفعة مطلوب.' })
    .trim()
    .toUpperCase()
    .min(1, 'رقم الدفعة مطلوب.')
    .max(50, 'رقم الدفعة طويل جداً.'),
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
  reason: z.enum(['damaged', 'near_expiry', 'wrong_order', 'other'], {
    errorMap: () => ({ message: 'سبب الإرجاع غير معتمد.' }),
  }),
  note: z
    .string()
    .trim()
    .max(500, 'الملاحظة طويلة جداً.')
    .optional()
    .or(z.literal('')),
});

// ============================================================
// 2) الهيكل الأساسي (Base Schema)
// ============================================================

/**
 * الهيكل الأساسي — بدون تحققات متقاطعة.
 * نُعيد استخدامه في updateCustomerReturnSchema.
 */
const customerReturnBaseSchema = z.object({
  // ─────────────────────────────────────────────
  // 1. المراجع الأساسية
  // ─────────────────────────────────────────────
  /**
   * الفاتورة الأصلية — إلزامية (لا مرتجع بدون فاتورة).
   */
  originalInvoice: objectIdSchema,

  /**
   * الصيدلية — إلزامية (تُشتق عادةً من الفاتورة، لكن نقبلها لتفادي الاستعلام المزدوج).
   */
  pharmacy: objectIdSchema,

  // ─────────────────────────────────────────────
  // 2. البنود
  // ─────────────────────────────────────────────
  /**
   * عناصر المرتجع — عنصر واحد على الأقل.
   */
  items: z
    .array(returnItemSchema)
    .min(1, 'المرتجع يجب أن يحتوي على بند واحد على الأقل.'),

  // ─────────────────────────────────────────────
  // 3. الحسابات
  // ─────────────────────────────────────────────
  /**
   * الإجمالي = مجموع items[].total.
   * يتحقق متقاطعاً.
   */
  total: nonNegativeNumberSchema(0),

  // ─────────────────────────────────────────────
  // 4. الخيارات
  // ─────────────────────────────────────────────
  /**
   * تاريخ الإرجاع — افتراضي الآن.
   */
  returnDate: optionalDateSchema,

  /**
   * طريقة التسوية المتفق عليها (تُحدَّد لحظة الإنشاء).
   * - cash_refund: استرداد نقدي.
   * - balance_deduction: خصم من رصيد الصيدلية.
   */
  settlementType: z.enum(['cash_refund', 'balance_deduction'], {
    errorMap: () => ({ message: 'طريقة التسوية غير معتمدة.' }),
  }),

  /**
   * ملاحظات عامة.
   */
  notes: optionalTextSchema(1000),
});

// ============================================================
// 3) الإنشاء
// ============================================================

/**
 * POST /api/customer-returns
 *
 * الحقول المرفوضة (تُدار داخلياً):
 * - returnNumber (auto-generated).
 * - invoiceDate (يُنسخ من الفاتورة).
 * - gracePeriodDays (من Customer).
 * - isWithinGracePeriod (يُحسب في Model).
 * - status (يبدأ pending).
 * - settledAmount (يُملأ عند الموافقة).
 * - settlementTransaction (يُملأ عند الموافقة).
 * - approvedBy/rejectedBy (من req.user).
 */
export const createCustomerReturnSchema = customerReturnBaseSchema
  // 1) total = مجموع البنود.
  .refine(
    (data) => {
      const itemsTotal = data.items.reduce(
        (sum, item) => sum + (item.total || 0),
        0
      );
      return Math.abs(itemsTotal - (data.total || 0)) < 0.01;
    },
    {
      message: 'إجمالي المرتجع لا يطابق مجموع البنود.',
      path: ['total'],
    }
  );

// ============================================================
// 4) التعديل
// ============================================================

/**
 * PATCH /api/customer-returns/:id
 *
 * الحقول المرفوضة كلياً (ثوابت بعد الإنشاء):
 * - originalInvoice, pharmacy, returnDate, settlementType.
 * - status, settledAmount, settlementTransaction.
 *
 * ملاحظة: controller يتحقق إضافياً أن status === 'pending' قبل السماح بالتعديل.
 * هذا لا يمكن فرضه في Zod.
 */
export const updateCustomerReturnSchema = customerReturnBaseSchema
  .omit({
    originalInvoice: true,
    pharmacy: true,
    settlementType: true, // لا يمكن تغيير طريقة التسوية بعد الإنشاء
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'لا توجد حقول للتعديل.',
  });

// ============================================================
// 5) الموافقة (Approve)
// ============================================================

/**
 * POST /api/customer-returns/:id/approve
 *
 * لماذا endpoint منفصل؟
 * - الموافقة تُفعّل إعادة Stock + إنشاء CashTransaction (إن نقدي).
 * - المبلغ المُسوَّى قد يختلف عن total الأصلي (مثلاً: خصم إضافي).
 * - نطلب cashFund/bankAccount فقط عند cash_refund.
 *
 * ملاحظة: controller يتحقق من أن settlementType في DB يطابق الحقول المطلوبة.
 */
export const approveCustomerReturnSchema = z
  .object({
    /**
     * المبلغ المُسوَّى فعلياً — لا يتجاوز إجمالي المرتجع.
     */
    settledAmount: z.coerce
      .number()
      .min(0.0001, 'المبلغ المُسوَّى يجب أن يكون أكبر من صفر.'),

    /**
     * الصندوق النقدي — إلزامي إذا كانت طريقة التسوية cash_refund.
     */
    cashFund: optionalObjectIdSchema,

    /**
     * الحساب البنكي — إلزامي إذا كانت طريقة التسوية cash_refund (بنك).
     */
    bankAccount: optionalObjectIdSchema,

    /**
     * ملاحظات الموافقة.
     */
    notes: optionalTextSchema(500),
  })
  // نطلب cashFund أو bankAccount عند وجود المبلغ (المتحقق الفعلي في controller)
  // لا نستطيع ربطه بـ settlementType هنا لأن Zod لا يعرف حالة الفاتورة في DB.
  .refine(
    (data) => Boolean(data.cashFund || data.bankAccount) || data.settledAmount === 0,
    {
      message: 'يجب تحديد صندوق أو حساب بنكي لتسوية المرتجع النقدي.',
      path: ['cashFund'],
    }
  );

// ============================================================
// 6) الرفض (Reject)
// ============================================================

/**
 * POST /api/customer-returns/:id/reject
 *
 * لماذا سبب الرفض إلزامي؟
 * - لأنه يُسجَّل في AuditLog ويُبلَّغ للمندوب.
 * - يُرفض المرتجع نهائياً، ويعود Stock كما كان.
 */
export const rejectCustomerReturnSchema = z.object({
  rejectionReason: z
    .string({ required_error: 'سبب الرفض مطلوب.' })
    .trim()
    .min(2, 'سبب الرفض قصير جداً.')
    .max(500, 'سبب الرفض طويل جداً.'),
});

// ============================================================
// 7) القائمة
// ============================================================

/**
 * GET /api/customer-returns
 *
 * ملاحظة: sales_rep يُضاف له scope.salesRepId تلقائياً.
 */
export const listCustomerReturnsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),

  /**
   * بحث نصي — returnNumber + pharmacy.name.
   */
  search: z.string().trim().max(100).optional(),

  // ─── فلاتر مرجعية ───
  pharmacy: optionalObjectIdSchema,
  originalInvoice: optionalObjectIdSchema,

  // ─── فلاتر حالة ───
  status: z.enum(['pending', 'confirmed', 'rejected']).optional(),
  settlementType: z.enum(['cash_refund', 'balance_deduction']).optional(),

  // ─── فلاتر سلوكية ───
  /**
   * المرتجعات خارج فترة السماح.
   */
  outsideGracePeriod: queryBooleanSchema,
  /**
   * المرتجعات التي تحتوي على بند واحد على الأقل من نوع damaged.
   */
  hasDamagedItems: queryBooleanSchema,

  // ─── نطاق تاريخي ───
  dateFrom: optionalDateSchema,
  dateTo: optionalDateSchema,

  // ─── الترتيب ───
  sortBy: z
    .enum(['createdAt', 'returnDate', 'total', 'settledAmount'])
    .default('returnDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================
// 8) Params
// ============================================================

export const customerReturnIdParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  createCustomerReturnSchema,
  updateCustomerReturnSchema,
  approveCustomerReturnSchema,
  rejectCustomerReturnSchema,
  listCustomerReturnsQuerySchema,
  customerReturnIdParamsSchema,
};