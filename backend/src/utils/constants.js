/**
 * @file constants.js
 * @description
 * الثوابت المشتركة في التطبيق — Phase 0-5.
 *
 * ⚠️ AUDIT_ACTIONS يُعاد تصديره من models/AuditLog.js
 *    (المصدر الوحيد للحقيقة — يمنع الازدواجية).
 *
 * ✅ 🅱 (2026-11-08):
 * - حذف DELIVERY_NOTE_STATUS.
 * - حذف CASH_TRANSACTION_REFERENCES.DELIVERY_NOTE.
 *
 * ✅ 🅲 (2026-11-08):
 * - حذف CHECK_STATUS (4 حالات).
 * - حذف CHECK_TYPES (2 نوع).
 * - حذف PAYMENT_METHODS.CHECK.
 * - حذف CASH_TRANSACTION_METHODS.CHECK.
 * - حذف CASH_TRANSACTION_REFERENCES.CHECK.
 * - حذف ACCOUNTING_ENTRY_TYPES.CHECK_* (5 أنواع).
 *
 * المبادئ:
 *  - كل ثابت مجمّد (Object.freeze) — لا تعديل.
 *  - القيم تتوافق مع enum في النماذج.
 */

/* ─────────────────────────────────────────────────────────────
 * 1) سجل التدقيق (Audit Log)
 * ─────────────────────────────────────────────────────────────
 */
import { AUDIT_ACTIONS } from '../models/AuditLog.js';
export { AUDIT_ACTIONS };

/* ─────────────────────────────────────────────────────────────
 * 2) أكواد الأدوار (Role Codes)
 * ─────────────────────────────────────────────────────────────
 */
export const ROLE_CODES = Object.freeze({
  ADMIN: 'admin',
  STOREKEEPER: 'storekeeper',
  ACCOUNTANT: 'accountant',
  SALES_REP: 'sales_rep',
  PHARMACY: 'pharmacy',
});

/* ─────────────────────────────────────────────────────────────
 * 3) حالات الفاتورة (Invoice Status)
 * ─────────────────────────────────────────────────────────────
 */
export const INVOICE_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING: 'pending',
  PARTIAL: 'partial',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
});

/* ─────────────────────────────────────────────────────────────
 * 4) ⚠️ 🅲: CHECK_STATUS — محذوف
 *    (كان: pending / paid / bounced / cancelled)
 * ─────────────────────────────────────────────────────────────
 */

/* ─────────────────────────────────────────────────────────────
 * 5) ⚠️ 🅲: CHECK_TYPES — محذوف
 *    (كان: incoming / outgoing)
 * ─────────────────────────────────────────────────────────────
 */

/* ─────────────────────────────────────────────────────────────
 * 6) أنواع الدفع (Payment Types)
 * ─────────────────────────────────────────────────────────────
 */
export const PAYMENT_TYPES = Object.freeze({
  CASH: 'cash',
  CREDIT: 'credit',
  INSTALLMENTS: 'installments',
});

/* ─────────────────────────────────────────────────────────────
 * 7) طرق الدفع (Payment Methods)
 * ─────────────────────────────────────────────────────────────
 * ✅ 🅲: حُذف CHECK — فقط CASH + BANK
 */
export const PAYMENT_METHODS = Object.freeze({
  CASH: 'cash',
  BANK: 'bank',
});

/* ─────────────────────────────────────────────────────────────
 * 8) الحركات النقدية (Cash Transactions)
 * ─────────────────────────────────────────────────────────────
 */
export const CASH_TRANSACTION_DIRECTIONS = Object.freeze({
  IN: 'in',
  OUT: 'out',
});

/**
 * ✅ 🅲: حُذف CHECK — فقط CASH + BANK
 */
export const CASH_TRANSACTION_METHODS = Object.freeze({
  CASH: 'cash',
  BANK: 'bank',
});

/**
 * ✅ 🅲: حُذف DELIVERY_NOTE (🅱) + CHECK (🅲).
 */
export const CASH_TRANSACTION_REFERENCES = Object.freeze({
  MANUAL: 'manual',
  INVOICE: 'invoice',
  CUSTOMER_RETURN: 'customer_return',
  PURCHASE: 'purchase',
  SUPPLIER_RETURN: 'supplier_return',
  TRANSFER: 'transfer',
  EXPENSE: 'expense',
});

/* ─────────────────────────────────────────────────────────────
 * 9) حالات مرتجع العميل (Customer Return)
 * ─────────────────────────────────────────────────────────────
 */
export const CUSTOMER_RETURN_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

export const CUSTOMER_RETURN_SETTLEMENT = Object.freeze({
  CASH_REFUND: 'cash_refund',
  BALANCE_DEDUCTION: 'balance_deduction',
});

/* ─────────────────────────────────────────────────────────────
 * 10) حالات مرتجع المورد (Supplier Return)
 * ─────────────────────────────────────────────────────────────
 */
export const SUPPLIER_RETURN_STATUS = Object.freeze({
  DRAFT: 'draft',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
});

export const SUPPLIER_RETURN_SETTLEMENT = Object.freeze({
  CREDIT_NOTE: 'credit_note',
  REPLACEMENT: 'replacement',
  CASH_REFUND: 'cash_refund',
});

