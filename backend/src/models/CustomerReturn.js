/**
 * @file CustomerReturn.js
 * @description
 * مرتجع العميل (الصيدلية) — مع التحقق من فترة السماح (7 أيام).
 *
 * لماذا هذا الملف؟
 * - متطلب صريح: "فترة سماح المرتجع: أسبوع واحد".
 * - نحتفظ بـ invoiceDate داخل المرتجع لتفادي الاستعلام عن الفاتورة الأصلية
 *   عند كل تحقق.
 * - isWithinGracePeriod يُحسب آلياً قبل الحفظ.
 * - settlementType: نقدي (استرداد) أو خصم من الرصيد.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * أسباب المرتجع.
 * @readonly
 * @enum {string}
 */
export const RETURN_REASONS = Object.freeze({
  DAMAGED: 'damaged',
  NEAR_EXPIRY: 'near_expiry',
  WRONG_ORDER: 'wrong_order',
  OTHER: 'other',
});

/**
 * حالات المرتجع.
 * @readonly
 * @enum {string}
 */
export const RETURN_STATUSES = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
});

/**
 * طرق التسوية.
 * @readonly
 * @enum {string}
 */
export const SETTLEMENT_TYPES = Object.freeze({
  CASH_REFUND: 'cash_refund',
  BALANCE_DEDUCTION: 'balance_deduction',
});

/**
 * Schema عنصر المرتجع.
 */
const returnItemSchema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    batch: { type: String, trim: true, uppercase: true, required: true },
    quantity: { type: Number, required: true, min: 0.0001 },
    unit: { type: String, trim: true, default: '' },
    unitPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    reason: {
      type: String,
      enum: Object.values(RETURN_REASONS),
      required: true,
    },
    /**
     * ملاحظة تفصيلية لكل عنصر.
     */
    note: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

/**
 * Schema مرتجع العميل.
 */
const customerReturnSchema = new Schema(
  {
    /**
     * رقم المرتجع (فريد).
     */
    returnNumber: {
      type: String,
      required: [true, 'رقم المرتجع مطلوب.'],
      unique: true,
      trim: true,
      index: true,
    },

    /**
     * الفاتورة الأصلية.
     */
    originalInvoice: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
      required: [true, 'الفاتورة الأصلية مطلوبة.'],
      index: true,
    },

    /**
     * الصيدلية.
     */
    pharmacy: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'الصيدلية مطلوبة.'],
      index: true,
    },

    /**
     * العناصر.
     */
    items: {
      type: [returnItemSchema],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'المرتجع يجب أن يحتوي على عنصر واحد على الأقل.',
      },
    },

    /**
     * الإجمالي.
     */
    total: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    // ------------------------------------------------------------
    // فترة السماح
    // ------------------------------------------------------------
    /**
     * تاريخ المرتجع.
     */
    returnDate: {
      type: Date,
      default: Date.now,
      index: true,
    },

    /**
     * تاريخ الفاتورة الأصلية (منسوخ للتحقق السريع).
     */
    invoiceDate: {
      type: Date,
      required: true,
    },

    /**
     * فترة السماح بالأيام (منسوخة من العميل/الإعدادات).
     */
    gracePeriodDays: {
      type: Number,
      default: 7,
      min: 0,
      max: 90,
    },

    /**
     * هل المرتجع ضمن فترة السماح؟
     * يُحسب آلياً قبل الحفظ.
     */
    isWithinGracePeriod: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ------------------------------------------------------------
    // الحالة والتسوية
    // ------------------------------------------------------------
    status: {
      type: String,
      enum: Object.values(RETURN_STATUSES),
      default: RETURN_STATUSES.PENDING,
      index: true,
    },

    /**
     * طريقة التسوية — إلزامية عند الإنشاء.
     */
    settlementType: {
      type: String,
      enum: Object.values(SETTLEMENT_TYPES),
      required: [true, 'طريقة التسوية مطلوبة.'],
    },

    /**
     * المبلغ المُسوَّى فعلياً (يُحدَّد عند التأكيد).
     */
    settledAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * المعاملة المالية المرتبطة (CashTransaction).
     */
    settlementTransaction: {
      type: Schema.Types.ObjectId,
      ref: 'CashTransaction',
      default: null,
    },

    // ------------------------------------------------------------
    // الموافقة
    // ------------------------------------------------------------
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },

    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, default: '' },

    /**
     * ملاحظات.
     */
    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: [1000, 'الملاحظات طويلة جداً.'],
    },

    /**
     * من أنشأ المرتجع؟
     */
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * فهارس التقارير.
 */
customerReturnSchema.index({ pharmacy: 1, status: 1, returnDate: -1 });
customerReturnSchema.index({ originalInvoice: 1 });
customerReturnSchema.index({ status: 1, isWithinGracePeriod: 1 });

/**
 * قبل الحفظ: احسب isWithinGracePeriod آلياً.
 */
customerReturnSchema.pre('save', function preSave(next) {
  if (this.returnDate && this.invoiceDate) {
    const diffMs = this.returnDate.getTime() - this.invoiceDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    this.isWithinGracePeriod = diffDays <= (this.gracePeriodDays || 7);
  }
  next();
});

export const CustomerReturn = model('CustomerReturn', customerReturnSchema);

export default CustomerReturn;