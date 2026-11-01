/**
 * @file constants.js
 * @description الثوابت العامة للتطبيق.
 *
 * ⚠️ Phase D (2026-10-30):
 * - ROLES + ROLE_LABELS_AR يشملان hr_manager.
 * - تحقق من تطابق أي إضافة مستقبلية مع Role.code في Backend.
 */

// ═══════════════════════════════════════════════
// 1. مفاتيح التخزين (localStorage)
// ═══════════════════════════════════════════════
export const STORAGE_KEYS = Object.freeze({
  ACCESS_TOKEN: 'pharma_access_token',
  REFRESH_TOKEN: 'pharma_refresh_token',
  USER: 'pharma_user',
  THEME: 'pharma_theme',
  SIDEBAR_COLLAPSED: 'pharma_sidebar_collapsed',
});

// ═══════════════════════════════════════════════
// 2. الأدوار (Roles) — 6 أدوار (Phase D)
// ═══════════════════════════════════════════════
export const ROLES = Object.freeze({
  ADMIN: 'admin',
  HR_MANAGER: 'hr_manager',
  STOREKEEPER: 'storekeeper',
  ACCOUNTANT: 'accountant',
  SALES_REP: 'sales_rep',
  PHARMACY: 'pharmacy',
});

export const ROLE_LABELS_AR = Object.freeze({
  admin: 'مدير',
  hr_manager: 'مدير موارد بشرية',
  storekeeper: 'أمين مخزن',
  accountant: 'محاسب',
  sales_rep: 'مندوب',
  pharmacy: 'صيدلية',
});

// ═══════════════════════════════════════════════
// 3. المسارات (Routes)
// ═══════════════════════════════════════════════
export const ROUTES = Object.freeze({
  LOGIN: '/login',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  DASHBOARD: '/',
  NOT_FOUND: '*',
});

// ═══════════════════════════════════════════════
// 4. حالات الفواتير
// ═══════════════════════════════════════════════
export const INVOICE_STATUSES = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  PARTIAL: 'partial',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
});

export const INVOICE_STATUS_LABELS_AR = Object.freeze({
  pending: 'معلّقة',
  paid: 'مدفوعة',
  partial: 'مدفوعة جزئياً',
  overdue: 'متأخرة',
  cancelled: 'ملغاة',
});

// ═══════════════════════════════════════════════
// 5. حالات إيصال التسليم
// ═══════════════════════════════════════════════
export const DELIVERY_STATUSES = Object.freeze({
  PENDING: 'pending',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  RETURNED: 'returned',
});

export const DELIVERY_STATUS_LABELS_AR = Object.freeze({
  pending: 'معلّق',
  in_transit: 'قيد التوصيل',
  delivered: 'تم التسليم',
  returned: 'مُرتجع',
});

// ═══════════════════════════════════════════════
// 6. أنواع الدفع
// ═══════════════════════════════════════════════
export const PAYMENT_TYPES = Object.freeze({
  CASH: 'cash',
  CREDIT: 'credit',
  INSTALLMENTS: 'installments',
});

export const PAYMENT_TYPE_LABELS_AR = Object.freeze({
  cash: 'نقدي',
  credit: 'آجل',
  installments: 'أقساط',
});

// ═══════════════════════════════════════════════
// 7. أنواع الشيكات
// ═══════════════════════════════════════════════
export const CHECK_TYPES = Object.freeze({
  INCOMING: 'incoming',
  OUTGOING: 'outgoing',
});

export const CHECK_STATUSES = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  BOUNCED: 'bounced',
  CANCELLED: 'cancelled',
});

export const CHECK_STATUS_LABELS_AR = Object.freeze({
  pending: 'معلّق',
  paid: 'مدفوع',
  bounced: 'مرتجع',
  cancelled: 'ملغى',
});

// ═══════════════════════════════════════════════
// 8. أسباب المرتجعات
// ═══════════════════════════════════════════════
export const RETURN_REASONS = Object.freeze({
  DAMAGED: 'damaged',
  NEAR_EXPIRY: 'near_expiry',
  WRONG_ORDER: 'wrong_order',
  OTHER: 'other',
});

export const RETURN_REASON_LABELS_AR = Object.freeze({
  damaged: 'تالف',
  near_expiry: 'قريب الانتهاء',
  wrong_order: 'خطأ في الطلب',
  other: 'أخرى',
});

// ═══════════════════════════════════════════════
// 9. تصنيفات الأصناف
// ═══════════════════════════════════════════════
export const ITEM_CATEGORIES = Object.freeze({
  MEDICINE: 'medicine',
  COSMETICS: 'cosmetics',
  SUPPLEMENTS: 'supplements',
  MEDICAL_SUPPLIES: 'medical_supplies',
  OTHER: 'other',
});

export const ITEM_CATEGORY_LABELS_AR = Object.freeze({
  medicine: 'أدوية',
  cosmetics: 'مستحضرات تجميل',
  supplements: 'مكملات غذائية',
  medical_supplies: 'مستلزمات طبية',
  other: 'أخرى',
});

