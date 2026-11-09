/**
 * @file reportService.js
 * @description
 * دوال مساعدة مشتركة بين كل التقارير.
 *
 * ✅ 🅲 (2026-11-08):
 * - حُذف CHECK_STATUS + CHECK_TYPES من imports (من constants.js).
 * - حُذفت 5 أسطر CHECK_* من ENTRY_TYPE_LABELS.
 * - حُذف CHECK_STATUS_LABELS (كائن كامل).
 * - حُذف CHECK_TYPE_LABELS (كائن كامل).
 */

import mongoose from 'mongoose';

import {
  ACCOUNTING_ENTRY_TYPES,
  INVOICE_STATUS,
  // ⚠️ 🅲: حُذف CHECK_STATUS
  // ⚠️ 🅲: حُذف CHECK_TYPES
  PAYMENT_TYPES,
} from '../utils/constants.js';
import { AppError } from '../middlewares/errorMiddleware.js';

/* ─────────────────────────────────────────────────────────────
 * 1) تقريب آمن
 * ───────────────────────────────────────────────────────────── */

export function round2(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/* ─────────────────────────────────────────────────────────────
 * 2) التواريخ
 * ───────────────────────────────────────────────────────────── */

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function formatDate(date) {
  if (!date) return '';
  try {
    return new Date(date).toLocaleDateString('en-GB');
  } catch {
    return '';
  }
}

export function formatDateTime(date) {
  if (!date) return '';
  try {
    return new Date(date).toLocaleString('en-GB');
  } catch {
    return '';
  }
}

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

export function defaultMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now);
  return { from: startOfDay(from), to: endOfDay(to) };
}

export function defaultLast30Days() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: startOfDay(from), to: endOfDay(to) };
}

/* ─────────────────────────────────────────────────────────────
 * 3) بيانات الترويسة
 * ───────────────────────────────────────────────────────────── */

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
 * 4) تصنيف الحسابات
 * ───────────────────────────────────────────────────────────── */

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
 * ✅ 🅲: حُذفت 5 أنواع CHECK_* (Check أُلغي).
 */
export const ENTRY_TYPE_LABELS = Object.freeze({
  [ACCOUNTING_ENTRY_TYPES.SALE_CASH]: 'بيع نقدي',
  [ACCOUNTING_ENTRY_TYPES.SALE_CREDIT]: 'بيع آجل',
  [ACCOUNTING_ENTRY_TYPES.SALE_RETURN]: 'مرتجع بيع',
  [ACCOUNTING_ENTRY_TYPES.CUSTOMER_PAYMENT]: 'دفعة عميل',
  [ACCOUNTING_ENTRY_TYPES.PURCHASE]: 'مشتريات',
  [ACCOUNTING_ENTRY_TYPES.PURCHASE_RETURN]: 'مرتجع مشتريات',
  // ⚠️ 🅲: حُذفت CHECK_RECEIVED / CHECK_COLLECTED / CHECK_BOUNCED / CHECK_ISSUED / CHECK_PAID
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

// ⚠️ 🅲: حُذف CHECK_STATUS_LABELS (Check أُلغي)
// ⚠️ 🅲: حُذف CHECK_TYPE_LABELS (Check أُلغي)

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
    return { pharmacy: new mongoose.Types.ObjectId('000000000000000000000000') };
  }

  return {};
}

export function isValidObjectId(id) {
  if (!id) return false;
  return mongoose.Types.ObjectId.isValid(String(id));
}

export function toObjectId(id, fieldName = 'id') {
  if (!isValidObjectId(id)) {
    throw new AppError(`${fieldName} غير صالح.`, 400, 'INVALID_ID');
  }
  return new mongoose.Types.ObjectId(id);
}

/* ─────────────────────────────────────────────────────────────
 * 7) الترقيم
 * ───────────────────────────────────────────────────────────── */

export function pagination({ page = 1, limit = 100 } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(500, Math.max(1, Number(limit) || 100));
  return { skip: (p - 1) * l, limit: l, page: p };
}

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

export function orDash(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  return value;
}

export function partyName(doc, field = 'name') {
  if (!doc) return '—';
  return doc[field] || '—';
}

/* ─────────────────────────────────────────────────────────────
 * 9) التصدير الافتراضي
 * ─────────────────────────────────────────────────────────────
 * ✅ 🅲: حُذف CHECK_STATUS_LABELS + CHECK_TYPE_LABELS.
 */

export default {
  round2,
  startOfDay,
  endOfDay,
  formatDate,
  formatDateTime,
  validateRange,
  defaultMonthRange,
  defaultLast30Days,
  makeExportMeta,
  classifyAccount,
  ACCOUNT_TYPE_LABELS,
  ENTRY_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
  // ⚠️ 🅲: CHECK_STATUS_LABELS — محذوف
  // ⚠️ 🅲: CHECK_TYPE_LABELS — محذوف
  PAYMENT_TYPE_LABELS,
  buildScope,
  isValidObjectId,
  toObjectId,
  pagination,
  paginationMeta,
  orDash,
  partyName,
};