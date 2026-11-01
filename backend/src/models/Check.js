/**
 * Check.js — النسخة المبسطة
 *
 * الحالات:
 *  pending → (settle) → paid
 *          → (cancel) → cancelled
 *  paid    → (bounce) → bounced
 *
 * ملاحظة: لا يوجد collected بعد الآن.
 */

import mongoose from 'mongoose';

export const CHECK_STATUSES = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  BOUNCED: 'bounced',
  CANCELLED: 'cancelled',
});

const checkSchema = new mongoose.Schema(
  {
    // ─── معلومات الشيك الأساسية ───
    type: {
      type: String,
      enum: ['incoming', 'outgoing'],
      required: [true, 'نوع الشيك مطلوب'],
      index: true,
    },
    checkNumber: {
      type: String,
      required: [true, 'رقم الشيك مطلوب'],
      trim: true,
      maxlength: [50, 'رقم الشيك طويل جداً'],
    },
    bankName: {
      type: String,
      required: [true, 'اسم البنك مطلوب'],
      trim: true,
      maxlength: [100, 'اسم البنك طويل جداً'],
    },
    amount: {
      type: Number,
      required: [true, 'المبلغ مطلوب'],
      min: [0.01, 'المبلغ يجب أن يكون أكبر من صفر'],
    },
    issueDate: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: [true, 'تاريخ الاستحقاق مطلوب'],
      index: true,
    },

    // ─── الأطراف ───
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      default: null,
      index: true,
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
    },

    // ─── الحالة ───
    status: {
      type: String,
      enum: ['pending', 'paid', 'bounced', 'cancelled'],
      default: 'pending',
      index: true,
    },

    // ─── الصرف (settle) ───
    paidAt: {
      type: Date,
      default: null,
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank', null],
      default: null,
    },
    cashFundId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CashFund',
      default: null,
    },
    bankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankAccount',
      default: null,
    },
    cashTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CashTransaction',
      default: null,
    },

    // ─── الارتداد (bounce) ───
    bouncedAt: {
      type: Date,
      default: null,
    },
    bouncedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    bounceReason: {
      type: String,
      trim: true,
      maxlength: [500, 'سبب الارتداد طويل جداً'],
      default: null,
    },

    // ─── الإلغاء (cancel) ───
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    cancelReason: {
      type: String,
      trim: true,
      maxlength: [500, 'سبب الإلغاء طويل جداً'],
      default: null,
    },

    // ─── عام ───
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'الملاحظات طويلة جداً'],
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ─── فهارس مفيدة ───
checkSchema.index({ checkNumber: 1, bankName: 1 }, { unique: true });
checkSchema.index({ status: 1, dueDate: 1 });
checkSchema.index({ type: 1, status: 1 });

// ─── Virtual: هل الشيك متأخر؟ ───
checkSchema.virtual('isOverdue').get(function () {
  return this.status === 'pending' && this.dueDate < new Date();
});

// ─── Virtual: الأيام المتبقية للاستحقاق ───
checkSchema.virtual('daysUntilDue').get(function () {
  if (!this.dueDate) return null;
  const diff = this.dueDate.getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
});

checkSchema.set('toJSON', { virtuals: true });
checkSchema.set('toObject', { virtuals: true });

export const Check = mongoose.model('Check', checkSchema);

export default Check;