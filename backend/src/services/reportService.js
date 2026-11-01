/**
 * @file reportService.js
 * @description
 * دوال مساعدة مشتركة بين كل التقارير.
 *
 * لماذا هذا الملف؟
 * - يمنع تكرار الكود في 5 controllers.
 * - يوحّد طريقة التعامل مع التواريخ (from/to) والأرقام.
 * - يوفر تسميات عربية للحسابات والأنواع (لا magic strings).
 * - يعالج scope (المندوب يرى بياناته فقط، الصيدلية ترى فواتيرها فقط).
 */

import mongoose from 'mongoose';

import {
  ACCOUNTING_ENTRY_TYPES,
  INVOICE_STATUS,
  CHECK_STATUS,
  CHECK_TYPES,
  PAYMENT_TYPES,
} from '../utils/constants.js';
import { AppError } from '../middlewares/errorMiddleware.js';

/* ─────────────────────────────────────────────────────────────
 * 1) تقريب آمن
 * ───────────────────────────────────────────────────────────── */

/**
 * تقريب آمن لخانتين عشريتين.
 * @param {number} n
 * @returns {number}
 */
export function round2(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/* ─────────────────────────────────────────────────────────────
 * 2) التواريخ
 * ───────────────────────────────────────────────────────────── */

/**
 * بداية اليوم (00:00:00.000).
 * @param {Date|string} date
 * @returns {Date}
 */
export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * نهاية اليوم (23:59:59.999).
 * @param {Date|string} date
 * @returns {Date}
 */
export function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * تحويل تاريخ إلى نص YYYY-MM-DD (للتصدير والعرض).
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDate(date) {
  if (!date) return '';
  try {
    return new Date(date).toLocaleDateString('en-GB');
  } catch {
    return '';
  }
}

/**
 * تحويل تاريخ + وقت إلى نص (للترويسة).
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDateTime(date) {
  if (!date) return '';
  try {
    return new Date(date).toLocaleString('en-GB');
  } catch {
    return '';
  }
}

/**
 * التحقق من نطاق تاريخي (from/to) وإرجاعهما كـ Date.
 * @param {string} from
 * @param {string} to
 * @returns {{ from: Date, to: Date }}
 * @throws {AppError}
 */
export function validateRange(from, to) {
  const f = startOfDay(from);
  const t = endOfDay(to);

  if (Number.isNaN(f.getTime())) {
    throw new AppError('صيغة تاريخ البداية غير صالحة.', 400, 'INVALID_FROM_DATE');
  }
  if (Number.isNaN(t.getTime())) {
    throw new AppError('صيغة تاريخ النهاية غير صالحة.', 400, 'INVALID_TO_DATE');
  }
  if (f > t) {
    throw new AppError('تاريخ البداية يجب أن يسبق النهاية.', 400, 'INVALID_DATE_RANGE');
  }

  return { from: f, to: t };
}

/**
 * نطاق تاريخي افتراضي (هذا الشهر — من أول الشهر إلى اليوم).
 * @returns {{ from: Date, to: Date }}
 */
export function defaultMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now);
  return { from: startOfDay(from), to: endOfDay(to) };
}

/**
 * نطاق تاريخي افتراضي (آخر 30 يوماً).
 * @returns {{ from: Date, to: Date }}
 */
export function defaultLast30Days() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: startOfDay(from), to: endOfDay(to) };
}

/* ─────────────────────────────────────────────────────────────
 * 3) بيانات الترويسة (للتصدير)
 * ───────────────────────────────────────────────────────────── */

/**
 * بناء meta object لتمريره إلى التصدير.
 * @param {Object} params
 * @param {string} params.title - عنوان التقرير
 * @param {Date} [params.from]
 * @param {Date} [params.to]
 * @returns {Object}
 */
export function makeExportMeta({ title, from, to }) {
  return {
    title,
    periodLabel: from && to
      ? `${formatDate(from)} — ${formatDate(to)}`
      : (to ? `حتى ${formatDate(to)}` : 'كل الفترات'),
    from: from ? formatDate(from) : '',
    to: to ? formatDate(to) : '',
    generatedAt: formatDateTime(new Date()),
    company: 'TOP PHARMA MEDICAL COMPANY',
    companyAr: 'شركة توب فارما الطبية',
  };
}

/* ─────────────────────────────────────────────────────────────
 * 4) تصنيف الحسابات (للتحليل المالي)
 * ───────────────────────────────────────────────────────────── */

