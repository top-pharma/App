/**
 * @file Settings.js
 * @description
 * إعدادات النظام العامة (وثيقة واحدة — Singleton) — Phase 2.5.
 *
 * ⚠️ إضافة Phase 2.5 (سياسات التسعير في sales):
 * - minMarginPercent: الحد الأدنى للهامش (%).
 * - maxDiscountPercent: أقصى خصم مسموح (%).
 * - allowPriceOverrides: هل يُسمح بالتجاوز (بصلاحية).
 * - nearExpiryThresholdDays: عتبة "قاربة الانتهاء" (يوم).
 * - nearExpiryMaxDiscountPercent: خصم أعلى للدفعات القاربة.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const SETTINGS_KEY = 'system';

const settingsSchema = new Schema(
  {
    key: {
      type: String,
      default: SETTINGS_KEY,
      unique: true,
      immutable: true,
    },

    // ─── 1. بيانات الشركة ───
    company: {
      name: { type: String, default: 'شركة الأدوية', trim: true },
      nameEn: { type: String, default: '', trim: true },
      phone: { type: String, default: '', trim: true },
      email: { type: String, default: '', trim: true, lowercase: true },
      address: { type: String, default: '', trim: true },
      taxNumber: { type: String, default: '', trim: true },
      registrationNumber: { type: String, default: '', trim: true },
      logoUrl: { type: String, default: '', trim: true },
    },

    // ─── 2. العملة والتقويم ───
    currency: {
      code: { type: String, default: 'SDG', enum: ['SDG'] },
      symbol: { type: String, default: 'ج.س' },
      decimals: { type: Number, default: 2, min: 0, max: 4 },
    },

    locale: {
      language: { type: String, default: 'ar', enum: ['ar'] },
      direction: { type: String, default: 'rtl', enum: ['rtl'] },
      calendar: { type: String, default: 'gregorian', enum: ['gregorian'] },
      numerals: { type: String, default: 'latin', enum: ['latin'] },
      timezone: { type: String, default: 'Africa/Khartoum' },
    },

    // ─── 3. المبيعات (مع سياسات التسعير) ───
    sales: {
      prefixes: {
        invoice: { type: String, default: 'INV', trim: true },
        deliveryNote: { type: String, default: 'DN', trim: true },
        customerReturn: { type: String, default: 'RET', trim: true },
        purchaseReceipt: { type: String, default: 'PR', trim: true },
        supplierReturn: { type: String, default: 'SRET', trim: true },
        cashTransaction: { type: String, default: 'CT', trim: true },
        salesRepTransaction: { type: String, default: 'SRT', trim: true },
        check: { type: String, default: 'CHK', trim: true },
      },

      defaultTaxRate: { type: Number, default: 0, min: 0, max: 100 },

      returnGracePeriodDays: { type: Number, default: 7, min: 0, max: 90 },

      defaultPaymentTerms: { type: Number, default: 30, min: 0, max: 365 },

      allowNegativeStock: { type: Boolean, default: false },

      // ✅ Phase 2.5: سياسات التسعير
      /**
       * الحد الأدنى للهامش (%) — التكلفة × (1 + minMarginPercent).
       * أي بيع أقل من هذا = خسارة → ممنوع دائماً.
       */
      minMarginPercent: {
        type: Number,
        default: 10,
        min: 0,
        max: 100,
      },

      /**
       * أقصى خصم مسموح (%) من سعر القائمة — للمندوب.
       * البيع بين هذا و minMarginPercent = يحتاج تجاوز.
       */
      maxDiscountPercent: {
        type: Number,
        default: 15,
        min: 0,
        max: 100,
      },

      /**
       * هل يُسمح بالتجاوز (بصلاحية `invoices.override_price_limit`)؟
       */
      allowPriceOverrides: {
        type: Boolean,
        default: true,
      },

      /**
       * عتبة "قاربة الانتهاء" بالأيام.
       */
      nearExpiryThresholdDays: {
        type: Number,
        default: 30,
        min: 1,
        max: 365,
      },

      /**
       * خصم أعلى للدفعات القاربة على الانتهاء (%).
       * يُتجاوز maxDiscountPercent عندما تكون الدفعة قريبة الانتهاء.
       */
      nearExpiryMaxDiscountPercent: {
        type: Number,
        default: 30,
        min: 0,
        max: 100,
      },
    },

    // ─── 4. المخزون ───
    inventory: {
      issuePolicy: { type: String, default: 'FEFO', enum: ['FEFO'] },
      expiryWarningDays: { type: Number, default: 90, min: 1, max: 365 },
      reorderWarningEnabled: { type: Boolean, default: true },
    },

    // ─── 5. المالية ───
    finance: {
      checkReminderDays: { type: Number, default: 3, min: 0, max: 30 },
      invoiceReminderDays: { type: Number, default: 3, min: 0, max: 30 },
      remindersEnabled: { type: Boolean, default: true },
    },

    // ─── 6. الأمان ───
    security: {
      sessionHours: { type: Number, default: 8, min: 1, max: 72 },
      idleTimeoutMinutes: { type: Number, default: 30, min: 5, max: 240 },
      maxFailedLogins: { type: Number, default: 5, min: 3, max: 20 },
      lockDurationMinutes: { type: Number, default: 15, min: 1, max: 1440 },
      passwordMinLength: { type: Number, default: 8, min: 6, max: 32 },
    },

    // ─── 7. سجل التدقيق ───
    audit: {
      retentionDays: { type: Number, default: 365, min: 30, max: 3650 },
    },

    // ─── 8. الفواتير المطبوعة ───
    print: {
      showLogoWatermark: { type: Boolean, default: true },
      watermarkOpacity: { type: Number, default: 0.08, min: 0, max: 0.5 },
      invoiceHeader: { type: String, default: '', trim: true },
      invoiceFooter: { type: String, default: 'شكراً لتعاملكم معنا', trim: true },
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    minimize: false,
  }
);

/**
 * الحصول على الإعدادات (أو إنشاء الافتراضية).
 * @returns {Promise<import('mongoose').Document>}
 */
settingsSchema.statics.getSettings = async function getSettings() {
  let settings = await this.findOne({ key: SETTINGS_KEY });
  if (!settings) {
    settings = await this.create({ key: SETTINGS_KEY });
  }
  return settings;
};

export const Settings = model('Settings', settingsSchema);

export default Settings;