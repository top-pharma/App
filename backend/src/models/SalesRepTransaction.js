/**
 * @file SalesRepTransaction.js
 * @description
 * حركة مالية للمندوب (عمولة، مصروف، بونص، سلفة، تسوية، راتب).
 *
 * لماذا هذا الملف؟
 * - متطلب: "المندوبون (عمولات + بونص متدرج + مصروفات + سلف)".
 * - كل حركة لها direction (credit = له، debit = عليه).
 * - balanceAfter يُحسب آلياً من الخدمة المالية.
 * - الحالة: pending → approved → paid أو cancelled.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * أنواع حركات المندوب.
 * @readonly
 * @enum {string}
 */
export const SALES_REP_TRANSACTION_TYPES = Object.freeze({
  COMMISSION: 'commission',
  EXPENSE: 'expense',
  BONUS: 'bonus',
  ADVANCE: 'advance',
  SETTLEMENT: 'settlement',
  SALARY: 'salary',
});

/**
 * الاتجاه.
 * @readonly
 * @enum {string}
 */
export const SALES_REP_DIRECTIONS = Object.freeze({
  CREDIT: 'credit', // له (يُزاد رصيده)
  DEBIT: 'debit', // عليه (يُخصم من رصيده)
});

/**
 * الحالة.
 * @readonly
 * @enum {string}
 */
export const SALES_REP_TRANSACTION_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  PAID: 'paid',
  CANCELLED: 'cancelled',
});

/**
 * Schema حركة المندوب.
 */
const salesRepTransactionSchema = new Schema(
  {
    /**
     * رقم الحركة الفريد.
     */
    transactionNumber: {
      type: String,
      required: [true, 'رقم الحركة مطلوب.'],
      unique: true,
      trim: true,
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
     * النوع.
     */
    type: {
      type: String,
      enum: Object.values(SALES_REP_TRANSACTION_TYPES),
      required: [true, 'نوع الحركة مطلوب.'],
      index: true,
    },

    /**
     * الاتجاه.
     */
    direction: {
      type: String,
      enum: Object.values(SALES_REP_DIRECTIONS),
      required: true,
      index: true,
    },

    /**
     * المبلغ.
     */
    amount: {
      type: Number,
      required: [true, 'المبلغ مطلوب.'],
      min: [0.0001, 'المبلغ يجب أن يكون أكبر من صفر.'],
    },

    /**
     * الرصيد بعد الحركة (يُحسب في الخدمة).
     */
    balanceAfter: {
      type: Number,
      default: 0,
    },

    /**
     * وصف مختصر.
     */
    description: {
      type: String,
      trim: true,
      required: [true, 'الوصف مطلوب.'],
      maxlength: [500, 'الوصف طويل جداً.'],
    },

    /**
     * السبب (اختياري).
     */
    reason: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * نوع المرجع (Invoice, Check, ...).
     */
    referenceType: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },

    /**
     * مُعرّف المرجع.
     */
    referenceId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    /**
     * تاريخ الحركة.
     */
    transactionDate: {
      type: Date,
      default: Date.now,
      index: true,
    },

    /**
     * الحالة.
     */
    status: {
      type: String,
      enum: Object.values(SALES_REP_TRANSACTION_STATUSES),
      default: SALES_REP_TRANSACTION_STATUSES.PENDING,
      index: true,
    },

    /**
     * الموافقة.
     */
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },

    /**
     * الدفع.
     */
    paidAt: { type: Date, default: null },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    paymentTransaction: {
      type: Schema.Types.ObjectId,
      ref: 'CashTransaction',
      default: null,
    },

    /**
     * الإلغاء.
     */
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cancelReason: { type: String, trim: true, default: '' },

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
     * من أنشأ الحركة؟
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
salesRepTransactionSchema.index({ salesRep: 1, status: 1, transactionDate: -1 });
salesRepTransactionSchema.index({ type: 1, status: 1, transactionDate: -1 });
salesRepTransactionSchema.index({ referenceType: 1, referenceId: 1 });

export const SalesRepTransaction = model(
  'SalesRepTransaction',
  salesRepTransactionSchema
);

export default SalesRepTransaction;