/* ─────────────────────────────────────────────────────────────
 * 11) حالات إيصال الاستلام (Purchase Receipt)
 * ─────────────────────────────────────────────────────────────
 */
export const PURCHASE_RECEIPT_STATUS = Object.freeze({
  DRAFT: 'draft',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
});

/* ─────────────────────────────────────────────────────────────
 * 12) ⚠️ 🅱: DELIVERY_NOTE_STATUS — محذوف
 * ─────────────────────────────────────────────────────────────
 */

/* ─────────────────────────────────────────────────────────────
 * 13) أنواع القيود المحاسبية (Accounting Entry Types)
 * ─────────────────────────────────────────────────────────────
 * ✅ 🅲: حُذفت 5 أنواع CHECK_* (CHECK_RECEIVED, CHECK_COLLECTED,
 *    CHECK_BOUNCED, CHECK_ISSUED, CHECK_PAID)
 */
export const ACCOUNTING_ENTRY_TYPES = Object.freeze({
  SALE_CASH: 'SALE_CASH',
  SALE_CREDIT: 'SALE_CREDIT',
  SALE_RETURN: 'SALE_RETURN',
  CUSTOMER_PAYMENT: 'CUSTOMER_PAYMENT',
  PURCHASE: 'PURCHASE',
  PURCHASE_RETURN: 'PURCHASE_RETURN',
  // ⚠️ 🅲: حُذفت CHECK_RECEIVED / CHECK_COLLECTED / CHECK_BOUNCED / CHECK_ISSUED / CHECK_PAID
  CASH_TRANSFER: 'CASH_TRANSFER',
  CASH_DEPOSIT: 'CASH_DEPOSIT',
  CASH_WITHDRAWAL: 'CASH_WITHDRAWAL',
  EXPENSE: 'EXPENSE',
  OPENING: 'OPENING',
  ADJUSTMENT: 'ADJUSTMENT',
  REVERSAL: 'REVERSAL',
});

/* ─────────────────────────────────────────────────────────────
 * 14) أنواع الإشعارات (Notification Types)
 * ─────────────────────────────────────────────────────────────
 * ⚠️ يجب أن تطابق models/Notification.js NOTIFICATION_TYPES حرفياً.
 * ⚠️ في Jobs استخدم الاستيراد من models/Notification.js مباشرة.
 * ⚠️ هذا موجود للاستخدام العام فقط (display, filtering).
 */
export const NOTIFICATION_TYPES = Object.freeze({
  STOCK_LOW: 'stock_low',
  STOCK_EXPIRING: 'stock_expiring',
  STOCK_EXPIRED: 'stock_expired',
  INVOICE_DUE: 'invoice_due',
  INVOICE_OVERDUE: 'invoice_overdue',
  CHECK_DUE: 'check_due',        // ← ⚠️ يبقى مؤقتاً (للإشعارات القديمة في DB)
  CHECK_OVERDUE: 'check_overdue', // ← ⚠️ يبقى مؤقتاً
  RETURN_GRACE_WARNING: 'return_grace_warning',
  SALES_REP_SETTLEMENT: 'sales_rep_settlement',
  ACCOUNT_LOCKED: 'account_locked',
  SYSTEM: 'system',
});

export const NOTIFICATION_LEVELS = Object.freeze({
  INFO: 'info',
  WARNING: 'warning',
  DANGER: 'danger',
});

/* ─────────────────────────────────────────────────────────────
 * 15) أنواع المخازن (Warehouse Types)
 * ─────────────────────────────────────────────────────────────
 */
export const WAREHOUSE_TYPES = Object.freeze({
  MAIN: 'main',
  BRANCH: 'branch',
});

/* ─────────────────────────────────────────────────────────────
 * 16) ثوابت مالية
 * ─────────────────────────────────────────────────────────────
 */
export const CURRENCY = 'SDG';
export const ROUNDING_TOLERANCE = 0.01;

/* ─────────────────────────────────────────────────────────────
 * 17) التصدير الافتراضي
 * ─────────────────────────────────────────────────────────────
 * ✅ 🅲: حُذفت CHECK_STATUS + CHECK_TYPES
 */
export default {
  AUDIT_ACTIONS,
  ROLE_CODES,
  INVOICE_STATUS,
  // ⚠️ 🅲: CHECK_STATUS — محذوف
  // ⚠️ 🅲: CHECK_TYPES — محذوف
  PAYMENT_TYPES,
  PAYMENT_METHODS,
  CASH_TRANSACTION_DIRECTIONS,
  CASH_TRANSACTION_METHODS,
  CASH_TRANSACTION_REFERENCES,
  CUSTOMER_RETURN_STATUS,
  CUSTOMER_RETURN_SETTLEMENT,
  SUPPLIER_RETURN_STATUS,
  SUPPLIER_RETURN_SETTLEMENT,
  PURCHASE_RECEIPT_STATUS,
  // ⚠️ 🅱: DELIVERY_NOTE_STATUS — محذوف
  ACCOUNTING_ENTRY_TYPES,
  NOTIFICATION_TYPES,
  NOTIFICATION_LEVELS,
  WAREHOUSE_TYPES,
  CURRENCY,
  ROUNDING_TOLERANCE,
};