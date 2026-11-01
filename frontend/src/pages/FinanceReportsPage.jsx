/**
 * @file FinanceReportsPage.jsx
 * @description
 * صفحة التقارير المالية — 6 تقارير في Tabs.
 *
 * التقارير:
 *   1. ميزان المراجعة (trial-balance)
 *   2. الحركات النقدية (cash-transactions)
 *   3. أرصدة الصناديق (fund-balances)
 *   4. الشيكات (checks)
 *   5. المصروفات (expenses)
 *   6. الإيرادات - المصروفات (income-summary)
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Scale,
  Banknote,
  Wallet,
  Receipt,
  DollarSign,
  TrendingUp,
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

import * as api from '../api/reportsAPI';

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
    ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
    : n ?? '—';

const TABS = [
  { key: 'trial-balance', label: 'ميزان المراجعة', icon: Scale, usesDate: true },
  { key: 'cash-transactions', label: 'الحركات النقدية', icon: Banknote, usesDate: true },
  { key: 'fund-balances', label: 'أرصدة الصناديق', icon: Wallet, usesDate: false },
  { key: 'checks', label: 'الشيكات', icon: Receipt, usesDate: true },
  { key: 'expenses', label: 'المصروفات', icon: DollarSign, usesDate: true },
  { key: 'income-summary', label: 'الإيرادات - المصروفات', icon: TrendingUp, usesDate: true },
];

/* ─────────────────────────────────────────────────────────────
 * Main
 * ───────────────────────────────────────────────────────────── */