/**
 * تصنيف حساب حسب أول رقم من كوده.
 * 1 = أصول، 2 = خصوم، 3 = حقوق ملكية، 4 = إيرادات، 5 = تكاليف، 6 = مصروفات.
 * @param {string} accountCode
 * @returns {'asset'|'liability'|'equity'|'revenue'|'cost'|'expense'|'unknown'}
 */
export function classifyAccount(accountCode) {
  const code = String(accountCode || '').trim();
  if (!code) return 'unknown';
  const first = code.charAt(0);
  if (first === '1') return 'asset';
  if (first === '2') return 'liability';
  if (first === '3') return 'equity';
  if (first === '4') return 'revenue';
  if (first === '5') return 'cost';
  if (first === '6') return 'expense';
  return 'unknown';
}

/**
 * تسمية عربية لنوع الحساب.
 */
export const ACCOUNT_TYPE_LABELS = Object.freeze({
  asset: 'أصول',
  liability: 'خصوم',
  equity: 'حقوق ملكية',
  revenue: 'إيرادات',
  cost: 'تكاليف',
  expense: 'مصروفات',
  unknown: 'غير مصنف',
});

/* ─────────────────────────────────────────────────────────────
 * 5) تسميات عربية للـ enums
 * ───────────────────────────────────────────────────────────── */

/**
 * تسميات أنواع القيود المحاسبية.
 */
export const ENTRY_TYPE_LABELS = Object.freeze({
  [ACCOUNTING_ENTRY_TYPES.SALE_CASH]: 'بيع نقدي',
  [ACCOUNTING_ENTRY_TYPES.SALE_CREDIT]: 'بيع آجل',
  [ACCOUNTING_ENTRY_TYPES.SALE_RETURN]: 'مرتجع بيع',
  [ACCOUNTING_ENTRY_TYPES.CUSTOMER_PAYMENT]: 'دفعة عميل',
  [ACCOUNTING_ENTRY_TYPES.PURCHASE]: 'مشتريات',
  [ACCOUNTING_ENTRY_TYPES.PURCHASE_RETURN]: 'مرتجع مشتريات',
  [ACCOUNTING_ENTRY_TYPES.CHECK_RECEIVED]: 'استلام شيك',
  [ACCOUNTING_ENTRY_TYPES.CHECK_COLLECTED]: 'تحصيل شيك',
  [ACCOUNTING_ENTRY_TYPES.CHECK_BOUNCED]: 'ارتداد شيك',
  [ACCOUNTING_ENTRY_TYPES.CHECK_ISSUED]: 'إصدار شيك',
  [ACCOUNTING_ENTRY_TYPES.CHECK_PAID]: 'صرف شيك',
  [ACCOUNTING_ENTRY_TYPES.CASH_TRANSFER]: 'تحويل نقدي',
  [ACCOUNTING_ENTRY_TYPES.CASH_DEPOSIT]: 'إيداع نقدي',
  [ACCOUNTING_ENTRY_TYPES.CASH_WITHDRAWAL]: 'سحب نقدي',
  [ACCOUNTING_ENTRY_TYPES.EXPENSE]: 'مصروف',
  [ACCOUNTING_ENTRY_TYPES.OPENING]: 'قيد افتتاحي',
  [ACCOUNTING_ENTRY_TYPES.ADJUSTMENT]: 'تسوية',
  [ACCOUNTING_ENTRY_TYPES.REVERSAL]: 'قيد عكسي',
});

/**
 * تسميات حالات الفاتورة.
 */
export const INVOICE_STATUS_LABELS = Object.freeze({
  [INVOICE_STATUS.DRAFT]: 'مسودة',
  [INVOICE_STATUS.PENDING]: 'معلقة',
  [INVOICE_STATUS.PARTIAL]: 'مدفوعة جزئياً',
  [INVOICE_STATUS.PAID]: 'مدفوعة',
  [INVOICE_STATUS.OVERDUE]: 'متأخرة',
  [INVOICE_STATUS.CANCELLED]: 'ملغاة',
});

/**
 * تسميات حالات الشيك.
 */
export const CHECK_STATUS_LABELS = Object.freeze({
  [CHECK_STATUS.PENDING]: 'معلّق',
  [CHECK_STATUS.PAID]: 'مصروف',
  [CHECK_STATUS.BOUNCED]: 'مرتد',
  [CHECK_STATUS.CANCELLED]: 'ملغى',
});

/**
 * تسميات أنواع الشيك.
 */
export const CHECK_TYPE_LABELS = Object.freeze({
  [CHECK_TYPES.INCOMING]: 'وارد',
  [CHECK_TYPES.OUTGOING]: 'صادر',
});

/**
 * تسميات طرق الدفع.
 */
