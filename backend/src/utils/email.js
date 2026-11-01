/**
 * @file email.js
 * @description
 * إرسال البريد الإلكتروني عبر Nodemailer (Ethereal في التطوير).
 *
 * لماذا هذا الملف؟
 * - نُغلّف Nodemailer في transporter واحد (singleton) لتقليل الاتصالات.
 * - في التطوير نستخدم Ethereal، فتُطبع معاينة الرسالة في السجل
 *   بدلاً من إرسالها فعلياً — مفيد لاختبار استرداد كلمة المرور.
 * - نُوفّر قوالب نصية عربية جاهزة (استرداد كلمة المرور، إشعارات إدارية).
 * - لا نُدرج أي سرّ في السجلات (لا نطبع EMAIL_PASS).
 */

import nodemailer from 'nodemailer';

import { env, isProduction } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Transporter مُخزّن لتفادي إنشاء اتصال جديد لكل بريد.
 * @type {import('nodemailer').Transporter | null}
 */
let transporter = null;

/**
 * الحصول على transporter (يُنشأ مرة واحدة فقط).
 *
 * @returns {import('nodemailer').Transporter}
 */
const getTransporter = () => {
  if (transporter) {
    return transporter;
  }

  // إذا لم تُضبط بيانات البريد، نستخدم وضع "تسجيل فقط" (لا يُرسل شيئاً).
  const hasCredentials = Boolean(env.EMAIL_USER && env.EMAIL_PASS);

  if (!hasCredentials) {
    logger.warn(
      '⚠️  بيانات البريد (EMAIL_USER / EMAIL_PASS) غير مضبوطة — سيتم تسجيل الرسائل فقط بلا إرسال.'
    );
    transporter = nodemailer.createTransport({
      jsonTransport: true,
    });
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: env.EMAIL_HOST,
    port: env.EMAIL_PORT,
    secure: env.EMAIL_SECURE,
    auth: {
      user: env.EMAIL_USER,
      pass: env.EMAIL_PASS,
    },
  });

  return transporter;
};

/**
 * التحقق من صحة إعدادات البريد عند بدء التشغيل.
 * تُستدعى مرة واحدة من server.js (اختيارية لكن مفيدة).
 *
 * @async
 * @returns {Promise<boolean>}
 */
export const verifyEmailConnection = async () => {
  try {
    const tx = getTransporter();
    await tx.verify();
    logger.info('✅ إعدادات البريد الإلكتروني صالحة.');
    return true;
  } catch (error) {
    logger.warn(`⚠️  تعذّر التحقق من إعدادات البريد: ${error.message}`);
    return false;
  }
};

/**
 * إرسال بريد إلكتروني عام.
 *
 * @async
 * @param {Object} params
 * @param {string} params.to - عنوان المستلم.
 * @param {string} params.subject - موضوع الرسالة.
 * @param {string} params.text - النص الصريح.
 * @param {string} [params.html] - نسخة HTML (اختيارية).
 * @returns {Promise<{ sent: boolean, previewUrl?: string, messageId?: string }>}
 */
export const sendEmail = async ({ to, subject, text, html }) => {
  if (!to || !subject || (!text && !html)) {
    logger.error('فشل إرسال البريد: بيانات ناقصة.');
    return { sent: false };
  }

  try {
    const tx = getTransporter();
    const info = await tx.sendMail({
      from: env.EMAIL_FROM,
      to,
      subject,
      text,
      html,
    });

    // في التطوير مع Ethereal، نطبع رابط المعاينة لتسهيل الفحص.
    const previewUrl = !isProduction() ? nodemailer.getTestMessageUrl(info) : null;

    if (previewUrl) {
      logger.info(`📧 معاينة البريد (Ethereal): ${previewUrl}`);
    } else {
      logger.info(`📧 تم إرسال البريد إلى ${to} — الموضوع: ${subject}`);
    }

    return {
      sent: true,
      previewUrl: previewUrl || undefined,
      messageId: info.messageId,
    };
  } catch (error) {
    logger.error(`❌ فشل إرسال البريد: ${error.message}`);
    return { sent: false };
  }
};

