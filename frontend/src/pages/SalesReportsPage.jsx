/**
 * @file SalesReportsPage.jsx
 * @description
 * صفحة تقارير المبيعات — 6 تقارير في Tabs.
 *
 * التقارير:
 *   1. الفواتير (invoices)
 *   2. حسب المندوب (by-rep)
 *   3. حسب الصنف (by-item)
 *   4. العمولات (commissions)
 *   5. البونص (discounts)
 *   6. كشف حساب مندوب (statement) — Phase 4.5
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FileText,
  Users,
  Package,
  DollarSign,
  Gift,
  BookUser,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

import KpiCards from '../components/Reports/KpiCards';
import ExportButtons from '../components/Reports/ExportButtons';
import Table from '../components/UI/Table';
import Input from '../components/UI/Input';
import Select from '../components/UI/Select';
import Button from '../components/UI/Button';
import Loading from '../components/UI/Loading';

import * as api from '../api/salesReportsAPI';
import { listSalesReps } from '../api/usersAPI';

/* ─────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const today = () => new Date().toISOString().slice(0, 10);

const fmt = (n) =>
  typeof n === 'number'
    ? new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n)
    : n ?? '—';

const TABS = [
  { key: 'invoices', label: 'الفواتير', icon: FileText },
  { key: 'by-rep', label: 'حسب المندوب', icon: Users },
  { key: 'by-item', label: 'حسب الصنف', icon: Package },
  { key: 'commissions', label: 'العمولات', icon: DollarSign },
  { key: 'discounts', label: 'البونص', icon: Gift },
  { key: 'statement', label: 'كشف حساب مندوب', icon: BookUser },
];

/* ─────────────────────────────────────────────────────────────
 * Main
 * ───────────────────────────────────────────────────────────── */

