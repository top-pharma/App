/**
 * @file constants.js
 * @description
 * الثوابت المشتركة في التطبيق — Phase 0-5.
 *
 * ⚠️ AUDIT_ACTIONS يُعاد تصديره من models/AuditLog.js
 *    (المصدر الوحيد للحقيقة — يمنع الازدواجية).
 *
 * المبادئ:
 *  - كل ثابت مجمّد (Object.freeze) — لا تعديل.
 *  - القيم تتوافق مع enum في النماذج.
 */

/* ─────────────────────────────────────────────────────────────
 * 1) سجل التدقيق (Audit Log)
 * ─────────────────────────────────────────────────────────────
 * ⚠️ لا نُعرّف AUDIT_ACTIONS محلياً — نستورده من AuditLog.js
 *    ثم نُعيد تصديره. هذا يضمن تطابقاً حرفياً مع enum في الموديل
 *    (الذي يرفض أي قيمة غير معروفة عند الحفظ في MongoDB).
 *
 * ⚠️ لماذا import + export بدلاً من export { X } from '...'؟
 *    لأن الصيغة المختصرة (re-export) لا تُنشئ ربطاً محلياً، فلا
 *    يمكن استخدام AUDIT_ACTIONS داخل التصدير الافتراضي في نهاية
 *    الملف (سيرمي ReferenceError).
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
 * 4) حالات الشيك (Check Status) — النسخة المبسطة (4 حالات)
 * ─────────────────────────────────────────────────────────────
 * pending → (settle) → paid
 *         → (cancel) → cancelled
 * paid    → (bounce) → bounced
 */
export const CHECK_STATUS = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  BOUNCED: 'bounced',
  CANCELLED: 'cancelled',
});

export const CHECK_TYPES = Object.freeze({
  INCOMING: 'incoming',
  OUTGOING: 'outgoing',
});

/* ─────────────────────────────────────────────────────────────
 * 5) أنواع الدفع (Payment Types)
 * ─────────────────────────────────────────────────────────────
 */
export const PAYMENT_TYPES = Object.freeze({
  CASH: 'cash',
  CREDIT: 'credit',
  INSTALLMENTS: 'installments',
});

/* ─────────────────────────────────────────────────────────────
 * 6) طرق الدفع (Payment Methods)
 * ─────────────────────────────────────────────────────────────
 */
export const PAYMENT_METHODS = Object.freeze({
  CASH: 'cash',
  BANK: 'bank',
  CHECK: 'check',
});

/* ─────────────────────────────────────────────────────────────
 * 7) الحركات النقدية (Cash Transactions)
 * ─────────────────────────────────────────────────────────────
 */
export const CASH_TRANSACTION_DIRECTIONS = Object.freeze({
  IN: 'in',
  OUT: 'out',
});

export const CASH_TRANSACTION_METHODS = Object.freeze({
  CASH: 'cash',
  BANK: 'bank',
  CHECK: 'check',
});

export const CASH_TRANSACTION_REFERENCES = Object.freeze({
  MANUAL: 'manual',
  INVOICE: 'invoice',
  DELIVERY_NOTE: 'delivery_note',
  CUSTOMER_RETURN: 'customer_return',
  PURCHASE: 'purchase',
  SUPPLIER_RETURN: 'supplier_return',
  CHECK: 'check',
  TRANSFER: 'transfer',
  EXPENSE: 'expense',
});

/* ─────────────────────────────────────────────────────────────
 * 8) حالات مرتجع العميل (Customer Return)
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
 * 9) حالات مرتجع المورد (Supplier Return)
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
 * 10) حالات إيصال الاستلام (Purchase Receipt)
 * ─────────────────────────────────────────────────────────────
 */
export const PURCHASE_RECEIPT_STATUS = Object.freeze({
  DRAFT: 'draft',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
});

/* ─────────────────────────────────────────────────────────────
 * 11) حالات إيصال التسليم (Delivery Note)
 * ─────────────────────────────────────────────────────────────
 */
export const DELIVERY_NOTE_STATUS = Object.freeze({
  PENDING: 'pending',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
});

/* ─────────────────────────────────────────────────────────────
 * 12) أنواع القيود المحاسبية (Accounting Entry Types)
 * ─────────────────────────────────────────────────────────────
 */
export const ACCOUNTING_ENTRY_TYPES = Object.freeze({
  SALE_CASH: 'SALE_CASH',
  SALE_CREDIT: 'SALE_CREDIT',
  SALE_RETURN: 'SALE_RETURN',
  CUSTOMER_PAYMENT: 'CUSTOMER_PAYMENT',
  PURCHASE: 'PURCHASE',
  PURCHASE_RETURN: 'PURCHASE_RETURN',
  CHECK_RECEIVED: 'CHECK_RECEIVED',
  CHECK_COLLECTED: 'CHECK_COLLECTED',
  CHECK_BOUNCED: 'CHECK_BOUNCED',
  CHECK_ISSUED: 'CHECK_ISSUED',
  CHECK_PAID: 'CHECK_PAID',
  CASH_TRANSFER: 'CASH_TRANSFER',
  CASH_DEPOSIT: 'CASH_DEPOSIT',
  CASH_WITHDRAWAL: 'CASH_WITHDRAWAL',
  EXPENSE: 'EXPENSE',
  OPENING: 'OPENING',
  ADJUSTMENT: 'ADJUSTMENT',
  REVERSAL: 'REVERSAL',
});

/* ─────────────────────────────────────────────────────────────
 * 13) أنواع الإشعارات (Notification Types)
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
  CHECK_DUE: 'check_due',
  CHECK_OVERDUE: 'check_overdue',
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
 * 14) أنواع المخازن (Warehouse Types)
 * ─────────────────────────────────────────────────────────────
 */
export const WAREHOUSE_TYPES = Object.freeze({
  MAIN: 'main',
  BRANCH: 'branch',
});

/* ─────────────────────────────────────────────────────────────
 * 15) ثوابت مالية
 * ─────────────────────────────────────────────────────────────
 */
export const CURRENCY = 'SDG';
export const ROUNDING_TOLERANCE = 0.01;

/* ─────────────────────────────────────────────────────────────
 * 16) التصدير الافتراضي (للتوافق إن استُخدم `import constants from ...`)
 * ─────────────────────────────────────────────────────────────
 */
export default {
  AUDIT_ACTIONS,       // ← الآن يعمل (binding محلي موجود من import)
  ROLE_CODES,
  INVOICE_STATUS,
  CHECK_STATUS,
  CHECK_TYPES,
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
  DELIVERY_NOTE_STATUS,
  ACCOUNTING_ENTRY_TYPES,
  NOTIFICATION_TYPES,
  NOTIFICATION_LEVELS,
  WAREHOUSE_TYPES,
  CURRENCY,
  ROUNDING_TOLERANCE,
};