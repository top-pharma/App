/**
 * @file PurchaseReceiptsPage.jsx
 * @description
 * صفحة إدارة إيصالات استلام المشتريات من الموردين.
 *
 * لماذا هذا الملف؟
 * - إدارة دخول البضاعة للمخزون من الشركات المستوردة.
 * - "تأكيد الاستلام" يُدخل البضاعة لـ Stock + يُحدّث رصيد المورد.
 * - "إلغاء" مسموح فقط للمسودات (draft).
 * - يدعم البحث، الفلترة، والإنشاء عبر Modal.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Receipt,
  Search,
  X,
  Eye,
  AlertCircle,
  CheckCircle2,
  Clock,
  Ban,
  PackageCheck,
  XCircle,
} from 'lucide-react';

import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import * as purchaseReceiptsAPI from '../api/purchaseReceiptsAPI.js';

import Button from '../components/UI/Button.jsx';
import Input from '../components/UI/Input.jsx';
import Table from '../components/UI/Table.jsx';
import Pagination from '../components/UI/Pagination.jsx';
import Modal from '../components/UI/Modal.jsx';
import PurchaseReceiptForm from '../components/Sales/PurchaseReceiptForm.jsx';

import { formatCurrency, formatDate, formatNumber } from '../utils/formatters.js';
import {
  PAYMENT_TYPE_LABELS_AR,
} from '../utils/constants.js';

// ═══════════════════════════════════════════════
// 1. المكونات المساعدة
// ═══════════════════════════════════════════════

function StatusBadge({ status }) {
  const map = {
    draft: { label: 'مسودة', class: 'bg-neutral-200 text-neutral-700', icon: Clock },
    received: { label: 'تم الاستلام', class: 'bg-success-100 text-success-800', icon: CheckCircle2 },
    cancelled: { label: 'ملغى', class: 'bg-danger-100 text-danger-800', icon: Ban },
  };
  const config = map[status] || map.draft;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${config.class}`}>
      <Icon size={12} />
      {config.label}
    </span>
  );
}

function MiniStat({ label, value, color = 'primary' }) {
  const colors = {
    primary: 'text-primary-700',
    warning: 'text-warning-700',
    danger: 'text-danger-700',
    success: 'text-success-700',
  };
  return (
    <div className="bg-white rounded-lg border border-neutral-200 px-4 py-3">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className={`text-lg font-bold numeric ${colors[color]}`}>{formatNumber(value)}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════
// 2. المكون الرئيسي
// ═══════════════════════════════════════════════

function PurchaseReceiptsPage() {
  const { isAdmin, isStorekeeper } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  // ─── الحالة ───
  const [receipts, setReceipts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [stats, setStats] = useState({ total: 0, draft: 0, received: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ─── الفلاتر ───
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [currentLimit, setCurrentLimit] = useState(20);

  // ─── المودالات ───
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // ─── Debounce البحث ───
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ─── جلب البيانات ───
  const loadReceipts = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = {
      page: currentPage,
      limit: currentLimit,
      sortBy: 'receiptDate',
      sortOrder: 'desc',
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (statusFilter) params.status = statusFilter;
    if (paymentTypeFilter) params.paymentType = paymentTypeFilter;

    try {
      const result = await purchaseReceiptsAPI.listPurchaseReceipts(params);
      setReceipts(result.items || []);
      setPagination(result.pagination || { page: 1, limit: 20, total: 0 });
    } catch (err) {
      setError(err?.error?.message || err?.message || 'فشل تحميل المشتريات.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, currentLimit, debouncedSearch, statusFilter, paymentTypeFilter]);

  // ─── جلب الإحصاءات ───
  const loadStats = useCallback(async () => {
    try {
      const [totalRes, draftRes, receivedRes] = await Promise.all([
        purchaseReceiptsAPI.listPurchaseReceipts({ limit: 1 }),
        purchaseReceiptsAPI.listPurchaseReceipts({ status: 'draft', limit: 1 }),
        purchaseReceiptsAPI.listPurchaseReceipts({ status: 'received', limit: 1 }),
      ]);
      setStats({
        total: totalRes.pagination?.total || 0,
        draft: draftRes.pagination?.total || 0,
        received: receivedRes.pagination?.total || 0,
      });
    } catch {
      // لا نُعطّل الواجهة
    }
  }, []);

  useEffect(() => {
    loadReceipts();
    loadStats();
  }, [loadReceipts, loadStats]);

  // ─── مسح الفلاتر ───
  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setPaymentTypeFilter('');
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(search || statusFilter || paymentTypeFilter);

  // ─── إنشاء ناجح ───
  const handleCreateSuccess = () => {
    setIsFormOpen(false);
    toast.success('تم إنشاء إيصال الاستلام.');
    loadReceipts();
    loadStats();
  };

  // ─── تأكيد الاستلام ───
  const handleConfirmReceipt = async () => {
    if (!confirmTarget) return;

    setIsProcessing(true);
    try {
      await purchaseReceiptsAPI.confirmPurchaseReceipt(confirmTarget.id, {});
      toast.success('تم تأكيد الاستلام وإضافة البضاعة للمخزون.');
      setConfirmTarget(null);
      loadReceipts();
      loadStats();
    } catch (err) {
      toast.error(err?.error?.message || err?.message || 'فشل تأكيد الاستلام.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── إلغاء المسودة ───
  const handleCancelReceipt = async () => {
    if (!cancelReason.trim()) {
      toast.error('سبب الإلغاء مطلوب.');
      return;
    }

    setIsProcessing(true);
    try {
      await purchaseReceiptsAPI.cancelPurchaseReceipt(cancelTarget.id, {
        cancelReason: cancelReason.trim(),
      });
      toast.success('تم إلغاء الإيصال.');
      setCancelTarget(null);
      setCancelReason('');
      loadReceipts();
      loadStats();
    } catch (err) {
      toast.error(err?.error?.message || err?.message || 'فشل إلغاء الإيصال.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── أعمدة الجدول ───
  const columns = [
    {
      key: 'receiptNumber',
      label: 'رقم الإيصال',
      render: (row) => (
        <span className="font-mono text-sm text-primary-800 font-bold">{row.receiptNumber}</span>
      ),
    },
    {
      key: 'supplier',
      label: 'المورّد',
      render: (row) => (
        <div>
          <p className="font-medium text-neutral-900">{row.supplier?.name || '—'}</p>
          <p className="text-xs text-neutral-500">{row.supplier?.code || ''}</p>
        </div>
      ),
    },
    {
      key: 'supplierInvoiceNumber',
      label: 'فاتورة المورد',
      render: (row) => (
        <span className="font-mono text-xs">{row.supplierInvoiceNumber || '—'}</span>
      ),
    },
    {
      key: 'receiptDate',
      label: 'التاريخ',
      render: (row) => <span className="text-sm">{formatDate(row.receiptDate)}</span>,
    },
    {
      key: 'paymentType',
      label: 'نوع الدفع',
      render: (row) => (
        <span className="text-sm">{PAYMENT_TYPE_LABELS_AR[row.paymentType] || '—'}</span>
      ),
    },
    {
      key: 'total',
      label: 'الإجمالي',
      align: 'end',
      render: (row) => (
        <span className="font-medium numeric">{formatCurrency(row.total, false)}</span>
      ),
    },
    {
      key: 'remainingAmount',
      label: 'المتبقي',
      align: 'end',
      render: (row) => (
        <span className={`font-medium numeric ${row.remainingAmount > 0 ? 'text-danger-700' : 'text-success-700'}`}>
          {formatCurrency(row.remainingAmount, false)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'الحالة',
      align: 'center',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      label: 'إجراءات',
      align: 'center',
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          {row.status === 'draft' && (isAdmin || isStorekeeper) && (
            <>
              <Button
                variant="ghost"
                size="sm"
                icon={PackageCheck}
                onClick={() => setConfirmTarget(row)}
              >
                تأكيد
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={XCircle}
                onClick={() => {
                  setCancelTarget(row);
                  setCancelReason('');
                }}
              >
                إلغاء
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* ═══ الترويسة ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Receipt size={24} className="text-primary-700" />
            إيصالات استلام المشتريات
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            استلام البضاعة من الموردين وإدخالها للمخزون
          </p>
        </div>
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setIsFormOpen(true)}
        >
          إيصال استلام جديد
        </Button>
      </div>

      {/* ═══ الإحصاءات السريعة ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="الإجمالي" value={stats.total} color="primary" />
        <MiniStat label="مسودات" value={stats.draft} color="warning" />
        <MiniStat label="مستلمة" value={stats.received} color="success" />
        <MiniStat label="المعروض" value={pagination.total} color="primary" />
      </div>

      {/* ═══ البحث والفلاتر ═══ */}
      <div className="bg-white rounded-lg border border-neutral-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Input
              placeholder="ابحث برقم الإيصال أو فاتورة المورد..."
              icon={Search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">كل الحالات</option>
            <option value="draft">مسودة</option>
            <option value="received">تم الاستلام</option>
            <option value="cancelled">ملغى</option>
          </select>

          <select
            value={paymentTypeFilter}
            onChange={(e) => { setPaymentTypeFilter(e.target.value); setCurrentPage(1); }}
            className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">كل الأنواع</option>
            <option value="cash">نقدي</option>
            <option value="credit">آجل</option>
            <option value="partial">جزئي</option>
          </select>
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
          <Button variant="ghost" size="sm" onClick={loadReceipts}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {/* ═══ الجدول ═══ */}
      <Table
        columns={columns}
        data={receipts}
        loading={loading && receipts.length === 0}
        emptyMessage="لا توجد إيصالات استلام مطابقة للبحث"
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

      {/* ═══ مودال إنشاء الإيصال ═══ */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title="إيصال استلام مشتريات جديد"
        size="full"
        closeOnOverlay={false}
      >
        <PurchaseReceiptForm
          onSuccess={handleCreateSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </Modal>

      {/* ═══ مودال تأكيد الاستلام ═══ */}
      <Modal
        isOpen={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        title="تأكيد الاستلام"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmTarget(null)} disabled={isProcessing}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={handleConfirmReceipt} loading={isProcessing}>
              تأكيد
            </Button>
          </>
        }
      >
        {confirmTarget && (
          <div className="space-y-4">
            <div className="bg-neutral-50 rounded-md p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span>رقم الإيصال:</span>
                <span className="font-mono font-bold">{confirmTarget.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>المورّد:</span>
                <span className="font-medium">{confirmTarget.supplier?.name}</span>
              </div>
              <div className="flex justify-between">
                <span>الإجمالي:</span>
                <span className="font-bold numeric">{formatCurrency(confirmTarget.total)}</span>
              </div>
            </div>

            <div className="bg-success-50 border border-success-200 rounded p-3 text-sm text-success-800">
              <CheckCircle2 size={16} className="inline mr-1" />
              بعد التأكيد:
              <ul className="list-disc pr-5 mt-2 space-y-1">
                <li>ستُضاف البضاعة إلى المخزون.</li>
                {confirmTarget.remainingAmount > 0 && (
                  <li>سيُضاف المبلغ المتبقي إلى رصيد المورد.</li>
                )}
                {confirmTarget.paidAmount > 0 && (
                  <li>ستُسجَّل دفعة بمبلغ {formatCurrency(confirmTarget.paidAmount)}.</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══ مودال إلغاء المسودة ═══ */}
      <Modal
        isOpen={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="إلغاء إيصال الاستلام"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelTarget(null)} disabled={isProcessing}>
              رجوع
            </Button>
            <Button variant="danger" onClick={handleCancelReceipt} loading={isProcessing}>
              تأكيد الإلغاء
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-danger-50 border border-danger-200 rounded p-3 text-sm text-danger-800">
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
            <p>سيتم إلغاء المسودة نهائياً. لا يمكن التراجع.</p>
          </div>

          <div>
            <label className="block mb-1.5 text-sm font-medium text-neutral-700">سبب الإلغاء *</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-200"
              rows={3}
              placeholder="اذكر سبب إلغاء الإيصال..."
              required
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default PurchaseReceiptsPage;