/**
 * @file AccountingEntry.js
 * @description
 * نموذج القيد المحاسبي (AccountingEntry) — Double-entry bookkeeping.
 *
 * لماذا هذا الملف؟
 * - كل عملية مالية تُنشئ قيداً: مدين = دائن (توازن إلزامي).
 * - القيود immutable: للتصحيح، نُنشئ قيداً عكسياً (reverseEntry).
 * - نُخزّن snapshot من أكواد/أسماء الحسابات في lines[] (history آمن).
 * - sourceType + sourceId يربط القيد بمصدره (Invoice, Check, CashTransaction, ...).
 * - entryNumber فريد بالتنسيق: JE-YYYYMM-000001.
 *
 * أنواع القيود:
 *  - SALE_CASH, SALE_CREDIT, SALE_RETURN
 *  - CUSTOMER_PAYMENT
 *  - PURCHASE, PURCHASE_RETURN
 *  - CHECK_RECEIVED, CHECK_COLLECTED, CHECK_BOUNCED, CHECK_ISSUED, CHECK_PAID
 *  - CASH_TRANSFER, CASH_DEPOSIT, CASH_WITHDRAWAL
 *  - EXPENSE, OPENING, ADJUSTMENT
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * أنواع القيود المدعومة.
 */
export const ACCOUNTING_ENTRY_TYPES = Object.freeze([
  'SALE_CASH',
  'SALE_CREDIT',
  'SALE_RETURN',
  'CUSTOMER_PAYMENT',
  'PURCHASE',
  'PURCHASE_RETURN',
  'CHECK_RECEIVED',
  'CHECK_COLLECTED',
  'CHECK_BOUNCED',
  'CHECK_ISSUED',
  'CHECK_PAID',
  'CASH_TRANSFER',
  'CASH_DEPOSIT',
  'CASH_WITHDRAWAL',
  'EXPENSE',
  'OPENING',
  'ADJUSTMENT',
]);

/**
 * Schema سطر واحد في القيد.
 * كل سطر: إما مدين (debit > 0) أو دائن (credit > 0)، وليس الاثنين.
 */
