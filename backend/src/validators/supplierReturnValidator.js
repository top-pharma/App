/**
 * @file supplierReturnValidator.js
 * @description
 * مخططات Zod للتحقق من مدخلات مرتجعات الموردين (إنشاء/تعديل/إرسال/قبول/رفض/قائمة).
 *
 * لماذا هذا الملف؟
 * - مرتجع المورد يوثّق إرجاع أدوية تالفة أو قريبة الانتهاء إلى الشركة المستوردة.
 * - يمر بدورة حياة: draft (مسودة) → sent (مُرسل) → accepted / rejected.
 * - نمنع تمرير الحقول المُدارة آلياً:
 *     • returnNumber (auto-generated).
 *     • status (يُدار عبر send/accept/reject).
 *     • settledAmount, settledAt (تُملأ عند القبول).
 *     • replacementReference (يُملأ عند القبول إن كان النوع replacement).
 *     • createdBy (من req.user).
 * - نُجري تحققات متقاطعة:
 *     • total = مجموع البنود.
 *     • عند القبول بطريقة replacement ⇒ replacementReference إلزامي.
 *     • عند القبول بطريقة credit_note أو cash_refund ⇒ settledAmount إلزامي.
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
 * تاريخ إلزامي.
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
 * بند داخل مرتجع المورد.
 *
 * لماذا هذه الحقول بالضبط؟
 * - `item`, `batch`, `quantity`, `unitCost`, `total`: أساسيات مالية/مخزنية.
 * - `expiry`: اختياري لكن مفيد (لتأكيد أن المرتجع فعلاً قريب انتهاء).
 * - `reason`: إلزامي (5 أسباب).
 * - `note`: تفصيل لكل بند.
 */
