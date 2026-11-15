/**
 * @file AuditLogsPage.jsx
 * @description
 * صفحة عرض سجل التدقيق (AuditLog) — للمدير فقط.
 *
 * الميزات:
 * - جدول السجلات مع Pagination.
 * - فلاتر: action, resource, success, from, to, search.
 * - مودال تفاصيل السجل (before/after/changes).
 * - إحصائيات سريعة (summary).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  FileText,
  Search,
  X,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  RefreshCw,
} from 'lucide-react';

import { useToast } from '../hooks/useToast.js';
import * as auditLogsAPI from '../api/auditLogsAPI.js';

import Button from '../components/UI/Button.jsx';
import Input from '../components/UI/Input.jsx';
import Table from '../components/UI/Table.jsx';
import Pagination from '../components/UI/Pagination.jsx';
import Modal from '../components/UI/Modal.jsx';

import { formatDate } from '../utils/formatters.js';
import { AUDIT_ACTION_LABELS_AR } from '../utils/constants.js';

// ═══════════════════════════════════════════════
// 1. مكونات مساعدة
// ═══════════════════════════════════════════════

function ActionBadge({ action }) {
  const colors = {
    create: 'bg-success-100 text-success-800',
    update: 'bg-info-100 text-info-800',
    delete: 'bg-danger-100 text-danger-800',
    login_success: 'bg-primary-100 text-primary-800',
    login_failed: 'bg-warning-100 text-warning-800',
    logout: 'bg-neutral-100 text-neutral-600',
    password_change: 'bg-warning-100 text-warning-800',
    permission_denied: 'bg-danger-100 text-danger-800',
    export: 'bg-primary-100 text-primary-800',
    backup: 'bg-success-100 text-success-800',
  };
  const labels = AUDIT_ACTION_LABELS_AR || {};
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
        colors[action] || 'bg-neutral-100 text-neutral-600'
      }`}
    >
      {labels[action] || action}
    </span>
  );
}

function SuccessBadge({ success }) {
  return success ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-success-100 text-success-800 text-[11px] rounded-full">
      <CheckCircle2 size={12} /> نجح
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-danger-100 text-danger-800 text-[11px] rounded-full">
      <XCircle size={12} /> فشل
    </span>
  );
}

function MiniStat({ label, value, color = 'primary' }) {
  const colors = {
    primary: 'text-primary-700',
    success: 'text-success-700',
    danger: 'text-danger-700',
    warning: 'text-warning-700',
  };
  return (
    <div className="bg-white rounded-lg border border-neutral-200 px-4 py-3">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className={`text-lg font-bold numeric ${colors[color]}`}>{value}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════
// 2. المكون الرئيسي
// ═══════════════════════════════════════════════

function AuditLogsPage() {
  const { error: showError } = useToast();

  // ─── الحالة ───
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ─── الفلاتر ───
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [successFilter, setSuccessFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [currentLimit, setCurrentLimit] = useState(20);

  // ─── المودال ───
  const [selectedLog, setSelectedLog] = useState(null);

  // ─── Debounce البحث ───
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ─── جلب السجلات ───
  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = {
      page: currentPage,
      limit: currentLimit,
      sortBy: 'occurredAt',
      sortOrder: 'desc',
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (actionFilter) params.action = actionFilter;
    if (resourceFilter) params.resource = resourceFilter;
    if (successFilter !== 'all') params.success = successFilter;
    if (fromDate) params.from = fromDate;
    if (toDate) params.to = toDate;

    try {
      const result = await auditLogsAPI.listAuditLogs(params);
      setLogs(result.items || []);
      setPagination(result.pagination || { page: 1, limit: 20, total: 0 });
    } catch (err) {
      setError(err?.error?.message || err?.message || 'فشل تحميل السجلات.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, currentLimit, debouncedSearch, actionFilter, resourceFilter, successFilter, fromDate, toDate]);

  // ─── جلب الإحصائيات ───
  const loadSummary = useCallback(async () => {
    try {
      const params = {};
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;
      const data = await auditLogsAPI.getAuditSummary(params);
      setSummary(data);
    } catch {
      // لا نُعطّل الواجهة
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    loadLogs();
    loadSummary();
  }, [loadLogs, loadSummary]);

  // ─── مسح الفلاتر ───
  const handleClearFilters = () => {
    setSearch('');
    setActionFilter('');
    setResourceFilter('');
    setSuccessFilter('all');
    setFromDate('');
    setToDate('');
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(
    search || actionFilter || resourceFilter || successFilter !== 'all' || fromDate || toDate
  );

  // ─── أعمدة الجدول ───
  const columns = [
    {
      key: 'occurredAt',
      label: 'التاريخ',
      render: (row) => (
        <span className="text-xs text-neutral-600 whitespace-nowrap">
          {formatDate(row.occurredAt)}
        </span>
      ),
    },
    {
      key: 'action',
      label: 'الإجراء',
      align: 'center',
      render: (row) => <ActionBadge action={row.action} />,
    },
    {
      key: 'resource',
      label: 'المورد',
      render: (row) => (
        <span className="text-sm font-mono text-neutral-700">{row.resource || '—'}</span>
      ),
    },
    {
      key: 'description',
      label: 'الوصف',
      render: (row) => (
        <span className="text-sm text-neutral-800">{row.description || '—'}</span>
      ),
    },
    {
      key: 'actor',
      label: 'المستخدم',
      render: (row) => (
        <span className="text-sm text-neutral-700">
          {row.actorName || row.actor?.name || '—'}
        </span>
      ),
    },
    {
      key: 'success',
      label: 'الحالة',
      align: 'center',
      render: (row) => <SuccessBadge success={row.success} />,
    },
    {
      key: 'actions',
      label: '',
      align: 'center',
      render: (row) => (
        <button
          onClick={() => setSelectedLog(row)}
          className="p-1.5 text-primary-600 hover:bg-primary-50 rounded"
          title="تفاصيل"
        >
          <Eye size={16} />
        </button>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* ═══ الترويسة ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <FileText size={24} className="text-primary-700" />
            سجل التدقيق
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            كل العمليات الحساسة في النظام — إنشاء، تعديل، حذف، تسجيل دخول
          </p>
        </div>
        <Button variant="secondary" onClick={() => { loadLogs(); loadSummary(); }} disabled={loading}>
          <RefreshCw size={16} className="inline ml-1" />
          تحديث
        </Button>
      </div>

      {/* ═══ الإحصائيات ═══ */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat label="الإجمالي" value={summary.total} color="primary" />
          <MiniStat label="ناجحة" value={summary.success} color="success" />
          <MiniStat label="فاشلة" value={summary.failed} color="danger" />
          <MiniStat label="أنواع الإجراءات" value={summary.byAction?.length || 0} color="warning" />
        </div>
      )}

      {/* ═══ الفلاتر ═══ */}
      <div className="bg-white rounded-lg border border-neutral-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <Input
              placeholder="ابحث في الوصف أو المستخدم..."
              icon={Search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setCurrentPage(1); }}
            className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">كل الإجراءات</option>
            <option value="create">إنشاء</option>
            <option value="update">تعديل</option>
            <option value="delete">حذف</option>
            <option value="login_success">دخول ناجح</option>
            <option value="login_failed">دخول فاشل</option>
            <option value="logout">خروج</option>
            <option value="password_change">تغيير كلمة مرور</option>
            <option value="permission_denied">صلاحية مرفوضة</option>
            <option value="export">تصدير</option>
            <option value="backup">نسخ احتياطي</option>
          </select>

          <select
            value={resourceFilter}
            onChange={(e) => { setResourceFilter(e.target.value); setCurrentPage(1); }}
            className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">كل الموارد</option>
            <option value="BankAccount">الحساب البنكي</option>
            <option value="CashFund">الصندوق النقدي</option>
            <option value="Invoice">الفاتورة</option>
            <option value="PurchaseReceipt">إيصال الاستلام</option>
            <option value="Customer">العميل</option>
            <option value="Supplier">المورد</option>
            <option value="User">المستخدم</option>
            <option value="Item">الصنف</option>
            <option value="CashTransaction">الحركة النقدية</option>
          </select>

          <select
            value={successFilter}
            onChange={(e) => { setSuccessFilter(e.target.value); setCurrentPage(1); }}
            className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="all">الكل</option>
            <option value="true">ناجحة</option>
            <option value="false">فاشلة</option>
          </select>

          <div className="flex gap-2">
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }}
              placeholder="من"
            />
            <Input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }}
              placeholder="إلى"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-neutral-600">{pagination.total} نتيجة</span>
            <button
              type="button"
              onClick={handleClearFilters}
              className="flex items-center gap-1 text-primary-700 hover:text-primary-900 font-medium"
            >
              <X size={14} />
              مسح الفلاتر
            </button>
          </div>
        )}
      </div>

      {/* ═══ الخطأ ═══ */}
      {error && (
        <div className="bg-danger-50 border border-danger-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-danger-800">
            <AlertCircle size={18} />
            <span className="text-sm">{error}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={loadLogs}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {/* ═══ الجدول ═══ */}
      <Table
        columns={columns}
        data={logs}
        loading={loading && logs.length === 0}
        emptyMessage="لا توجد سجلات مطابقة"
        rowKey="id"
      />

      {/* ═══ الترقيم ═══ */}
      {pagination.total > 0 && (
        <Pagination
          page={currentPage}
          limit={currentLimit}
          total={pagination.total}
          onPageChange={setCurrentPage}
          onLimitChange={(limit) => {
            setCurrentLimit(limit);
            setCurrentPage(1);
          }}
        />
      )}

      {/* ═══ مودال التفاصيل ═══ */}
      <Modal
        isOpen={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title={`تفاصيل السجل — ${AUDIT_ACTION_LABELS_AR?.[selectedLog?.action] || selectedLog?.action || ''}`}
        size="lg"
      >
        {selectedLog && (
          <div className="space-y-4">
            {/* معلومات أساسية */}
            <div className="bg-neutral-50 rounded-lg p-3 text-sm grid grid-cols-2 gap-2">
              <div>
                <p className="text-neutral-500 text-xs">التاريخ</p>
                <p className="font-medium">{formatDate(selectedLog.occurredAt)}</p>
              </div>
              <div>
                <p className="text-neutral-500 text-xs">المستخدم</p>
                <p className="font-medium">
                  {selectedLog.actorName || selectedLog.actor?.name || '—'}
                </p>
              </div>
              <div>
                <p className="text-neutral-500 text-xs">الإجراء</p>
                <ActionBadge action={selectedLog.action} />
              </div>
              <div>
                <p className="text-neutral-500 text-xs">المورد</p>
                <p className="font-mono">{selectedLog.resource || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-neutral-500 text-xs">الوصف</p>
                <p className="font-medium">{selectedLog.description || '—'}</p>
              </div>
              {selectedLog.path && (
                <div className="col-span-2">
                  <p className="text-neutral-500 text-xs">المسار</p>
                  <p className="font-mono text-xs">
                    {selectedLog.method} {selectedLog.path}
                  </p>
                </div>
              )}
              {selectedLog.ip && (
                <div>
                  <p className="text-neutral-500 text-xs">IP</p>
                  <p className="font-mono text-xs">{selectedLog.ip}</p>
                </div>
              )}
            </div>

            {/* Before/After */}
            {selectedLog.before && (
              <div>
                <h4 className="text-sm font-bold text-neutral-900 mb-2">قبل التعديل</h4>
                <pre className="bg-danger-50 border border-danger-200 rounded-lg p-3 text-xs overflow-x-auto max-h-60">
                  {JSON.stringify(selectedLog.before, null, 2)}
                </pre>
              </div>
            )}
            {selectedLog.after && (
              <div>
                <h4 className="text-sm font-bold text-neutral-900 mb-2">بعد التعديل</h4>
                <pre className="bg-success-50 border border-success-200 rounded-lg p-3 text-xs overflow-x-auto max-h-60">
                  {JSON.stringify(selectedLog.after, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default AuditLogsPage;