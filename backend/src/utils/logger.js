/**
 * @file logger.js
 * @description
 * Logger بسيط وموحّد لكل المشروع، بلا أي اعتماديات خارجية.
 *
 * لماذا هذا الملف؟
 * - نريد مكاناً واحداً لضبط شكل السجلات ومستوياتها.
 * - في الإنتاج نُخرج JSON مُهيكل (يسهل جمعه في Render/Railway).
 * - في التطوير نُخرج سطراً ملوّناً مقروءاً للبشر.
 * - لا نستخدم winston/pino لتقليل الاعتماديات (البساطة أولاً).
 * - نمنع تسريب أي قيمة حساسة: الدوال هنا لا تسجّل كائنات `env` أبداً.
 */

import { env, isProduction, isTest } from '../config/env.js';

/**
 * مستويات السجل مرتّبة من الأقل خطورة إلى الأعلى.
 * @readonly
 * @enum {number}
 */
const LEVELS = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 99,
});

/**
 * الألوان المستخدمة في وضع التطوير (ANSI).
 * @readonly
 */
const COLORS = Object.freeze({
  debug: '\x1b[36m', // سماوي
  info: '\x1b[32m', // أخضر
  warn: '\x1b[33m', // أصفر
  error: '\x1b[31m', // أحمر
  reset: '\x1b[0m',
});

/**
 * المستوى الفعّال الحالي.
 * - في الاختبار: silent (لا نُلوّث مخرجات الاختبارات).
 * - في الإنتاج: info وما فوق.
 * - في التطوير: debug وما فوق.
 * @returns {number}
 */
const getActiveLevel = () => {
  if (isTest()) {
    return LEVELS.silent;
  }
  if (isProduction()) {
    return LEVELS.info;
  }
  return LEVELS.debug;
};

/**
 * تنسيق الطابع الزمني بالشكل الميلادي المعتمد في النظام.
 * نستخدم تنسيق ISO لتوحيد القراءة عبر كل البيئات.
 * @returns {string}
 */
const timestamp = () => new Date().toISOString();

/**
 * إخراج السجل في وضع التطوير (نص ملوّن مقروء).
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} message
 * @param {unknown[]} meta
 */
const writeDev = (level, message, meta) => {
  const color = COLORS[level] ?? '';
  const reset = COLORS.reset;
  const tag = `${color}[${level.toUpperCase()}]${reset}`;
  const line = `${tag} ${timestamp()} — ${message}`;

  // نستخدم console مباشرة هنا لأن هذا هو المكان الوحيد المسموح له بذلك.
  /* eslint-disable no-console */
  if (level === 'error') {
    console.error(line, ...meta);
  } else if (level === 'warn') {
    console.warn(line, ...meta);
  } else {
    console.log(line, ...meta);
  }
  /* eslint-enable no-console */
};

/**
 * إخراج السجل في وضع الإنتاج (JSON مُهيكل).
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} message
 * @param {unknown[]} meta
 */
const writeProd = (level, message, meta) => {
  const payload = {
    level,
    time: timestamp(),
    env: env.NODE_ENV,
    message,
  };

  // نُدمج أي كائنات إضافية في الحقل `meta` لتسهيل الفلترة.
  if (meta.length === 1 && typeof meta[0] === 'object' && meta[0] !== null) {
    payload.meta = meta[0];
  } else if (meta.length > 0) {
    payload.meta = meta;
  }

  const line = JSON.stringify(payload);

  /* eslint-disable no-console */
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
  /* eslint-enable no-console */
};

/**
 * كتابة سجل بمستوى معيّن.
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} message
 * @param {unknown[]} meta
 */
const write = (level, message, meta) => {
  if (LEVELS[level] < getActiveLevel()) {
    return;
  }
  if (isProduction()) {
    writeProd(level, message, meta);
  } else {
    writeDev(level, message, meta);
  }
};

/**
 * Logger موحّد.
 * @typedef {Object} Logger
 * @property {(message: string, ...meta: unknown[]) => void} debug
 * @property {(message: string, ...meta: unknown[]) => void} info
 * @property {(message: string, ...meta: unknown[]) => void} warn
 * @property {(message: string, ...meta: unknown[]) => void} error
 * @property {() => void} success
 */

/** @type {Logger} */
export const logger = {
  /**
   * سجل تصحيحي — للتطوير فقط.
   * @param {string} message
   * @param {...unknown} meta
   */
  debug(message, ...meta) {
    write('debug', message, meta);
  },

  /**
   * سجل معلوماتي.
   * @param {string} message
   * @param {...unknown} meta
   */
  info(message, ...meta) {
    write('info', message, meta);
  },

  /**
   * سجل تحذيري.
   * @param {string} message
   * @param {...unknown} meta
   */
  warn(message, ...meta) {
    write('warn', message, meta);
  },

  /**
   * سجل خطأ.
   * @param {string} message
   * @param {...unknown} meta
   */
  error(message, ...meta) {
    write('error', message, meta);
  },

  /**
   * سجل نجاح (يظهر كـ info لكن مع علامة بصرية).
   * مفيد في Seed Script لتمييز الخطوات الناجحة.
   * @param {string} message
   * @param {...unknown} meta
   */
  success(message, ...meta) {
    write('info', `✅ ${message}`, meta);
  },
};

export default logger;