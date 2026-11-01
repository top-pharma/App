/**
 * @file SupplierReturnsPage.jsx
 * @description
 * صفحة إدارة مرتجعات الموردين.
 * تدير دورة الحياة الكاملة: draft → sent → accepted/rejected.
 *
 * لماذا هذا الملف؟
 * - إدارة إرجاع الأدوية التالفة/قريبة الانتهاء إلى الموردين.
 * - "إرسال" يُبلّغ المورد بالمرتجع.
 * - "قبول" يخصم من المخزون ويُسوّي مالياً (إشعار دائن / استبدال / استرداد نقدي).
 * - "رفض" يُعيد المرتجع لحالة الرفض.
 * - يدير حالته بنفسه (لا Context — لتجنب تعقيد غير ضروري).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  ArrowLeftRight,
  Search,
  X,
  AlertCircle,
  CheckCircle2,
  Clock,
  Ban,
  Send,
  ThumbsUp,
  ThumbsDown,
  Eye,
} from 'lucide-react';

import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import * as supplierReturnsAPI from '../api/supplierReturnsAPI.js';

import Button from '../components/UI/Button.jsx';
import Input from '../components/UI/Input.jsx';
import Table from '../components/UI/Table.jsx';
import Pagination from '../components/UI/Pagination.jsx';
import Modal from '../components/UI/Modal.jsx';
import SupplierReturnForm from '../components/Sales/SupplierReturnForm.jsx';

import { formatCurrency, formatDate, formatNumber } from '../utils/formatters.js';

// ═══════════════════════════════════════════════
// 1. المكونات المساعدة
// ═══════════════════════════════════════════════

function StatusBadge({ status }) {
  const map = {
    draft: { label: 'مسودة', class: 'bg-neutral-200 text-neutral-700', icon: Clock },
    sent: { label: 'مُرسل', class: 'bg-info-100 text-info-800', icon: Send },
    accepted: { label: 'مقبول', class: 'bg-success-100 text-success-800', icon: CheckCircle2 },
    rejected: { label: 'مرفوض', class: 'bg-danger-100 text-danger-800', icon: Ban },
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

function SettlementBadge({ type }) {
  const map = {
    credit_note: { label: 'إشعار دائن', class: 'bg-primary-100 text-primary-800' },
    replacement: { label: 'استبدال', class: 'bg-info-100 text-info-800' },
    cash_refund: { label: 'استرداد نقدي', class: 'bg-success-100 text-success-800' },
  };
  const config = map[type] || map.credit_note;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.class}`}>
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

function SupplierReturnsPage() {
  const { isAdmin, isAccountant, isStorekeeper } = useAuth();
  const toast = useToast();

  // ─── الحالة ───
  const [returns, setReturns] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [stats, setStats] = useState({ total: 0, draft: 0, sent: 0, accepted: 0, rejected: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ─── الفلاتر ───
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [settlementFilter, setSettlementFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [currentLimit, setCurrentLimit] = useState(20);

  // ─── المودالات ───
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [sendTarget, setSendTarget] = useState(null);
  const [acceptTarget, setAcceptTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // ─── نموذج القبول ───
  const [settledAmount, setSettledAmount] = useState('');
  const [replacementReference, setReplacementReference] = useState('');
  const [acceptNotes, setAcceptNotes] = useState('');

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
  const loadReturns = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = {
      page: currentPage,
      limit: currentLimit,
      sortBy: 'returnDate',
      sortOrder: 'desc',
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (statusFilter) params.status = statusFilter;
    if (settlementFilter) params.settlementType = settlementFilter;

    try {
      const result = await supplierReturnsAPI.listSupplierReturns(params);
      setReturns(result.items || []);
      setPagination(result.pagination || { page: 1, limit: 20, total: 0 });
    } catch (err) {
      setError(err?.error?.message || err?.message || 'فشل تحميل المرتجعات.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, currentLimit, debouncedSearch, statusFilter, settlementFilter]);

  // ─── جلب الإحصاءات ───
  const loadStats = useCallback(async () => {
    try {
      const [total, draft, sent, accepted, rejected] = await Promise.all([
        supplierReturnsAPI.listSupplierReturns({ limit: 1 }),
        supplierReturnsAPI.listSupplierReturns({ status: 'draft', limit: 1 }),
        supplierReturnsAPI.listSupplierReturns({ status: 'sent', limit: 1 }),
        supplierReturnsAPI.listSupplierReturns({ status: 'accepted', limit: 1 }),
        supplierReturnsAPI.listSupplierReturns({ status: 'rejected', limit: 1 }),
      ]);
      setStats({
        total: total.pagination?.total || 0,
        draft: draft.pagination?.total || 0,
        sent: sent.pagination?.total || 0,
        accepted: accepted.pagination?.total || 0,
        rejected: rejected.pagination?.total || 0,
      });
    } catch {
      // لا نُعطّل الواجهة
    }
  }, []);

  useEffect(() => {
    loadReturns();
    loadStats();
  }, [loadReturns, loadStats]);

  // ─── مسح الفلاتر ───
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
    toast.success('تم إنشاء مرتجع المورد.');
    loadReturns();
    loadStats();
  };

  // ─── إرسال للمورد ───
  const handleSend = async () => {
    if (!sendTarget) return;
    setIsProcessing(true);
    try {
      await supplierReturnsAPI.sendSupplierReturn(sendTarget.id, {});
      toast.success('تم إرسال المرتجع إلى المورد.');
      setSendTarget(null);
      loadReturns();
      loadStats();
    } catch (err) {
      toast.error(err?.error?.message || err?.message || 'فشل الإرسال.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── قبول من المورد ───
  const handleOpenAccept = (ret) => {
    setAcceptTarget(ret);
    setSettledAmount(String(ret.total));
    setReplacementReference('');
    setAcceptNotes('');
  };

  const handleConfirmAccept = async () => {
    if (!acceptTarget) return;

    const isReplacement = acceptTarget.settlementType === 'replacement';
    const isFinancial = ['credit_note', 'cash_refund'].includes(acceptTarget.settlementType);

    if (isReplacement && !replacementReference.trim()) {
      toast.error('مرجع الاستبدال مطلوب.');
      return;
    }
    if (isFinancial) {
      const amount = Number(settledAmount);
      if (isNaN(amount) || amount <= 0) {
        toast.error('المبلغ المُسوَّى مطلوب.');
        return;
      }
    }

    setIsProcessing(true);
    try {
      await supplierReturnsAPI.acceptSupplierReturn(acceptTarget.id, {
        settledAmount: isFinancial ? Number(settledAmount) : 0,
        replacementReference: isReplacement ? replacementReference.trim() : undefined,
        notes: acceptNotes || undefined,
      });
      toast.success('تم قبول المرتجع من المورد.');
      setAcceptTarget(null);
      loadReturns();
      loadStats();
    } catch (err) {
      toast.error(err?.error?.message || err?.message || 'فشل القبول.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── رفض من المورد ───
  const handleConfirmReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error('سبب الرفض مطلوب.');
      return;
    }

    setIsProcessing(true);
    try {
      await supplierReturnsAPI.rejectSupplierReturn(rejectTarget.id, {
        rejectionReason: rejectionReason.trim(),
      });
      toast.success('تم رفض المرتجع من المورد.');
      setRejectTarget(null);
      setRejectionReason('');
      loadReturns();
      loadStats();
    } catch (err) {
      toast.error(err?.error?.message || err?.message || 'فشل الرفض.');
    } finally {
      setIsProcessing(false);
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
      label: 'التسوية',
      align: 'center',
      render: (row) => <SettlementBadge type={row.settlementType} />,
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
            <Button
              variant="ghost"
              size="sm"
              icon={Send}
              onClick={() => setSendTarget(row)}
            >
              إرسال
            </Button>
          )}
          {row.status === 'sent' && (isAdmin || isAccountant) && (
            <>
              <Button
                variant="ghost"
                size="sm"
                icon={ThumbsUp}
                onClick={() => handleOpenAccept(row)}
              >
                قبول
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={ThumbsDown}
                onClick={() => {
                  setRejectTarget(row);
                  setRejectionReason('');
                }}
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
            <ArrowLeftRight size={24} className="text-primary-700" />
            مرتجعات الموردين
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            إرجاع البضاعة التالفة أو قريبة الانتهاء إلى الشركات المستوردة
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setIsFormOpen(true)}>
          مرتجع مورد جديد
        </Button>
      </div>

      {/* ═══ الإحصاءات ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniStat label="الإجمالي" value={stats.total} color="primary" />
        <MiniStat label="مسودات" value={stats.draft} color="warning" />
        <MiniStat label="مُرسلة" value={stats.sent} color="primary" />
        <MiniStat label="مقبولة" value={stats.accepted} color="success" />
        <MiniStat label="مرفوضة" value={stats.rejected} color="danger" />
      </div>

      {/* ═══ البحث والفلاتر ═══ */}
      <div className="bg-white rounded-lg border border-neutral-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Input
              placeholder="ابحث برقم المرتجع أو مرجع الاستبدال..."
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
            <option value="sent">مُرسل</option>
            <option value="accepted">مقبول</option>
            <option value="rejected">مرفوض</option>
          </select>

          <select
            value={settlementFilter}
            onChange={(e) => { setSettlementFilter(e.target.value); setCurrentPage(1); }}
            className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">كل طرق التسوية</option>
            <option value="credit_note">إشعار دائن</option>
            <option value="replacement">استبدال</option>
            <option value="cash_refund">استرداد نقدي</option>
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
          <Button variant="ghost" size="sm" onClick={loadReturns}>إعادة المحاولة</Button>
        </div>
      )}

      {/* ═══ الجدول ═══ */}
      <Table
        columns={columns}
        data={returns}
        loading={loading && returns.length === 0}
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
        title="مرتجع مورد جديد"
        size="full"
        closeOnOverlay={false}
      >
        <SupplierReturnForm
          onSuccess={handleCreateSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </Modal>

      {/* ═══ مودال الإرسال ═══ */}
      <Modal
        isOpen={Boolean(sendTarget)}
        onClose={() => setSendTarget(null)}
        title="إرسال المرتجع للمورد"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSendTarget(null)} disabled={isProcessing}>إلغاء</Button>
            <Button variant="primary" onClick={handleSend} loading={isProcessing}>إرسال</Button>
          </>
        }
      >
        {sendTarget && (
          <div className="space-y-3 text-sm">
            <div className="bg-neutral-50 rounded p-3 space-y-1">
              <div className="flex justify-between">
                <span>رقم المرتجع:</span>
                <span className="font-mono font-bold">{sendTarget.returnNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>المورّد:</span>
                <span className="font-medium">{sendTarget.supplier?.name}</span>
              </div>
              <div className="flex justify-between">
                <span>الإجمالي:</span>
                <span className="font-bold numeric">{formatCurrency(sendTarget.total)}</span>
              </div>
            </div>
            <p className="text-neutral-600">
              بعد الإرسال ستتحول الحالة إلى "مُرسل" — بانتظار رد المورد (قبول/رفض).
            </p>
          </div>
        )}
      </Modal>

      {/* ═══ مودال القبول ═══ */}
      <Modal
        isOpen={Boolean(acceptTarget)}
        onClose={() => setAcceptTarget(null)}
        title="قبول المرتجع من المورد"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAcceptTarget(null)} disabled={isProcessing}>إلغاء</Button>
            <Button variant="primary" onClick={handleConfirmAccept} loading={isProcessing}>تأكيد القبول</Button>
          </>
        }
      >
        {acceptTarget && (
          <div className="space-y-4">
            <div className="bg-neutral-50 rounded p-3 text-sm">
              <div className="flex justify-between mb-1">
                <span>رقم المرتجع:</span>
                <span className="font-mono font-bold">{acceptTarget.returnNumber}</span>
              </div>
              <div className="flex justify-between mb-1">
                <span>الإجمالي:</span>
                <span className="font-bold numeric">{formatCurrency(acceptTarget.total)}</span>
              </div>
              <div className="flex justify-between">
                <span>طريقة التسوية:</span>
                <SettlementBadge type={acceptTarget.settlementType} />
              </div>
            </div>

            {acceptTarget.settlementType === 'replacement' && (
              <div>
                <label className="block mb-1.5 text-sm font-medium text-neutral-700">
                  مرجع الاستبدال *
                </label>
                <Input
                  value={replacementReference}
                  onChange={(e) => setReplacementReference(e.target.value)}
                  placeholder="رقم إيصال الاستلام الجديد أو رقم البوليصة"
                  required
                />
              </div>
            )}

            {['credit_note', 'cash_refund'].includes(acceptTarget.settlementType) && (
              <div>
                <label className="block mb-1.5 text-sm font-medium text-neutral-700">
                  المبلغ المُسوَّى *
                </label>
                <Input
                  type="number"
                  value={settledAmount}
                  onChange={(e) => setSettledAmount(e.target.value)}
                  min="0"
                  max={acceptTarget.total}
                  step="0.01"
                  required
                />
                <p className="text-xs text-neutral-500 mt-1">
                  {acceptTarget.settlementType === 'credit_note'
                    ? 'سيُخصم من رصيد المورّد (إشعار دائن).'
                    : 'سيُسترد نقداً للخزينة (Phase 3).'}
                </p>
              </div>
            )}

            <div>
              <label className="block mb-1.5 text-sm font-medium text-neutral-700">ملاحظات (اختياري)</label>
              <textarea
                value={acceptNotes}
                onChange={(e) => setAcceptNotes(e.target.value)}
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
        title="رفض المرتجع من المورد"
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
            <p>المورد رفض استلام المرتجع. سيُسجَّل الرفض في AuditLog.</p>
          </div>

          <div>
            <label className="block mb-1.5 text-sm font-medium text-neutral-700">سبب الرفض *</label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-200"
              rows={3}
              placeholder="اذكر سبب رفض المورّد للمرتجع..."
              required
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default SupplierReturnsPage;