/**
 * @file Role.js
 * @description
 * نموذج الدور (Role) — 5 أدوار + 77 صلاحية دقيقة.
 *
 * لماذا هذا الملف؟
 * - نُطبّق RBAC دقيقاً: لكل دور ما يخصه فقط.
 * - الصلاحيات بصيغة resource.action (مثل: invoices.create).
 * - نستخدم الأدوار عبر requirePermissions middleware.
 *
 * الصلاحيات المالية (Phase 3):
 *  - finance.view               → عرض الصناديق والبنك والشيكات والقيود
 *  - finance.manage             → إدارة الصناديق والبنك (CRUD)
 *  - finance.checks.manage      → إدارة الشيكات (تسجيل، صرف، ارتداد، إلغاء)
 *  - finance.entries.view       → عرض القيود المحاسبية
 *  - finance.entries.manage     → إنشاء قيود يدوية (نادر)
 *  - finance.transactions.view  → عرض الحركات النقدية
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * جميع الصلاحيات المعروفة في النظام (77 صلاحية).
 * تُستخدم في pre-save للتحقق من صحة الصلاحيات.
 */
export const ALL_PERMISSIONS = Object.freeze([
  // ─── المستخدمون (5) ───
  'users.view', 'users.create', 'users.update', 'users.delete', 'users.reset_password',

  // ─── الأدوار (2) ───
  'roles.view', 'roles.manage',

  // ─── التصنيفات (4) ───
  'categories.view', 'categories.create', 'categories.update', 'categories.delete',

  // ─── المخازن (4) ───
  'warehouses.view', 'warehouses.create', 'warehouses.update', 'warehouses.delete',

  // ─── الأصناف (4) ───
  'items.view', 'items.create', 'items.update', 'items.delete',

  // ─── الموردون (4) ───
  'suppliers.view', 'suppliers.create', 'suppliers.update', 'suppliers.delete',

  // ─── الصيدليات / العملاء (4) ───
  'customers.view', 'customers.create', 'customers.update', 'customers.delete',

  // ─── المخزون / الدفعات (4) ───
  'stocks.view', 'stocks.create', 'stocks.update', 'stocks.adjust',

  // ─── الفواتير (5) ───
  'invoices.view', 'invoices.create', 'invoices.update', 'invoices.cancel', 'invoices.override_price_limit',

  // ─── إيصالات التسليم (4) ───
  'delivery_notes.view', 'delivery_notes.create', 'delivery_notes.update', 'delivery_notes.mark_delivered',

  // ─── مرتجعات العملاء (4) ───
  'customer_returns.view', 'customer_returns.create', 'customer_returns.approve', 'customer_returns.reject',

  // ─── مرتجعات الموردين (6) ───
  'supplier_returns.view', 'supplier_returns.create', 'supplier_returns.update',
  'supplier_returns.send', 'supplier_returns.accept', 'supplier_returns.reject',

  // ─── المشتريات (4) ───
  'purchase_receipts.view', 'purchase_receipts.create', 'purchase_receipts.confirm', 'purchase_receipts.cancel',

  // ─── الإعدادات (2) ───
  'settings.view', 'settings.update',

  // ─── سجل التدقيق (1) ───
  'audit_logs.view',

  // ─── الإشعارات (2) ───
  'notifications.view', 'notifications.manage',

  // ─── التقارير (2) — Phase 4 ───
  'reports.view', 'reports.export',

  // ─── المالية (6) — Phase 3 ───
  'finance.view',
  'finance.manage',
  'finance.checks.manage',
  'finance.entries.view',
  'finance.entries.manage',
  'finance.transactions.view',
]);

/**
 * Schema الدور.
 */
const roleSchema = new Schema(
  {
    /**
     * كود الدور (admin، accountant، إلخ).
     */
    code: {
      type: String,
      required: [true, 'كود الدور مطلوب.'],
      unique: true,
      trim: true,
      lowercase: true,
      enum: ['admin', 'storekeeper', 'accountant', 'sales_rep', 'pharmacy', 'hr_manager'],
    },

    /**
     * اسم الدور (بالعربية).
     */
    name: {
      type: String,
      required: [true, 'اسم الدور مطلوب.'],
      trim: true,
      maxlength: [100, 'الاسم طويل جداً.'],
    },

    /**
     * الوصف.
     */
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'الوصف طويل جداً.'],
    },

    /**
     * الصلاحيات (list of resource.action).
     */
    permissions: {
      type: [String],
      default: [],
    },

    /**
     * هل الدور نظامي (لا يمكن حذفه)؟
     */
    isSystem: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 

/**
 * التحقق من أن كل الصلاحيات معروفة.
 */
