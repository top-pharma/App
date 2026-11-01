/**
 * @file SalesPage.jsx
 * @description
 * الصفحة الرئيسية (Hub) لقسم المبيعات.
 * تجمع روابط الأقسام الفرعية في بطاقات كبيرة + إحصاءات سريعة.
 *
 * لماذا هذا الملف؟
 * - تُجنّب ازدحام القائمة الجانبية (Sidebar) بعناصر كثيرة.
 * - تُوفّر نظرة سريعة على حالة المبيعات (فواتير متأخرة، إيصالات معلقة).
 * - تتبع نمط InventoryPage.jsx (Hub pattern) للاتساق البصري.
 * - تُظهر البطاقات حسب صلاحيات المستخدم.
 */

import { Link } from 'react-router-dom';
import {
  FileText,
  Truck,
  Undo2,
  Receipt,
  ArrowLeftRight,
  ChevronLeft,
  AlertCircle,
  Clock,
  TrendingUp,
} from 'lucide-react';

import { useAuth } from '../hooks/useAuth.js';
import { useInvoices } from '../hooks/useInvoices.js';
import { useDeliveryNotes } from '../hooks/useDeliveryNotes.js';
import { useCustomerReturns } from '../hooks/useCustomerReturns.js';
import Card from '../components/UI/Card.jsx';
import { formatNumber } from '../utils/formatters.js';

// ═══════════════════════════════════════════════
// 1. مكون البطاقة (قابل لإعادة الاستخدام)
// ═══════════════════════════════════════════════

/**
 * بطاقة قسم (تُستخدم للربط مع صفحة فرعية).
 * @param {Object} props
 * @param {string} props.to - المسار
 * @param {React.ComponentType} props.icon - الأيقونة
 * @param {string} props.title - العنوان
 * @param {string} props.description - الوصف
 * @param {string} [props.color='primary'] - اللون (primary/success/warning/danger/info)
 * @param {number} [props.badge] - رقم الإشعار (اختياري)
 * @param {string} [props.badgeColor='danger'] - لون الشارة
 * @returns {JSX.Element}
 */
function HubCard({
  to,
  icon: Icon,
  title,
  description,
  color = 'primary',
  badge,
  badgeColor = 'danger',
}) {
  // خريطة الألوان
  const colorClasses = {
    primary: 'bg-primary-50 text-primary-800 group-hover:bg-primary-100',
    success: 'bg-success-50 text-success-700 group-hover:bg-success-100',
    warning: 'bg-warning-50 text-warning-700 group-hover:bg-warning-100',
    danger: 'bg-danger-50 text-danger-700 group-hover:bg-danger-100',
    info: 'bg-info-50 text-info-700 group-hover:bg-info-100',
  };

  const badgeClasses = {
    danger: 'bg-danger-600 text-white',
    warning: 'bg-warning-600 text-white',
    primary: 'bg-primary-600 text-white',
  };

  return (
    <Link
      to={to}
      className="group block bg-white rounded-lg border border-neutral-200 p-6 shadow-sm hover:shadow-md hover:border-primary-300 transition-all duration-200 relative"
    >
      {/* الشارة (رقم الإشعار) */}
      {badge > 0 && (
        <span
          className={`absolute top-3 left-3 min-w-[28px] h-7 px-2 rounded-full text-xs font-bold flex items-center justify-center ${badgeClasses[badgeColor]}`}
        >
          <span className="numeric">{formatNumber(badge)}</span>
        </span>
      )}

      <div className="flex items-start gap-4">
        {/* الأيقونة */}
        <div
          className={`flex-shrink-0 w-14 h-14 rounded-lg flex items-center justify-center transition-colors ${colorClasses[color]}`}
        >
          <Icon size={28} />
        </div>

        {/* النصوص */}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-neutral-900 mb-1">{title}</h3>
          <p className="text-sm text-neutral-600 leading-relaxed">{description}</p>
        </div>
      </div>

      {/* سهم الانتقال */}
      <div className="mt-4 flex items-center text-primary-700 text-sm font-medium">
        <span>فتح</span>
        <ChevronLeft
          size={16}
          className="mr-1 transition-transform group-hover:-translate-x-1"
        />
      </div>
    </Link>
  );
}

// ═══════════════════════════════════════════════
// 2. بطاقة الإحصاءات السريعة (KPI Card)
// ═══════════════════════════════════════════════

/**
 * بطاقة إحصائية صغيرة (للـ Top KPIs).
 */
