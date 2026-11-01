/**
 * @file ChecksPage.jsx
 * @description
 * صفحة إدارة الشيكات — النسخة المبسطة (Phase 3).
 *
 * المبدأ:
 *  - الشيك = سجل + تنبيهات فقط.
 *  - التسجيل لا يؤثر على الأرصدة.
 *  - "تسجيل الصرف" (settle) هو الحدث الوحيد المؤثر على الأرصدة.
 *  - 4 حالات: pending / paid / bounced / cancelled.
 *
 * الوظائف:
 *  - عرض قائمة الشيكات مع فلترة (النوع + الحالة + البحث).
 *  - إنشاء شيك جديد (CheckForm).
 *  - تسجيل الصرف (settle) → CashSelector + طريقة الدفع.
 *  - تسجيل ارتداد (bounce) → سبب إلزامي.
 *  - إلغاء (cancel) → سبب إلزامي.
 *  - الانتقال لصفحة التفاصيل/الطباعة.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Printer,
  DollarSign,
  XCircle,
  Ban,
} from 'lucide-react';
import { useChecksContext } from '../context/ChecksContext.jsx';
import { useToast } from '../hooks/useToast.js';
import Button from '../components/UI/Button.jsx';
import Table from '../components/UI/Table.jsx';
import Loading from '../components/UI/Loading.jsx';
import CheckForm from '../components/Finance/CheckForm.jsx';
import CashSelector from '../components/Finance/CashSelector.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';

/* ─────────────────────────────────────────────────────────────
 * خرائط الحالة (4 حالات فقط)
 * ───────────────────────────────────────────────────────────── */
const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-green-100 text-green-800',
  bounced: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

const statusLabels = {
  pending: 'معلّق',
  paid: 'مدفوع',
  bounced: 'مرتد',
  cancelled: 'ملغى',
};