const entryLineSchema = new Schema(
  {
    accountCode: {
      type: String,
      required: [true, 'كود الحساب مطلوب.'],
      trim: true,
    },
    accountName: {
      type: String,
      required: [true, 'اسم الحساب مطلوب.'],
      trim: true,
    },
    debit: {
      type: Number,
      default: 0,
      min: [0, 'المدين لا يمكن أن يكون سالباً.'],
    },
    credit: {
      type: Number,
      default: 0,
      min: [0, 'الدائن لا يمكن أن يكون سالباً.'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [300, 'الوصف طويل جداً.'],
    },
  },
  { _id: false }
);

/**
 * Schema القيد المحاسبي.
 */
const accountingEntrySchema = new Schema(
  {
    /**
     * رقم القيد الفريد: JE-YYYYMM-000001.
     */
    entryNumber: {
      type: String,
      required: [true, 'رقم القيد مطلوب.'],
      unique: true,
      trim: true,
      index: true,
    },

    /**
     * تاريخ القيد.
     */
    entryDate: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },

    /**
     * نوع القيد (SALE_CASH, CHECK_PAID, ...).
     */
    entryType: {
      type: String,
      enum: {
        values: ACCOUNTING_ENTRY_TYPES,
        message: 'نوع القيد غير صحيح.',
      },
      required: [true, 'نوع القيد مطلوب.'],
      index: true,
    },

    /**
     * وصف القيد.
     */
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'الوصف طويل جداً.'],
      default: '',
    },

    /**
     * السطور (مدين + دائن).
     */
    lines: {
      type: [entryLineSchema],
      validate: {
        validator: function validateLines(lines) {
          return Array.isArray(lines) && lines.length >= 2;
        },
        message: 'القيد يحتاج سطرين على الأقل (مدين + دائن).',
      },
    },

    /**
     * إجمالي المدين (يُحسب تلقائياً في pre-save).
     */
    totalDebit: {
      type: Number,
      default: 0,
      min: [0, 'الإجمالي لا يمكن أن يكون سالباً.'],
    },

    /**
     * إجمالي الدائن (يُحسب تلقائياً في pre-save).
     */
    totalCredit: {
      type: Number,
      default: 0,
      min: [0, 'الإجمالي لا يمكن أن يكون سالباً.'],
    },

    /**
     * نوع المصدر (Invoice, Check, CashTransaction, ...).
     */
    sourceType: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    /**
     * معرّف المصدر.
     */
    sourceId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    /**
     * الصندوق المرتبط (إن وُجد).
     */
    cashFundId: {
      type: Schema.Types.ObjectId,
      ref: 'CashFund',
      default: null,
      index: true,
    },

    /**
     * البنك المرتبط (إن وُجد).
     */
    bankAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'BankAccount',
      default: null,
      index: true,
    },

    /**
     * من أنشأ القيد؟
     */
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    /**
     * هل عُكس القيد؟
     */
    isReversed: {
      type: Boolean,
      default: false,
      index: true,
    },

    /**
     * معرّف القيد العكسي (إن عُكس).
     */
    reversedBy: {
      type: Schema.Types.ObjectId,
      ref: 'AccountingEntry',
      default: null,
    },

    /**
     * بيانات إضافية (before/after، overrideReason، reversesEntryId، ...).
     */
    meta: {
      type: Schema.Types.Mixed,
      default: {},
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

// للبحث بمصدر (منع تكرار القيد)
accountingEntrySchema.index({ sourceType: 1, sourceId: 1, entryType: 1 });

// لتقارير الفترة
accountingEntrySchema.index({ entryDate: -1, entryType: 1 });

// للبحث بالصندوق/البنك
accountingEntrySchema.index({ cashFundId: 1, entryDate: -1 });
accountingEntrySchema.index({ bankAccountId: 1, entryDate: -1 });

// لاستثناء المُعكسة
accountingEntrySchema.index({ isReversed: 1, entryDate: -1 });

/* ─────────────────────────────────────────────────────────────
 * Hooks
 * ───────────────────────────────────────────────────────────── */

/**
 * قبل الحفظ:
 *  - التحقق من صحة كل سطر (مدين XOR دائن، موجب).
 *  - حساب totalDebit و totalCredit.
 *  - التحقق من التوازن (مدين = دائن).
 */
accountingEntrySchema.pre('save', function computeTotals(next) {
  try {
    // 1) التحقق من كل سطر
    for (const line of this.lines) {
      const d = Number(line.debit || 0);
      const c = Number(line.credit || 0);

      if (d < 0 || c < 0) {
        return next(new Error('المبالغ لا يمكن أن تكون سالبة.'));
      }
      if (d === 0 && c === 0) {
        return next(new Error('كل سطر يحتاج مبلغاً في المدين أو الدائن.'));
      }
      if (d > 0 && c > 0) {
        return next(new Error('السطر لا يمكن أن يحمل مدين ودائن معاً.'));
      }

      // تقريب لمنزلتين
      line.debit = Math.round(d * 100) / 100;
      line.credit = Math.round(c * 100) / 100;
    }

    // 2) حساب الإجماليات
    const totalDebit = this.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCredit = this.lines.reduce((s, l) => s + Number(l.credit || 0), 0);

    this.totalDebit = Math.round(totalDebit * 100) / 100;
    this.totalCredit = Math.round(totalCredit * 100) / 100;

    // 3) التحقق من التوازن
    if (Math.abs(this.totalDebit - this.totalCredit) > 0.01) {
      return next(
        new Error(
          `القيد غير متوازن: مدين=${this.totalDebit} دائن=${this.totalCredit}`
        )
      );
    }
    if (this.totalDebit === 0) {
      return next(new Error('القيد لا يمكن أن يكون صفراً.'));
    }

    next();
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────────
 * Virtuals
 * ───────────────────────────────────────────────────────────── */

/**
 * هل القيد متوازن؟
 */
accountingEntrySchema.virtual('isBalanced').get(function isBalanced() {
  return Math.abs((this.totalDebit || 0) - (this.totalCredit || 0)) < 0.01;
});

/**
 * عدد السطور.
 */
accountingEntrySchema.virtual('linesCount').get(function linesCount() {
  return Array.isArray(this.lines) ? this.lines.length : 0;
});

// تفعيل virtuals
accountingEntrySchema.set('toJSON', { virtuals: true });
accountingEntrySchema.set('toObject', { virtuals: true });

export const AccountingEntry = model('AccountingEntry', accountingEntrySchema);

export default AccountingEntry;