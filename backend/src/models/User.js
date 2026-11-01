/**
 * @file User.js
 * @description
 * نموذج المستخدم (يدعم الأدوار الخمسة).
 *
 * لماذا هذا الملف؟
 * - كل المستخدمين (مدير، محاسب، مندوب، أمين مخزن، صيدلية) يُنشَؤون من نفس
 *   النموذج، والتفريق بينهم عبر حقل `role` فقط.
 * - نحتفظ بـ `tokenVersion` لإبطال كل الجلسات عند تغيير كلمة المرور.
 * - نحتفظ بحقول تتبّع تسجيل الدخول (آخر دخول، عدد المحاولات الفاشلة،
 *   قفل الحساب المؤقت) لدعم الأمان.
 * - كلمة المرور مُختارة `select: false` لكيلا تُعاد في أي استعلام بالخطأ.
 * - ندعم ربط المستخدم بكيان (مندوب ↔ SalesRep، صيدلية ↔ Customer) اختيارياً
 *   عبر `linkedEntity`.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * أسماء الأدوار المدعومة (يجب أن تطابق Role.name).
 * @readonly
 * @enum {string}
 */
export const USER_ROLES = Object.freeze({
  ADMIN: 'admin',
  STOREKEEPER: 'storekeeper',
  ACCOUNTANT: 'accountant',
  SALES_REP: 'sales_rep',
  PHARMACY: 'pharmacy',
  HR_MANAGER: 'hr_manager',
});

/**
 * أنواع الكيانات المرتبطة (اختيارية).
 * @readonly
 * @enum {string}
 */
export const LINKED_ENTITY_TYPES = Object.freeze({
  CUSTOMER: 'Customer',
  NONE: null,
});

/**
 * Schema المستخدم.
 */
const userSchema = new Schema(
  {
    /**
     * الاسم الكامل.
     */
    name: {
      type: String,
      required: [true, 'الاسم مطلوب.'],
      trim: true,
      minlength: [2, 'الاسم قصير جداً.'],
      maxlength: [100, 'الاسم طويل جداً.'],
    },

    /**
     * البريد الإلكتروني (فريد، lowercase).
     */
    email: {
      type: String,
      required: [true, 'البريد الإلكتروني مطلوب.'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'صيغة البريد الإلكتروني غير صحيحة.'],
    },

    /**
     * رقم الهاتف (اختياري، لتواصل الشركة).
     */
    phone: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * كلمة المرور المشفّرة.
     * select: false يمنع إعادتها بالخطأ في أي استعلام.
     */
    password: {
      type: String,
      required: [true, 'كلمة المرور مطلوبة.'],
      select: false,
    },

    /**
     * اسم الدور (يطابق Role.name).
     */
    role: {
      type: String,
      required: [true, 'الدور مطلوب.'],
      enum: {
        values: Object.values(USER_ROLES),
        message: 'دور غير معتمد.',
      },
      index: true,
    },

    /**
     * ربط اختياري بكيان آخر.
     * - المندوب: لا نربطه بكيان (يكفي الدور).
     * - الصيدلية: نربطها بـ Customer لعرض فواتيرها فقط.
     */
    linkedEntity: {
      type: {
        type: String,
        enum: [LINKED_ENTITY_TYPES.CUSTOMER, null],
        default: null,
      },
      id: {
        type: Schema.Types.ObjectId,
        default: null,
        refPath: 'linkedEntity.type',
      },
    },

    /**
     * حالة الحساب.
     */
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    /**
     * رقم نسخة التوكن — يُزاد عند تغيير كلمة المرور لإبطال كل الجلسات.
     */
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * آخر تسجيل دخول ناجح.
     */
    lastLoginAt: {
      type: Date,
      default: null,
    },

    /**
     * آخر IP استُخدم في تسجيل الدخول.
     */
    lastLoginIp: {
      type: String,
      default: '',
    },

    /**
     * عدد محاولات تسجيل الدخول الفاشلة المتتالية.
     */
    failedLoginAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * إذا كان الحساب مقفلاً مؤقتاً، هذا وقت فك القفل.
     * null = غير مقفل.
     */
    lockUntil: {
      type: Date,
      default: null,
    },

    /**
     * هل يجب على المستخدم تغيير كلمة المرور في أول دخول؟
     * يُفعَّل عند الإنشاء بكلمة مرور مؤقتة.
     */
    mustChangePassword: {
      type: Boolean,
      default: false,
    },

    /**
     * ملاحظات إدارية (اختيارية).
     */
    notes: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * من أنشأ هذا المستخدم (للتتبع).
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
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

/**
 * فهارس مركّبة لتسريع الاستعلامات الشائعة.
 */
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ isActive: 1, createdAt: -1 });

/**
 * هل الحساب مقفل حالياً؟
 * @returns {boolean}
 */
userSchema.methods.isLocked = function isLocked() {
  return Boolean(this.lockUntil && this.lockUntil.getTime() > Date.now());
};

/**
 * إعادة ضبط عدّاد المحاولات الفاشلة وحالة القفل.
 * @returns {void}
 */
userSchema.methods.resetLoginAttempts = function resetLoginAttempts() {
  this.failedLoginAttempts = 0;
  this.lockUntil = null;
};

/**
 * تسجيل محاولة فاشلة، مع قفل مؤقت بعد 5 محاولات لمدة 15 دقيقة.
 * @returns {void}
 */
userSchema.methods.registerFailedLogin = function registerFailedLogin() {
  this.failedLoginAttempts = (this.failedLoginAttempts || 0) + 1;

  // نُقفل الحساب بعد 5 محاولات فاشلة لمدة 15 دقيقة.
  if (this.failedLoginAttempts >= 5) {
    this.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
  }
};

/**
 * إبطال كل الجلسات الحالية للمستخدم.
 * @returns {void}
 */
userSchema.methods.invalidateSessions = function invalidateSessions() {
  this.tokenVersion = (this.tokenVersion || 0) + 1;
};

export const User = model('User', userSchema);

export default User;