// ═══════════════════════════════════════════════
// 10. وحدات القياس
// ═══════════════════════════════════════════════
export const UNIT_TYPES = Object.freeze({
  TABLET: 'قرص',
  CAPSULE: 'كبسولة',
  STRIP: 'شريط',
  BOX: 'علبة',
  VIAL: 'زجاجة',
  AMPOULE: 'أمبولة',
  PACKET: 'كيس',
  CARTON: 'كرتونة',
  INHALER: 'بخاخ',
  DROP: 'قطارة',
  SUPPOSITORY: 'تحاميل',
  CREAM: 'مرهم',
  SYRUP: 'شراب',
});

// ═══════════════════════════════════════════════
// 11. حدود Pagination
// ═══════════════════════════════════════════════
export const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  LIMIT_OPTIONS: [10, 20, 50, 100],
  MAX_LIMIT: 100,
});

// ═══════════════════════════════════════════════
// 12. العملة والتاريخ
// ═══════════════════════════════════════════════
export const CURRENCY = Object.freeze({
  CODE: 'SDG',
  SYMBOL: 'SDG',
  LOCALE: 'en-US',
  DECIMALS: 2,
});

export const DATE_FORMAT = Object.freeze({
  SHORT: 'yyyy-MM-dd',
  LONG: 'yyyy-MM-dd HH:mm',
  DISPLAY: 'dd/MM/yyyy',
  DISPLAY_LONG: 'dd/MM/yyyy HH:mm',
  LOCALE: 'en-GB',
});

// ═══════════════════════════════════════════════
// 13. حدود التحقق
// ═══════════════════════════════════════════════
export const VALIDATION = Object.freeze({
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
  NAME_MIN: 2,
  NAME_MAX: 100,
  EMAIL_MAX: 255,
  PHONE_MIN: 7,
  PHONE_MAX: 20,
});

// ═══════════════════════════════════════════════
// 14. رسائل عامة
// ═══════════════════════════════════════════════
export const MESSAGES = Object.freeze({
  LOADING: 'جاري التحميل...',
  SAVING: 'جاري الحفظ...',
  DELETING: 'جاري الحذف...',
  SUCCESS: 'تمت العملية بنجاح',
  ERROR: 'حدث خطأ. حاول مرة أخرى.',
  NETWORK_ERROR: 'تعذّر الاتصال بالخادم',
  UNAUTHORIZED: 'غير مصرح لك بالوصول',
  NOT_FOUND: 'العنصر غير موجود',
  CONFIRM_DELETE: 'هل أنت متأكد من الحذف؟',
});

// ═══════════════════════════════════════════════
// 15. الإشعارات (Notifications) — Phase 5
// ═══════════════════════════════════════════════
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

export const NOTIFICATION_TYPE_LABELS_AR = Object.freeze({
  stock_low: 'حد أدنى للمخزون',
  stock_expiring: 'دفعة قاربة الانتهاء',
  stock_expired: 'دفعة منتهية',
  invoice_due: 'فاتورة مستحقة',
  invoice_overdue: 'فاتورة متأخرة',
  check_due: 'شيك مستحق',
  check_overdue: 'شيك متأخر',
  return_grace_warning: 'تحذير مهلة الإرجاع',
  sales_rep_settlement: 'تسوية مندوب',
  account_locked: 'حساب مقفل',
  system: 'إشعار نظام',
});

export const NOTIFICATION_LEVEL_LABELS_AR = Object.freeze({
  info: 'معلومة',
  warning: 'تحذير',
  danger: 'خطر',
});

export const NOTIFICATION_LEVEL_BADGE = Object.freeze({
  info: 'bg-primary-100 text-primary-800',
  warning: 'bg-warning-100 text-warning-800',
  danger: 'bg-danger-100 text-danger-800',
});

// ═══════════════════════════════════════════════
// 16. تصدير افتراضي
// ═══════════════════════════════════════════════
export default {
  STORAGE_KEYS,
  ROLES,
  ROLE_LABELS_AR,
  ROUTES,
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS_AR,
  DELIVERY_STATUSES,
  DELIVERY_STATUS_LABELS_AR,
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABELS_AR,
  CHECK_TYPES,
  CHECK_STATUSES,
  CHECK_STATUS_LABELS_AR,
  RETURN_REASONS,
  RETURN_REASON_LABELS_AR,
  ITEM_CATEGORIES,
  ITEM_CATEGORY_LABELS_AR,
  UNIT_TYPES,
  PAGINATION,
  CURRENCY,
  DATE_FORMAT,
  VALIDATION,
  MESSAGES,
  NOTIFICATION_TYPES,
  NOTIFICATION_LEVELS,
  NOTIFICATION_TYPE_LABELS_AR,
  NOTIFICATION_LEVEL_LABELS_AR,
  NOTIFICATION_LEVEL_BADGE,
};