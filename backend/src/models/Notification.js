/**
 * @file Notification.js
 * @description
 * إشعارات داخلية للمستخدمين (تنبيهات المخزون، الشيكات، الفواتير...).
 *
 * لماذا هذا الملف؟
 * - متطلب "تنبيهات" في النظام الجديد (النظام القديم بلا تنبيهات).
 * - نخزّن الإشعار موجّهاً لمستخدم معيّن (recipient)، مع رابط اختياري
 *   للانتقال إليه عند النقر.
 * - TTL بعد 90 يوماً لتفادي تضخّم الجدول.
 * - ندعم الأولوية (info/warning/danger) لعرض لون مختلف في الواجهة.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * أنواع الإشعارات المدعومة.
 * @readonly
 * @enum {string}
 */
export const NOTIFICATION_TYPES = Object.freeze({
  STOCK_LOW: 'stock_low',
  STOCK_EXPIRING: 'stock_expiring',
  STOCK_EXPIRED: 'stock_expired',
  INVOICE_DUE: 'invoice_due',
  INVOICE_OVERDUE: 'invoice_overdue',
  CHECK_DUE: 'check_due',
  CHECK_OVERDUE: 'check_overdue',
  RETURN_GRACE_WARNING: 'return_grace_warning',
  SALES_REP_SETTLEMENT: 'sales_rep_settlement',
  ACCOUNT_LOCKED: 'account_locked',
  SYSTEM: 'system',
});

/**
 * مستويات الأولوية.
 * @readonly
 * @enum {string}
 */
export const NOTIFICATION_LEVELS = Object.freeze({
  INFO: 'info',
  WARNING: 'warning',
  DANGER: 'danger',
});

/**
 * Schema الإشعار.
 */
const notificationSchema = new Schema(
  {
    /**
     * المستخدم المستهدف.
     */
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'المستلم مطلوب.'],
      index: true,
    },

    /**
     * نوع الإشعار.
     */
    type: {
      type: String,
      required: true,
      enum: Object.values(NOTIFICATION_TYPES),
      index: true,
    },

    /**
     * مستوى الأولوية (يحدّد اللون والأيقونة).
     */
    level: {
      type: String,
      enum: Object.values(NOTIFICATION_LEVELS),
      default: NOTIFICATION_LEVELS.INFO,
    },

    /**
     * عنوان مختصر.
     */
    title: {
      type: String,
      required: [true, 'عنوان الإشعار مطلوب.'],
      trim: true,
      maxlength: [120, 'العنوان طويل جداً.'],
    },

    /**
     * نص الإشعار.
     */
    message: {
      type: String,
      required: [true, 'نص الإشعار مطلوب.'],
      trim: true,
      maxlength: [500, 'النص طويل جداً.'],
    },

    /**
     * رابط اختياري للانتقال إليه عند النقر.
     */
    link: {
      type: String,
      default: '',
      trim: true,
    },

    /**
     * مرجع اختياري لكيان مرتبط (مثل Invoice).
     */
    reference: {
      type: {
        type: String,
        default: '',
        trim: true,
      },
      id: {
        type: Schema.Types.ObjectId,
        default: null,
      },
    },

    /**
     * هل قُرئ؟
     */
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    /**
     * متى قُرئ؟
     */
    readAt: {
      type: Date,
      default: null,
    },

    /**
     * بيانات إضافية حرة (مثل batch, expiry).
     */
    meta: {
      type: Schema.Types.Mixed,
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
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1, createdAt: -1 });

/**
 * TTL — نحذف الإشعارات تلقائياً بعد 90 يوماً.
 */
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 90 }
);

/**
 * تعليم الإشعار كمقروء.
 * @returns {void}
 */
notificationSchema.methods.markAsRead = function markAsRead() {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
  }
};

export const Notification = model('Notification', notificationSchema);

export default Notification;