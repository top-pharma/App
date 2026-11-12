/**
 * @file BankAccount.js
 * @description
 * نموذج الحساب البنكي — مبسّط (بدون isActive / isDefault).
 *
 * ⚠️ إصلاح 2026-11-12:
 * - حذف isActive نهائياً — الحساب موجود دائماً نشط.
 * - حذف isDefault — الحساب البنكي واحد فقط (لا حاجة لافتراضي).
 * - حذف unique index على isActive (كان يسبب E11000 عند التفعيل).
 * - الحساب البنكي يُنشأ مرة واحدة، ويُعدّل، ويُحذف (فعلياً).
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const bankAccountSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'اسم الحساب مطلوب.'],
      trim: true,
      maxlength: [150, 'الاسم طويل جداً.'],
    },
    bankName: {
      type: String,
      required: [true, 'اسم البنك مطلوب.'],
      trim: true,
      maxlength: [150, 'اسم البنك طويل جداً.'],
    },
    accountNumber: {
      type: String,
      required: [true, 'رقم الحساب مطلوب.'],
      trim: true,
      maxlength: [50, 'رقم الحساب طويل جداً.'],
    },
    iban: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    branchName: {
      type: String,
      trim: true,
      default: '',
    },
    swift: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    currency: {
      type: String,
      default: 'SDG',
      enum: ['SDG'],
    },
    currentBalance: {
      type: Number,
      default: 0,
    },
    openingBalance: {
      type: Number,
      default: 0,
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

// ✅ virtuals — isActive: true دائماً (للتوافق مع الكود القديم)
bankAccountSchema.virtual('isActive').get(function getIsActive() {
  return true;
});

bankAccountSchema.set('toJSON', { virtuals: true });
bankAccountSchema.set('toObject', { virtuals: true });

/* ─────────────────────────────────────────────────────────────
 * الفهارس
 * ───────────────────────────────────────────────────────────── */

// منع تكرار رقم الحساب
bankAccountSchema.index({ accountNumber: 1 }, { unique: true });

// ⚠️ لا unique index على isActive — تم حذفه
// ⚠️ لا index على isDefault — تم حذفه

export const BankAccount = model('BankAccount', bankAccountSchema);

export default BankAccount;