const ChecksPage = () => {
  const navigate = useNavigate();
  const {
    checks,
    loading,
    fetchChecks,
    createCheck,
    settle,
    bounce,
    cancel,
  } = useChecksContext();
  const { showToast } = useToast();

  /* ─── State: نموذج الإنشاء ─── */
  const [isFormOpen, setIsFormOpen] = useState(false);

  /* ─── State: الفلاتر ─── */
  const [filters, setFilters] = useState({
    type: 'all',
    status: 'all',
    search: '',
  });

  /* ─── State: مودال الإجراء (settle / bounce / cancel) ─── */
  const [actionCheck, setActionCheck] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [actionReason, setActionReason] = useState('');

  /* ─── State: settle (طريقة الصرف + الصندوق/البنك) ─── */
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cashFundId, setCashFundId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');

  const [submitting, setSubmitting] = useState(false);

  /* ─────────────────────────────────────────────────────────
   * تحميل الشيكات عند تغيير الفلاتر
   * ───────────────────────────────────────────────────────── */
  useEffect(() => {
    fetchChecks(filters);
  }, [filters, fetchChecks]);

  /* ─────────────────────────────────────────────────────────
   * إنشاء شيك جديد
   * ───────────────────────────────────────────────────────── */
  const handleCreate = async (payload) => {
    await createCheck(payload);
  };

  /* ─────────────────────────────────────────────────────────
   * فتح مودال الإجراء
   * ───────────────────────────────────────────────────────── */
  const openAction = (check, type) => {
    setActionCheck(check);
    setActionType(type);
    setActionReason('');
    setPaymentMethod('cash');
    setCashFundId('');
    setBankAccountId('');
  };

  /* ─────────────────────────────────────────────────────────
   * إغلاق مودال الإجراء
   * ───────────────────────────────────────────────────────── */
  const closeAction = () => {
    setActionCheck(null);
    setActionType(null);
    setActionReason('');
    setCashFundId('');
    setBankAccountId('');
  };

  /* ─────────────────────────────────────────────────────────
   * تنفيذ الإجراء
   * ───────────────────────────────────────────────────────── */
  const handleActionSubmit = async () => {
    if (!actionCheck) return;
    setSubmitting(true);
    try {
      /* ─── settle ─── */
      if (actionType === 'settle') {
        if (paymentMethod === 'cash' && !cashFundId) {
          showToast('يجب اختيار الصندوق', 'error');
          return;
        }
        if (paymentMethod === 'bank' && !bankAccountId) {
          showToast('يجب اختيار الحساب البنكي', 'error');
          return;
        }
        await settle(actionCheck._id, {
          paymentMethod,
          cashFundId: paymentMethod === 'cash' ? cashFundId : null,
          bankAccountId: paymentMethod === 'bank' ? bankAccountId : null,
        });
      }

      /* ─── bounce ─── */
      else if (actionType === 'bounce') {
        if (!actionReason.trim()) {
          showToast('أدخل سبب الارتداد', 'error');
          return;
        }
        await bounce(actionCheck._id, actionReason);
      }

      /* ─── cancel ─── */
      else if (actionType === 'cancel') {
        if (!actionReason.trim()) {
          showToast('أدخل سبب الإلغاء', 'error');
          return;
        }
        await cancel(actionCheck._id, actionReason);
      }

      closeAction();
    } catch (err) {
      showToast(err.response?.data?.message || 'فشل العملية', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /* ─────────────────────────────────────────────────────────
   * أعمدة الجدول
   * ───────────────────────────────────────────────────────── */
  const columns = [
    {
      header: 'رقم الشيك',
      accessor: 'checkNumber',
      cell: (row) => (
        <span className="font-mono font-medium">{row.checkNumber}</span>
      ),
    },
    {
      header: 'النوع',
      accessor: 'type',
      cell: (row) => (
        <span
          className={`px-2 py-0.5 text-xs rounded-full ${
            row.type === 'incoming'
              ? 'bg-blue-100 text-blue-800'
              : 'bg-orange-100 text-orange-800'
          }`}
        >
          {row.type === 'incoming' ? 'وارد' : 'صادر'}
        </span>
      ),
    },
    {
      header: 'البنك',
      accessor: 'bankName',
    },
    {
      header: 'الطرف',
      cell: (row) => (
        <span>
          {row.type === 'incoming'
            ? row.customerId?.name || '-'
            : row.supplierId?.name || '-'}
        </span>
      ),
    },
    {
      header: 'المبلغ',
      accessor: 'amount',
      cell: (row) => (
        <span className="font-bold text-green-700">
          {formatCurrency(row.amount)} SDG
        </span>
      ),
    },
    {
      header: 'الاستحقاق',
      accessor: 'dueDate',
      cell: (row) => {
        const due = new Date(row.dueDate);
        const isOverdue = row.status === 'pending' && due < new Date();
        return (
          <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
            {formatDate(row.dueDate)}
            {isOverdue && ' ⚠️'}
          </span>
        );
      },
    },
    {
      header: 'الحالة',
      accessor: 'status',
      cell: (row) => (
        <span
          className={`px-2 py-0.5 text-xs rounded-full ${
            statusColors[row.status] || 'bg-gray-100'
          }`}
        >
          {statusLabels[row.status] || row.status}
        </span>
      ),
    },
    {
      header: 'إجراءات',
      cell: (row) => (
        <div className="flex gap-1">
          {/* تفاصيل / طباعة */}
          <button
            onClick={() => navigate(`/finance/checks/${row._id}`)}
            className="p-1.5 text-gray-600 hover:bg-gray-50 rounded"
            title="تفاصيل وطباعة"
          >
            <Printer size={16} />
          </button>

          {/* تسجيل الصرف — الزر الوحيد للحركة المالية */}
          {row.status === 'pending' && (
            <button
              onClick={() => openAction(row, 'settle')}
              className="p-1.5 text-green-600 hover:bg-green-50 rounded"
              title="تسجيل الصرف (يؤثر على الأرصدة)"
            >
              <DollarSign size={16} />
            </button>
          )}

          {/* ارتداد — فقط بعد الصرف */}
          {row.status === 'paid' && (
            <button
              onClick={() => openAction(row, 'bounce')}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded"
              title="تسجيل ارتداد"
            >
              <XCircle size={16} />
            </button>
          )}

          {/* إلغاء — فقط قبل الصرف */}
          {row.status === 'pending' && (
            <button
              onClick={() => openAction(row, 'cancel')}
              className="p-1.5 text-orange-600 hover:bg-orange-50 rounded"
              title="إلغاء الشيك"
            >
              <Ban size={16} />
            </button>
          )}
        </div>
      ),
    },
  ];

  /* ─────────────────────────────────────────────────────────
   * Render
   * ───────────────────────────────────────────────────────── */
  return (
    <div className="p-6">
      {/* العنوان + زر الإنشاء */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الشيكات</h1>
          <p className="text-gray-600 text-sm mt-1">
            {checks.length} شيك — الشيك لا يؤثر على الأرصدة حتى يُصرف
          </p>
        </div>
        <Button onClick={() => setIsFormOpen(true)} variant="primary">
          <Plus size={18} className="inline ml-1" /> شيك جديد
        </Button>
      </div>

      {/* شريط الفلاتر */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-4 flex flex-wrap gap-3">
        <select
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="all">كل الأنواع</option>
          <option value="incoming">وارد</option>
          <option value="outgoing">صادر</option>
        </select>

        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="all">كل الحالات</option>
          <option value="pending">معلّق</option>
          <option value="paid">مدفوع</option>
          <option value="bounced">مرتد</option>
          <option value="cancelled">ملغى</option>
        </select>

        <input
          type="text"
          placeholder="بحث برقم الشيك أو البنك..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>

      {/* الجدول */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {loading ? (
          <Loading />
        ) : (
          <Table columns={columns} data={checks} emptyMessage="لا توجد شيكات" />
        )}
      </div>

      {/* نموذج إنشاء شيك */}
      <CheckForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleCreate}
      />

      {/* مودال الإجراء (settle / bounce / cancel) */}
      {actionCheck && actionType && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            {/* العنوان */}
            <h3 className="text-lg font-bold mb-2">
              {actionType === 'settle' && 'تسجيل صرف الشيك'}
              {actionType === 'bounce' && 'تسجيل ارتداد'}
              {actionType === 'cancel' && 'إلغاء الشيك'}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              شيك رقم{' '}
              <span className="font-mono font-medium">
                {actionCheck.checkNumber}
              </span>{' '}
              — {formatCurrency(actionCheck.amount)} SDG
            </p>

            {/* ─── settle ─── */}
            {actionType === 'settle' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    طريقة الصرف
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="cash">نقدي (صندوق)</option>
                    <option value="bank">بنكي</option>
                  </select>
                </div>

                <CashSelector
                  method={paymentMethod}
                  value={
                    paymentMethod === 'cash' ? cashFundId : bankAccountId
                  }
                  onChange={
                    paymentMethod === 'cash' ? setCashFundId : setBankAccountId
                  }
                  required
                  showBalance
                  label={
                    paymentMethod === 'cash'
                      ? 'الصندوق (إلزامي)'
                      : 'الحساب البنكي (إلزامي)'
                  }
                />

                <div className="bg-blue-50 border border-blue-200 rounded-md p-2 text-xs text-blue-800">
                  ℹ️ عند التأكيد سيُحدَّث رصيد{' '}
                  {paymentMethod === 'cash' ? 'الصندوق' : 'البنك'} بمقدار{' '}
                  {formatCurrency(actionCheck.amount)} SDG، وسيُنشأ قيد محاسبي
                  (CHECK_PAID).
                  {actionCheck.type === 'incoming' &&
                    actionCheck.invoiceId &&
                    ' كما ستزيد مدفوعات الفاتورة المرتبطة.'}
                </div>
              </div>
            )}

            {/* ─── bounce / cancel ─── */}
            {(actionType === 'bounce' || actionType === 'cancel') && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  {actionType === 'bounce'
                    ? 'سبب الارتداد'
                    : 'سبب الإلغاء'}
                </label>
                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="اذكر السبب..."
                  autoFocus
                />

                {actionType === 'bounce' && (
                  <div className="mt-2 bg-red-50 border border-red-200 rounded-md p-2 text-xs text-red-800">
                    ⚠️ سيُعكس تأثير الصرف: رصيد{' '}
                    {actionCheck.paymentMethod === 'bank'
                      ? 'البنك'
                      : 'الصندوق'}{' '}
                    + القيد المحاسبي
                    {actionCheck.type === 'incoming' &&
                      actionCheck.invoiceId &&
                      ' + مدفوعات الفاتورة'}
                    .
                  </div>
                )}

                {actionType === 'cancel' && (
                  <div className="mt-2 bg-gray-50 border border-gray-200 rounded-md p-2 text-xs text-gray-700">
                    ℹ️ الشيك لم يُصرف بعد — لا يوجد أثر مالي لعكسه.
                  </div>
                )}
              </div>
            )}

            {/* أزرار المودال */}
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="secondary"
                onClick={closeAction}
                disabled={submitting}
              >
                إلغاء
              </Button>
              <Button
                variant="primary"
                onClick={handleActionSubmit}
                disabled={submitting}
              >
                {submitting ? 'جارٍ...' : 'تأكيد'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChecksPage;