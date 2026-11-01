/**
 * @file SupplierReportsPage.jsx
 * @description
 * صفحة تقارير الموردين — 2 تقارير.
 *
 *   1. أرصدة الموردين (balances)
 *   2. كشف حساب مورد (statement) — يتطلب اختيار مورد
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Wallet,
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

import * as api from '../api/supplierReportsAPI';
import { listSuppliers } from '../api/suppliersAPI';

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
  { key: 'balances', label: 'الأرصدة', icon: Wallet },
  { key: 'statement', label: 'كشف حساب', icon: BookUser },
];

export default function SupplierReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'balances';

  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await listSuppliers({ limit: 500 });
        setSuppliers(result?.items || result?.data?.items || []);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[suppliers]', err);
      }
    })();
  }, []);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      let result;
      if (activeTab === 'balances') {
        result = await api.getBalances();
      } else if (activeTab === 'statement') {
        if (!supplierId) {
          setError('اختر مورداً لعرض كشف الحساب.');
          setLoading(false);
          return;
        }
        result = await api.getStatement(supplierId, { from, to });
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
    setSupplierId('');
    setData(null);
    setError(null);
  };

  const buildExportParams = () => ({ from, to });

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

    if (activeTab === 'balances') {
      const kpis = [
        {
          label: 'عدد الموردين',
          value: data.totals.count,
          color: 'neutral',
        },
        {
          label: 'إجمالي الموجب',
          value: `${fmt(data.totals.positive)} SDG`,
          color: 'orange',
        },
        {
          label: 'إجمالي السالب',
          value: `${fmt(data.totals.negative)} SDG`,
          color: 'green',
        },
        {
          label: 'الصافي',
          value: `${fmt(data.totals.net)} SDG`,
          color: data.totals.net > 0 ? 'red' : 'green',
        },
      ];

      const columns = [
        { key: 'name', label: 'المورد', align: 'start' },
        { key: 'code', label: 'الكود', align: 'start' },
        { key: 'phone', label: 'الهاتف', align: 'start' },
        {
          key: 'currentBalance',
          label: 'الرصيد',
          align: 'end',
          render: (r) => (
            <span
              className={
                r.currentBalance > 0
                  ? 'text-orange-700 font-semibold'
                  : r.currentBalance < 0
                    ? 'text-green-700 font-semibold'
                    : 'text-neutral-500'
              }
            >
              {fmt(r.currentBalance)}
            </span>
          ),
        },
        { key: 'paymentTerms', label: 'شروط الدفع (يوم)', align: 'center' },
      ];

      return (
        <div className="space-y-4">
          <KpiCards items={kpis} />
          <Table
            columns={columns}
            data={data.lines}
            emptyMessage="لا يوجد موردون نشطون"
          />
        </div>
      );
    }

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
                r.balance > 0 ? 'text-orange-700 font-semibold' : 'text-green-700'
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
              المورد: <strong className="text-neutral-900">{data.supplier?.name}</strong>
              {data.supplier?.code && (
                <span className="text-neutral-500"> — {data.supplier.code}</span>
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
          <h1 className="text-2xl font-bold text-neutral-900">تقارير الموردين</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {activeTab === 'balances' ? 'أرصدة حالية' : `${from} — ${to}`}
          </p>
        </div>
        {activeTab === 'balances' && (
          <ExportButtons
            reportName="balances"
            category="suppliers"
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
          {activeTab === 'statement' && (
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
                label="المورد"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                options={suppliers.map((s) => ({ value: s._id, label: s.name }))}
                placeholder="— اختر مورداً —"
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