export const PAYMENT_TYPE_LABELS = Object.freeze({
  [PAYMENT_TYPES.CASH]: 'نقدي',
  [PAYMENT_TYPES.CREDIT]: 'آجل',
  [PAYMENT_TYPES.INSTALLMENTS]: 'أقساط',
});

/* ─────────────────────────────────────────────────────────────
 * 6) Scope — الفلترة حسب الدور
 * ───────────────────────────────────────────────────────────── */

/**
 * بناء شرط scope حسب دور المستخدم.
 * ⚠️ يتحقق من type of `linkedEntity.id` (ObjectId أو string أو كائن).
 * @param {Object} req
 * @returns {Object}
 */
export function buildScope(req) {
  if (!req?.user) return {};

  if (req.user.role === 'sales_rep') {
    try {
      return { salesRep: new mongoose.Types.ObjectId(req.user._id) };
    } catch {
      return {};
    }
  }

  if (req.user.role === 'pharmacy') {
    // ⚠️ linkedEntity قد يكون: null | { type, id } | { _id }
    const raw = req.user.linkedEntity;
    let customerId = null;

    if (raw) {
      if (raw.id) customerId = raw.id;
      else if (raw._id) customerId = raw._id;
      else if (typeof raw === 'string') customerId = raw;
    }

    if (customerId && mongoose.Types.ObjectId.isValid(String(customerId))) {
      return { pharmacy: new mongoose.Types.ObjectId(String(customerId)) };
    }
    // صيدلية غير مربوطة → لا ترى شيئاً
    return { pharmacy: new mongoose.Types.ObjectId('000000000000000000000000') };
  }

  return {};
}

/**
 * التحقق من صلاحية ObjectId.
 * @param {string} id
 * @returns {boolean}
 */
export function isValidObjectId(id) {
  if (!id) return false;
  return mongoose.Types.ObjectId.isValid(String(id));
}

/**
 * تحويل آمن إلى ObjectId (يرمي 400 إن لم يكن صالحاً).
 * @param {string} id
 * @param {string} [fieldName]
 * @returns {mongoose.Types.ObjectId}
 */
export function toObjectId(id, fieldName = 'id') {
  if (!isValidObjectId(id)) {
    throw new AppError(`${fieldName} غير صالح.`, 400, 'INVALID_ID');
  }
  return new mongoose.Types.ObjectId(id);
}

/* ─────────────────────────────────────────────────────────────
 * 7) الترقيم (pagination)
 * ───────────────────────────────────────────────────────────── */

/**
 * حساب skip/limit من page/limit.
 * @param {Object} params
 * @param {number} [params.page=1]
 * @param {number} [params.limit=100]
 * @returns {{ skip: number, limit: number, page: number }}
 */
export function pagination({ page = 1, limit = 100 } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(500, Math.max(1, Number(limit) || 100));
  return { skip: (p - 1) * l, limit: l, page: p };
}

/**
 * بناء meta للترقيم (للاستجابة).
 * @param {Object} params
 * @param {number} params.page
 * @param {number} params.limit
 * @param {number} params.total
 * @returns {Object}
 */
export function paginationMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/* ─────────────────────────────────────────────────────────────
 * 8) مساعدات صغيرة
 * ───────────────────────────────────────────────────────────── */

/**
 * إرجاع قيمة أو بديل عند null/undefined/فراغ.
 * @param {*} value
 * @param {string} [fallback='—']
 * @returns {*}
 */
export function orDash(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  return value;
}

/**
 * اسم مختصر للصيدلية/المورد (للجداول).
 * @param {Object} doc
 * @param {string} [field='name']
 * @returns {string}
 */
export function partyName(doc, field = 'name') {
  if (!doc) return '—';
  return doc[field] || '—';
}

/* ─────────────────────────────────────────────────────────────
 * 9) التصدير الافتراضي
 * ───────────────────────────────────────────────────────────── */

export default {
  // تقريب
  round2,
  // تواريخ
  startOfDay,
  endOfDay,
  formatDate,
  formatDateTime,
  validateRange,
  defaultMonthRange,
  defaultLast30Days,
  // ترويسة
  makeExportMeta,
  // تصنيف
  classifyAccount,
  ACCOUNT_TYPE_LABELS,
  // تسميات
  ENTRY_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
  CHECK_STATUS_LABELS,
  CHECK_TYPE_LABELS,
  PAYMENT_TYPE_LABELS,
  // scope
  buildScope,
  isValidObjectId,
  toObjectId,
  // pagination
  pagination,
  paginationMeta,
  // helpers
  orDash,
  partyName,
};