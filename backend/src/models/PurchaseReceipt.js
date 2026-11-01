/**
 * @file PurchaseReceipt.js
 * @description
 * إيصال استلام البضاعة من المورّد إلى المخزن الرئيسي.
 *
 * لماذا هذا الملف؟
 * - الشركة تستورد الأدوية → يجب توثيق كل عملية استلام (كمية، سعر، دفعة، expiry).
 * - كل إيصال يُنشئ سجلات Stock جديدة (دفعات) عبر خدمة لاحقة.
 * - نحتفظ بحالة الاستلام (draft/received/cancelled) لتفادي تعديل استلامات مؤكَّدة.
 * - ندعم الشراء النقدي والآجل (paymentType).
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * حالات إيصال الاستلام.
 * @readonly
 * @enum {string}
 */
export const PURCHASE_STATUSES = Object.freeze({
  DRAFT: 'draft',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
});

/**
 * أنواع الدفع للمورّد.
 * @readonly
 * @enum {string}
 */
export const PURCHASE_PAYMENT_TYPES = Object.freeze({
  CASH: 'cash',
  CREDIT: 'credit',
  PARTIAL: 'partial',
});

/**
 * Schema عنصر في إيصال الاستلام.
 */
const purchaseItemSchema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    batch: { type: String, trim: true, uppercase: true, required: true },
    productionDate: { type: Date, default: null },
    expiry: { type: Date, required: true },
    quantity: { type: Number, required: true, min: 0.0001 },
    unit: { type: String, trim: true, default: '' },
    unitCost: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    location: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

/**
 * Schema الدفعة المقدّمة للمورّد.
 */
const purchaseInitialPaymentSchema = new Schema(
  {
    amount: { type: Number, default: 0, min: 0 },
    method: {
      type: String,
      enum: ['cash', 'bank', 'check'],
      default: 'cash',
    },
    checkId: { type: Schema.Types.ObjectId, ref: 'Check', default: null },
    paidAt: { type: Date, default: null },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

/**
 * Schema إيصال الاستلام.
 */
const purchaseReceiptSchema = new Schema(
  {
    /**
     * رقم الإيصال (فريد).
     */
    receiptNumber: {
      type: String,
      required: [true, 'رقم الإيصال مطلوب.'],
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
     * المخزن المستلم.
     */
    warehouse: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: [true, 'المخزن مطلوب.'],
      index: true,
    },

    /**
     * رقم فاتورة المورّد (اختياري).
     */
    supplierInvoiceNumber: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * تاريخ الاستلام.
     */
    receiptDate: {
      type: Date,
      default: Date.now,
      index: true,
    },

    /**
     * العناصر.
     */
    items: {
      type: [purchaseItemSchema],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'إيصال الاستلام يجب أن يحتوي على عنصر واحد على الأقل.',
      },
    },

    /**
     * المجموع الفرعي.
     */
    subtotal: { type: Number, default: 0, min: 0 },

    /**
     * خصم المورّد (إن وُجد).
     */
    discount: { type: Number, default: 0, min: 0 },

    /**
     * الضريبة.
     */
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    taxAmount: { type: Number, default: 0, min: 0 },

    /**
     * الإجمالي.
     */
    total: { type: Number, required: true, default: 0, min: 0 },

    /**
     * نوع الدفع.
     */
    paymentType: {
      type: String,
      enum: Object.values(PURCHASE_PAYMENT_TYPES),
      default: PURCHASE_PAYMENT_TYPES.CASH,
      index: true,
    },

    /**
     * الدفعة الأولى (عند CASH أو PARTIAL).
     */
    initialPayment: {
      type: purchaseInitialPaymentSchema,
      default: () => ({}),
    },

    /**
     * المدفوع فعلياً.
     */
    paidAmount: { type: Number, default: 0, min: 0 },

    /**
     * المتبقي.
     */
    remainingAmount: { type: Number, default: 0, min: 0 },

    /**
     * تاريخ الاستحقاق (عند الآجل).
     */
    dueDate: { type: Date, default: null, index: true },

    /**
     * الحالة.
     */
    status: {
      type: String,
      enum: Object.values(PURCHASE_STATUSES),
      default: PURCHASE_STATUSES.DRAFT,
      index: true,
    },

    /**
     * وقت الاستلام الفعلي (عند تأكيد الاستلام).
     */
    receivedAt: { type: Date, default: null },

    /**
     * من استلم البضاعة في المخزن؟
     */
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

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
     * من أنشأ الإيصال؟
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
purchaseReceiptSchema.index({ supplier: 1, status: 1, receiptDate: -1 });
purchaseReceiptSchema.index({ warehouse: 1, status: 1, receiptDate: -1 });
purchaseReceiptSchema.index({ status: 1, dueDate: 1 });

/**
 * قبل الحفظ: احسب المتبقي.
 */
purchaseReceiptSchema.pre('save', function preSave(next) {
  const total = this.total || 0;
  const paid = this.paidAmount || 0;
  this.remainingAmount = Math.max(0, total - paid);
  next();
});

export const PurchaseReceipt = model('PurchaseReceipt', purchaseReceiptSchema);

export default PurchaseReceipt;