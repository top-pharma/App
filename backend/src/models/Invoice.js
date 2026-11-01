/**
 * @file Invoice.js
 * @description
 * نموذج فاتورة البيع للصيدلية — Phase 2.5 (مع المسودات).
 *
 * لماذا هذا الملف؟
 * - البونص مرن (نسبة / مبلغ ثابت / أصناف مجانية).
 * - يدعم draft (مسودة) — لا تأثير على المخزون/المال حتى الاعتماد.
 * - يحتفظ بحقل warehouse (يُستخدم في FEFO + التحقق المسبق).
 * - commission داخل الفاتورة (لتقارير المناديب).
 * - reminders (للتنبيهات).
 * - finalizedBy + finalizedAt (لتتبع من اعتمد).
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * طرق الدفع.
 * @readonly
 * @enum {string}
 */
export const PAYMENT_TYPES = Object.freeze({
  CASH: 'cash',
  CREDIT: 'credit',
  INSTALLMENTS: 'installments',
});

/**
 * حالات الفاتورة.
 * @readonly
 * @enum {string}
 */
export const INVOICE_STATUSES = Object.freeze({
  DRAFT: 'draft',
  PENDING: 'pending',
  PAID: 'paid',
  PARTIAL: 'partial',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
});

/**
 * أنواع البونص.
 * @readonly
 * @enum {string}
 */
export const DISCOUNT_TYPES = Object.freeze({
  PERCENTAGE: 'percentage',
  FIXED: 'fixed',
  FREE_ITEMS: 'free_items',
});

/**
 * Schema عنصر داخل الفاتورة.
 */