function KpiCard({ icon: Icon, label, value, color = 'primary', suffix = '' }) {
  const colorClasses = {
    primary: 'text-primary-700 bg-primary-50',
    warning: 'text-warning-700 bg-warning-50',
    danger: 'text-danger-700 bg-danger-50',
    success: 'text-success-700 bg-success-50',
  };

  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClasses[color]}`}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-neutral-500 mb-0.5">{label}</p>
        <p className="text-xl font-bold text-neutral-900 numeric">
          {formatNumber(value)}
          {suffix && <span className="text-sm font-normal text-neutral-500 mr-1">{suffix}</span>}
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// 3. المكون الرئيسي
// ═══════════════════════════════════════════════

function SalesPage() {
  const { isAdmin, isAccountant, isSalesRep, isStorekeeper } = useAuth();

  // الإحصاءات (تُقرأ من الـ Contexts — بدون جلب)
  const { stats: invoiceStats } = useInvoices();
  const { stats: deliveryStats } = useDeliveryNotes();
  const { stats: returnStats } = useCustomerReturns();

  // الصلاحيات
  const canViewInvoices = isAdmin || isAccountant || isSalesRep;
  const canViewDeliveryNotes = isAdmin || isAccountant || isSalesRep;
  const canViewCustomerReturns = isAdmin || isAccountant || isSalesRep;
  const canViewPurchases = isAdmin || isAccountant || isStorekeeper;

  // عدد المشكلات (للإبراز)
  const totalAlerts = (invoiceStats?.overdue || 0) + (deliveryStats?.pending || 0) + (returnStats?.pending || 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ═══ الترويسة ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">المبيعات</h1>
          <p className="text-sm text-neutral-600 mt-1">
            إدارة الفواتير، إيصالات التسليم، والمرتجعات
          </p>
        </div>
        {totalAlerts > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-warning-50 border border-warning-200 rounded-lg text-sm text-warning-800">
            <AlertCircle size={18} />
            <span>
              لديك <strong className="numeric">{totalAlerts}</strong> عنصر بحاجة إلى متابعة
            </span>
          </div>
        )}
      </div>

      {/* ═══ الإحصاءات السريعة (KPIs) ═══ */}
      {canViewInvoices && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={FileText}
            label="إجمالي الفواتير"
            value={invoiceStats?.total || 0}
            color="primary"
          />
          <KpiCard
            icon={Clock}
            label="فواتير غير مدفوعة"
            value={invoiceStats?.unpaid || 0}
            color="warning"
          />
          <KpiCard
            icon={AlertCircle}
            label="فواتير متأخرة"
            value={invoiceStats?.overdue || 0}
            color="danger"
          />
          <KpiCard
            icon={TrendingUp}
            label="مرتجعات معلقة"
            value={returnStats?.pending || 0}
            color="warning"
          />
        </div>
      )}

      {/* ═══ قسم المبيعات (البطاقات) ═══ */}
      <div>
        <h2 className="text-lg font-bold text-neutral-900 mb-3">إدارة المبيعات</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {canViewInvoices && (
            <HubCard
              to="/sales/invoices"
              icon={FileText}
              title="الفواتير"
              description="إدارة فواتير البيع (نقدي، آجل، أقساط) مع تتبع الدفعات والتحصيل."
              color="primary"
              badge={invoiceStats?.overdue}
              badgeColor="danger"
            />
          )}

          {canViewDeliveryNotes && (
            <HubCard
              to="/sales/delivery-notes"
              icon={Truck}
              title="إيصالات التسليم"
              description="تسجيل خروج البضاعة من المخزن إلى الصيدليات مع توقيع المستلم."
              color="info"
              badge={deliveryStats?.pending}
              badgeColor="warning"
            />
          )}

          {canViewCustomerReturns && (
            <HubCard
              to="/sales/customer-returns"
              icon={Undo2}
              title="مرتجعات العملاء"
              description="استلام البضاعة المرتجعة من الصيدليات خلال فترة السماح (7 أيام)."
              color="warning"
              badge={returnStats?.pending}
              badgeColor="warning"
            />
          )}
        </div>
      </div>

      {/* ═══ قسم المشتريات (البطاقات) ═══ */}
      {canViewPurchases && (
        <div>
          <h2 className="text-lg font-bold text-neutral-900 mb-3">المشتريات والموردون</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <HubCard
              to="/sales/purchase-receipts"
              icon={Receipt}
              title="إيصالات الاستلام"
              description="استلام البضاعة من الموردين وإدخالها للمخزون مع تسجيل الدفعات."
              color="success"
            />

            <HubCard
              to="/sales/supplier-returns"
              icon={ArrowLeftRight}
              title="مرتجعات الموردين"
              description="إرجاع الأدوية التالفة أو قريبة الانتهاء إلى الشركات المستوردة."
              color="danger"
            />
          </div>
        </div>
      )}

      {/* ═══ حالة فارغة (إن لم يكن لديه أي صلاحية) ═══ */}
      {!canViewInvoices && !canViewPurchases && (
        <Card>
          <div className="text-center py-8">
            <p className="text-neutral-600">
              لا تملك صلاحية الوصول إلى أي قسم من أقسام المبيعات.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

export default SalesPage;