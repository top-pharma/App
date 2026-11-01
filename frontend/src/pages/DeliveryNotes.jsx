/**
 * @file DeliveryNotesPage.jsx
 * @description
 * صفحة إدارة إيصالات التسليم.
 * تعرض قائمة الإيصالات، البحث، الفلترة، وإنشاء إيصال جديد.
 * تتيح تعليم الإيصال كمُسلَّم (مع اسم المستلم).
 *
 * لماذا هذا الملف؟
 * - إدارة خروج البضاعة من المخزن للصيدليات.
 * - تتبع حالة التسليم (معلق، تم التسليم).
 * - تفتح `DeliveryNoteForm` في Modal للإنشاء.
 * - تفتح Modal صغير لتعليم التسليم.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Truck,
  Search,
  X,
  Eye,
  AlertCircle,
  Clock,
  CheckCircle2,
  RotateCcw,
  PackageCheck,
} from 'lucide-react';

import { useAuth } from '../hooks/useAuth.js';
import { useDeliveryNotes } from '../hooks/useDeliveryNotes.js';
import { useToast } from '../hooks/useToast.js';

import Button from '../components/UI/Button.jsx';
import Input from '../components/UI/Input.jsx';
import Table from '../components/UI/Table.jsx';
import Pagination from '../components/UI/Pagination.jsx';
import Modal from '../components/UI/Modal.jsx';
import DeliveryNoteForm from '../components/Sales/DeliveryNoteForm.jsx';

import {
  DELIVERY_STATUS_LABELS_AR,
  PAYMENT_TYPE_LABELS_AR,
} from '../utils/constants.js';
import { formatCurrency, formatDate, formatNumber } from '../utils/formatters.js';

// ═══════════════════════════════════════════════
// 1. المكونات المساعدة
// ═══════════════════════════════════════════════

/**
 * شارة حالة الإيصال.
 */
