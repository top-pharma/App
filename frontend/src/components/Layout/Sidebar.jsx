/**
 * @file Sidebar.jsx
 * @description القائمة الجانبية — Phase D (RBAC كامل) + AuditLogs.
 *
 * ⚠️ إصلاح 2026-11-12:
 * - F1: إضافة رابط "سجل التدقيق" — بصلاحية `audit.view`.
 * - F2: إضافة `ScrollText` (موجود) — `FileText` (موجود).
 */

import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  FileText,
  Undo2,
  Users,
  Building2,
  Store,
  ChevronDown,
  ChevronLeft,
  Boxes,
  Tags,
  ClipboardList,
  Receipt,
  ArrowLeftRight,
  Wallet,
  Coins,
  Bell,
  Landmark,
  ScrollText,
  BarChart3,
  TrendingUp,
  UserCog,
  Database,
  Settings,
} from 'lucide-react';

import { useAuth } from '../../hooks/useAuth.js';
import { useNotifications } from '../../hooks/useNotifications.js';
import { ROLE_LABELS_AR } from '../../utils/constants.js';

// ═══════════════════════════════════════════════
// 1. مكونات فرعية
// ═══════════════════════════════════════════════

function SidebarLink({ to, icon: Icon, label, end = false, badge = 0 }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? 'bg-primary-800 text-white'
            : 'text-neutral-700 hover:bg-neutral-100'
        }`
      }
    >
      {Icon && <Icon size={18} className="flex-shrink-0" />}
      <span className="truncate flex-1">{label}</span>
      {badge > 0 && (
        <span className="bg-danger-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 flex-shrink-0">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
}

function SidebarGroup({ title, icon: Icon, children, defaultOpen = false, isActiveGroup }) {
  const [isOpen, setIsOpen] = useState(defaultOpen || isActiveGroup);

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
          isActiveGroup
            ? 'bg-primary-50 text-primary-800'
            : 'text-neutral-700 hover:bg-neutral-100'
        }`}
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon size={18} className="flex-shrink-0" />}
          <span className="truncate">{title}</span>
        </div>
        {isOpen ? (
          <ChevronDown size={16} className="flex-shrink-0" />
        ) : (
          <ChevronLeft size={16} className="flex-shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="pr-8 space-y-1 mt-1 border-r-2 border-neutral-200 mr-6">
          {children}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// 2. المكون الرئيسي
// ═══════════════════════════════════════════════

function Sidebar() {
  const { userRole, isSalesRep, isPharmacy, hasPermission } = useAuth();
  const location = useLocation();
  const { unreadCount } = useNotifications();

  // ─── مساعد ───
  const canAny = (perms) => perms.some((p) => hasPermission(p));

  // ─── مجموعات ───
  const canViewInventory = canAny([
    'categories.view',
    'warehouses.view',
    'items.view',
    'suppliers.view',
    'customers.view',
    'stocks.view',
  ]);

  const canViewSales = canAny([
    'invoices.view',
    'customer_returns.view',
  ]);

  const canViewPurchases = canAny([
    'purchase_receipts.view',
    'supplier_returns.view',
  ]);

  const canViewFinance = canAny([
    'finance.view',
    'finance.transactions.view',
    'finance.entries.view',
  ]);

  const canViewReports = hasPermission('reports.view');
  const canViewDashboard = hasPermission('reports.view');
  const canViewUsers = hasPermission('users.view');
  const canViewAuditLogs = hasPermission('audit.view');  // ✅ جديد
  const canViewBackup = hasPermission('settings.update');

  // ─── الروابط الخاصة ───
  const canViewMyPharmacies = isSalesRep && hasPermission('customers.view');
  const canViewMyInvoices = isPharmacy && hasPermission('invoices.view');

  const roleLabel = ROLE_LABELS_AR[userRole] || 'مستخدم';

  return (
    <aside className="w-64 bg-white border-l border-neutral-200 h-screen flex flex-col sticky top-0">
      <div className="h-16 flex items-center justify-center border-b border-neutral-200 flex-shrink-0">
        <h1 className="text-xl font-bold text-primary-800">TOP PHARMA</h1>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin">
        {/* لوحة التحكم */}
        {canViewDashboard && (
          <SidebarLink to="/" icon={LayoutDashboard} label="لوحة التحكم" end />
        )}

        {/* المخزون */}
        {canViewInventory && (
          <SidebarGroup
            title="المخزون"
            icon={Package}
            isActiveGroup={location.pathname.startsWith('/inventory')}
          >
            {hasPermission('categories.view') && (
              <SidebarLink to="/inventory/categories" icon={Tags} label="التصنيفات" />
            )}
            {hasPermission('warehouses.view') && (
              <SidebarLink to="/inventory/warehouses" icon={Building2} label="المخازن" />
            )}
            {hasPermission('items.view') && (
              <SidebarLink to="/inventory/items" icon={Boxes} label="الأصناف" />
            )}
            {hasPermission('suppliers.view') && (
              <SidebarLink to="/inventory/suppliers" icon={Users} label="الموردون" />
            )}
            {hasPermission('customers.view') && (
              <SidebarLink to="/inventory/customers" icon={Store} label="الصيدليات" />
            )}
            {hasPermission('stocks.view') && (
              <SidebarLink to="/inventory/stock" icon={ClipboardList} label="المخزون" />
            )}
          </SidebarGroup>
        )}

        {/* المبيعات */}
        {canViewSales && (
          <SidebarGroup
            title="المبيعات"
            icon={ShoppingCart}
            isActiveGroup={
              location.pathname.startsWith('/sales') &&
              !location.pathname.includes('purchase') &&
              !location.pathname.includes('supplier-returns')
            }
          >
            {hasPermission('invoices.view') && (
              <SidebarLink to="/sales/invoices" icon={FileText} label="الفواتير" />
            )}
            {hasPermission('customer_returns.view') && (
              <SidebarLink to="/sales/customer-returns" icon={Undo2} label="مرتجعات العملاء" />
            )}
          </SidebarGroup>
        )}

        {/* المشتريات */}
        {canViewPurchases && (
          <SidebarGroup
            title="المشتريات"
            icon={Receipt}
            isActiveGroup={
              location.pathname.includes('purchase-receipts') ||
              location.pathname.includes('supplier-returns')
            }
          >
            {hasPermission('purchase_receipts.view') && (
              <SidebarLink to="/sales/purchase-receipts" icon={Receipt} label="إيصالات الاستلام" />
            )}
            {hasPermission('supplier_returns.view') && (
              <SidebarLink to="/sales/supplier-returns" icon={ArrowLeftRight} label="مرتجعات الموردين" />
            )}
          </SidebarGroup>
        )}

        {/* المالية */}
        {canViewFinance && (
          <SidebarGroup
            title="المالية"
            icon={Wallet}
            isActiveGroup={location.pathname.startsWith('/finance')}
          >
            {hasPermission('finance.view') && (
              <SidebarLink to="/finance" icon={Wallet} label="نظرة عامة" end />
            )}
            {hasPermission('finance.view') && (
              <SidebarLink to="/finance/cash-funds" icon={Coins} label="الصناديق النقدية" />
            )}
            {hasPermission('finance.view') && (
              <SidebarLink to="/finance/bank-accounts" icon={Landmark} label="الحساب البنكي" />
            )}
            {hasPermission('finance.transactions.view') && (
              <SidebarLink to="/finance/cash-transactions" icon={Receipt} label="الحركات النقدية" />
            )}
            {hasPermission('finance.entries.view') && (
              <SidebarLink to="/finance/accounting-entries" icon={ScrollText} label="القيود المحاسبية" />
            )}
          </SidebarGroup>
        )}

        {/* التقارير */}
        {canViewReports && (
          <SidebarGroup
            title="التقارير"
            icon={BarChart3}
            isActiveGroup={location.pathname.startsWith('/reports')}
          >
            <SidebarLink to="/reports" icon={BarChart3} label="مركز التقارير" end />
            <SidebarLink to="/reports/finance" icon={Wallet} label="التقارير المالية" />
            <SidebarLink to="/reports/sales" icon={TrendingUp} label="تقارير المبيعات" />
            <SidebarLink to="/reports/customers" icon={Users} label="تقارير العملاء" />
            <SidebarLink to="/reports/suppliers" icon={Store} label="تقارير الموردين" />
            <SidebarLink to="/reports/inventory" icon={Package} label="تقارير المخزون" />
          </SidebarGroup>
        )}

        {/* الإشعارات */}
        {hasPermission('notifications.view') && (
          <SidebarLink
            to="/notifications"
            icon={Bell}
            label="الإشعارات"
            badge={unreadCount}
          />
        )}

        {/* المستخدمون */}
        {canViewUsers && (
          <SidebarLink to="/users" icon={UserCog} label="المستخدمون والموظفون" />
        )}

        {/* ✅ سجل التدقيق — جديد */}
        {canViewAuditLogs && (
          <SidebarLink to="/audit-logs" icon={ScrollText} label="سجل التدقيق" />
        )}

        {/* النسخ الاحتياطي */}
        {canViewBackup && (
          <SidebarLink to="/backup" icon={Database} label="النسخ الاحتياطي" />
        )}

        {/* الإعدادات */}
        {hasPermission('settings.view') && (
          <SidebarLink to="/settings" icon={Settings} label="الإعدادات" />
        )}

        {/* روابط خاصة */}
        {canViewMyPharmacies && (
          <SidebarLink to="/inventory/customers" icon={Store} label="صيدلياتي" />
        )}

        {canViewMyInvoices && (
          <SidebarLink to="/sales/invoices" icon={FileText} label="فواتيري" />
        )}
      </nav>

      <div className="p-4 border-t border-neutral-200 flex-shrink-0 text-sm text-neutral-600">
        <p className="font-bold text-neutral-900">{roleLabel}</p>
        <p className="text-xs mt-1">نظام Pharma</p>
      </div>
    </aside>
  );
}

export default Sidebar;