export default function SalesReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'invoices';

  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [status, setStatus] = useState('all');
  const [paymentType, setPaymentType] = useState('all');

  // statement
  const [salesReps, setSalesReps] = useState([]);
  const [salesRepId, setSalesRepId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  // تحميل المناديب (مرة واحدة)
  useEffect(() => {
    (async () => {
      try {
        const reps = await listSalesReps();
        setSalesReps(reps || []);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[salesReps]', err);
      }
    })();
  }, []);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      let result;
      switch (activeTab) {
        case 'invoices':
          result = await api.getInvoices({ from, to, status, paymentType });
          break;
        case 'by-rep':
          result = await api.getByRep({ from, to });
          break;
        case 'by-item':
          result = await api.getByItem({ from, to });
          break;
        case 'commissions':
          result = await api.getCommissions({ from, to });
          break;
        case 'discounts':
          result = await api.getDiscounts({ from, to });
          break;
        case 'statement':
          if (!salesRepId) {
            setError('اختر مندوباً لعرض كشف الحساب.');
            setLoading(false);
            return;
          }
          result = await api.getSalesRepStatement(salesRepId, { from, to });
          break;
        default:
          result = null;
      }
      setData(result);
    } catch (err) {
      setError(err?.error?.message || err?.message || 'فشل تحميل التقرير.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const setTab = (key) => {
    setSearchParams({ tab: key });
    setData(null);
    setError(null);
  };

  const handleReset = () => {
    setFrom(firstOfMonth());
    setTo(today());
    setStatus('all');
    setPaymentType('all');
    setSalesRepId('');
    setData(null);
    setError(null);
  };

  const buildExportParams = () => {
    if (activeTab === 'invoices') return { from, to, status, paymentType };
    if (activeTab === 'statement') return { from, to, salesRepId };
    return { from, to };
  };

  const renderReport = () => {
    if (loading) {
      return (
        <div className="bg-white rounded-xl border border-neutral-200 p-12">
          <Loading text="جارٍ تحميل التقرير..." />
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm flex items-start gap-2">
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      );
    }

    if (!data) return null;

    switch (activeTab) {
      /* ───── 1. الفواتير ───── */
      case 'invoices': {
        const kpis = [
          { label: 'عدد الفواتير', value: data.totals.count, color: 'blue' },
          {
            label: 'إجمالي المبيعات',
            value: `${fmt(data.totals.total)} SDG`,
            color: 'green',
          },
          {
            label: 'المدفوع',
            value: `${fmt(data.totals.paid)} SDG`,
            color: 'purple',
          },
          {
            label: 'المتبقي',
            value: `${fmt(data.totals.remaining)} SDG`,
            color: data.totals.remaining > 0 ? 'orange' : 'green',
          },
        ];

        const columns = [
          { key: 'invoiceNumber', label: 'الرقم', align: 'start' },
          { key: 'dateLabel', label: 'التاريخ', align: 'center' },
          { key: 'pharmacyName', label: 'الصيدلية', align: 'start' },
          { key: 'salesRepName', label: 'المندوب', align: 'start' },
          { key: 'paymentTypeLabel', label: 'الدفع', align: 'center' },
          { key: 'statusLabel', label: 'الحالة', align: 'center' },
          {
            key: 'total',
            label: 'الإجمالي',
            align: 'end',
            render: (r) => fmt(r.total),
          },
          {
            key: 'paid',
            label: 'المدفوع',
            align: 'end',
            render: (r) => fmt(r.paid),
          },
          {
            key: 'remaining',
            label: 'المتبقي',
            align: 'end',
            render: (r) => (
              <span
                className={
                  r.remaining > 0 ? 'text-orange-700' : 'text-green-700'
                }
              >
                {fmt(r.remaining)}
              </span>
            ),
          },
        ];

        return (
          <div className="space-y-4">
            <KpiCards items={kpis} />
            <Table
              columns={columns}
              data={data.lines}
              emptyMessage="لا توجد فواتير في هذه الفترة"
            />
          </div>
        );
      }

      /* ───── 2. حسب المندوب ───── */
      case 'by-rep': {
        const kpis = [
          {
            label: 'إجمالي المبيعات',
            value: `${fmt(data.totals.total)} SDG`,
            color: 'blue',
          },
          {
            label: 'عدد الفواتير',
            value: data.totals.count,
            color: 'neutral',
          },
          {
            label: 'المحصّل',
            value: `${fmt(data.totals.paid)} SDG`,
            color: 'green',
          },
          {
            label: 'عدد المناديب',
            value: data.lines.length,
            color: 'purple',
          },
        ];

        const columns = [
          { key: 'name', label: 'المندوب', align: 'start' },
          { key: 'email', label: 'البريد', align: 'start' },
          { key: 'count', label: 'الفواتير', align: 'center' },
          {
            key: 'total',
            label: 'الإجمالي',
            align: 'end',
            render: (r) => fmt(r.total),
          },
          {
            key: 'avgInvoice',
            label: 'متوسط الفاتورة',
            align: 'end',
            render: (r) => fmt(r.avgInvoice),
          },
          {
            key: 'paid',
            label: 'المدفوع',
            align: 'end',
            render: (r) => fmt(r.paid),
          },
        ];

        return (
          <div className="space-y-4">
            <KpiCards items={kpis} />
            <Table
              columns={columns}
              data={data.lines}
              emptyMessage="لا توجد مبيعات في هذه الفترة"
            />
          </div>
        );
      }

      /* ───── 3. حسب الصنف ───── */
      case 'by-item': {
        const kpis = [
          {
            label: 'إجمالي المبيعات',
            value: `${fmt(data.totals.total)} SDG`,
            color: 'blue',
          },
          {
            label: 'إجمالي الربح',
            value: `${fmt(data.totals.profit)} SDG`,
            color: 'green',
          },
          {
            label: 'إجمالي الكمية',
            value: fmt(data.totals.quantity),
            color: 'neutral',
          },
          {
            label: 'عدد الأصناف',
            value: data.lines.length,
            color: 'purple',
          },
        ];

        const columns = [
          { key: 'tradeName', label: 'الصنف', align: 'start' },
          { key: 'scientificName', label: 'الاسم العلمي', align: 'start' },
          {
            key: 'quantity',
            label: 'الكمية',
            align: 'end',
            render: (r) => fmt(r.quantity),
          },
          {
            key: 'total',
            label: 'الإجمالي',
            align: 'end',
            render: (r) => fmt(r.total),
          },
          {
            key: 'profit',
            label: 'الربح',
            align: 'end',
            render: (r) => (
              <span
                className={r.profit >= 0 ? 'text-green-700' : 'text-red-700'}
              >
                {fmt(r.profit)}
              </span>
            ),
          },
          {
            key: 'marginPercent',
            label: 'الهامش %',
            align: 'end',
            render: (r) => `${Number(r.marginPercent || 0).toFixed(1)}%`,
          },
        ];

        return (
          <div className="space-y-4">
            <KpiCards items={kpis} />
            <Table
              columns={columns}
              data={data.lines}
              emptyMessage="لا توجد مبيعات في هذه الفترة"
            />
          </div>
        );
      }

      /* ───── 4. العمولات ───── */
      case 'commissions': {
        const kpis = [
          {
            label: 'إجمالي العمولات',
            value: `${fmt(data.totals.total)} SDG`,
            color: 'green',
          },
          {
            label: 'عدد العمولات',
            value: data.totals.count,
            color: 'neutral',
          },
          {
            label: 'قيمة الفواتير',
            value: `${fmt(data.totals.invoiceTotal)} SDG`,
            color: 'blue',
          },
        ];

        const columns = [
          { key: 'transactionNumber', label: 'رقم الحركة', align: 'start' },
          { key: 'dateLabel', label: 'التاريخ', align: 'center' },
          { key: 'salesRepName', label: 'المندوب', align: 'start' },
          { key: 'invoiceNumber', label: 'الفاتورة', align: 'start' },
          {
            key: 'invoiceTotal',
            label: 'قيمة الفاتورة',
            align: 'end',
            render: (r) => fmt(r.invoiceTotal),
          },
          {
            key: 'amount',
            label: 'العمولة',
            align: 'end',
            render: (r) => (
              <span className="font-semibold text-green-700">
                {fmt(r.amount)}
              </span>
            ),
          },
        ];

        return (
          <div className="space-y-4">
            <KpiCards items={kpis} />
            <Table
              columns={columns}
              data={data.lines}
              emptyMessage="لا توجد عمولات في هذه الفترة"
            />
          </div>
        );
      }

      /* ───── 5. البونص ───── */
      case 'discounts': {
        const kpis = [
          {
            label: 'إجمالي البونص',
            value: `${fmt(data.totals.amount)} SDG`,
            color: 'orange',
          },
          {
            label: 'عدد الفواتير',
            value: data.totals.count,
            color: 'neutral',
          },
          {
            label: 'قيمة الفواتير',
            value: `${fmt(data.totals.invoiceTotal)} SDG`,
            color: 'blue',
          },
        ];

        const columns = [
          { key: 'invoiceNumber', label: 'الفاتورة', align: 'start' },
          { key: 'dateLabel', label: 'التاريخ', align: 'center' },
          { key: 'pharmacyName', label: 'الصيدلية', align: 'start' },
          { key: 'salesRepName', label: 'المندوب', align: 'start' },
          { key: 'discountType', label: 'النوع', align: 'center' },
          {
            key: 'discountValue',
            label: 'القيمة',
            align: 'end',
            render: (r) => fmt(r.discountValue),
          },
          {
            key: 'discountAmount',
            label: 'المبلغ المخصوم',
            align: 'end',
            render: (r) => (
              <span className="font-semibold text-orange-700">
                {fmt(r.discountAmount)}
              </span>
            ),
          },
          { key: 'reason', label: 'السبب', align: 'start' },
        ];

        return (
          <div className="space-y-4">
            <KpiCards items={kpis} />
            <Table
              columns={columns}
              data={data.lines}
              emptyMessage="لا توجد خصومات في هذه الفترة"
            />
          </div>
        );
      }

      /* ───── 6. كشف حساب مندوب ───── */
      case 'statement': {
        const kpis = [
          {
            label: 'الرصيد الافتتاحي',
            value: `${fmt(data.openingBalance)} SDG`,
            color: 'neutral',
          },
          {
            label: 'له (مدين)',
            value: `${fmt(data.totals.credit)} SDG`,
            color: 'blue',
          },
          {
            label: 'عليه (دائن)',
            value: `${fmt(data.totals.debit)} SDG`,
            color: 'orange',
          },
          {
            label: 'الرصيد الختامي',
            value: `${fmt(data.closingBalance)} SDG`,
            color: data.closingBalance >= 0 ? 'green' : 'red',
          },
        ];

        const columns = [
          { key: 'dateLabel', label: 'التاريخ', align: 'center' },
          { key: 'typeLabel', label: 'النوع', align: 'center' },
          { key: 'ref', label: 'المرجع', align: 'start' },
          {
            key: 'credit',
            label: 'له (مدين)',
            align: 'end',
            render: (r) => fmt(r.credit),
          },
          {
            key: 'debit',
            label: 'عليه (دائن)',
            align: 'end',
            render: (r) => fmt(r.debit),
          },
          {
            key: 'balance',
            label: 'الرصيد',
            align: 'end',
            render: (r) => (
              <span
                className={
                  r.balance < 0
                    ? 'text-red-700 font-semibold'
                    : 'text-green-700'
                }
              >
                {fmt(r.balance)}
              </span>
            ),
          },
        ];

        return (
          <div className="space-y-4">
            <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
              <p className="text-sm text-neutral-600">
                المندوب:{' '}
                <strong className="text-neutral-900">
                  {data.salesRep?.name}
                </strong>
                {data.salesRep?.email && (
                  <span className="text-neutral-500">
                    {' '}
                    — {data.salesRep.email}
                  </span>
                )}
              </p>
            </div>
            <KpiCards items={kpis} />
            <Table
              columns={columns}
              data={data.lines}
              emptyMessage="لا توجد حركات في هذه الفترة"
            />
          </div>
        );
      }

      default:
        return null;
    }
  };

  const extraFilters = () => {
    if (activeTab === 'invoices') {
      return (
        <>
          <Select
            label="الحالة"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: 'all', label: 'الكل' },
              { value: 'pending', label: 'معلقة' },
              { value: 'partial', label: 'جزئية' },
              { value: 'paid', label: 'مدفوعة' },
              { value: 'overdue', label: 'متأخرة' },
            ]}
            containerClassName="w-32"
          />
          <Select
            label="الدفع"
            value={paymentType}
            onChange={(e) => setPaymentType(e.target.value)}
            options={[
              { value: 'all', label: 'الكل' },
              { value: 'cash', label: 'نقدي' },
              { value: 'credit', label: 'آجل' },
              { value: 'installments', label: 'أقساط' },
            ]}
            containerClassName="w-32"
          />
        </>
      );
    }

    if (activeTab === 'statement') {
      return (
        <Select
          label="المندوب"
          value={salesRepId}
          onChange={(e) => setSalesRepId(e.target.value)}
          options={salesReps.map((r) => ({ value: r._id, label: r.name }))}
          placeholder="— اختر مندوباً —"
          containerClassName="w-64"
        />
      );
    }

    return null;
  };

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            تقارير المبيعات
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {from} — {to}
          </p>
        </div>

        {/* زر التصدير */}
        {activeTab === 'statement' ? (
          salesRepId && (
            <ExportButtons
              reportName="statement"
              category="sales"
              params={{ from, to, salesRepId }}
              onError={(msg) => setError(msg)}
            />
          )
        ) : (
          <ExportButtons
            reportName={activeTab}
            category="sales"
            params={buildExportParams()}
            onError={(msg) => setError(msg)}
          />
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-neutral-100 p-1 rounded-lg">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                isActive
                  ? 'bg-primary-800 text-white shadow-sm'
                  : 'text-neutral-700 hover:bg-white'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* الفلاتر */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Input
              label="من"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Input
              label="إلى"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          {extraFilters()}
          <div className="flex gap-2 ms-auto">
            <Button variant="secondary" size="sm" onClick={handleReset}>
              إعادة تعيين
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={loadReport}
              disabled={loading}
              icon={RefreshCw}
            >
              {loading ? 'جارٍ...' : 'تحديث'}
            </Button>
          </div>
        </div>
      </div>

      {/* التقرير */}
      {renderReport()}
    </div>
  );
}