roleSchema.pre('save', function validatePermissions(next) {
  const unknown = (this.permissions || []).filter((p) => !ALL_PERMISSIONS.includes(p));
  if (unknown.length > 0) {
    return next(new Error(`صلاحيات غير معروفة: ${unknown.join(', ')}`));
  }
  next();
});

/**
 * هل الدور يملك صلاحية محددة؟
 * @param {string} permission
 * @returns {boolean}
 */
roleSchema.methods.hasPermission = function hasPermission(permission) {
  if (this.code === 'admin') return true;
  return (this.permissions || []).includes(permission);
};

/**
 * هل الدور يملك أي من الصلاحيات؟
 * @param {...string} perms
 * @returns {boolean}
 */
roleSchema.methods.hasAnyPermission = function hasAnyPermission(...perms) {
  if (this.code === 'admin') return true;
  return perms.some((p) => (this.permissions || []).includes(p));
};

/**
 * هل الدور يملك كل الصلاحيات؟
 * @param {...string} perms
 * @returns {boolean}
 */
roleSchema.methods.hasAllPermissions = function hasAllPermissions(...perms) {
  if (this.code === 'admin') return true;
  return perms.every((p) => (this.permissions || []).includes(p));
};

/**
 * قائمة الأدوار الافتراضية + صلاحياتها.
 * تُستخدم في seed.js.
 */
export const DEFAULT_ROLES = Object.freeze([
  {
    code: 'admin',
    name: 'مدير',
    description: 'كل الصلاحيات + إدارة المستخدمين + تجاوز الأسعار + إدارة القيود يدوياً',
    isSystem: true,
    permissions: [...ALL_PERMISSIONS],
  },
  {
    code: 'storekeeper',
    name: 'أمين مخزن',
    description: 'المخزون + المشتريات (بدون delete، بدون مالية)',
    isSystem: true,
    permissions: [
      'categories.view',
      'warehouses.view',
      'items.view', 'items.create', 'items.update',
      'suppliers.view', 'suppliers.create', 'suppliers.update',
      'customers.view',
      'stocks.view', 'stocks.create', 'stocks.update', 'stocks.adjust',
      'purchase_receipts.view', 'purchase_receipts.create', 'purchase_receipts.confirm',
      'supplier_returns.view', 'supplier_returns.create',
      'notifications.view',
    ],
  },
  {
    code: 'accountant',
    name: 'محاسب',
    description: 'المالية + الفواتير + الشيكات + تجاوز الأسعار',
    isSystem: true,
    permissions: [
      'categories.view',
      'warehouses.view',
      'items.view',
      'suppliers.view',
      'customers.view', 'customers.update',
      'stocks.view',
      'invoices.view', 'invoices.create', 'invoices.update', 'invoices.cancel', 'invoices.override_price_limit',
      'delivery_notes.view',
      'customer_returns.view', 'customer_returns.approve', 'customer_returns.reject',
      'supplier_returns.view',
      'purchase_receipts.view',
      'settings.view',
      'audit_logs.view',
      'notifications.view',
      'reports.view', 'reports.export',
      // ─── المالية (Phase 3) ───
      'finance.view',
      'finance.manage',
      'finance.checks.manage',
      'finance.entries.view',
      'finance.transactions.view',
      // ⚠️ بدون finance.entries.manage — القيود تلقائية فقط
    ],
  },
    {
    code: 'hr_manager',
    name: 'مدير موارد بشرية',
    description: 'إدارة الموظفين والمستخدمين فقط (بدون مالية، بدون مخزون، بدون مبيعات)',
    isSystem: true,
    permissions: [
      'users.view',
      'users.create',
      'users.update',
      'users.delete',
      'users.reset_password',
      'roles.view',
      'notifications.view',
      'audit_logs.view',
      'settings.view',
    ],
  },
  {
    code: 'sales_rep',
    name: 'مندوب',
    description: 'صيدلياته فقط + فواتيره + عمولاته (بدون تجاوز أسعار، بدون مالية)',
    isSystem: true,
    permissions: [
      'items.view',
      'customers.view',
      'stocks.view',
      'invoices.view', 'invoices.create', 'invoices.update',
      'delivery_notes.view', 'delivery_notes.create', 'delivery_notes.update', 'delivery_notes.mark_delivered',
      'customer_returns.view', 'customer_returns.create',
      'notifications.view',
    ],
  },
  {
    code: 'pharmacy',
    name: 'صيدلية',
    description: 'عرض فقط (فواتيره + إيصالاته)',
    isSystem: true,
    permissions: [
      'items.view',
      'invoices.view',
      'delivery_notes.view',
      'customer_returns.view',
      'notifications.view',
    ],
  },
]);

export const Role = model('Role', roleSchema);

export default Role;