const supplierReturnItemSchema = z.object({
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
  unitCost: z.coerce.number().min(0, 'التكلفة لا يمكن أن تكون سالبة.'),
  total: z.coerce.number().min(0, 'الإجمالي لا يمكن أن يكون سالباً.'),
  reason: z.enum(
    ['damaged', 'near_expiry', 'wrong_order', 'quality_issue', 'other'],
    {
      errorMap: () => ({ message: 'سبب الإرجاع غير معتمد.' }),
    }
  ),
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
 */
const supplierReturnBaseSchema = z.object({
  // ─────────────────────────────────────────────
  // 1. المراجع الأساسية
  // ─────────────────────────────────────────────
  /**
   * المورّد — إلزامي.
   */
  supplier: objectIdSchema,

  /**
   * إيصال الاستلام الأصلي — اختياري (قد لا يكون المرتجع مرتبطاً بإيصال محدد).
   */
  purchaseReceipt: optionalObjectIdSchema,

  // ─────────────────────────────────────────────
  // 2. البنود
  // ─────────────────────────────────────────────
  /**
   * عناصر المرتجع — عنصر واحد على الأقل.
   */
  items: z
    .array(supplierReturnItemSchema)
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
   * تاريخ المرتجع — افتراضي الآن.
   */
  returnDate: optionalDateSchema,

  /**
   * طريقة التسوية المتفق عليها مع المورّد.
   * - credit_note: إشعار دائن يخصم من رصيد المورّد (default).
   * - replacement: استبدال ببضاعة جديدة.
   * - cash_refund: استرداد نقدي.
   */
  settlementType: z
    .enum(['credit_note', 'replacement', 'cash_refund'], {
      errorMap: () => ({ message: 'طريقة التسوية غير معتمدة.' }),
    })
    .default('credit_note'),

  /**
   * ملاحظات عامة.
   */
  notes: optionalTextSchema(1000),
});

// ============================================================
// 3) الإنشاء
// ============================================================

/**
 * POST /api/supplier-returns
 *
 * الحقول المرفوضة (تُدار داخلياً):
 * - returnNumber (auto-generated).
 * - status (يبدأ draft).
 * - settledAmount, settledAt (تُملأ عند القبول).
 * - replacementReference (يُملأ عند القبول إن لزم).
 * - createdBy (من req.user).
 */
export const createSupplierReturnSchema = supplierReturnBaseSchema
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
 * PATCH /api/supplier-returns/:id
 *
 * الحقول المرفوضة كلياً (ثوابت بعد الإنشاء):
 * - supplier, purchaseReceipt (لا يمكن تغيير المورّد أو إيصال الاستلام).
 * - returnDate (تاريخ المرتجع ثابت).
 * - status, settledAmount, settledAt (تُدار عبر endpoints).
 *
 * ملاحظة: controller يتحقق إضافياً أن status === 'draft' قبل السماح بالتعديل.
 * هذا لا يمكن فرضه في Zod.
 */
export const updateSupplierReturnSchema = supplierReturnBaseSchema
  .omit({
    supplier: true,
    purchaseReceipt: true,
    returnDate: true,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'لا توجد حقول للتعديل.',
  });

// ============================================================
// 5) الإرسال (Send to Supplier)
// ============================================================

/**
 * POST /api/supplier-returns/:id/send
 *
 * لماذا endpoint منفصل؟
 * - الإرسال يعني "تم التواصل مع المورّد وقبول المرتجع مبدئياً".
 * - نطلب ملاحظات اختيارية (مثل "تم الإرسال عبر المندوب").
 */
export const sendSupplierReturnSchema = z.object({
  notes: optionalTextSchema(500),
});

// ============================================================
// 6) القبول (Accept from Supplier)
// ============================================================

/**
 * POST /api/supplier-returns/:id/accept
 *
 * لماذا endpoint منفصل؟
 * - القبول يعني: البضاعة خرجت من Stock + تمت التسوية مع المورّد.
 * - نطلب `settledAmount` إذا كان النوع credit_note أو cash_refund.
 * - نطلب `replacementReference` إذا كان النوع replacement.
 */
export const acceptSupplierReturnSchema = z
  .object({
    /**
     * المبلغ المُسوَّى فعلياً (للأنواع النقدية/الائتمانية).
     */
    settledAmount: z.coerce
      .number()
      .min(0, 'المبلغ المُسوَّى لا يمكن أن يكون سالباً.')
      .default(0),

    /**
     * مرجع الاستبدال (رقم إيصال الاستلام الجديد، أو رقم البوليصة).
     * إلزامي عند settlementType = replacement.
     */
    replacementReference: z
      .string()
      .trim()
      .max(100, 'مرجع الاستبدال طويل جداً.')
      .optional()
      .or(z.literal('')),

    /**
     * الصندوق النقدي — إلزامي عند cash_refund.
     */
    cashFund: optionalObjectIdSchema,

    /**
     * ملاحظات الموافقة.
     */
    notes: optionalTextSchema(500),
  })
  // نتحقق من أن settledAmount موجب عندما يكون النوع credit_note أو cash_refund.
  // لا نستطيع التحقق من النوع هنا (لأنه في DB)، لذا نتركه لـ controller،
  // لكن نضمن أن صفر مع cash_refund في controller سيرفض.
  .refine(
    (data) => Boolean(data.settledAmount) || Boolean(data.replacementReference),
    {
      message: 'يجب تحديد مبلغ التسوية أو مرجع الاستبدال.',
      path: ['settledAmount'],
    }
  );

// ============================================================
// 7) الرفض (Reject from Supplier)
// ============================================================

/**
 * POST /api/supplier-returns/:id/reject
 *
 * لماذا سبب الرفض إلزامي؟
 * - لأنه يُسجَّل في AuditLog.
 * - يُرجع حالة الإيصال إلى draft (لتعديله) أو يُلغى.
 */
export const rejectSupplierReturnSchema = z.object({
  rejectionReason: z
    .string({ required_error: 'سبب الرفض مطلوب.' })
    .trim()
    .min(2, 'سبب الرفض قصير جداً.')
    .max(500, 'سبب الرفض طويل جداً.'),
});

// ============================================================
// 8) القائمة
// ============================================================

/**
 * GET /api/supplier-returns
 */
export const listSupplierReturnsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),

  /**
   * بحث نصي — returnNumber + supplier.name.
   */
  search: z.string().trim().max(100).optional(),

  // ─── فلاتر مرجعية ───
  supplier: optionalObjectIdSchema,
  purchaseReceipt: optionalObjectIdSchema,

  // ─── فلاتر حالة/نوع ───
  status: z.enum(['draft', 'sent', 'accepted', 'rejected']).optional(),
  settlementType: z.enum(['credit_note', 'replacement', 'cash_refund']).optional(),

  // ─── فلاتر سلوكية ───
  /**
   * المرتجعات التي لم تُرسل بعد (draft فقط).
   */
  notSent: queryBooleanSchema,
  /**
   * المرتجعات التي تحتوي على بند واحد على الأقل من نوع quality_issue.
   */
  hasQualityIssues: queryBooleanSchema,

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
// 9) Params
// ============================================================

export const supplierReturnIdParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  createSupplierReturnSchema,
  updateSupplierReturnSchema,
  sendSupplierReturnSchema,
  acceptSupplierReturnSchema,
  rejectSupplierReturnSchema,
  listSupplierReturnsQuerySchema,
  supplierReturnIdParamsSchema,
};