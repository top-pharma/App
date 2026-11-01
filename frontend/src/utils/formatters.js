/**
 * @file formatters.js
 * @description دوال التنسيق (عملة، تاريخ، أرقام، نصوص)
 *
 * لماذا هذا الملف:
 * - مكان واحد للتنسيقات.
 * - ضمان الاتساق في كل التطبيق.
 * - دعم RTL + أرقام إنجليزية.
 */

import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';

import { CURRENCY, DATE_FORMAT, ROLE_LABELS_AR, INVOICE_STATUS_LABELS_AR } from './constants.js';

// ═══════════════════════════════════════════════
// 1. الأرقام
// ═══════════════════════════════════════════════

/**
 * تنسيق رقم بفواصل الآلاف (أرقام إنجليزية)
 * @param {number|string} value
 * @param {number} decimals - عدد المنازل العشرية
 * @returns {string}
 * @example formatNumber(1234567.89) → "1,234,567.89"
 */
export function formatNumber(value, decimals = 0) {
  const num = Number(value);

  if (Number.isNaN(num)) {
    return '0';
  }

  return new Intl.NumberFormat(CURRENCY.LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

// ═══════════════════════════════════════════════
// 2. العملة (SDG)
// ═══════════════════════════════════════════════

/**
 * تنسيق مبلغ بعملة SDG
 * @param {number|string} value
 * @param {boolean} withSymbol - إظهار "SDG"
 * @returns {string}
 * @example formatCurrency(1234.5) → "1,234.50 SDG"
 */
export function formatCurrency(value, withSymbol = true) {
  const num = Number(value);

  if (Number.isNaN(num)) {
    return withSymbol ? `0.00 ${CURRENCY.SYMBOL}` : '0.00';
  }

  const formatted = formatNumber(num, CURRENCY.DECIMALS);

  return withSymbol ? `${formatted} ${CURRENCY.SYMBOL}` : formatted;
}

/**
 * تنسيق مبلغ مختصر (للوحات التحكم)
 * @param {number} value
 * @returns {string}
 * @example formatCurrencyShort(1500000) → "1.5M SDG"
 */
export function formatCurrencyShort(value) {
  const num = Number(value);

  if (Number.isNaN(num)) {
    return '0 SDG';
  }

  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toFixed(1)}B SDG`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1)}M SDG`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(1)}K SDG`;
  }

  return `${sign}${formatNumber(abs, 2)} SDG`;
}

// ═══════════════════════════════════════════════
// 3. التواريخ (ميلادية فقط)
// ═══════════════════════════════════════════════

/**
 * تحويل قيمة إلى Date
 * @param {Date|string|number} value
 * @returns {Date|null}
 */
function toDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return isValid(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = parseISO(value);
    return isValid(parsed) ? parsed : null;
  }

  const date = new Date(value);
  return isValid(date) ? date : null;
}

/**
 * تنسيق تاريخ (ميلادي)
 * @param {Date|string} value
 * @param {string} pattern - نمط date-fns
 * @returns {string}
 * @example formatDate('2026-10-12') → "12/10/2026"
 */
export function formatDate(value, pattern = DATE_FORMAT.DISPLAY) {
  const date = toDate(value);

  if (!date) {
    return '—';
  }

  return format(date, pattern);
}

/**
 * تنسيق تاريخ ووقت
 * @param {Date|string} value
 * @returns {string}
 */
export function formatDateTime(value) {
  return formatDate(value, DATE_FORMAT.DISPLAY_LONG);
}

/**
 * تنسيق تاريخ مع الوقت النسبي
 * @param {Date|string} value
 * @returns {string}
 * @example formatRelativeTime('2026-10-12T10:00:00') → "قبل ساعتين"
 */
export function formatRelativeTime(value) {
  const date = toDate(value);

  if (!date) {
    return '—';
  }

  return formatDistanceToNow(date, {
    addSuffix: true,
    locale: {
      formatDistance: (token, count) => {
        // ✅ ترجمة عربية مبسطة
        const map = {
          lessThanXSeconds: 'أقل من ثانية',
          xSeconds: `${count} ثانية`,
          halfAMinute: 'نصف دقيقة',
          lessThanXMinutes: 'أقل من دقيقة',
          xMinutes: `${count} دقيقة`,
          aboutXHours: `حوالي ${count} ساعة`,
          xHours: `${count} ساعة`,
          xDays: `${count} يوم`,
          aboutXWeeks: `حوالي ${count} أسبوع`,
          xWeeks: `${count} أسبوع`,
          aboutXMonths: `حوالي ${count} شهر`,
          xMonths: `${count} شهر`,
          aboutXYears: `حوالي ${count} سنة`,
          xYears: `${count} سنة`,
          overXYears: `أكثر من ${count} سنة`,
          almostXYears: `تقريباً ${count} سنة`,
        };

        return map[token] || `${count}`;
      },
    },
  });
}

/**
 * حساب عدد الأيام حتى تاريخ (موجب = مستقبل، سالب = ماضي)
 * @param {Date|string} value
 * @returns {number}
 */
export function daysUntil(value) {
  const date = toDate(value);

  if (!date) {
    return 0;
  }

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// ═══════════════════════════════════════════════
// 4. النصوص
// ═══════════════════════════════════════════════

/**
 * اختصار نص طويل
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 * @example truncate('نص طويل جداً', 10) → "نص طويل ج..."
 */
export function truncate(text, maxLength = 50) {
  if (!text) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

/**
 * تحويل أول حرف إلى كبير
 * @param {string} text
 * @returns {string}
 */
export function capitalize(text) {
  if (!text) {
    return '';
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * تحويل snake_case إلى Title Case
 * @param {string} text
 * @returns {string}
 */
export function humanize(text) {
  if (!text) {
    return '';
  }

  return text
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(capitalize)
    .join(' ');
}

// ═══════════════════════════════════════════════
// 5. التسميات العربية (Labels)
// ═══════════════════════════════════════════════

/**
 * ترجمة رمز الدور إلى عربي
 * @param {string} role
 * @returns {string}
 */
export function formatRole(role) {
  return ROLE_LABELS_AR[role] || role || '—';
}

/**
 * ترجمة حالة الفاتورة إلى عربي
 * @param {string} status
 * @returns {string}
 */
export function formatInvoiceStatus(status) {
  return INVOICE_STATUS_LABELS_AR[status] || status || '—';
}

// ═══════════════════════════════════════════════
// 6. الهاتف
// ═══════════════════════════════════════════════

/**
 * تنسيق رقم هاتف (سوداني)
 * @param {string} phone
 * @returns {string}
 * @example formatPhone('0912345678') → "0912 345 678"
 */
export function formatPhone(phone) {
  if (!phone) {
    return '—';
  }

  // ✅ إزالة كل ما ليس رقماً
  const digits = String(phone).replace(/\D/g, '');

  // ✅ إذا كان 10 أرقام (سوداني)
  if (digits.length === 10) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }

  return digits;
}

// ═══════════════════════════════════════════════
// 7. النسب
// ═══════════════════════════════════════════════

/**
 * تنسيق نسبة مئوية
 * @param {number} value
 * @param {number} decimals
 * @returns {string}
 * @example formatPercent(12.345) → "12.35%"
 */
export function formatPercent(value, decimals = 2) {
  const num = Number(value);

  if (Number.isNaN(num)) {
    return '0%';
  }

  return `${num.toFixed(decimals)}%`;
}

// ═══════════════════════════════════════════════
// 8. تصدير افتراضي
// ═══════════════════════════════════════════════
export default {
  formatNumber,
  formatCurrency,
  formatCurrencyShort,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  daysUntil,
  truncate,
  capitalize,
  humanize,
  formatRole,
  formatInvoiceStatus,
  formatPhone,
  formatPercent,
};