const invoiceItemSchema = new Schema(
  {
    item: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
    },
    batch: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
    },
    expiry: {
      type: Date,
      default: null,
    },
    quantity: {
      type: Number,
      required: true,
      min: [0.0001, 'الكمية يجب أن تكون أكبر من صفر.'],
    },
    unit: {
      type: String,
      trim: true,
      default: '',
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    unitCost: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

/**
 * Schema صنف مجاني.
 */
const freeItemSchema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    batch: { type: String, trim: true, uppercase: true, default: '' },
    quantity: { type: Number, required: true, min: 0.0001 },
    reason: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

/**
 * Schema العمولة.
 */
const commissionSubSchema = new Schema(
  {
    rate: { type: Number, default: 0, min: 0 },
    amount: { type: Number, default: 0, min: 0 },
    isPaid: { type: Boolean, default: false },
    paidAt: { type: Date, default: null },
    transactionId: { type: Schema.Types.ObjectId, ref: 'SalesRepTransaction', default: null },
  },
  { _id: false }
);

/**
 * Schema التذكيرات.
 */
const remindersSubSchema = new Schema(
  {
    beforeDue: { type: Boolean, default: false },
    onDue: { type: Boolean, default: false },
    afterDue: { type: Boolean, default: false },
    overdueCount: { type: Number, default: 0, min: 0 },
    lastReminderAt: { type: Date, default: null },
  },
  { _id: false }
);

/**
 * Schema الفاتورة.
 */
const invoiceSchema = new Schema(
  {
    /**
     * رقم الفاتورة (فريد — immutable).
     */
    invoiceNumber: {
      type: String,
      required: [true, 'رقم الفاتورة مطلوب.'],
      unique: true,
      trim: true,
      index: true,
      immutable: true,
    },

    /**
     * إيصال التسليم المرتبط (اختياري).
     */
    deliveryNote: {
      type: Schema.Types.ObjectId,
      ref: 'DeliveryNote',
      default: null,
      index: true,
    },

    /**
     * الصيدلية (العميل).
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
     * ✅ المخزن الذي ستُخصم منه الدفعات (Phase 2.5).
     * - في المسودة: مطلوب للتحقق المسبق من كفاية المخزون.
     * - عند الاعتماد: يُستخدم لخصم Stock.
     * - في الفواتير القديمة: null (توافق).
     */
    warehouse: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      default: null,
      index: true,
    },

    /**
     * تاريخ الفاتورة.
     */
    invoiceDate: {
      type: Date,
      default: Date.now,
      index: true,
    },

    /**
     * عناصر الفاتورة.
     */
    items: {
      type: [invoiceItemSchema],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'الفاتورة يجب أن تحتوي على عنصر واحد على الأقل.',
      },
    },

    subtotal: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    discount: {
      type: {
        type: String,
        enum: Object.values(DISCOUNT_TYPES),
        default: null,
      },
      value: { type: Number, default: 0, min: 0 },
      reason: { type: String, trim: true, default: '' },
      approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      approvedAt: { type: Date, default: null },
      computedAmount: { type: Number, default: 0, min: 0 },
      freeItems: { type: [freeItemSchema], default: [] },
    },

    taxRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    total: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    /**
     * نوع الدفع — قد يكون null في المسودة.
     */
    paymentType: {
      type: String,
      enum: [...Object.values(PAYMENT_TYPES), null],
      default: null,
      index: true,
    },

    dueDate: {
      type: Date,
      default: null,
      index: true,
    },

    installmentNumber: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalInstallments: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: Object.values(INVOICE_STATUSES),
      default: INVOICE_STATUSES.DRAFT,
      index: true,
    },

    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    remainingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    paymentMethod: {
      type: String,
      trim: true,
      default: '',
    },

    commission: {
      type: commissionSubSchema,
      default: () => ({}),
    },

    reminders: {
      type: remindersSubSchema,
      default: () => ({}),
    },

    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cancelReason: { type: String, trim: true, default: '' },

    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: [1000, 'الملاحظات طويلة جداً.'],
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    /**
     * ✅ Phase 2.5 — من اعتمد المسودة؟
     */
    finalizedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    finalizedAt: {
      type: Date,
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
invoiceSchema.index({ pharmacy: 1, status: 1, invoiceDate: -1 });
invoiceSchema.index({ salesRep: 1, status: 1, invoiceDate: -1 });
invoiceSchema.index({ status: 1, dueDate: 1 });
invoiceSchema.index({ status: 1, invoiceDate: -1 });
invoiceSchema.index({ paymentType: 1, status: 1 });
invoiceSchema.index({ warehouse: 1, status: 1 });

/**
 * إعادة حساب الحالة.
 * ⚠️ يستثني draft و cancelled.
 */
invoiceSchema.methods.recalculateStatus = function recalculateStatus() {
  if (
    this.status === INVOICE_STATUSES.DRAFT ||
    this.status === INVOICE_STATUSES.CANCELLED
  ) {
    return;
  }

  this.remainingAmount = Math.max(0, (this.total || 0) - (this.paidAmount || 0));

  if (this.remainingAmount <= 0) {
    this.status = INVOICE_STATUSES.PAID;
    if (!this.paidAt) {
      this.paidAt = new Date();
    }
    return;
  }

  if (this.paidAmount > 0) {
    this.status = INVOICE_STATUSES.PARTIAL;
    return;
  }

  if (this.dueDate && this.dueDate.getTime() < Date.now()) {
    this.status = INVOICE_STATUSES.OVERDUE;
    return;
  }

  this.status = INVOICE_STATUSES.PENDING;
};

/**
 * pre-save: يُعيد الحساب فقط لغير المسودات.
 */
invoiceSchema.pre('save', function preSave(next) {
  if (this.status === INVOICE_STATUSES.DRAFT) {
    return next();
  }

  if (
    this.isModified('paidAmount') ||
    this.isModified('total') ||
    this.isModified('dueDate') ||
    this.isModified('status')
  ) {
    this.recalculateStatus();
  }
  return next();
});

/**
 * تسجيل دفعة (يرفض المسودات).
 */
invoiceSchema.methods.registerPayment = function registerPayment(amount) {
  if (this.status === INVOICE_STATUSES.DRAFT) {
    throw new Error('لا يمكن تسجيل دفعة على مسودة. يجب اعتماد الفاتورة أولاً.');
  }
  if (typeof amount !== 'number' || amount <= 0) {
    return;
  }
  this.paidAmount = (this.paidAmount || 0) + amount;
  this.recalculateStatus();
};

/**
 * هل الفاتورة مسودة؟
 */
invoiceSchema.methods.isDraft = function isDraft() {
  return this.status === INVOICE_STATUSES.DRAFT;
};

export const Invoice = model('Invoice', invoiceSchema);

export default Invoice;