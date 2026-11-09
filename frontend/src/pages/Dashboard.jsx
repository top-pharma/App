/**
 * @file Dashboard.jsx
 * @description
 * لوحة التحكم الرئيسية.
 *
 * ✅ 🅱 (2026-11-08):
 * - حذف `useDeliveryNotes` + StatCard "إيصالات معلقة" + QuickLink "إيصالات التسليم".
 */

import { Link, useNavigate } from 'react-router-dom';
import {
  FileText,
  // ⚠️ 🅱: حُذف Truck
  Undo2,
  Receipt,
  ArrowLeftRight,
  Package,
  AlertCircle,
  TrendingUp,
  Users,
  Boxes,
  BarChart3,
  Wallet,
  Plus,
} from 'lucide-react';

import { useAuth } from '../hooks/useAuth.js';
import { useInvoices } from '../hooks/useInvoices.js';
// ⚠️ 🅱: حُذف useDeliveryNotes
import { useCustomerReturns } from '../hooks/useCustomerReturns.js';
import { useStock } from '../hooks/useStock.js';

import Card from '../components/UI/Card.jsx';
import Button from '../components/UI/Button.jsx';
import { formatNumber } from '../utils/formatters.js';

// ═══════════════════════════════════════════════
// 1. مكونات فرعية
// ═══════════════════════════════════════════════

function StatCard({ icon: Icon, label, value, color = 'primary', suffix = '', to }) {
  const colorMap = {
    primary: 'bg-primary-50 text-primary-700',
    warning: 'bg-warning-50 text-warning-700',
    danger: 'bg-danger-50 text-danger-700',
    success: 'bg-success-50 text-success-700',
    info: 'bg-info-50 text-info-700',
  };

  const content = (
    <div className="bg-white rounded-lg border border-neutral-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon size={20} />
        </div>
      </div>
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-neutral-900 numeric">
        {formatNumber(value)}
        {suffix && <span className="text-sm font-normal text-neutral-500 mr-1">{suffix}</span>}
      </p>
    </div>
  );

  if (to) {
    return <Link to={to}>{content}</Link>;
  }
  return content;
}

function QuickLink({ to, icon: Icon, title, description, color = 'primary' }) {
  const colorMap = {
    primary: 'bg-primary-50 text-primary-700 group-hover:bg-primary-100',
    success: 'bg-success-50 text-success-700 group-hover:bg-success-100',
    warning: 'bg-warning-50 text-warning-700 group-hover:bg-warning-100',
    danger: 'bg-danger-50 text-danger-700 group-hover:bg-danger-100',
    info: 'bg-info-50 text-info-700 group-hover:bg-info-100',
  };

  return (
    <Link
      to={to}
      className="group flex items-center gap-3 p-3 rounded-lg border border-neutral-200 hover:border-primary-300 hover:shadow-sm transition-all"
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colorMap[color]}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="font-bold text-sm text-neutral-900">{title}</p>
        <p className="text-xs text-neutral-500 truncate">{description}</p>
      </div>
    </Link>
  );
}

// ═══════════════════════════════════════════════
// 2. المكون الرئيسي
// ═══════════════════════════════════════════════

