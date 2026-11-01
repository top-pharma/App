/**
 * @file DeliveryNote.js
 * @description
 * إيصال التسليم — يوثّق خروج الأدوية من المخزن إلى الصيدلية.
 *
 * لماذا هذا الملف؟
 * - إيصال التسليم سابق للفاتورة (قد تُؤجَّل الفاتورة قليلاً).
 * - نحتفظ فيه بدفعة أولى (initialPayment) لأن المندوب قد يقبض نقداً.
 * - ندعم التوقيع كصورة (base64) أو اسم المستلم.
 * - يحمل رقم الإيصال + قائمة الفواتير الناتجة عنه (قد تكون أكثر من فاتورة).
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * حالة إيصال التسليم.
 * @readonly
 * @enum {string}
 */
export const DELIVERY_STATUSES = Object.freeze({
  PENDING: 'pending',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  RETURNED: 'returned',
});

/**
 * خطة الدفع.
 * @readonly
 * @enum {string}
 */
export const PAYMENT_PLANS = Object.freeze({
  CASH: 'cash',
  CREDIT: 'credit',
  INSTALLMENTS: 'installments',
});

/**
 * طرق الدفع في الدفعة الأولى.
 * @readonly
 * @enum {string}
 */
export const INITIAL_PAYMENT_METHODS = Object.freeze({
  CASH: 'cash',
  BANK: 'bank',
  CHECK: 'check',
});

/**
 * Schema عنصر إيصال التسليم.
 */
const deliveryItemSchema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    batch: { type: String, trim: true, uppercase: true, required: true },
    expiry: { type: Date, default: null },
    quantity: { type: Number, required: true, min: 0.0001 },
    unit: { type: String, trim: true, default: '' },
    unitPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

/**
 * Schema الدفعة الأولى.
 */
const initialPaymentSubSchema = new Schema(
  {
    amount: { type: Number, default: 0, min: 0 },
    paymentMethod: {
      type: String,
      enum: Object.values(INITIAL_PAYMENT_METHODS),
      default: INITIAL_PAYMENT_METHODS.CASH,
    },
    checkId: { type: Schema.Types.ObjectId, ref: 'Check', default: null },
    receivedAt: { type: Date, default: null },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

/**
 * Schema إيصال التسليم.
 */
const deliveryNoteSchema = new Schema(
  {
    /**
     * رقم الإيصال (فريد).
     */
    deliveryNumber: {
      type: String,
      required: [true, 'رقم الإيصال مطلوب.'],
      unique: true,
      trim: true,
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
     * المندوب.
     */
    salesRep: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'المندوب مطلوب.'],
      index: true,
    },

    /**
     * المخزن الذي خرجت منه البضاعة.
     */
    warehouse: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: [true, 'المخزن مطلوب.'],
    },

    /**
     * تاريخ الإيصال.
     */
    deliveryDate: {
      type: Date,
      default: Date.now,
      index: true,
    },

    /**
     * العناصر.
     */
    items: {
      type: [deliveryItemSchema],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'إيصال التسليم يجب أن يحتوي على عنصر واحد على الأقل.',
      },
    },

    /**
     * إجمالي القيمة.
     */
    totalAmount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    /**
     * الدفعة الأولى (نقداً/بنكاً/شيكاً).
     */
    initialPayment: {
      type: initialPaymentSubSchema,
      default: () => ({}),
    },

    /**
     * المتبقي بعد الدفعة الأولى.
     */
    remainingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * الفواتير الناتجة عن هذا الإيصال.
     */
    invoices: {
      type: [Schema.Types.ObjectId],
      ref: 'Invoice',
      default: [],
    },

    /**
     * خطة الدفع المتفق عليها.
     */
    paymentPlan: {
      type: String,
      enum: Object.values(PAYMENT_PLANS),
      default: PAYMENT_PLANS.CASH,
    },

    /**
     * حالة الإيصال.
     */
    status: {
      type: String,
      enum: Object.values(DELIVERY_STATUSES),
      default: DELIVERY_STATUSES.PENDING,
      index: true,
    },

    /**
     * وقت التسليم الفعلي.
     */
    deliveredAt: {
      type: Date,
      default: null,
    },

    /**
     * اسم المستلم في الصيدلية.
     */
    receivedBy: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * توقيع المستلم (base64 أو بيانات).
     */
    signature: {
      type: String,
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
deliveryNoteSchema.index({ salesRep: 1, status: 1, deliveryDate: -1 });
deliveryNoteSchema.index({ pharmacy: 1, status: 1, deliveryDate: -1 });
deliveryNoteSchema.index({ warehouse: 1, deliveryDate: -1 });

/**
 * تعليم الإيصال كمُسلَّم.
 * @param {Object} params
 * @param {string} params.receivedBy
 * @param {string} [params.signature]
 * @returns {void}
 */
deliveryNoteSchema.methods.markDelivered = function markDelivered({ receivedBy, signature }) {
  this.status = DELIVERY_STATUSES.DELIVERED;
  this.deliveredAt = new Date();
  if (receivedBy) {
    this.receivedBy = receivedBy;
  }
  if (signature) {
    this.signature = signature;
  }
};

export const DeliveryNote = model('DeliveryNote', deliveryNoteSchema);

export default DeliveryNote;