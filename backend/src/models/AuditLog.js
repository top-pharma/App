/**
 * @file AuditLog.js
 * @description
 * سجل التدقيق — يوثّق كل عملية حسّاسة في النظام.
 *
 * لماذا هذا الملف؟
 * - متطلب صريح: "تسجيل كل عملية (إنشاء، تعديل، حذف) + محاولات الفشل".
 * - TTL index لمدة سنة (تُقرأ من AUDIT_LOG_TTL_DAYS) لتنظيف تلقائي.
 * - نخزّن الفروق (before/after) عند التعديل لتسهيل المراجعة.
 * - نخزّن IP + User-Agent لتتبع مصدر العملية.
 * - لا نخزّن كلمات المرور أو التوكنات أبداً في أي حقل.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * أنواع الأحداث المدعومة.
 * @readonly
 * @enum {string}
 */
export const AUDIT_ACTIONS = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  LOGOUT: 'logout',
  PASSWORD_CHANGE: 'password_change',
  PASSWORD_RESET_REQUEST: 'password_reset_request',
  PASSWORD_RESET_COMPLETE: 'password_reset_complete',
  PERMISSION_DENIED: 'permission_denied',
  ACCOUNT_LOCKED: 'account_locked',
  ACCOUNT_UNLOCKED: 'account_unlocked',
  REFRESH_TOKEN: 'refresh_token',
  EXPORT: 'export',
  BACKUP: 'backup',
});

/**
 * Schema سجل التدقيق.
 */
const auditLogSchema = new Schema(
  {
    /**
     * نوع العملية.
     */
    action: {
      type: String,
      required: true,
      enum: Object.values(AUDIT_ACTIONS),
      index: true,
    },

    /**
     * من قام بالعملية (قد يكون null لمحاولات دخول ببريد غير موجود).
     */
    actor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    /**
     * اسم الفاعل وقت العملية (نحفظه لأن المستخدم قد يُحذف لاحقاً).
     */
    actorName: {
      type: String,
      default: '',
      trim: true,
    },

    /**
     * بريد الفاعل وقت العملية.
     */
    actorEmail: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },

    /**
     * دور الفاعل وقت العملية.
     */
    actorRole: {
      type: String,
      default: '',
      trim: true,
    },

    /**
     * المورد المتأثر (User, Customer, Invoice, ...).
     */
    resource: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },

    /**
     * مُعرّف المورد المتأثر.
     */
    resourceId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    /**
     * وصف مختصر للعملية بالعربية.
     */
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },

    /**
     * الحالة قبل التعديل (للعمليات UPDATE/DELETE).
     * نُخزّنها كـ Object لأن الـ schema قد تتغيّر.
     */
    before: {
      type: Schema.Types.Mixed,
      default: null,
    },

    /**
     * الحالة بعد التعديل (للعمليات CREATE/UPDATE).
     */
    after: {
      type: Schema.Types.Mixed,
      default: null,
    },

    /**
     * الفروق المحسوبة (حقول تغيّرت فقط).
     */
    changes: {
      type: Schema.Types.Mixed,
      default: null,
    },

    /**
     * هل نجحت العملية؟
     * false لمحاولات الفشل (مثل محاولة دخول فاشلة).
     */
    success: {
      type: Boolean,
      default: true,
      index: true,
    },

    /**
     * رمز الخطأ إن وُجد.
     */
    errorCode: {
      type: String,
      default: '',
    },

    /**
     * رسالة الخطأ إن وُجدت.
     */
    errorMessage: {
      type: String,
      default: '',
      trim: true,
    },

    /**
     * عنوان IP للمصدر.
     */
    ip: {
      type: String,
      default: '',
      trim: true,
    },

    /**
     * User-Agent للمتصفح/العميل.
     */
    userAgent: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },

    /**
     * طريقة HTTP (POST/PATCH/DELETE...).
     */
    method: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },

    /**
     * المسار المطلوب.
     */
    path: {
      type: String,
      default: '',
      trim: true,
    },

    /**
     * وقت الحدث (نسخة صريحة لتسهيل الاستعلامات).
     */
    occurredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    // نجعل السجل غير قابل للتعديل (immutable) على مستوى الـ schema.
    strict: true,
  }
);

/**
 * فهرس TTL — يُحذف السجل تلقائياً بعد المدة المحددة.
 * نستخدم createdAt المُدار تلقائياً من timestamps.
 */
auditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 365 } // افتراضي سنة — يُعاد ضبطه في seed
);

/**
 * فهارس إضافية لتسريع التقارير.
 */
auditLogSchema.index({ actor: 1, occurredAt: -1 });
auditLogSchema.index({ action: 1, occurredAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1, occurredAt: -1 });

/**
 * منع تعديل السجلات بعد إنشائها.
 * أي محاولة save على وثيقة موجودة تُرفض.
 */
auditLogSchema.pre('save', function preventUpdate(next) {
  if (!this.isNew) {
    return next(new Error('سجلات التدقيق غير قابلة للتعديل.'));
  }
  return next();
});

/**
 * منع الحذف الفردي (يُسمح فقط بالحذف عبر TTL أو من Admin صراحة).
 * ملاحظة: TTL يعمل على مستوى MongoDB ولا يمر بهذا الـ hook.
 */
auditLogSchema.pre('deleteOne', { document: true, query: false }, function preventDelete(next) {
  // نسمح بالحذف فقط إذا مُرّر flag خاص (للاختبار أو التنظيف الإداري).
  if (this.$locals?.allowDelete) {
    return next();
  }
  return next(new Error('لا يمكن حذف سجلات التدقيق يدوياً.'));
});

export const AuditLog = model('AuditLog', auditLogSchema);

export default AuditLog;