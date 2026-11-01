/**
 * @file InvoicesPage.jsx
 * @description صفحة الفواتير — Phase 2.5 (دعم المسودات).
 *
 * إضافة:
 *  - فلتر "مسودة" في القائمة.
 *  - زر "متابعة" للمسودات (يفتح Detail).
 *  - زر "اعتماد" سريع على صفوف المسودات (ينقل للـ Detail مع auto-finalize).
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, FileText, Search, X, Eye, AlertCircle, Clock, CheckCircle2, Ban,
  FileEdit, Send,
} from 'lucide-react';

import { useAuth } from '../hooks/useAuth.js';
import { useInvoices } from '../hooks/useInvoices.js';
import { useToast } from '../hooks/useToast.js';

import Button from '../components/UI/Button.jsx';
import Input from '../components/UI/Input.jsx';
import Table from '../components/UI/Table.jsx';
import Pagination from '../components/UI/Pagination.jsx';
import Modal from '../components/UI/Modal.jsx';
import InvoiceForm from '../components/Sales/InvoiceForm.jsx';

import { INVOICE_STATUS_LABELS_AR, PAYMENT_TYPE_LABELS_AR } from '../utils/constants.js';
import { formatCurrency, formatDate, formatNumber } from '../utils/formatters.js';

function StatusBadge({ status }) {
  const map = {
    draft: { label: 'مسودة', class: 'bg-neutral-200 text-neutral-700', icon: FileEdit },
    pending: { label: 'معلقة', class: 'bg-warning-100 text-warning-800', icon: Clock },
    paid: { label: 'مدفوعة', class: 'bg-success-100 text-success-800', icon: CheckCircle2 },
    partial: { label: 'مدفوعة جزئياً', class: 'bg-info-100 text-info-800', icon: Clock },
    overdue: { label: 'متأخرة', class: 'bg-danger-100 text-danger-800', icon: AlertCircle },
    cancelled: { label: 'ملغاة', class: 'bg-neutral-200 text-neutral-700', icon: Ban },
  };
  const c = map[status] || map.pending;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${c.class}`}>
      <Icon size={12} />{c.label}
    </span>
  );
}

function MiniStat({ label, value, color = 'primary' }) {
  const colors = {
    primary: 'text-primary-700', warning: 'text-warning-700',
    danger: 'text-danger-700', success: 'text-success-700',
    neutral: 'text-neutral-700',
  };
  return (
    <div className="bg-white rounded-lg border border-neutral-200 px-4 py-3">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className={`text-lg font-bold numeric ${colors[color]}`}>{formatNumber(value)}</p>
    </div>
  );
}

function InvoicesPage() {
  const { isAdmin, isAccountant, isSalesRep } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { invoices, pagination, loading, error, stats, fetchInvoices, resetError } = useInvoices();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [currentLimit, setCurrentLimit] = useState(20);
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setCurrentPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadInvoices = useCallback(() => {
    const params = {
      page: currentPage, limit: currentLimit,
      sortBy: 'invoiceDate', sortOrder: 'desc',
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (statusFilter) params.status = statusFilter;
    if (paymentTypeFilter) params.paymentType = paymentTypeFilter;
    fetchInvoices(params);
  }, [currentPage, currentLimit, debouncedSearch, statusFilter, paymentTypeFilter, fetchInvoices]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const handleClearFilters = () => {
    setSearch(''); setStatusFilter(''); setPaymentTypeFilter(''); setCurrentPage(1);
  };
  const hasActiveFilters = Boolean(search || statusFilter || paymentTypeFilter);

  const handleCreateSuccess = () => {
  setIsFormOpen(false);
  // ✅ Toast مُدار من InvoiceForm (نعرف نوع العملية هناك)
  loadInvoices();
};

  const columns = [
    {
      key: 'invoiceNumber', label: 'رقم الفاتورة',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-primary-800 font-bold">{row.invoiceNumber}</span>
        </div>
      ),
    },
    {
      key: 'pharmacy', label: 'الصيدلية',
      render: (row) => (
        <div>
          <p className="font-medium text-neutral-900">{row.pharmacy?.name || '—'}</p>
          <p className="text-xs text-neutral-500">{row.pharmacy?.phone || ''}</p>
        </div>
      ),
    },
    {
      key: 'invoiceDate', label: 'التاريخ',
      render: (row) => <span className="text-sm">{formatDate(row.invoiceDate)}</span>,
    },
    {
      key: 'dueDate', label: 'الاستحقاق',
      render: (row) => (
        <span className="text-sm">{row.dueDate ? formatDate(row.dueDate) : '—'}</span>
      ),
    },
    {
      key: 'total', label: 'الإجمالي', align: 'end',
      render: (row) => (
        <span className="font-medium numeric">{formatCurrency(row.total, false)}</span>
      ),
    },
    {
      key: 'remainingAmount', label: 'المتبقي', align: 'end',
      render: (row) => (
        <span className={`font-medium numeric ${row.remainingAmount > 0 ? 'text-danger-700' : 'text-success-700'}`}>
          {formatCurrency(row.remainingAmount, false)}
        </span>
      ),
    },
    {
      key: 'status', label: 'الحالة', align: 'center',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions', label: 'إجراءات', align: 'center',
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          {row.status === 'draft' && (
            <>
              <Link to={`/sales/invoices/${row.id}`}>
                <Button variant="ghost" size="sm" icon={FileEdit}>متابعة</Button>
              </Link>
              <Link to={`/sales/invoices/${row.id}?finalize=1`}>
                <Button variant="ghost" size="sm" icon={Send}>اعتماد</Button>
              </Link>
            </>
          )}
          {row.status !== 'draft' && (
            <Link to={`/sales/invoices/${row.id}`}>
              <Button variant="ghost" size="sm" icon={Eye}>عرض</Button>
            </Link>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <FileText size={24} className="text-primary-700" />الفواتير
          </h1>
          <p className="text-sm text-neutral-600 mt-1">إدارة فواتير المبيعات والمسودات</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setIsFormOpen(true)}>
          إنشاء فاتورة
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniStat label="الإجمالي" value={stats?.total || 0} color="primary" />
        <MiniStat label="مسودات" value={stats?.drafts || 0} color="neutral" />
        <MiniStat label="غير مدفوعة" value={stats?.unpaid || 0} color="warning" />
        <MiniStat label="متأخرة" value={stats?.overdue || 0} color="danger" />
        <MiniStat label="المعروض" value={pagination.total || 0} color="success" />
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Input placeholder="ابحث برقم الفاتورة أو اسم الصيدلية..." icon={Search}
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm">
            <option value="">كل الحالات</option>
            {Object.entries(INVOICE_STATUS_LABELS_AR).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
          <select value={paymentTypeFilter}
            onChange={(e) => { setPaymentTypeFilter(e.target.value); setCurrentPage(1); }}
            className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm">
            <option value="">كل الأنواع</option>
            {Object.entries(PAYMENT_TYPE_LABELS_AR).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
        {hasActiveFilters && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-neutral-600">{pagination.total} نتيجة</span>
            <button type="button" onClick={handleClearFilters}
              className="flex items-center gap-1 text-primary-700 hover:text-primary-900 font-medium">
              <X size={14} />مسح الفلاتر
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-danger-50 border border-danger-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-danger-800">
            <AlertCircle size={18} /><span className="text-sm">{error}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { resetError(); loadInvoices(); }}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      <Table columns={columns} data={invoices}
        loading={loading && invoices.length === 0}
        emptyMessage="لا توجد فواتير مطابقة للبحث" rowKey="id" />

      {pagination.total > 0 && (
        <Pagination page={currentPage} limit={currentLimit} total={pagination.total}
          onPageChange={setCurrentPage}
          onLimitChange={(l) => { setCurrentLimit(l); setCurrentPage(1); }} />
      )}

      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)}
        title="إنشاء فاتورة جديدة" size="full" closeOnOverlay={false}>
        <InvoiceForm mode="create" onSuccess={handleCreateSuccess} onCancel={() => setIsFormOpen(false)} />
      </Modal>
    </div>
  );
}

export default InvoicesPage;