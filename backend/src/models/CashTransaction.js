/**
 * @file CashTransaction.js
 * @description
 * نموذج الحركة النقدية (CashTransaction).
 *
 * ✅ v10.10 (2026-11-16):
 * - إضافة 'sales_rep_transaction' إلى CASH_TRANSACTION_REFERENCE_TYPES.
 *   (لدفع/استلام حركات المناديب).
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * أنواع المراجع المدعومة.
 */
export const CASH_TRANSACTION_REFERENCE_TYPES = Object.freeze([
  'manual',                  // حركة يدوية (إيداع/سحب)
  'invoice',                 // دفعة على فاتورة
  'customer_return',         // رد نقدي لمرتجع عميل
  'purchase',                // دفعة على مشتريات
  'supplier_return',         // استرداد من مرتجع مورد
  'transfer',                // تحويل بين صناديق
  'expense',                 // مصروف
  'sales_rep_transaction',   // ✅ v10.10 — دفع/استلام حركة مندوب
]);

export const CASH_DIRECTIONS = Object.freeze({
  IN: 'in',
  OUT: 'out',
});

/**
 * Schema الحركة النقدية.
 */
const cashTransactionSchema = new Schema(
  {
    cashFundId: {
      type: Schema.Types.ObjectId,
      ref: 'CashFund',
      default: null,
      index: true,
    },

    bankAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'BankAccount',
      default: null,
      index: true,
    },

    direction: {
      type: String,
      enum: {
        values: ['in', 'out'],
        message: 'الاتجاه يجب أن يكون in أو out.',
      },
      required: [true, 'اتجاه الحركة مطلوب.'],
      index: true,
    },

    amount: {
      type: Number,
      required: [true, 'المبلغ مطلوب.'],
      min: [0.01, 'المبلغ يجب أن يكون أكبر من صفر.'],
    },

    method: {
      type: String,
      enum: {
        values: ['cash', 'bank'],
        message: 'طريقة الدفع يجب أن تكون cash أو bank.',
      },
      default: 'cash',
      required: true,
      index: true,
    },

    transactionDate: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, 'الوصف طويل جداً.'],
      default: '',
    },

    referenceType: {
      type: String,
      enum: {
        values: CASH_TRANSACTION_REFERENCE_TYPES,
        message: 'نوع المرجع غير صحيح.',
      },
      default: 'manual',
      required: true,
      index: true,
    },

    referenceId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    isReversed: {
      type: Boolean,
      default: false,
      index: true,
    },

    reversedBy: {
      type: Schema.Types.ObjectId,
      ref: 'CashTransaction',
      default: null,
    },

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

/* ─────────────────────────────────────────────────────────────
 * الفهارس
 * ───────────────────────────────────────────────────────────── */
cashTransactionSchema.index({ cashFundId: 1, transactionDate: -1 });
cashTransactionSchema.index({ bankAccountId: 1, transactionDate: -1 });
cashTransactionSchema.index({ referenceType: 1, referenceId: 1 });
cashTransactionSchema.index({ transactionDate: -1, method: 1, direction: 1 });
cashTransactionSchema.index({ isReversed: 1, transactionDate: -1 });

/* ─────────────────────────────────────────────────────────────
 * Validators
 * ───────────────────────────────────────────────────────────── */
cashTransactionSchema.pre('validate', function validateTarget(next) {
  if (this.method === 'cash' && !this.cashFundId) {
    return next(new Error('الصندوق (cashFundId) مطلوب عند method=cash.'));
  }
  if (this.method === 'bank' && !this.bankAccountId) {
    return next(new Error('الحساب البنكي (bankAccountId) مطلوب عند method=bank.'));
  }
  next();
});

/* ─────────────────────────────────────────────────────────────
 * Virtuals
 * ───────────────────────────────────────────────────────────── */
cashTransactionSchema.virtual('signedAmount').get(function signedAmount() {
  return this.direction === 'in' ? this.amount : -this.amount;
});

cashTransactionSchema.virtual('targetType').get(function targetType() {
  return this.method === 'cash' ? 'CashFund' : 'BankAccount';
});

cashTransactionSchema.set('toJSON', { virtuals: true });
cashTransactionSchema.set('toObject', { virtuals: true });

export const CashTransaction = model('CashTransaction', cashTransactionSchema);

export default CashTransaction;