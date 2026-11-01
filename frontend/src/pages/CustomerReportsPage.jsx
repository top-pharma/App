/**
 * @file CustomerReportsPage.jsx
 * @description
 * صفحة تقارير العملاء — 2 تقارير.
 *
 *   1. أعمار الديون (aging)
 *   2. كشف حساب عميل (statement) — يتطلب اختيار عميل
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Clock,
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

import * as api from '../api/customerReportsAPI';
import { listCustomers } from '../api/customersAPI';

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
  { key: 'aging', label: 'أعمار الديون', icon: Clock, usesCustomer: false },
  { key: 'statement', label: 'كشف حساب', icon: BookUser, usesCustomer: true },
];

export default function CustomerReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'aging';

  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  // تحميل العملاء لاختيارهم في "كشف حساب"
  useEffect(() => {
    (async () => {
      try {
        const result = await listCustomers({ limit: 500 });
        setCustomers(result?.items || result?.data?.items || []);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[customers]', err);
      }
    })();
  }, []);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      let result;
      if (activeTab === 'aging') {
        result = await api.getAging({ asOf: to });
      } else if (activeTab === 'statement') {
        if (!customerId) {
          setError('اختر عميلاً لعرض كشف الحساب.');
          setLoading(false);
          return;
        }
        result = await api.getStatement(customerId, { from, to });
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
    setCustomerId('');
    setData(null);
    setError(null);
  };

  {/* قبل: كانت تعرض ExportButtons فقط لـ aging */}
{/* بعد: تعرضها لكليهما معاً */}
{activeTab === 'aging' && (
  <ExportButtons
    reportName="aging"
    category="customers"
    params={buildExportParams()}
    onError={(msg) => setError(msg)}
  />
)}
{activeTab === 'statement' && customerId && (
  <ExportButtons
    reportName="statement"
    category="customers"
    params={buildExportParams()}
    onError={(msg) => setError(msg)}
  />
)}

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

    /* ───── 1. أعمار الديون ───── */
    if (activeTab === 'aging') {
      const kpis = [
        { label: 'حالي', value: `${fmt(data.buckets.current)} SDG`, color: 'green' },
        { label: '1-30 يوم', value: `${fmt(data.buckets.d30)} SDG`, color: 'blue' },
        { label: '31-60 يوم', value: `${fmt(data.buckets.d60)} SDG`, color: 'orange' },
        { label: '61-90 يوم', value: `${fmt(data.buckets.d90)} SDG`, color: 'orange' },
        {
          label: '+90 يوم',
          value: `${fmt(data.buckets.d90plus)} SDG`,
          color: 'red',
        },
      ];

      const columns = [
        { key: 'name', label: 'العميل', align: 'start' },
        { key: 'phone', label: 'الهاتف', align: 'start' },
        { key: 'invoicesCount', label: 'الفواتير', align: 'center' },
        {
          key: 'current',
          label: 'حالي',
          align: 'end',
          render: (r) => fmt(r.current),
        },
        {
          key: 'd30',
          label: '1-30',
          align: 'end',
          render: (r) => fmt(r.d30),
        },
        {
          key: 'd60',
          label: '31-60',
          align: 'end',
          render: (r) => fmt(r.d60),
        },
        {
          key: 'd90',
          label: '61-90',
          align: 'end',
          render: (r) => fmt(r.d90),
        },
        {
          key: 'd90plus',
          label: '+90',
          align: 'end',
          render: (r) => (
            <span className={r.d90plus > 0 ? 'text-red-700 font-semibold' : ''}>
              {fmt(r.d90plus)}
            </span>
          ),
        },
        {
          key: 'total',
          label: 'الإجمالي',
          align: 'end',
          render: (r) => (
            <span className="font-semibold text-neutral-900">{fmt(r.total)}</span>
          ),
        },
      ];

      return (
        <div className="space-y-4">
          <KpiCards items={kpis} />
          <Table
            columns={columns}
            data={data.lines}
            emptyMessage="لا توجد ديون مستحقة"
          />
        </div>
      );
    }

    /* ───── 2. كشف حساب ───── */
    if (activeTab === 'statement') {
      const kpis = [
        {
          label: 'الرصيد الافتتاحي',
          value: `${fmt(data.openingBalance)} SDG`,
          color: 'neutral',
        },
        {
          label: 'إجمالي المدين',
          value: `${fmt(data.totals.debit)} SDG`,
          color: 'blue',
        },
        {
          label: 'إجمالي الدائن',
          value: `${fmt(data.totals.credit)} SDG`,
          color: 'green',
        },
        {
          label: 'الرصيد الختامي',
          value: `${fmt(data.closingBalance)} SDG`,
          color: data.closingBalance > 0 ? 'orange' : 'green',
        },
      ];

      const columns = [
        { key: 'dateLabel', label: 'التاريخ', align: 'center' },
        { key: 'typeLabel', label: 'النوع', align: 'center' },
        { key: 'ref', label: 'المرجع', align: 'start' },
        {
          key: 'debit',
          label: 'مدين',
          align: 'end',
          render: (r) => fmt(r.debit),
        },
        {
          key: 'credit',
          label: 'دائن',
          align: 'end',
          render: (r) => fmt(r.credit),
        },
        {
          key: 'balance',
          label: 'الرصيد',
          align: 'end',
          render: (r) => (
            <span
              className={
                r.balance < 0 ? 'text-red-700 font-semibold' : 'text-green-700'
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
              العميل: <strong className="text-neutral-900">{data.customer?.name}</strong>
              {data.customer?.phone && (
                <span className="text-neutral-500"> — {data.customer.phone}</span>
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

    return null;
  };

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">تقارير العملاء</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {activeTab === 'aging' ? `كما في ${to}` : `${from} — ${to}`}
          </p>
        </div>
        {activeTab === 'aging' && (
          <ExportButtons
            reportName="aging"
            category="customers"
            params={buildExportParams()}
            onError={(msg) => setError(msg)}
          />
        )}
      </div>

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

      <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          {activeTab === 'aging' ? (
            <div className="w-40">
              <Input
                label="كما في"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          ) : (
            <>
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
              <Select
                label="العميل"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                options={customers.map((c) => ({ value: c._id, label: c.name }))}
                placeholder="— اختر عميلاً —"
                containerClassName="w-64"
              />
            </>
          )}

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

      {renderReport()}
    </div>
  );
}