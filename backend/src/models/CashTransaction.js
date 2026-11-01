/**
 * @file CashTransaction.js
 * @description
 * نموذج الحركة النقدية (CashTransaction).
 *
 * لماذا هذا الملف؟
 * - كل حركة نقدية في النظام (فاتورة، مرتجع، مشتريات، شيك، تحويل، مصروف) تُسجَّل هنا.
 * - الحركة مرتبطة بصندوق نقدي (method='cash') أو حساب بنكي (method='bank').
 * - method='check' لا يُحدّث أي رصيد (الشيك لا يؤثر حتى يُصرف — Phase 3 simplified).
 * - كل حركة لها قيد محاسبي مقابل (AccountingEntry) — يُنشأ تلقائياً.
 * - الحركات immutable: للتصحيح، نُنشئ حركة عكسية (isReversed + reversedBy).
 *
 * المبادئ:
 *  - direction: in (دخل) | out (خرج)
 *  - amount موجب دائماً — الاتجاه يحدد + أو -
 *  - لا نسمح بحركة بلا صندوق (cash) ولا بنك (bank)
 *  - referenceType + referenceId يربطها بمصدرها (Invoice, Check, PurchaseReceipt, ...)
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * أنواع المراجع المدعومة.
 * تُستخدم في createEntryForTransaction في cashService.
 */
export const CASH_TRANSACTION_REFERENCE_TYPES = Object.freeze([
  'manual',            // حركة يدوية (إيداع/سحب)
  'invoice',           // دفعة على فاتورة
  'delivery_note',     // دفعة أولى في إيصال تسليم
  'customer_return',   // رد نقدي لمرتجع عميل
  'purchase',          // دفعة على مشتريات
  'supplier_return',   // استرداد من مرتجع مورد
  'check',             // صرف/تحصيل شيك
  'transfer',          // تحويل بين صناديق
  'expense',           // مصروف
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
    /**
     * الصندوق النقدي (method='cash').
     * مطلوب إذا method='cash'.
     */
    cashFundId: {
      type: Schema.Types.ObjectId,
      ref: 'CashFund',
      default: null,
      index: true,
    },

    /**
     * الحساب البنكي (method='bank').
     * مطلوب إذا method='bank'.
     */
    bankAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'BankAccount',
      default: null,
      index: true,
    },

    /**
     * اتجاه الحركة.
     * in  = دخل (صندوق/بنك يزيد)
     * out = خرج (صندوق/بنك ينقص)
     */
    direction: {
      type: String,
      enum: {
        values: ['in', 'out'],
        message: 'الاتجاه يجب أن يكون in أو out.',
      },
      required: [true, 'اتجاه الحركة مطلوب.'],
      index: true,
    },

    /**
     * المبلغ — موجب دائماً.
     */
    amount: {
      type: Number,
      required: [true, 'المبلغ مطلوب.'],
      min: [0.01, 'المبلغ يجب أن يكون أكبر من صفر.'],
    },

    /**
     * طريقة الدفع.
     * cash  → يُحدّث CashFund
     * bank  → يُحدّث BankAccount
     * check → لا يُحدّث أي رصيد (الشيك يُعالَج لاحقاً عند الصرف)
     */
    method: {
      type: String,
      enum: {
        values: ['cash', 'bank', 'check'],
        message: 'طريقة الدفع يجب أن تكون cash أو bank أو check.',
      },
      default: 'cash',
      required: true,
      index: true,
    },

    /**
     * تاريخ الحركة (قد يختلف عن createdAt).
     */
    transactionDate: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },

    /**
     * وصف الحركة.
     */
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'الوصف طويل جداً.'],
      default: '',
    },

    /**
     * نوع المصدر (invoice, customer_return, ...).
     */
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

    /**
     * معرّف المصدر (ObjectId للفاتورة/الشيك/... إن وُجد).
     */
    referenceId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    /**
     * هل عُكست الحركة؟
     */
    isReversed: {
      type: Boolean,
      default: false,
      index: true,
    },

    /**
     * معرّف الحركة العكسية (إن عُكست).
     */
    reversedBy: {
      type: Schema.Types.ObjectId,
      ref: 'CashTransaction',
      default: null,
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

/* ─────────────────────────────────────────────────────────────
 * الفهارس
 * ───────────────────────────────────────────────────────────── */

// للبحث عن حركات صندوق محدد بترتيب زمني
cashTransactionSchema.index({ cashFundId: 1, transactionDate: -1 });

// للبحث عن حركات بنك محدد
cashTransactionSchema.index({ bankAccountId: 1, transactionDate: -1 });

// للبحث عن حركة مرتبطة بمصدر (منع التكرار/المراجعة)
cashTransactionSchema.index({ referenceType: 1, referenceId: 1 });

// لتقارير الفترة
cashTransactionSchema.index({ transactionDate: -1, method: 1, direction: 1 });

// لاستثناء المُعكسة
cashTransactionSchema.index({ isReversed: 1, transactionDate: -1 });

/* ─────────────────────────────────────────────────────────────
 * Validators
 * ───────────────────────────────────────────────────────────── */

/**
 * التحقق من وجود الصندوق أو البنك حسب method.
 */
cashTransactionSchema.pre('validate', function validateTarget(next) {
  if (this.method === 'cash' && !this.cashFundId) {
    return next(new Error('الصندوق (cashFundId) مطلوب عند method=cash.'));
  }
  if (this.method === 'bank' && !this.bankAccountId) {
    return next(new Error('الحساب البنكي (bankAccountId) مطلوب عند method=bank.'));
  }
  // في method='check'، لا نطلب أياً منهما (الشيك يُعالَج لاحقاً)
  next();
});

/* ─────────────────────────────────────────────────────────────
 * Virtuals
 * ───────────────────────────────────────────────────────────── */

/**
 * المبلغ المُوقَّع (+ للدخل، - للخرج).
 */
cashTransactionSchema.virtual('signedAmount').get(function signedAmount() {
  return this.direction === 'in' ? this.amount : -this.amount;
});

/**
 * الهدف (صندوق أو بنك).
 */
cashTransactionSchema.virtual('targetType').get(function targetType() {
  return this.method === 'cash' ? 'CashFund' : this.method === 'bank' ? 'BankAccount' : 'Check';
});

// تفعيل virtuals في toJSON / toObject
cashTransactionSchema.set('toJSON', { virtuals: true });
cashTransactionSchema.set('toObject', { virtuals: true });

export const CashTransaction = model('CashTransaction', cashTransactionSchema);

export default CashTransaction;