/**
 * @file Customer.js
 * @description
 * نموذج العميل — كل العملاء صيدليات (لا يوجد عميل عابر).
 *
 * لماذا هذا الملف؟
 * - متطلب صريح: "كل من يشتري من الشركة يُنشأ له ملف عميل دائم".
 * - كل عميل مرتبط بمندوب مسؤول (assignedSalesRep) — إلزامي.
 * - فترة سماح المرتجعات على مستوى العميل (افتراضي 7 أيام، قابل للتخصيص).
 * - نحتفظ بـ currentBalance لتسريع كشوف الحساب (يُحدَّث في الخدمات المالية).
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * نوع العميل — ثابت (pharmacy).
 * نبقيها كحقل لأن النظام القديم قد يحتوي أنواعاً أخرى، لكن في نظامنا
 * نوع واحد فقط، مما يسهّل الانتقال لاحقاً لو أُضيف نوع جديد.
 * @readonly
 */
export const CUSTOMER_TYPES = Object.freeze({
  PHARMACY: 'pharmacy',
});

/**
 * Schema العميل.
 */
const customerSchema = new Schema(
  {
    /**
     * اسم الصيدلية.
     */
    name: {
      type: String,
      required: [true, 'اسم الصيدلية مطلوب.'],
      trim: true,
      minlength: [2, 'الاسم قصير جداً.'],
      maxlength: [150, 'الاسم طويل جداً.'],
      index: true,
    },

    /**
     * نوع العميل — ثابت pharmacy.
     */
    type: {
      type: String,
      enum: Object.values(CUSTOMER_TYPES),
      default: CUSTOMER_TYPES.PHARMACY,
      immutable: true,
    },

    /**
     * كود فريد للعميل (يُولَّد تلقائياً إن لم يُمرَّر).
     */
    code: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
      sparse: true,
    },

    /**
     * اسم المالك / المسؤول (اختياري).
     */
    ownerName: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * رقم الهاتف الأساسي.
     */
    phone: {
      type: String,
      required: [true, 'رقم الهاتف مطلوب.'],
      trim: true,
    },

    /**
     * رقم هاتف بديل.
     */
    phone2: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * البريد الإلكتروني (اختياري).
     */
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
      match: [/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'صيغة البريد غير صحيحة.'],
    },

    /**
     * العنوان.
     */
    address: {
      type: String,
      trim: true,
      default: '',
      maxlength: [250, 'العنوان طويل جداً.'],
    },

    /**
     * المدينة.
     */
    city: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * الرقم الضريبي (اختياري).
     */
    taxNumber: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * رقم التسجيل التجاري.
     */
    commercialRegister: {
      type: String,
      trim: true,
      default: '',
    },

    // ------------------------------------------------------------
    // 1) الائتمان
    // ------------------------------------------------------------
    /**
     * حد الائتمان المسموح (بالجنيه السوداني).
     * 0 = لا ائتمان (دفع فوري).
     */
    creditLimit: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * الرصيد الحالي (مدين موجب / دائن سالب).
     */
    currentBalance: {
      type: Number,
      default: 0,
    },

    /**
     * شروط الدفع الافتراضية بالأيام.
     */
    paymentTerms: {
      type: Number,
      default: 30,
      min: 0,
      max: 365,
    },

    /**
     * فترة سماح المرتجعات بالأيام (متطلب صريح — افتراضي 7).
     */
    returnGracePeriod: {
      type: Number,
      default: 7,
      min: 0,
      max: 90,
    },

    // ------------------------------------------------------------
    // 2) الربط بالمندوب
    // ------------------------------------------------------------
    /**
     * المندوب المسؤول — إلزامي.
     */
    assignedSalesRep: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'المندوب المسؤول مطلوب.'],
      index: true,
    },

    // ------------------------------------------------------------
    // 3) الحالة
    // ------------------------------------------------------------
    /**
     * هل العميل نشط؟ التعطيل يمنع إنشاء فواتير جديدة.
     */
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    /**
     * هل العميل محظور من الشراء (لأسباب ائتمانية)؟
     */
    isBlocked: {
      type: Boolean,
      default: false,
    },

    /**
     * سبب الحظر (إن وُجد).
     */
    blockReason: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * ملاحظات إدارية.
     */
    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: [1000, 'الملاحظات طويلة جداً.'],
    },

    // ------------------------------------------------------------
    // 4) ربط حساب المستخدم (للدخول بصفة صيدلية — اختياري)
    // ------------------------------------------------------------
    /**
     * حساب المستخدم المرتبط (لو أرادت الصيدلية الدخول للعرض).
     */
    userAccount: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    /**
     * من أنشأ هذا العميل؟
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
 * فهارس مركّبة للاستعلامات الشائعة.
 */
customerSchema.index({ assignedSalesRep: 1, isActive: 1, name: 1 });
customerSchema.index({ isActive: 1, createdAt: -1 });
customerSchema.index({ name: 'text', phone: 'text', code: 'text' });

/**
 * توليد كود فريد للعميل إن لم يُمرَّر.
 * نستخدم الطابع الزمني + عشوائي لتقليل التصادم.
 */
customerSchema.pre('validate', function generateCode(next) {
  if (!this.code) {
    const ts = Date.now().toString(36).toUpperCase();
    const rnd = Math.random().toString(36).slice(2, 5).toUpperCase();
    this.code = `C-${ts}${rnd}`;
  }
  next();
});

/**
 * هل تجاوز العميل حد الائتمان؟
 * @param {number} [additionalAmount=0] - مبلغ إضافي (فاتورة جديدة).
 * @returns {boolean}
 */
customerSchema.methods.wouldExceedCredit = function wouldExceedCredit(additionalAmount = 0) {
  if (this.creditLimit <= 0) {
    return additionalAmount > 0;
  }
  return this.currentBalance + additionalAmount > this.creditLimit;
};

export const Customer = model('Customer', customerSchema);

export default Customer;