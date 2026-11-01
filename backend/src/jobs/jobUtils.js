/**
 * @file jobUtils.js
 * @description مساعدات مشتركة لكل Jobs (تنبيهات المخزون).
 *
 * لماذا هذا الملف؟
 * - توحيد جلب المستلمين (admin + storekeeper).
 * - توحيد إنشاء الإشعارات الداخلية.
 * - توحيد إرسال البريد بقالب RTL موحّد.
 * - التخزين المؤقت للناقل لتفادي إعادة الإنشاء.
 * - كل دالة تُعيد نتيجة واضحة ولا ترمي استثناءات (Jobs لا تُسقط السيرفر).
 */

import nodemailer from 'nodemailer';

import { env } from '../config/env.js';
import { User, USER_ROLES } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { logger } from '../utils/logger.js';

// ============================================================
// 1) المستلمون
// ============================================================

/**
 * جلب المستلمين (admin + storekeeper النشطين).
 * @async
 * @returns {Promise<Array<{_id, name, email, role}>>}
 */
export async function getAlertRecipients() {
  try {
    return await User.find({
      role: { $in: [USER_ROLES.ADMIN, USER_ROLES.STOREKEEPER] },
      isActive: true,
    })
      .select('_id name email role')
      .lean();
  } catch (error) {
    logger.error(`فشل جلب مستلمي التنبيهات: ${error.message}`);
    return [];
  }
}

// ============================================================
// 2) البريد الإلكتروني
// ============================================================

/** @type {import('nodemailer').Transporter|null} */
let cachedTransporter = null;

/**
 * الحصول على الناقل (مع تخزين مؤقت).
 * @returns {import('nodemailer').Transporter}
 */
function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    host: env.EMAIL_HOST,
    port: Number(env.EMAIL_PORT),
    secure: Number(env.EMAIL_PORT) === 465,
    auth: {
      user: env.EMAIL_USER,
      pass: env.EMAIL_PASS,
    },
  });

  return cachedTransporter;
}

/**
 * إرسال بريد تنبيه.
 * @async
 * @param {Object} params
 * @param {string|string[]} params.to
 * @param {string} params.subject
 * @param {string} params.html
 * @returns {Promise<{sent: boolean, messageId?: string, error?: string}>}
 */
export async function sendAlertEmail({ to, subject, html }) {
  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: `"نظام Pharma" <${env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`فشل إرسال بريد التنبيه: ${error.message}`);
    return { sent: false, error: error.message };
  }
}

/**
 * غلاف HTML موحّد لكل رسائل التنبيه (RTL).
 * @param {Object} params
 * @returns {string}
 */
export function wrapEmailHtml({ title, intro, bodyHtml, ctaText, ctaUrl }) {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="UTF-8"><style>
body{font-family:Tahoma,sans-serif;background:#f5f5f5;padding:20px;margin:0}
.container{max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.05)}
.header{background:#1E40AF;color:#fff;padding:24px;text-align:center}
.header h1{margin:0;font-size:20px}
.body{padding:24px;color:#1f2937;line-height:1.7}
.intro{margin:0 0 16px}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:14px}
th{background:#f3f4f6;padding:10px;text-align:right;border-bottom:2px solid #e5e7eb;font-weight:700}
td{padding:10px;border-bottom:1px solid #f3f4f6;text-align:right}
.numeric{font-family:monospace}
.cta{display:inline-block;margin-top:20px;background:#1E40AF;color:#fff!important;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600}
.footer{padding:16px;text-align:center;color:#6b7280;font-size:12px;background:#f9fafb}
</style></head><body><div class="container">
<div class="header"><h1>${title}</h1></div>
<div class="body"><p class="intro">${intro}</p>${bodyHtml}
${ctaUrl && ctaText ? `<a href="${ctaUrl}" class="cta">${ctaText}</a>` : ''}</div>
<div class="footer">رسالة تلقائية من نظام Pharma — لا تردّ عليها.</div>
</div></body></html>`.trim();
}

// ============================================================
// 3) الإشعارات الداخلية
// ============================================================

/**
 * إنشاء إشعار داخلي إذا لم يوجد إشعار غير مقروء بنفس المرجع.
 *
 * منطق منع السبام:
 * - إذا كان المستخدم لم يقرأ الإشعار السابق → نُبقي واحداً فقط.
 * - إذا قرأه وبقيت المشكلة → نُنشئ إشعاراً جديداً في التشغيل التالي.
 *
 * @async
 * @param {Object} params
 * @returns {Promise<boolean>} هل أُنشئ؟
 */
export async function createNotificationIfNotRecent({
  recipient,
  type,
  level,
  title,
  message,
  link = '',
  reference = null,
  meta = null,
}) {
  try {
    const query = { recipient, type, isRead: false };

    if (reference?.type && reference?.id) {
      query['reference.type'] = reference.type;
      query['reference.id'] = reference.id;
    }

    const existing = await Notification.findOne(query).select('_id').lean();
    if (existing) return false;

    await Notification.create({
      recipient,
      type,
      level,
      title,
      message,
      link,
      reference: reference
        ? { type: reference.type, id: reference.id }
        : { type: '', id: null },
      meta,
    });
    return true;
  } catch (error) {
    logger.error(`فشل إنشاء إشعار داخلي: ${error.message}`);
    return false;
  }
}

// ============================================================
// 4) تنسيقات
// ============================================================

/**
 * تنسيق تاريخ (dd/mm/yyyy).
 * @param {Date|string} value
 * @returns {string}
 */
export function formatDateShort(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${d.getFullYear()}`;
  } catch {
    return '—';
  }
}

/**
 * عدد الأيام حتى تاريخ (موجب مستقبل، سالب ماضٍ).
 * @param {Date|string} value
 * @returns {number}
 */
export function daysUntil(value) {
  if (!value) return 0;
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 0;
    return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

export default {
  getAlertRecipients,
  sendAlertEmail,
  wrapEmailHtml,
  createNotificationIfNotRecent,
  formatDateShort,
  daysUntil,
};