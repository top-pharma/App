/**
 * @file Commission.js
 * @description
 * إعدادات عمولة المندوب — مع بونص متدرّج وبونص خاص.
 *
 * لماذا هذا الملف؟
 * - متطلب: "عمولات + بونص متدرج + بونص خاص".
 * - كل مندوب له إعداداته الخاصة (baseCommission + tiers + specialBonuses).
 * - نُوفّر فترة سريان (effectiveFrom/effectiveTo) لتغيير الإعدادات
 *   دون التأثير على العمولات المحتسبة سابقاً.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * أنواع العمولة الأساسية.
 * @readonly
 * @enum {string}
 */
export const COMMISSION_BASE_TYPES = Object.freeze({
  PERCENTAGE: 'percentage',
  FIXED: 'fixed',
});

/**
 * Schema شريحة بونص.
 */
const tierSchema = new Schema(
  {
    minSales: { type: Number, required: true, min: 0 },
    maxSales: { type: Number, required: true, min: 0 },
    bonusRate: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

/**
 * Schema بونص خاص.
 */
const specialBonusSchema = new Schema(
  {
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, default: Date.now },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

/**
 * Schema إعدادات العمولة.
 */
const commissionSchema = new Schema(
  {
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
     * نوع العمولة الأساسية.
     */
    baseCommission: {
      type: String,
      enum: Object.values(COMMISSION_BASE_TYPES),
      default: COMMISSION_BASE_TYPES.PERCENTAGE,
    },

    /**
     * قيمة العمولة الأساسية (نسبة % أو مبلغ ثابت لكل فاتورة).
     */
    baseRate: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    /**
     * شرائح البونص المتدرّج.
     * يجب أن تكون متتالية بلا فجوات ولا تداخل (نتحقق في validator).
     */
    tiers: {
      type: [tierSchema],
      default: [],
      validate: {
        validator: (arr) => {
          if (!Array.isArray(arr) || arr.length === 0) {
            return true;
          }
          // نتحقق من عدم التداخل والترتيب التصاعدي.
          const sorted = [...arr].sort((a, b) => a.minSales - b.minSales);
          for (let i = 1; i < sorted.length; i += 1) {
            if (sorted[i].minSales <= sorted[i - 1].maxSales) {
              return false;
            }
          }
          return true;
        },
        message: 'شرائح البونص متداخلة أو غير مرتّبة.',
      },
    },

    /**
     * بونص خاص.
     */
    specialBonuses: {
      type: [specialBonusSchema],
      default: [],
    },

    /**
     * حالة التفعيل.
     */
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    /**
     * تاريخ السريان.
     */
    effectiveFrom: {
      type: Date,
      default: Date.now,
      index: true,
    },

    /**
     * تاريخ الانتهاء (null = مستمر).
     */
    effectiveTo: {
      type: Date,
      default: null,
    },

    /**
     * من أنشأ الإعدادات؟
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
 * فهرس لضمان إعدادات نشطة واحدة لكل مندوب في أي وقت.
 * (نسمح بإعدادات قديمة معطّلة للتاريخ).
 */
commissionSchema.index(
  { salesRep: 1, isActive: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
    name: 'unique_active_commission_per_sales_rep',
  }
);

/**
 * حساب العمولة الأساسية لمبلغ مبيعات.
 * @param {number} salesAmount
 * @returns {number}
 */
commissionSchema.methods.calculateBaseCommission = function calculateBaseCommission(
  salesAmount
) {
  if (!Number.isFinite(salesAmount) || salesAmount <= 0) {
    return 0;
  }
  if (this.baseCommission === COMMISSION_BASE_TYPES.PERCENTAGE) {
    return (salesAmount * this.baseRate) / 100;
  }
  // fixed = مبلغ ثابت لكل فاتورة (يُحسب في الخدمة بحسب عدد الفواتير).
  return this.baseRate;
};

/**
 * إيجاد شريحة البونص المناسبة لمبلغ مبيعات.
 * @param {number} salesAmount
 * @returns {number} bonusRate أو 0.
 */
commissionSchema.methods.findTierBonus = function findTierBonus(salesAmount) {
  if (!Array.isArray(this.tiers) || this.tiers.length === 0) {
    return 0;
  }
  const tier = this.tiers.find(
    (t) => salesAmount >= t.minSales && salesAmount <= t.maxSales
  );
  return tier ? tier.bonusRate : 0;
};

export const Commission = model('Commission', commissionSchema);

export default Commission;