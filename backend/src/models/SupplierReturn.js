/**
 * @file SupplierReturn.js
 * @description
 * مرتجع للمورّد — عند إرجاع أدوية تالفة أو قريبة الانتهاء للمورّد.
 *
 * لماذا هذا الملف؟
 * - الشركة قد تُرجع أدوية للمورّد (تالف، خطأ طلب، قريب الانتهاء).
 * - يُسجَّل المرتجع لتقارير "مرتجعات الموردين".
 * - المبلغ يُخصم من رصيد المورّد أو يُستبدل ببضاعة (اختياري).
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * أسباب مرتجع المورّد.
 * @readonly
 * @enum {string}
 */
export const SUPPLIER_RETURN_REASONS = Object.freeze({
  DAMAGED: 'damaged',
  NEAR_EXPIRY: 'near_expiry',
  WRONG_ORDER: 'wrong_order',
  QUALITY_ISSUE: 'quality_issue',
  OTHER: 'other',
});

/**
 * حالات مرتجع المورّد.
 * @readonly
 * @enum {string}
 */
export const SUPPLIER_RETURN_STATUSES = Object.freeze({
  DRAFT: 'draft',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
});

/**
 * طرق التسوية مع المورّد.
 * @readonly
 * @enum {string}
 */
export const SUPPLIER_SETTLEMENT_TYPES = Object.freeze({
  CREDIT_NOTE: 'credit_note', // إشعار دائن يخصم من الرصيد
  REPLACEMENT: 'replacement', // استبدال ببضاعة
  CASH_REFUND: 'cash_refund', // استرداد نقدي
});

/**
 * Schema عنصر مرتجع المورّد.
 */
const supplierReturnItemSchema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    batch: { type: String, trim: true, uppercase: true, required: true },
    expiry: { type: Date, default: null },
    quantity: { type: Number, required: true, min: 0.0001 },
    unit: { type: String, trim: true, default: '' },
    unitCost: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    reason: {
      type: String,
      enum: Object.values(SUPPLIER_RETURN_REASONS),
      required: true,
    },
    note: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

/**
 * Schema مرتجع المورّد.
 */
const supplierReturnSchema = new Schema(
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
     * المورّد.
     */
    supplier: {
      type: Schema.Types.ObjectId,
      ref: 'Supplier',
      required: [true, 'المورّد مطلوب.'],
      index: true,
    },

    /**
     * إيصال الاستلام الأصلي (اختياري).
     */
    purchaseReceipt: {
      type: Schema.Types.ObjectId,
      ref: 'PurchaseReceipt',
      default: null,
    },

    /**
     * العناصر.
     */
    items: {
      type: [supplierReturnItemSchema],
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

    /**
     * تاريخ المرتجع.
     */
    returnDate: {
      type: Date,
      default: Date.now,
      index: true,
    },

    /**
     * الحالة.
     */
    status: {
      type: String,
      enum: Object.values(SUPPLIER_RETURN_STATUSES),
      default: SUPPLIER_RETURN_STATUSES.DRAFT,
      index: true,
    },

    /**
     * طريقة التسوية.
     */
    settlementType: {
      type: String,
      enum: Object.values(SUPPLIER_SETTLEMENT_TYPES),
      default: SUPPLIER_SETTLEMENT_TYPES.CREDIT_NOTE,
    },

    /**
     * المبلغ المُسوَّى فعلياً.
     */
    settledAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * تاريخ التسوية.
     */
    settledAt: {
      type: Date,
      default: null,
    },

    /**
     * مرجع الاستبدال (إن وُجد).
     */
    replacementReference: {
      type: String,
      trim: true,
      default: '',
    },

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
supplierReturnSchema.index({ supplier: 1, status: 1, returnDate: -1 });
supplierReturnSchema.index({ status: 1, returnDate: -1 });

export const SupplierReturn = model('SupplierReturn', supplierReturnSchema);

export default SupplierReturn;