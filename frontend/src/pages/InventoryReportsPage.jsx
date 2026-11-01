/**
 * @file InventoryReportsPage.jsx
 * @description
 * صفحة تقارير المخزون — 3 تقارير.
 *
 *   1. الأرصدة (balances)
 *   2. قاربة الانتهاء (near-expiry)
 *   3. تحت الحد الأدنى (below-reorder)
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Boxes,
  Clock,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

import KpiCards from '../components/Reports/KpiCards';
import ExportButtons from '../components/Reports/ExportButtons';
import Table from '../components/UI/Table';
import Input from '../components/UI/Input';
import Button from '../components/UI/Button';
import Loading from '../components/UI/Loading';

import * as api from '../api/inventoryReportsAPI';

const fmt = (n) =>
  typeof n === 'number'
    ? new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n)
    : n ?? '—';

const TABS = [
  { key: 'balances', label: 'الأرصدة', icon: Boxes, hasDays: false },
  { key: 'near-expiry', label: 'قاربة الانتهاء', icon: Clock, hasDays: true },
  { key: 'below-reorder', label: 'تحت الحد الأدنى', icon: AlertTriangle, hasDays: false },
];

export default function InventoryReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'balances';

  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const tabDef = TABS.find((t) => t.key === activeTab) || TABS[0];

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      let result;
      switch (activeTab) {
        case 'balances':
          result = await api.getBalances();
          break;
        case 'near-expiry':
          result = await api.getNearExpiry({ days });
          break;
        case 'below-reorder':
          result = await api.getBelowReorder();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps  }, [activeTab]);

  const setTab = (key) => {
    setSearchParams({ tab: key });
    setData(null);
    setError(null);
  };

  const handleReset = () => {
    setDays(90);
    setData(null);
    setError(null);
  };

  const buildExportParams = () => {
    if (activeTab === 'near-expiry') return { days };
    return {};
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

    /* ───── 1. الأرصدة ───── */
    if (activeTab === 'balances') {
      const kpis = [
        { label: 'عدد الأصناف', value: data.totals.itemsCount, color: 'neutral' },
        { label: 'إجمالي الكمية', value: fmt(data.totals.totalQuantity), color: 'blue' },
        {
          label: 'قيمة التكلفة',
          value: `${fmt(data.totals.totalCostValue)} SDG`,
          color: 'orange',
        },
        {
          label: 'قيمة البيع',
          value: `${fmt(data.totals.totalSaleValue)} SDG`,
          color: 'green',
        },
      ];

      const columns = [
        { key: 'tradeName', label: 'الصنف', align: 'start' },
        { key: 'scientificName', label: 'الاسم العلمي', align: 'start' },
        { key: 'warehouseName', label: 'المخزن', align: 'start' },
        {
          key: 'quantity',
          label: 'الكمية',
          align: 'end',
          render: (r) => (
            <span
              className={
                r.belowReorder ? 'text-red-700 font-semibold' : 'text-neutral-900'
              }
            >
              {fmt(r.quantity)}
            </span>
          ),
        },
        { key: 'batchesCount', label: 'الدفعات', align: 'center' },
        { key: 'reorderLevel', label: 'الحد الأدنى', align: 'end' },
        {
          key: 'costValue',
          label: 'قيمة التكلفة',
          align: 'end',
          render: (r) => fmt(r.costValue),
        },
        {
          key: 'saleValue',
          label: 'قيمة البيع',
          align: 'end',
          render: (r) => fmt(r.saleValue),
        },
      ];

      return (
        <div className="space-y-4">
          <KpiCards items={kpis} />
          <Table
            columns={columns}
            data={data.lines}
            emptyMessage="لا توجد أصناف في المخزون"
            getRowClassName={(row) => (row.belowReorder ? 'bg-red-50/50' : '')}
          />
        </div>
      );
    }

    /* ───── 2. قاربة الانتهاء ───── */
    if (activeTab === 'near-expiry') {
      const kpis = [
        { label: 'عدد الدفعات', value: data.totals.batchesCount, color: 'orange' },
        {
          label: 'إجمالي الكمية',
          value: fmt(data.totals.totalQuantity),
          color: 'blue',
        },
        {
          label: 'قيمة التكلفة',
          value: `${fmt(data.totals.totalCostValue)} SDG`,
          color: 'red',
        },
      ];

      const columns = [
        { key: 'tradeName', label: 'الصنف', align: 'start' },
        { key: 'batch', label: 'الدفعة', align: 'center' },
        { key: 'warehouseName', label: 'المخزن', align: 'start' },
        { key: 'expiryLabel', label: 'الانتهاء', align: 'center' },
        {
          key: 'daysUntilExpiry',
          label: 'المتبقي (يوم)',
          align: 'center',
          render: (r) => (
            <span
              className={
                r.daysUntilExpiry <= 30
                  ? 'text-red-700 font-semibold'
                  : r.daysUntilExpiry <= 60
                    ? 'text-orange-700'
                    : 'text-neutral-700'
              }
            >
              {r.daysUntilExpiry}
            </span>
          ),
        },
        {
          key: 'quantity',
          label: 'الكمية',
          align: 'end',
          render: (r) => fmt(r.quantity),
        },
        {
          key: 'costValue',
          label: 'قيمة التكلفة',
          align: 'end',
          render: (r) => fmt(r.costValue),
        },
      ];

      return (
        <div className="space-y-4">
          <KpiCards items={kpis} />
          <Table
            columns={columns}
            data={data.lines}
            emptyMessage="لا توجد دفعات قاربة على الانتهاء"
          />
        </div>
      );
    }

    /* ───── 3. تحت الحد الأدنى ───── */
    if (activeTab === 'below-reorder') {
      const kpis = [
        { label: 'عدد الأصناف', value: data.totals.itemsCount, color: 'red' },
        {
          label: 'إجمالي النقص',
          value: fmt(data.totals.totalDeficit),
          color: 'orange',
        },
      ];

      const columns = [
        { key: 'tradeName', label: 'الصنف', align: 'start' },
        { key: 'scientificName', label: 'الاسم العلمي', align: 'start' },
        { key: 'barcode', label: 'الباركود', align: 'center' },
        {
          key: 'quantity',
          label: 'الرصيد',
          align: 'end',
          render: (r) => (
            <span className="text-red-700 font-semibold">{fmt(r.quantity)}</span>
          ),
        },
        { key: 'reorderLevel', label: 'الحد الأدنى', align: 'end' },
        {
          key: 'deficit',
          label: 'النقص',
          align: 'end',
          render: (r) => (
            <span className="inline-block px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 text-xs font-semibold">
              -{fmt(r.deficit)}
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
            emptyMessage="كل الأصناف فوق الحد الأدنى ✓"
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
          <h1 className="text-2xl font-bold text-neutral-900">تقارير المخزون</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {tabDef.hasDays ? `الدفعات المنتهية خلال ${days} يوم` : 'أرصدة حالية'}
          </p>
        </div>
        <ExportButtons
          reportName={activeTab}
          category="inventory"
          params={buildExportParams()}
          onError={(msg) => setError(msg)}
        />
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
          {tabDef.hasDays && (
            <div className="w-40">
              <Input
                label="عدد الأيام"
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </div>
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