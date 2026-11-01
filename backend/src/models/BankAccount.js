/**
 * @file BankAccount.js
 * @description
 * نموذج الحساب البنكي (متطلب صريح: حساب بنكي واحد فقط).
 *
 * لماذا هذا الملف؟
 * - النظام يدعم حساباً بنكياً واحداً فقط.
 * - نُفرض ذلك عبر unique index جزئي على isActive=true.
 * - الرصيد الحالي (currentBalance) يُحدَّث من CashTransaction (نوع bank).
 * - virtuals للتوافق: balance / accountName / branch / description.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Schema الحساب البنكي.
 */
const bankAccountSchema = new Schema(
  {
    /**
     * اسم الحساب (مثال: الحساب الرئيسي — بنك الخرطوم).
     * يُقرأ في الواجهة عبر virtual accountName.
     */
    name: {
      type: String,
      required: [true, 'اسم الحساب مطلوب.'],
      trim: true,
      maxlength: [150, 'الاسم طويل جداً.'],
    },

    /**
     * اسم البنك.
     */
    bankName: {
      type: String,
      required: [true, 'اسم البنك مطلوب.'],
      trim: true,
      maxlength: [150, 'اسم البنك طويل جداً.'],
    },

    /**
     * رقم الحساب.
     */
    accountNumber: {
      type: String,
      required: [true, 'رقم الحساب مطلوب.'],
      trim: true,
      maxlength: [50, 'رقم الحساب طويل جداً.'],
    },

    /**
     * رقم الآيبان (اختياري).
     */
    iban: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },

    /**
     * اسم الفرع.
     * يُقرأ في الواجهة عبر virtual branch.
     */
    branchName: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * SWIFT (اختياري).
     */
    swift: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },

    /**
     * العملة (SDG فقط).
     */
    currency: {
      type: String,
      default: 'SDG',
      enum: ['SDG'],
    },

    /**
     * الرصيد الحالي — الحقل الفعلي في قاعدة البيانات.
     * يُحدَّث عبر $inc: { currentBalance: delta } في cashService.
     */
    currentBalance: {
      type: Number,
      default: 0,
    },

    /**
     * الرصيد الافتتاحي.
     */
    openingBalance: {
      type: Number,
      default: 0,
    },

    /**
     * هل هو الحساب النشط الوحيد؟
     * النظام يدعم حساباً واحداً نشطاً فقط.
     */
    isActive: {
      type: Boolean,
      default: true,
    },

    /**
     * هل هو الحساب الافتراضي؟
     */
    isDefault: {
      type: Boolean,
      default: true,
    },

    /**
     * ملاحظات.
     */
    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'الملاحظات طويلة جداً.'],
    },

    /**
     * من أنشأ الحساب؟
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
 * Virtuals — توافق مع الكود القديم
 * ───────────────────────────────────────────────────────────── */

bankAccountSchema
  .virtual('balance')
  .get(function getBalance() {
    return this.currentBalance;
  })
  .set(function setBalance(v) {
    this.currentBalance = v;
  });

bankAccountSchema
  .virtual('accountName')
  .get(function getAccountName() {
    return this.name;
  })
  .set(function setAccountName(v) {
    this.name = v;
  });

bankAccountSchema
  .virtual('branch')
  .get(function getBranch() {
    return this.branchName;
  })
  .set(function setBranch(v) {
    this.branchName = v;
  });

bankAccountSchema
  .virtual('description')
  .get(function getDescription() {
    return this.notes || '';
  })
  .set(function setDescription(v) {
    this.notes = v || '';
  });

// تفعيل virtuals
bankAccountSchema.set('toJSON', { virtuals: true });
bankAccountSchema.set('toObject', { virtuals: true });

/* ─────────────────────────────────────────────────────────────
 * الفهارس
 * ───────────────────────────────────────────────────────────── */

/**
 * فرض حساب بنكي نشط واحد فقط (متطلب صريح).
 */
bankAccountSchema.index(
  { isActive: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
    name: 'unique_active_bank_account',
  }
);

/**
 * منع تكرار رقم الحساب.
 */
bankAccountSchema.index({ accountNumber: 1 }, { unique: true });

export const BankAccount = model('BankAccount', bankAccountSchema);

export default BankAccount;