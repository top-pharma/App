/**
 * @file User.js
 * @description
 * نموذج المستخدم (يدعم الأدوار الستة).
 *
 * ✅ v10.11 (2026-11-16):
 * - registerFailedLogin: async — يقرأ maxFailedLogins + lockDurationMinutes من Settings.
 * - password: minlength ديناميكي (يُتحقق في authValidator/controller — لا هنا).
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const USER_ROLES = Object.freeze({
  ADMIN: 'admin',
  STOREKEEPER: 'storekeeper',
  ACCOUNTANT: 'accountant',
  SALES_REP: 'sales_rep',
  PHARMACY: 'pharmacy',
  HR_MANAGER: 'hr_manager',
});

export const LINKED_ENTITY_TYPES = Object.freeze({
  CUSTOMER: 'Customer',
  NONE: null,
});

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'الاسم مطلوب.'],
      trim: true,
      minlength: [2, 'الاسم قصير جداً.'],
      maxlength: [100, 'الاسم طويل جداً.'],
    },

    email: {
      type: String,
      required: [true, 'البريد الإلكتروني مطلوب.'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'صيغة البريد الإلكتروني غير صحيحة.'],
    },

    phone: {
      type: String,
      trim: true,
      default: '',
    },

    password: {
      type: String,
      required: [true, 'كلمة المرور مطلوبة.'],
      select: false,
    },

    role: {
      type: String,
      required: [true, 'الدور مطلوب.'],
      enum: {
        values: Object.values(USER_ROLES),
        message: 'دور غير معتمد.',
      },
      index: true,
    },

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

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    lastLoginIp: {
      type: String,
      default: '',
    },

    failedLoginAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    lockUntil: {
      type: Date,
      default: null,
    },

    mustChangePassword: {
      type: Boolean,
      default: false,
    },

    notes: {
      type: String,
      trim: true,
      default: '',
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
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ isActive: 1, createdAt: -1 });

/**
 * هل الحساب مقفل حالياً؟
 */
userSchema.methods.isLocked = function isLocked() {
  return Boolean(this.lockUntil && this.lockUntil.getTime() > Date.now());
};

/**
 * إعادة ضبط عدّاد المحاولات الفاشلة وحالة القفل.
 */
userSchema.methods.resetLoginAttempts = function resetLoginAttempts() {
  this.failedLoginAttempts = 0;
  this.lockUntil = null;
};

/**
 * ✅ v10.11: تسجيل محاولة فاشلة — async — يقرأ من Settings.
 * - maxFailedLogins (default 5)
 * - lockDurationMinutes (default 15)
 */
userSchema.methods.registerFailedLogin = async function registerFailedLogin() {
  this.failedLoginAttempts = (this.failedLoginAttempts || 0) + 1;

  try {
    // Dynamic import لتجنب circular dependency (Settings → User)
    const { Settings } = await import('./Settings.js');
    const settings = await Settings.getSettings();
    const maxFailed = settings.security?.maxFailedLogins ?? 5;
    const lockMinutes = settings.security?.lockDurationMinutes ?? 15;

    if (this.failedLoginAttempts >= maxFailed) {
      this.lockUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
    }
  } catch {
    // Fallback — default
    if (this.failedLoginAttempts >= 5) {
      this.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
  }
};

/**
 * إبطال كل الجلسات الحالية للمستخدم.
 */
userSchema.methods.invalidateSessions = function invalidateSessions() {
  this.tokenVersion = (this.tokenVersion || 0) + 1;
};

export const User = model('User', userSchema);

export default User;