function Dashboard() {
  const { user, userName, isAdmin, isAccountant, isSalesRep, isStorekeeper } = useAuth();
  const navigate = useNavigate();

  const { stats: invoiceStats } = useInvoices();
  // ⚠️ 🅱: حُذف deliveryStats
  const { stats: returnStats } = useCustomerReturns();
  const { expiringSoon, belowReorder } = useStock();

  const canSeeFinance = isAdmin || isAccountant;
  const canSeeSales = isAdmin || isAccountant || isSalesRep;
  const canSeeReports = isAdmin || isAccountant;

  const handleGoToCreateInvoice = () => {
    navigate('/sales/invoices', { state: { openCreateForm: true } });
  };

  return (
    <div className="space-y-6">
      {/* ═══ الترحيب + زر إنشاء فاتورة ═══ */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            مرحباً {userName?.split(' ')[0] || 'بك'}
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            نظرة سريعة على حالة النظام — {new Date().toLocaleDateString('en-GB')}
          </p>
        </div>

        {(isAdmin || isAccountant) && (
          <Button
            variant="primary"
            icon={Plus}
            onClick={handleGoToCreateInvoice}
          >
            إنشاء فاتورة
          </Button>
        )}
      </div>

      {/* ═══ KPIs الرئيسية ═══ */}
      <div>
        <h2 className="text-lg font-bold text-neutral-900 mb-3">المؤشرات الرئيسية</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard
            icon={FileText}
            label="إجمالي الفواتير"
            value={invoiceStats?.total || 0}
            color="primary"
            to={canSeeSales ? '/sales/invoices' : undefined}
          />
          <StatCard
            icon={AlertCircle}
            label="فواتير متأخرة"
            value={invoiceStats?.overdue || 0}
            color="danger"
            to={canSeeSales ? '/sales/invoices?overdue=true' : undefined}
          />
          <StatCard
            icon={Undo2}
            label="مرتجعات معلقة"
            value={returnStats?.pending || 0}
            color="warning"
            to={canSeeSales ? '/sales/customer-returns' : undefined}
          />
          {/* ⚠️ 🅱: حُذف StatCard "إيصالات معلقة" */}
        </div>
      </div>

      {/* ═══ التنبيهات ═══ */}
      {(expiringSoon?.count > 0 || belowReorder?.count > 0) && (
        <div>
          <h2 className="text-lg font-bold text-neutral-900 mb-3">التنبيهات</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {expiringSoon?.count > 0 && (
              <Link
                to="/inventory/stock?filter=expiring"
                className="flex items-start gap-3 p-4 bg-warning-50 border border-warning-200 rounded-lg hover:bg-warning-100 transition-colors"
              >
                <AlertCircle size={20} className="text-warning-700 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-bold text-warning-900 text-sm">
                    {expiringSoon.count} دفعة قاربة على الانتهاء
                  </p>
                  <p className="text-xs text-warning-800 mt-1">
                    خلال {expiringSoon.thresholdDays} يوماً — راجع المخزون
                  </p>
                </div>
              </Link>
            )}
            {belowReorder?.count > 0 && (
              <Link
                to="/inventory/items?filter=lowStock"
                className="flex items-start gap-3 p-4 bg-danger-50 border border-danger-200 rounded-lg hover:bg-danger-100 transition-colors"
              >
                <TrendingUp size={20} className="text-danger-700 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-bold text-danger-900 text-sm">
                    {belowReorder.count} صنف تحت الحد الأدنى
                  </p>
                  <p className="text-xs text-danger-800 mt-1">
                    يحتاج إعادة طلب — راجع المشتريات
                  </p>
                </div>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ═══ التقارير (Phase 4) ═══ */}
      {canSeeReports && (
        <div>
          <h2 className="text-lg font-bold text-neutral-900 mb-3">التقارير والتحليلات</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Link
              to="/reports"
              className="group flex items-start gap-3 p-4 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-primary-600 text-white flex items-center justify-center flex-shrink-0">
                <BarChart3 size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-primary-900">مركز التقارير</p>
                <p className="text-xs text-primary-800 mt-1">
                  11 تقريراً متاحاً — مالية ومبيعات
                </p>
              </div>
            </Link>

            <Link
              to="/reports/finance"
              className="group flex items-start gap-3 p-4 bg-success-50 border border-success-200 rounded-lg hover:bg-success-100 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-success-600 text-white flex items-center justify-center flex-shrink-0">
                <Wallet size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-success-900">التقارير المالية</p>
                <p className="text-xs text-success-800 mt-1">
                  ميزان المراجعة، الحركات، الشيكات، المصروفات
                </p>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* ═══ الوصول السريع ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {canSeeSales && (
          <Card title="المبيعات" icon={FileText}>
            <div className="space-y-2">
              <QuickLink
                to="/sales/invoices"
                icon={FileText}
                title="الفواتير"
                description="إنشاء ومتابعة الفواتير"
                color="primary"
              />
              {/* ⚠️ 🅱: حُذف QuickLink "إيصالات التسليم" */}
              <QuickLink
                to="/sales/customer-returns"
                icon={Undo2}
                title="مرتجعات العملاء"
                description="استلام البضاعة المرتجعة"
                color="warning"
              />
            </div>
          </Card>
        )}

        <Card title="المخزون" icon={Package}>
          <div className="space-y-2">
            <QuickLink
              to="/inventory/items"
              icon={Boxes}
              title="الأصناف"
              description="إدارة الأدوية والمنتجات"
              color="primary"
            />
            <QuickLink
              to="/inventory/stock"
              icon={Package}
              title="المخزون"
              description="الدفعات والصلاحيات"
              color="success"
            />
            <QuickLink
              to="/inventory/customers"
              icon={Users}
              title="الصيدليات"
              description="العملاء والمندوبون"
              color="info"
            />
          </div>
        </Card>
      </div>

      {/* ═══ المشتريات ═══ */}
      {(canSeeFinance || isStorekeeper) && (
        <Card title="المشتريات والموردون" icon={Receipt}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <QuickLink
              to="/sales/purchase-receipts"
              icon={Receipt}
              title="إيصالات الاستلام"
              description="استلام البضاعة من الموردين"
              color="success"
            />
            <QuickLink
              to="/sales/supplier-returns"
              icon={ArrowLeftRight}
              title="مرتجعات الموردين"
              description="إرجاع البضاعة التالفة"
              color="danger"
            />
          </div>
        </Card>
      )}

      {/* ═══ الفوتر ═══ */}
      <div className="text-center text-xs text-neutral-500 pt-4">
        <p>
          مرحباً بك في نظام Pharma System — شركة TOP PHARMA MEDICAL COMPANY
        </p>
        <p className="mt-1">
          المرحلة الحالية: <strong>Phase 4 — التقارير</strong> — دورك: <strong>{user?.role || '—'}</strong>
        </p>
      </div>
    </div>
  );
}

export default Dashboard;