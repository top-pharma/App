/**
 * @file Role.js
 * @description
 * نموذج الدور (Role) — 6 أدوار + 67 صلاحية دقيقة.
 *
 * ✅ v10.9 (2026-11-16):
 * - إضافة 5 صلاحيات sales_rep_transactions.* (view, create, approve, pay, cancel).
 * - admin: كل الصلاحيات.
 * - accountant: كل sales_rep_transactions.*
 * - sales_rep: view فقط (ليرى حركاته).
 * - hr_manager / storekeeper / pharmacy: لا.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * جميع الصلاحيات المعروفة في النظام (67 صلاحية).
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
  'audit.view',

  // ─── الإشعارات (2) ───
  'notifications.view', 'notifications.manage',

  // ─── التقارير (2) ───
  'reports.view', 'reports.export',

  // ─── المالية (5) ───
  'finance.view',
  'finance.manage',
  'finance.entries.view',
  'finance.entries.manage',
  'finance.transactions.view',

  // ✅ v10.9: حركات المناديب (5)
  'sales_rep_transactions.view',
  'sales_rep_transactions.create',
  'sales_rep_transactions.approve',
  'sales_rep_transactions.pay',
  'sales_rep_transactions.cancel',
]);

/**
 * Schema الدور.
 */
const roleSchema = new Schema(
  {
    code: {
      type: String,
      required: [true, 'كود الدور مطلوب.'],
      unique: true,
      trim: true,
      lowercase: true,
      enum: ['admin', 'storekeeper', 'accountant', 'sales_rep', 'pharmacy', 'hr_manager'],
    },
    name: {
      type: String,
      required: [true, 'اسم الدور مطلوب.'],
      trim: true,
      maxlength: [100, 'الاسم طويل جداً.'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'الوصف طويل جداً.'],
    },
    permissions: {
      type: [String],
      default: [],
    },
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

roleSchema.pre('save', function validatePermissions(next) {
  const unknown = (this.permissions || []).filter((p) => !ALL_PERMISSIONS.includes(p));
  if (unknown.length > 0) {
    return next(new Error(`صلاحيات غير معروفة: ${unknown.join(', ')}`));
  }
  next();
});

roleSchema.methods.hasPermission = function hasPermission(permission) {
  if (this.code === 'admin') return true;
  return (this.permissions || []).includes(permission);
};

roleSchema.methods.hasAnyPermission = function hasAnyPermission(...perms) {
  if (this.code === 'admin') return true;
  return perms.some((p) => (this.permissions || []).includes(p));
};

roleSchema.methods.hasAllPermissions = function hasAllPermissions(...perms) {
  if (this.code === 'admin') return true;
  return perms.every((p) => (this.permissions || []).includes(p));
};

/**
 * قائمة الأدوار الافتراضية + صلاحياتها.
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
    description: 'المالية + الفواتير + تجاوز الأسعار + حركات المناديب',
    isSystem: true,
    permissions: [
      'categories.view',
      'warehouses.view',
      'items.view',
      'suppliers.view',
      'customers.view', 'customers.update',
      'stocks.view',
      'invoices.view', 'invoices.create', 'invoices.update', 'invoices.cancel', 'invoices.override_price_limit',
      'customer_returns.view', 'customer_returns.approve', 'customer_returns.reject',
      'supplier_returns.view',
      'purchase_receipts.view',
      'settings.view',
      'audit.view',
      'notifications.view',
      'reports.view', 'reports.export',
      'finance.view',
      'finance.manage',
      'finance.entries.view',
      'finance.transactions.view',
      // ✅ v10.9: حركات المناديب — كاملة
      'sales_rep_transactions.view',
      'sales_rep_transactions.create',
      'sales_rep_transactions.approve',
      'sales_rep_transactions.pay',
      'sales_rep_transactions.cancel',
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
      'audit.view',
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
      'customer_returns.view', 'customer_returns.create',
      'notifications.view',
      // ✅ v10.9: يرى حركاته فقط
      'sales_rep_transactions.view',
    ],
  },
  {
    code: 'pharmacy',
    name: 'صيدلية',
    description: 'عرض فقط (فواتيره)',
    isSystem: true,
    permissions: [
      'items.view',
      'invoices.view',
      'customer_returns.view',
      'notifications.view',
    ],
  },
]);

export const Role = model('Role', roleSchema);

export default Role;