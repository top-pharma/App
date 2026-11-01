/**
 * @file Supplier.js
 * @description
 * نموذج المورّد (شركة الأدوية المستوردة منها).
 *
 * لماذا هذا الملف؟
 * - نحتاج سجل مورّدين كاملاً (CRUD) + كشف حساب + سجل استلامات.
 * - الرصيد الحالي للمورّد (ما علينا له) مهم للتقارير المالية.
 * - لا نحذف مورّداً له حركة؛ نُعطّله فقط.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Schema المورّد.
 */
const supplierSchema = new Schema(
  {
    /**
     * اسم المورّد.
     */
    name: {
      type: String,
      required: [true, 'اسم المورّد مطلوب.'],
      trim: true,
      minlength: [2, 'الاسم قصير جداً.'],
      maxlength: [200, 'الاسم طويل جداً.'],
      index: true,
    },

    /**
     * كود فريد.
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
     * اسم جهة الاتصال (الشخص).
     */
    contactPerson: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * الهاتف.
     */
    phone: {
      type: String,
      required: [true, 'رقم الهاتف مطلوب.'],
      trim: true,
    },

    /**
     * هاتف بديل.
     */
    phone2: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * البريد الإلكتروني.
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
      maxlength: [300, 'العنوان طويل جداً.'],
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
     * الدولة.
     */
    country: {
      type: String,
      trim: true,
      default: 'السودان',
    },

    /**
     * الرقم الضريبي.
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

    /**
     * رقم الحساب البنكي للمورّد (اختياري).
     */
    bankAccount: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * اسم البنك.
     */
    bankName: {
      type: String,
      trim: true,
      default: '',
    },

    // ------------------------------------------------------------
    // الرصيد والشروط
    // ------------------------------------------------------------
    /**
     * الرصيد الحالي (ما علينا للمورّد).
     * موجب = علينا له، سالب = له عندنا (دفعة مقدّمة).
     */
    currentBalance: {
      type: Number,
      default: 0,
    },

    /**
     * شروط الدفع بالأيام.
     */
    paymentTerms: {
      type: Number,
      default: 30,
      min: 0,
      max: 365,
    },

    /**
     * العملة الافتراضية للتعامل (SDG فقط حالياً).
     */
    currency: {
      type: String,
      default: 'SDG',
      enum: ['SDG'],
    },

    // ------------------------------------------------------------
    // الحالة
    // ------------------------------------------------------------
    /**
     * هل المورّد نشط؟
     */
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    /**
     * ملاحظات.
     */
    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: [1000, 'الملاحظات طويلة جداً.'],
    },

    /**
     * من أنشأ المورّد؟
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
 * فهارس القوائم والبحث.
 */
supplierSchema.index({ isActive: 1, name: 1 });
supplierSchema.index({ name: 'text', phone: 'text', code: 'text' });

/**
 * توليد كود فريد للمورّد إن لم يُمرَّر.
 */
supplierSchema.pre('validate', function generateCode(next) {
  if (!this.code) {
    const ts = Date.now().toString(36).toUpperCase();
    const rnd = Math.random().toString(36).slice(2, 5).toUpperCase();
    this.code = `S-${ts}${rnd}`;
  }
  next();
});

export const Supplier = model('Supplier', supplierSchema);

export default Supplier;