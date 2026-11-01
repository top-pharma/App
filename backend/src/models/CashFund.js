/**
 * @file CashFund.js
 * @description
 * نموذج الصندوق النقدي (الخزينة النقدية).
 *
 * لماذا هذا الملف؟
 * - نُوفّر صناديق نقدية متعددة (رئيسي + فرعي).
 * - كل صندوق له رصيد حالي (currentBalance) يُحدَّث من CashTransaction.
 * - virtual `balance` = توافق للقراءة فقط مع الكود القديم.
 * - لا نحذف صندوقاً فيه حركة؛ نُعطّله فقط.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Schema الصندوق النقدي.
 */
const cashFundSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'اسم الصندوق مطلوب.'],
      trim: true,
      minlength: [2, 'الاسم قصير جداً.'],
      maxlength: [100, 'الاسم طويل جداً.'],
    },

    code: {
      type: String,
      required: [true, 'كود الصندوق مطلوب.'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    /** الرصيد الحالي — الحقل الفعلي في قاعدة البيانات. */
    currentBalance: {
      type: Number,
      default: 0,
    },

    /** الرصيد الافتتاحي (للرجوع إليه). */
    openingBalance: {
      type: Number,
      default: 0,
    },

    /** المخزن/الفرع المرتبط (اختياري). */
    warehouse: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      default: null,
    },

    /** أمين الصندوق (اختياري). */
    custodian: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    isDefault: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'الملاحظات طويلة جداً.'],
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
 * Virtuals — توافق مع الكود القديم
 * ─────────────────────────────────────────────────────────────
 * ملاحظة: virtual `balance` يعمل للقراءة والكتابة عبر document.balance.
 * لكن `updateOne({$inc: {balance}})` لا يعمل (يستخدم اسم الحقل الفعلي).
 * لذلك cashService.js يستخدم `currentBalance` في $inc.
 */

cashFundSchema
  .virtual('balance')
  .get(function getBalance() {
    return this.currentBalance;
  })
  .set(function setBalance(v) {
    this.currentBalance = v;
  });

cashFundSchema
  .virtual('description')
  .get(function getDescription() {
    return this.notes || '';
  })
  .set(function setDescription(v) {
    this.notes = v || '';
  });

// تفعيل virtuals في toJSON / toObject
cashFundSchema.set('toJSON', { virtuals: true });
cashFundSchema.set('toObject', { virtuals: true });

/* ─────────────────────────────────────────────────────────────
 * الفهارس
 * ───────────────────────────────────────────────────────────── */

cashFundSchema.index(
  { isDefault: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefault: true },
    name: 'unique_default_cash_fund',
  }
);

cashFundSchema.index({ isActive: 1, name: 1 });

/* ─────────────────────────────────────────────────────────────
 * Methods
 * ───────────────────────────────────────────────────────────── */

/**
 * هل الصندوق يسمح بالرصيد السالب؟
 * @returns {boolean}
 */
cashFundSchema.methods.allowsNegative = function allowsNegative() {
  return false;
};

export const CashFund = model('CashFund', cashFundSchema);

export default CashFund;