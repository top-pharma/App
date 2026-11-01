/**
 * @file CustomerReturnsPage.jsx
 * @description
 * صفحة إدارة مرتجعات العملاء.
 * تعرض القائمة، البحث، الفلترة، الإنشاء، والموافقة/الرفض.
 *
 * لماذا هذا الملف؟
 * - إدارة استلام البضاعة المرتجعة من الصيدليات.
 * - الموافقة تُعيد المخزون وتُسوّي مالياً (نقدي أو خصم رصيد).
 * - الرفض يحتاج سبباً (لتسجيله في AuditLog).
 * - تعرض حالة فترة السماح (داخل/خارج 7 أيام) لتوعية المحاسب.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Undo2,
  Search,
  X,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';

import { useAuth } from '../hooks/useAuth.js';
import { useCustomerReturns } from '../hooks/useCustomerReturns.js';
import { useToast } from '../hooks/useToast.js';

import Button from '../components/UI/Button.jsx';
import Input from '../components/UI/Input.jsx';
import Table from '../components/UI/Table.jsx';
import Pagination from '../components/UI/Pagination.jsx';
import Modal from '../components/UI/Modal.jsx';
import CustomerReturnForm from '../components/Sales/CustomerReturnForm.jsx';

import { formatCurrency, formatDate, formatNumber } from '../utils/formatters.js';

// ═══════════════════════════════════════════════
// 1. المكونات المساعدة
// ═══════════════════════════════════════════════

function StatusBadge({ status }) {
  const map = {
    pending: { label: 'معلق', class: 'bg-warning-100 text-warning-800', icon: Clock },
    confirmed: { label: 'مقبول', class: 'bg-success-100 text-success-800', icon: CheckCircle2 },
    rejected: { label: 'مرفوض', class: 'bg-danger-100 text-danger-800', icon: XCircle },
  };
  const config = map[status] || map.pending;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${config.class}`}>
      <Icon size={12} />
      {config.label}
    </span>
  );
}

function GracePeriodBadge({ isWithin }) {
  return isWithin ? (
    <span className="inline-flex items-center gap-1 text-xs text-success-700 font-medium">
      <CheckCircle2 size={12} />
      داخل الفترة
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-danger-700 font-bold">
      <AlertCircle size={12} />
      خارج الفترة
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

function CustomerReturnsPage() {
  const { isAdmin, isAccountant } = useAuth();
  const toast = useToast();
  const {
    customerReturns,
    pagination,
    loading,
    error,
    stats,
    fetchCustomerReturns,
    approveCustomerReturn,
    rejectCustomerReturn,
    resetError,
  } = useCustomerReturns();

  // ─── حالة الفلاتر ───
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [settlementFilter, setSettlementFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [currentLimit, setCurrentLimit] = useState(20);

  // ─── حالة المودالات ───
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // ─── نموذج الموافقة ───
  const [settledAmount, setSettledAmount] = useState('');
  const [cashFundOrBank, setCashFundOrBank] = useState('cash');
  const [approveNotes, setApproveNotes] = useState('');

  // ─── نموذج الرفض ───
  const [rejectionReason, setRejectionReason] = useState('');

  // ─── Debounce البحث ───
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ─── جلب البيانات ───
  const loadCustomerReturns = useCallback(() => {
    const params = {
      page: currentPage,
      limit: currentLimit,
      sortBy: 'returnDate',
      sortOrder: 'desc',
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (statusFilter) params.status = statusFilter;
    if (settlementFilter) params.settlementType = settlementFilter;

    fetchCustomerReturns(params);
  }, [currentPage, currentLimit, debouncedSearch, statusFilter, settlementFilter, fetchCustomerReturns]);

  useEffect(() => {
    loadCustomerReturns();
  }, [loadCustomerReturns]);

  // ─── إعادة تعيين الفلاتر ───
  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setSettlementFilter('');
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(search || statusFilter || settlementFilter);

  // ─── إنشاء ناجح ───
  const handleCreateSuccess = () => {
    setIsFormOpen(false);
    toast.success('تم إنشاء المرتجع بنجاح.');
    loadCustomerReturns();
  };

  // ─── فتح مودال الموافقة ───
  const handleOpenApprove = (ret) => {
    setApproveTarget(ret);
    setSettledAmount(String(ret.total));
    setApproveNotes('');
    setCashFundOrBank('cash');
  };

  const handleConfirmApprove = async () => {
    const amount = Number(settledAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error('المبلغ المُسوَّى غير صحيح.');
      return;
    }

    setIsProcessing(true);
    const result = await approveCustomerReturn(approveTarget.id, {
      settledAmount: amount,
      cashFund: cashFundOrBank === 'cash' ? '000000000000000000000000' : undefined, // ← ستحتاج إلى اختيار صندوق حقيقي
      bankAccount: cashFundOrBank === 'bank' ? '000000000000000000000000' : undefined, // ← ستحتاج إلى اختيار حساب بنكي حقيقي
      notes: approveNotes,
    });
    setIsProcessing(false);

    if (result.success) {
      toast.success('تمت الموافقة على المرتجع.');
      setApproveTarget(null);
      loadCustomerReturns();
    } else {
      toast.error(result.error);
    }
  };

  // ─── فتح مودال الرفض ───
  const handleOpenReject = (ret) => {
    setRejectTarget(ret);
    setRejectionReason('');
  };

  const handleConfirmReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error('سبب الرفض مطلوب.');
      return;
    }

    setIsProcessing(true);
    const result = await rejectCustomerReturn(rejectTarget.id, {
      rejectionReason: rejectionReason.trim(),
    });
    setIsProcessing(false);

    if (result.success) {
      toast.success('تم رفض المرتجع.');
      setRejectTarget(null);
      loadCustomerReturns();
    } else {
      toast.error(result.error);
    }
  };

  // ─── أعمدة الجدول ───
  const columns = [
    {
      key: 'returnNumber',
      label: 'رقم المرتجع',
      render: (row) => (
        <span className="font-mono text-sm text-primary-800 font-bold">{row.returnNumber}</span>
      ),
    },
    {
      key: 'originalInvoice',
      label: 'الفاتورة الأصلية',
      render: (row) => (
        <span className="font-mono text-xs text-neutral-700">
          {row.originalInvoice?.invoiceNumber || '—'}
        </span>
      ),
    },
    {
      key: 'pharmacy',
      label: 'الصيدلية',
      render: (row) => (
        <span className="text-sm font-medium">{row.pharmacy?.name || '—'}</span>
      ),
    },
    {
      key: 'returnDate',
      label: 'التاريخ',
      render: (row) => <span className="text-sm">{formatDate(row.returnDate)}</span>,
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
      key: 'settlementType',
      label: 'طريقة التسوية',
      render: (row) => (
        <span className="text-xs">
          {row.settlementType === 'cash_refund' ? 'نقدي' : 'خصم رصيد'}
        </span>
      ),
    },
    {
      key: 'isWithinGracePeriod',
      label: 'فترة السماح',
      align: 'center',
      render: (row) => <GracePeriodBadge isWithin={row.isWithinGracePeriod} />,
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
          {row.status === 'pending' && (isAdmin || isAccountant) && (
            <>
              <Button
                variant="ghost"
                size="sm"
                icon={ThumbsUp}
                onClick={() => handleOpenApprove(row)}
              >
                موافقة
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={ThumbsDown}
                onClick={() => handleOpenReject(row)}
              >
                رفض
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
            <Undo2 size={24} className="text-primary-700" />
            مرتجعات العملاء
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            إدارة استلام البضاعة المرتجعة من الصيدليات
          </p>
        </div>
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setIsFormOpen(true)}
        >
          إنشاء مرتجع
        </Button>
      </div>

      {/* ═══ الإحصاءات السريعة ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="الإجمالي" value={stats?.total || 0} color="primary" />
        <MiniStat label="معلقة" value={stats?.pending || 0} color="warning" />
        <MiniStat label="مقبولة" value={stats?.confirmed || 0} color="success" />
        <MiniStat label="مرفوضة" value={stats?.rejected || 0} color="danger" />
      </div>

      {/* ═══ البحث والفلاتر ═══ */}
      <div className="bg-white rounded-lg border border-neutral-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Input
              placeholder="ابحث برقم المرتجع..."
              icon={Search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">كل الحالات</option>
            <option value="pending">معلق</option>
            <option value="confirmed">مقبول</option>
            <option value="rejected">مرفوض</option>
          </select>

          <select
            value={settlementFilter}
            onChange={(e) => {
              setSettlementFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">كل طرق التسوية</option>
            <option value="cash_refund">نقدي</option>
            <option value="balance_deduction">خصم رصيد</option>
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
          <Button variant="ghost" size="sm" onClick={() => { resetError(); loadCustomerReturns(); }}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {/* ═══ الجدول ═══ */}
      <Table
        columns={columns}
        data={customerReturns}
        loading={loading && customerReturns.length === 0}
        emptyMessage="لا توجد مرتجعات مطابقة للبحث"
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

      {/* ═══ مودال الإنشاء ═══ */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title="إنشاء مرتجع جديد"
        size="lg"
        closeOnOverlay={false}
      >
        <CustomerReturnForm
          onSuccess={handleCreateSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </Modal>

      {/* ═══ مودال الموافقة ═══ */}
      <Modal
        isOpen={Boolean(approveTarget)}
        onClose={() => setApproveTarget(null)}
        title="الموافقة على المرتجع"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setApproveTarget(null)} disabled={isProcessing}>إلغاء</Button>
            <Button variant="primary" onClick={handleConfirmApprove} loading={isProcessing}>تأكيد الموافقة</Button>
          </>
        }
      >
        {approveTarget && (
          <div className="space-y-4">
            <div className="bg-neutral-50 rounded p-3 text-sm">
              <div className="flex justify-between mb-1">
                <span>رقم المرتجع:</span>
                <span className="font-mono font-bold">{approveTarget.returnNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>الإجمالي:</span>
                <span className="font-bold numeric">{formatCurrency(approveTarget.total)}</span>
              </div>
            </div>

            {!approveTarget.isWithinGracePeriod && (
              <div className="bg-danger-50 border border-danger-200 rounded p-3 text-sm text-danger-800">
                <AlertCircle size={16} className="inline mr-1" />
                هذا المرتجع <strong>خارج فترة السماح</strong>. تأكد قبل الموافقة.
              </div>
            )}

            <Input
              label="المبلغ المُسوَّى"
              type="number"
              value={settledAmount}
              onChange={(e) => setSettledAmount(e.target.value)}
              min="0"
              max={approveTarget.total}
              step="0.01"
              required
            />

            {approveTarget.settlementType === 'cash_refund' && (
              <div>
                <label className="block mb-1.5 text-sm font-medium text-neutral-700">
                  طريقة الاسترداد
                </label>
                <select
                  value={cashFundOrBank}
                  onChange={(e) => setCashFundOrBank(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
                >
                  <option value="cash">نقدي (الصندوق الرئيسي)</option>
                  <option value="bank">تحويل بنكي</option>
                </select>
                <p className="text-xs text-neutral-500 mt-1">
                  ⚠️ سيُسجَّل كحركة نقدية (Phase 3) — يُختار الحساب من الإعدادات لاحقاً.
                </p>
              </div>
            )}

            <div>
              <label className="block mb-1.5 text-sm font-medium text-neutral-700">ملاحظات (اختياري)</label>
              <textarea
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-200"
                rows={2}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ═══ مودال الرفض ═══ */}
      <Modal
        isOpen={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="رفض المرتجع"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectTarget(null)} disabled={isProcessing}>إلغاء</Button>
            <Button variant="danger" onClick={handleConfirmReject} loading={isProcessing}>تأكيد الرفض</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-danger-50 border border-danger-200 rounded p-3 text-sm text-danger-800">
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
            <p>سيُرفض المرتجع نهائياً. البضاعة لن تُعاد للمخزون.</p>
          </div>

          <div>
            <label className="block mb-1.5 text-sm font-medium text-neutral-700">سبب الرفض *</label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-200"
              rows={3}
              placeholder="اذكر سبب رفض المرتجع..."
              required
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default CustomerReturnsPage;