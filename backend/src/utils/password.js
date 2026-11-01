/**
 * @file password.js
 * @description
 * أدوات تشفير والتحقق من كلمات المرور + توليد كلمات مرور آمنة.
 *
 * لماذا هذا الملف؟
 * - نعزل bcrypt في مكان واحد، فلا نُكرّر عدد الدورات (rounds) في كل مكان.
 * - نضيف فحوصات مبكرة على المدخلات، لأن bcrypt يفشل بطرق غير واضحة
 *   عند تمرير قيم غير نصية أو فارغة.
 * - نُوفّر مولّد كلمات مرور قوية ليستخدمه الأدمن عند إنشاء المستخدمين.
 * - لا نكشف كلمة المرور أبداً في أي رسالة خطأ أو سجل.
 */

import bcrypt from 'bcrypt';

import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * الحد الأدنى والأقصى لطول كلمة المرور.
 * الحد الأدنى 8 لأن هذا ما نتوقعه من مستخدمي الشركة.
 * الحد الأقصى 128 لمنع هجمات DoS على bcrypt بكلمات ضخمة.
 * @readonly
 */
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

/**
 * تشفير كلمة المرور باستخدام bcrypt.
 *
 * @async
 * @param {string} plainPassword - كلمة المرور بالنص الصريح.
 * @returns {Promise<string>} الهاش الجاهز للتخزين.
 * @throws {TypeError} إذا كان المدخل غير نصي.
 * @throws {Error} إذا كان الطول خارج النطاق المسموح.
 */
export const hashPassword = async (plainPassword) => {
  if (typeof plainPassword !== 'string') {
    throw new TypeError('كلمة المرور يجب أن تكون نصاً.');
  }

  if (
    plainPassword.length < PASSWORD_MIN_LENGTH ||
    plainPassword.length > PASSWORD_MAX_LENGTH
  ) {
    throw new Error(
      `طول كلمة المرور يجب أن يكون بين ${PASSWORD_MIN_LENGTH} و ${PASSWORD_MAX_LENGTH} حرفاً.`
    );
  }

  try {
    const hash = await bcrypt.hash(plainPassword, env.BCRYPT_ROUNDS);
    return hash;
  } catch (error) {
    // لا نُدرج كلمة المرور في الرسالة.
    logger.error(`فشل تشفير كلمة المرور: ${error.message}`);
    throw new Error('تعذّر تشفير كلمة المرور.');
  }
};

/**
 * التحقق من مطابقة كلمة المرور للهاش المخزّن.
 *
 * ملاحظة أمنية: نُرجع false دائماً عند أي خطأ (مدخلات غير صالحة، هاش تالف)
 * بدلاً من رمي استثناء، حتى لا نكشف تفاصيل تقنية للمهاجم.
 *
 * @async
 * @param {string} plainPassword - كلمة المرور المُدخلة.
 * @param {string} hashedPassword - الهاش المخزّن في قاعدة البيانات.
 * @returns {Promise<boolean>} true إذا تطابقت.
 */
export const verifyPassword = async (plainPassword, hashedPassword) => {
  if (typeof plainPassword !== 'string' || typeof hashedPassword !== 'string') {
    return false;
  }
  if (plainPassword.length === 0 || hashedPassword.length === 0) {
    return false;
  }

  try {
    return await bcrypt.compare(plainPassword, hashedPassword);
  } catch (error) {
    logger.error(`فشل التحقق من كلمة المرور: ${error.message}`);
    return false;
  }
};

/**
 * توليد كلمة مرور عشوائية قوية.
 * نستخدمها عندما يُنشئ الأدمن مستخدماً جديداً ونريد كلمة مرور مؤقتة.
 *
 * القواعد:
 * - 12 حرفاً افتراضياً.
 * - تحتوي على أحرف كبيرة وصغيرة وأرقام ورموز.
 * - نستبعد الأحرف المتشابهة (O/0, l/1, I) لتقليل أخطاء الإدخال اليدوي.
 *
 * @param {number} [length=12] - طول كلمة المرور.
 * @returns {string}
 */
export const generateRandomPassword = (length = 12) => {
  const safeLength = Math.max(8, Math.min(64, Math.floor(length)));

  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = upper + lower + digits + symbols;

  /**
   * اختيار عنصر عشوائي من نص.
   * @param {string} source
   * @returns {string}
   */
  const pick = (source) => {
    const index = Math.floor(Math.random() * source.length);
    return source[index];
  };

  // نضمن وجود حرف واحد على الأقل من كل فئة.
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];

  const remainingLength = safeLength - required.length;
  const rest = Array.from({ length: remainingLength }, () => pick(all));

  // خلط عشوائي بسيط (Fisher–Yates) حتى لا تكون الفئات في البداية دائماً.
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
};

/**
 * التحقق من أن كلمة المرور تحقق الحد الأدنى من التعقيد.
 * نستخدمها في Zod Validator وأيضاً قبل أي عملية تغيير كلمة مرور.
 *
 * @param {string} password
 * @returns {{ valid: boolean, message?: string }}
 */
export const validatePasswordStrength = (password) => {
  if (typeof password !== 'string') {
    return { valid: false, message: 'كلمة المرور يجب أن تكون نصاً.' };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      message: `كلمة المرور يجب أن تكون ${PASSWORD_MIN_LENGTH} أحرف على الأقل.`,
    };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      valid: false,
      message: `كلمة المرور يجب ألا تتجاوز ${PASSWORD_MAX_LENGTH} حرفاً.`,
    };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'كلمة المرور يجب أن تحتوي على حرف كبير واحد على الأقل.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'كلمة المرور يجب أن تحتوي على حرف صغير واحد على الأقل.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'كلمة المرور يجب أن تحتوي على رقم واحد على الأقل.' };
  }

  return { valid: true };
};

export const PASSWORD_RULES = Object.freeze({
  MIN_LENGTH: PASSWORD_MIN_LENGTH,
  MAX_LENGTH: PASSWORD_MAX_LENGTH,
});

export default {
  hashPassword,
  verifyPassword,
  generateRandomPassword,
  validatePasswordStrength,
  PASSWORD_RULES,
};