/**
 * قالب بريد استرداد كلمة المرور.
 *
 * @async
 * @param {Object} params
 * @param {string} params.to
 * @param {string} params.name - اسم المستخدم (للتحية).
 * @param {string} params.resetUrl - رابط إعادة التعيين.
 * @param {number} [params.expiresMinutes=30]
 * @returns {Promise<{ sent: boolean, previewUrl?: string }>}
 */
export const sendPasswordResetEmail = async ({
  to,
  name,
  resetUrl,
  expiresMinutes = 30,
}) => {
  const subject = 'إعادة تعيين كلمة المرور — نظام إدارة الأدوية';

  const text = [
    `مرحباً ${name},`,
    '',
    'وصلنا طلب لإعادة تعيين كلمة المرور لحسابك في نظام إدارة الأدوية.',
    '',
    `رابط إعادة التعيين (صالح لمدة ${expiresMinutes} دقيقة):`,
    resetUrl,
    '',
    'إذا لم تطلب هذا، يمكنك تجاهل الرسالة — لن يتغير شيء.',
    '',
    'مع تحيات،',
    'فريق نظام إدارة الأدوية',
  ].join('\n');

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.8; color: #111;">
      <h2 style="margin: 0 0 12px;">إعادة تعيين كلمة المرور</h2>
      <p>مرحباً <strong>${name}</strong>,</p>
      <p>وصلنا طلب لإعادة تعيين كلمة المرور لحسابك في نظام إدارة الأدوية.</p>
      <p>
        <a href="${resetUrl}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none;">
          إعادة تعيين كلمة المرور
        </a>
      </p>
      <p style="font-size: 13px; color: #555;">
        الرابط صالح لمدة ${expiresMinutes} دقيقة. إذا لم تطلب هذا، تجاهل الرسالة.
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />
      <p style="font-size: 12px; color: #888;">نظام إدارة الأدوية — السودان</p>
    </div>
  `;

  return sendEmail({ to, subject, text, html });
};

/**
 * قالب بريد إنشاء حساب جديد (يُرسل للمستخدم عند إنشائه بواسطة الأدمن).
 *
 * @async
 * @param {Object} params
 * @param {string} params.to
 * @param {string} params.name
 * @param {string} params.roleLabel - اسم الدور بالعربية.
 * @param {string} params.loginUrl
 * @param {string} [params.temporaryPassword] - كلمة مرور مؤقتة (إن وُجدت).
 * @returns {Promise<{ sent: boolean, previewUrl?: string }>}
 */
export const sendWelcomeEmail = async ({
  to,
  name,
  roleLabel,
  loginUrl,
  temporaryPassword,
}) => {
  const subject = 'تم إنشاء حسابك — نظام إدارة الأدوية';

  const passwordLine = temporaryPassword
    ? `كلمة المرور المؤقتة: ${temporaryPassword}\n(يُنصح بتغييرها فور أول تسجيل دخول)`
    : 'سيتم تزويدك بكلمة المرور من قبل الإدارة.';

  const text = [
    `مرحباً ${name},`,
    '',
    `تم إنشاء حسابك في نظام إدارة الأدوية بصفة: ${roleLabel}.`,
    '',
    passwordLine,
    '',
    `رابط الدخول: ${loginUrl}`,
    '',
    'مع تحيات،',
    'فريق نظام إدارة الأدوية',
  ].join('\n');

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.8; color: #111;">
      <h2 style="margin: 0 0 12px;">تم إنشاء حسابك</h2>
      <p>مرحباً <strong>${name}</strong>,</p>
      <p>تم إنشاء حسابك بصفة: <strong>${roleLabel}</strong>.</p>
      ${
        temporaryPassword
          ? `<p>كلمة المرور المؤقتة: <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;">${temporaryPassword}</code></p>
             <p style="font-size: 13px; color:#b45309;">يُنصح بتغييرها فور أول تسجيل دخول.</p>`
          : '<p>سيتم تزويدك بكلمة المرور من قبل الإدارة.</p>'
      }
      <p>
        <a href="${loginUrl}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none;">
          تسجيل الدخول
        </a>
      </p>
      <p style="font-size: 12px; color: #888;">نظام إدارة الأدوية — السودان</p>
    </div>
  `;

  return sendEmail({ to, subject, text, html });
};

export default {
  verifyEmailConnection,
  sendEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
};