function StatusBadge({ status }) {
  const map = {
    pending: { label: 'معلق', class: 'bg-warning-100 text-warning-800', icon: Clock },
    in_transit: { label: 'قيد التوصيل', class: 'bg-info-100 text-info-800', icon: Truck },
    delivered: { label: 'تم التسليم', class: 'bg-success-100 text-success-800', icon: CheckCircle2 },
    returned: { label: 'مُرتجع', class: 'bg-danger-100 text-danger-800', icon: RotateCcw },
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

function DeliveryNotesPage() {
  const { isSalesRep, isAdmin, isAccountant } = useAuth();
  const toast = useToast();
  const {
    deliveryNotes,
    pagination,
    loading,
    error,
    stats,
    fetchDeliveryNotes,
    markDelivered,
    resetError,
  } = useDeliveryNotes();

  // ─── حالة الفلاتر ───
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentPlanFilter, setPaymentPlanFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [currentLimit, setCurrentLimit] = useState(20);

  // ─── حالة المودال ───
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState(null); // لتعليم التسليم
  const [isDeliverOpen, setIsDeliverOpen] = useState(false);
  const [receivedBy, setReceivedBy] = useState('');
  const [signature, setSignature] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // ─── Debounce البحث ───
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ─── جلب البيانات ───
  const loadDeliveryNotes = useCallback(() => {
    const params = {
      page: currentPage,
      limit: currentLimit,
      sortBy: 'deliveryDate',
      sortOrder: 'desc',
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (statusFilter) params.status = statusFilter;
    if (paymentPlanFilter) params.paymentPlan = paymentPlanFilter;

    fetchDeliveryNotes(params);
  }, [currentPage, currentLimit, debouncedSearch, statusFilter, paymentPlanFilter, fetchDeliveryNotes]);

  useEffect(() => {
    loadDeliveryNotes();
  }, [loadDeliveryNotes]);

  // ─── إعادة تعيين الفلاتر ───
  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setPaymentPlanFilter('');
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(search || statusFilter || paymentPlanFilter);

  // ─── إنشاء ناجح ───
  const handleCreateSuccess = () => {
    setIsFormOpen(false);
    toast.success('تم إنشاء إيصال التسليم بنجاح.');
    loadDeliveryNotes();
  };

  // ─── تعليم كمُسلَّم ───
  const handleOpenDeliver = (note) => {
    setSelectedNote(note);
    setReceivedBy('');
    setSignature('');
    setIsDeliverOpen(true);
  };

  const handleConfirmDeliver = async () => {
    if (!receivedBy.trim()) {
      toast.error('اسم المستلم مطلوب.');
      return;
    }

    setIsProcessing(true);
    const result = await markDelivered(selectedNote.id, {
      receivedBy: receivedBy.trim(),
      signature: signature.trim() || undefined,
      deliveredAt: new Date().toISOString(),
    });
    setIsProcessing(false);

    if (result.success) {
      toast.success('تم تعليم الإيصال كمُسلَّم.');
      setIsDeliverOpen(false);
      setSelectedNote(null);
      loadDeliveryNotes();
    } else {
      toast.error(result.error);
    }
  };

  // ─── أعمدة الجدول ───
  const columns = [
    {
      key: 'deliveryNumber',
      label: 'رقم الإيصال',
      render: (row) => (
        <span className="font-mono text-sm text-primary-800 font-bold">{row.deliveryNumber}</span>
      ),
    },
    {
      key: 'pharmacy',
      label: 'الصيدلية',
      render: (row) => (
        <div>
          <p className="font-medium text-neutral-900">{row.pharmacy?.name || '—'}</p>
          <p className="text-xs text-neutral-500">{row.pharmacy?.phone || ''}</p>
        </div>
      ),
    },
    {
      key: 'salesRep',
      label: 'المندوب',
      render: (row) => <span className="text-sm">{row.salesRep?.name || '—'}</span>,
    },
    {
      key: 'deliveryDate',
      label: 'التاريخ',
      render: (row) => <span className="text-sm">{formatDate(row.deliveryDate)}</span>,
    },
    {
      key: 'paymentPlan',
      label: 'خطة الدفع',
      render: (row) => (
        <span className="text-sm">{PAYMENT_TYPE_LABELS_AR[row.paymentPlan] || row.paymentPlan}</span>
      ),
    },
    {
      key: 'totalAmount',
      label: 'الإجمالي',
      align: 'end',
      render: (row) => (
        <span className="font-medium numeric">{formatCurrency(row.totalAmount, false)}</span>
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
          {(row.status === 'pending' || row.status === 'in_transit') && (
            <Button
              variant="ghost"
              size="sm"
              icon={PackageCheck}
              onClick={() => handleOpenDeliver(row)}
            >
              تسليم
            </Button>
          )}
          <Link to={`/sales/delivery-notes/${row.id}`}>
            <Button variant="ghost" size="sm" icon={Eye}>
              عرض
            </Button>
          </Link>
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
            <Truck size={24} className="text-primary-700" />
            إيصالات التسليم
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            توثيق خروج البضاعة من المخزن إلى الصيدليات
          </p>
        </div>
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setIsFormOpen(true)}
        >
          إنشاء إيصال
        </Button>
      </div>

      {/* ═══ الإحصاءات السريعة ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="الإجمالي" value={stats?.total || 0} color="primary" />
        <MiniStat label="معلقة" value={stats?.pending || 0} color="warning" />
        <MiniStat label="مُسلَّمة" value={stats?.delivered || 0} color="success" />
        <MiniStat label="المعروض" value={pagination.total || 0} color="primary" />
      </div>

      {/* ═══ البحث والفلاتر ═══ */}
      <div className="bg-white rounded-lg border border-neutral-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Input
              placeholder="ابحث برقم الإيصال أو اسم المستلم..."
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
            {Object.entries(DELIVERY_STATUS_LABELS_AR).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <select
            value={paymentPlanFilter}
            onChange={(e) => {
              setPaymentPlanFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">كل الخطط</option>
            {Object.entries(PAYMENT_TYPE_LABELS_AR).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
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
          <Button variant="ghost" size="sm" onClick={() => { resetError(); loadDeliveryNotes(); }}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {/* ═══ الجدول ═══ */}
      <Table
        columns={columns}
        data={deliveryNotes}
        loading={loading && deliveryNotes.length === 0}
        emptyMessage="لا توجد إيصالات تسليم مطابقة للبحث"
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
        title="إنشاء إيصال تسليم جديد"
        size="full"
        closeOnOverlay={false}
      >
        <DeliveryNoteForm
          onSuccess={handleCreateSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </Modal>

      {/* ═══ مودال تعليم التسليم ═══ */}
      <Modal
        isOpen={isDeliverOpen}
        onClose={() => setIsDeliverOpen(false)}
        title="تعليم الإيصال كمُسلَّم"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsDeliverOpen(false)} disabled={isProcessing}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={handleConfirmDeliver} loading={isProcessing}>
              تأكيد التسليم
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {selectedNote && (
            <div className="bg-neutral-50 rounded-md p-3 text-sm">
              <div className="flex justify-between mb-1">
                <span>رقم الإيصال:</span>
                <span className="font-mono font-bold">{selectedNote.deliveryNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>الصيدلية:</span>
                <span className="font-medium">{selectedNote.pharmacy?.name}</span>
              </div>
            </div>
          )}

          <Input
            label="اسم المستلم"
            value={receivedBy}
            onChange={(e) => setReceivedBy(e.target.value)}
            placeholder="اسم من استلم البضاعة"
            required
          />

          <div>
            <label className="block mb-1.5 text-sm font-medium text-neutral-700">
              التوقيع (اختياري — Base64 أو رابط صورة)
            </label>
            <textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-200 font-mono text-xs"
              rows={3}
              placeholder="data:image/png;base64,..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default DeliveryNotesPage;