export default function FinanceReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'trial-balance';
  const tabDef = TABS.find((t) => t.key === activeTab) || TABS[0];

  // فلاتر
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [direction, setDirection] = useState('all');
  const [method, setMethod] = useState('all');
  const [checkStatus, setCheckStatus] = useState('all');
  const [checkType, setCheckType] = useState('all');

  // حالة
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  /* ─── تحميل التقرير ─── */
  const loadReport = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      let result;
      switch (activeTab) {
        case 'trial-balance':
          result = await api.getTrialBalance({ from, to });
          break;
        case 'cash-transactions':
          result = await api.getCashTransactions({ from, to, direction, method });
          break;
        case 'fund-balances':
          result = await api.getFundBalances();
          break;
        case 'checks':
          result = await api.getChecks({
            from: from || undefined,
            to: to || undefined,
            status: checkStatus,
            type: checkType,
          });
          break;
        case 'expenses':
          result = await api.getExpenses({ from, to });
          break;
        case 'income-summary':
          result = await api.getIncomeSummary({ from, to });
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

  /* ─── تحميل تلقائي عند تغيير التبويب ─── */
  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  /* ─── تغيير التبويب ─── */
  const setTab = (key) => {
    setSearchParams({ tab: key });
    setData(null);
    setError(null);
  };

  /* ─── إعادة تعيين الفلاتر ─── */
  const handleReset = () => {
    setFrom(firstOfMonth());
    setTo(today());
    setDirection('all');
    setMethod('all');
    setCheckStatus('all');
    setCheckType('all');
    setData(null);
    setError(null);
  };

  /* ─── بناء params التصدير ─── */
  const buildExportParams = () => {
    if (activeTab === 'fund-balances') return {};
    if (activeTab === 'cash-transactions')
      return { from, to, direction, method };
    if (activeTab === 'checks')
      return { from: from || undefined, to: to || undefined, status: checkStatus, type: checkType };
    return { from, to };
  };

  /* ─── عرض التقرير ─── */
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
      /* ───── 1. ميزان المراجعة ───── */
      case 'trial-balance': {
        const kpis = [
          {
            label: 'مجموع مدين',
            value: `${fmt(data.totals.debit)} SDG`,
            color: 'blue',
          },
          {
            label: 'مجموع دائن',
            value: `${fmt(data.totals.credit)} SDG`,
            color: 'green',
          },
          {
            label: 'الفرق',
            value: `${fmt(data.totals.debit - data.totals.credit)} SDG`,
            color: data.totals.balanced ? 'green' : 'red',
            subValue: data.totals.balanced ? '✅ متوازن' : '⚠️ غير متوازن',
          },
          {
            label: 'عدد الحسابات',
            value: data.lines.length,
            color: 'neutral',
          },
        ];

        const columns = [
          { key: 'accountCode', label: 'الكود', align: 'start', width: '100px' },
          { key: 'accountName', label: 'اسم الحساب', align: 'start' },
          { key: 'accountTypeLabel', label: 'النوع', align: 'center' },
          {
            key: 'debit',
            label: 'مدين',
            align: 'end',
            render: (row) => fmt(row.debit),
          },
          {
            key: 'credit',
            label: 'دائن',
            align: 'end',
            render: (row) => fmt(row.credit),
          },
          {
            key: 'balance',
            label: 'الرصيد',
            align: 'end',
            render: (row) => (
              <span className={row.balance < 0 ? 'text-red-600' : 'text-green-700'}>
                {fmt(row.balance)}
              </span>
            ),
          },
        ];

        return (
          <div className="space-y-4">
            <KpiCards items={kpis} />
            {data.lines.length === 0 ? (
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-8 text-center text-neutral-500 text-sm">
                لا توجد قيود في هذه الفترة.
              </div>
            ) : (
              <Table
                columns={columns}
                data={data.lines}
                rowKey="accountCode"
                emptyMessage="لا توجد بيانات"
              />
            )}
          </div>
        );
      }

      /* ───── 2. الحركات النقدية ───── */
      case 'cash-transactions': {
        const kpis = [
          {
            label: 'إجمالي الدخول',
            value: `${fmt(data.totals.in)} SDG`,
            color: 'green',
          },
          {
            label: 'إجمالي الخروج',
            value: `${fmt(data.totals.out)} SDG`,
            color: 'red',
          },
          {
            label: 'الصافي',
            value: `${fmt(data.totals.net)} SDG`,
            color: data.totals.net >= 0 ? 'blue' : 'orange',
          },
          {
            label: 'عدد الحركات',
            value: data.count,
            color: 'neutral',
          },
        ];

        const columns = [
          { key: 'dateLabel', label: 'التاريخ', align: 'center' },
          { key: 'transactionNumber', label: 'رقم الحركة' },
          {
            key: 'method',
            label: 'الطريقة',
            align: 'center',
            render: (row) =>
              row.method === 'cash' ? 'صندوق' : row.method === 'bank' ? 'بنك' : 'شيك',
          },
          { key: 'accountName', label: 'الحساب' },
          {
            key: 'direction',
            label: 'الاتجاه',
            align: 'center',
            render: (row) =>
              row.direction === 'in' ? (
                <span className="text-green-700 font-medium">دخول</span>
              ) : (
                <span className="text-red-700 font-medium">خروج</span>
              ),
          },
          {
            key: 'amount',
            label: 'المبلغ',
            align: 'end',
            render: (row) => (
              <span
                className={
                  row.direction === 'in' ? 'text-green-700' : 'text-red-700'
                }
              >
                {fmt(row.amount)}
              </span>
            ),
          },
          { key: 'description', label: 'الوصف' },
        ];

        return (
          <div className="space-y-4">
            <KpiCards items={kpis} />
            <Table
              columns={columns}
              data={data.lines}
              emptyMessage="لا توجد حركات نقدية في هذه الفترة"
            />
          </div>
        );
      }

      /* ───── 3. أرصدة الصناديق ───── */
      case 'fund-balances': {
        const kpis = [
          {
            label: 'إجمالي النقد',
            value: `${fmt(data.totals.cash)} SDG`,
            color: 'blue',
          },
          {
            label: 'إجمالي البنك',
            value: `${fmt(data.totals.bank)} SDG`,
            color: 'purple',
          },
          {
            label: 'الإجمالي',
            value: `${fmt(data.totals.total)} SDG`,
            color: 'green',
          },
          {
            label: 'عدد الحسابات',
            value: data.lines.length,
            color: 'neutral',
          },
        ];

        const columns = [
          { key: 'typeLabel', label: 'النوع', align: 'center' },
          { key: 'name', label: 'الاسم' },
          { key: 'code', label: 'الكود' },
          {
            key: 'openingBalance',
            label: 'الافتتاحي',
            align: 'end',
            render: (row) => fmt(row.openingBalance),
          },
          {
            key: 'currentBalance',
            label: 'الرصيد الحالي',
            align: 'end',
            render: (row) => (
              <span className="font-semibold text-green-700">
                {fmt(row.currentBalance)}
              </span>
            ),
          },
          {
            key: 'isDefault',
            label: 'افتراضي',
            align: 'center',
            render: (row) => (row.isDefault ? '✅' : '—'),
          },
        ];

        return (
          <div className="space-y-4">
            <KpiCards items={kpis} />
            <Table
              columns={columns}
              data={data.lines}
              emptyMessage="لا توجد صناديق نشطة"
            />
          </div>
        );
      }

      /* ───── 4. الشيكات ───── */
      case 'checks': {
        const kpis = [
          {
            label: 'معلّق',
            value: `${data.totals.pendingCount} شيك`,
            subValue: `${fmt(data.totals.pending)} SDG`,
            color: 'orange',
          },
          {
            label: 'مصروف',
            value: `${data.totals.paidCount} شيك`,
            subValue: `${fmt(data.totals.paid)} SDG`,
            color: 'green',
          },
          {
            label: 'مرتد',
            value: `${data.totals.bouncedCount} شيك`,
            subValue: `${fmt(data.totals.bounced)} SDG`,
            color: 'red',
          },
          {
            label: 'متأخر',
            value: `${data.totals.overdueCount} شيك`,
            subValue: `${fmt(data.totals.overdue)} SDG`,
            color: data.totals.overdueCount > 0 ? 'red' : 'neutral',
          },
        ];

        const columns = [
          { key: 'checkNumber', label: 'الرقم' },
          { key: 'typeLabel', label: 'النوع', align: 'center' },
          { key: 'bankName', label: 'البنك' },
          {
            key: 'partyName',
            label: 'الطرف',
            render: (row) => row.customerName || row.supplierName || '—',
          },
          {
            key: 'amount',
            label: 'المبلغ',
            align: 'end',
            render: (row) => fmt(row.amount),
          },
          { key: 'dueDateLabel', label: 'الاستحقاق', align: 'center' },
          {
            key: 'status',
            label: 'الحالة',
            align: 'center',
            render: (row) => {
              const statusMap = {
                pending: { label: 'معلّق', class: 'bg-orange-100 text-orange-700' },
                paid: { label: 'مصروف', class: 'bg-green-100 text-green-700' },
                bounced: { label: 'مرتد', class: 'bg-red-100 text-red-700' },
                cancelled: { label: 'ملغى', class: 'bg-neutral-100 text-neutral-600' },
              };
              const s = statusMap[row.status] || statusMap.cancelled;
              return (
                <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${s.class}`}>
                  {s.label}
                </span>
              );
            },
          },
          {
            key: 'isOverdue',
            label: 'ملاحظة',
            align: 'center',
            render: (row) =>
              row.isOverdue ? (
                <span className="text-red-600 text-[11px] font-medium">
                  ⚠️ متأخر {Math.abs(row.daysUntilDue)} يوم
                </span>
              ) : (
                '—'
              ),
          },
        ];

        return (
          <div className="space-y-4">
            <KpiCards items={kpis} />
            <Table
              columns={columns}
              data={data.lines}
              emptyMessage="لا توجد شيكات مطابقة للفلاتر"
            />
          </div>
        );
      }

      /* ───── 5. المصروفات ───── */
      case 'expenses': {
        const kpis = [
          {
            label: 'إجمالي المصروفات',
            value: `${fmt(data.total)} SDG`,
            color: 'red',
          },
          { label: 'عدد الحركات', value: data.count, color: 'neutral' },
        ];

        const columns = [
          { key: 'dateLabel', label: 'التاريخ', align: 'center' },
          { key: 'entryNumber', label: 'المرجع' },
          { key: 'typeLabel', label: 'النوع', align: 'center' },
          { key: 'description', label: 'الوصف' },
          {
            key: 'amount',
            label: 'المبلغ',
            align: 'end',
            render: (row) => fmt(row.amount),
          },
        ];

        return (
          <div className="space-y-4">
            <KpiCards items={kpis} />
            <Table
              columns={columns}
              data={data.lines}
              emptyMessage="لا توجد مصروفات في هذه الفترة"
            />
          </div>
        );
      }

      /* ───── 6. الإيرادات - المصروفات ───── */
      case 'income-summary': {
        const kpis = [
          {
            label: 'إجمالي الإيرادات',
            value: `${fmt(data.totals.revenue)} SDG`,
            color: 'green',
          },
          {
            label: 'إجمالي المصروفات',
            value: `${fmt(data.totals.expenses)} SDG`,
            color: 'red',
          },
          {
            label: 'الصافي',
            value: `${fmt(data.totals.net)} SDG`,
            color: data.totals.net >= 0 ? 'blue' : 'orange',
            subValue: data.totals.net >= 0 ? '✅ ربح' : '⚠️ خسارة',
          },
        ];

        const allLines = [
          ...data.revenueLines.map((l) => ({ ...l, kind: 'إيراد' })),
          ...data.expenseLines.map((l) => ({ ...l, kind: 'مصروف' })),
        ];

        const columns = [
          {
            key: 'kind',
            label: 'النوع',
            align: 'center',
            render: (row) => (
              <span
                className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  row.kind === 'إيراد'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {row.kind}
              </span>
            ),
          },
          { key: 'entryTypeLabel', label: 'التصنيف' },
          { key: 'accountName', label: 'الحساب' },
          {
            key: 'amount',
            label: 'المبلغ',
            align: 'end',
            render: (row) => fmt(row.amount),
          },
        ];

        return (
          <div className="space-y-4">
            <KpiCards items={kpis} />
            <Table
              columns={columns}
              data={allLines}
              emptyMessage="لا توجد إيرادات أو مصروفات في هذه الفترة"
            />
          </div>
        );
      }

      default:
        return null;
    }
  };

  /* ─── الفلاتر الإضافية حسب التبويب ─── */
  const extraFilters = () => {
    if (activeTab === 'cash-transactions') {
      return (
        <>
          <Select
            label="الاتجاه"
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            options={[
              { value: 'all', label: 'الكل' },
              { value: 'in', label: 'دخول' },
              { value: 'out', label: 'خروج' },
            ]}
            containerClassName="w-32"
          />
          <Select
            label="الطريقة"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            options={[
              { value: 'all', label: 'الكل' },
              { value: 'cash', label: 'صندوق' },
              { value: 'bank', label: 'بنك' },
              { value: 'check', label: 'شيك' },
            ]}
            containerClassName="w-32"
          />
        </>
      );
    }

    if (activeTab === 'checks') {
      return (
        <>
          <Select
            label="الحالة"
            value={checkStatus}
            onChange={(e) => setCheckStatus(e.target.value)}
            options={[
              { value: 'all', label: 'الكل' },
              { value: 'pending', label: 'معلّق' },
              { value: 'paid', label: 'مصروف' },
              { value: 'bounced', label: 'مرتد' },
              { value: 'cancelled', label: 'ملغى' },
            ]}
            containerClassName="w-32"
          />
          <Select
            label="النوع"
            value={checkType}
            onChange={(e) => setCheckType(e.target.value)}
            options={[
              { value: 'all', label: 'الكل' },
              { value: 'incoming', label: 'وارد' },
              { value: 'outgoing', label: 'صادر' },
            ]}
            containerClassName="w-32"
          />
        </>
      );
    }

    return null;
  };

  /* ─── Render ─── */
  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">التقارير المالية</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {tabDef.usesDate ? `${from} — ${to}` : 'أرصدة حالية'}
          </p>
        </div>
        <ExportButtons
          reportName={activeTab}
          params={buildExportParams()}
          onError={(msg) => setError(msg)}
        />
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
          {tabDef.usesDate && (
            <>
              <Input
                label="من"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                containerClassName="w-40"
              />
              <Input
                label="إلى"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                containerClassName="w-40"
              />
            </>
          )}
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