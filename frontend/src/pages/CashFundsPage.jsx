/**
 * CashFundsPage.jsx
 *
 * صفحة إدارة صناديق النقدية.
 * - عرض قائمة الصناديق
 * - إنشاء / تعديل / حذف
 * - تعيين كافتراضي
 * - إيداع / سحب
 *
 * ⚠️ إصلاح 2026-11-11:
 *  - F1: currentBalance بدل balance.
 *  - F2: columns بصيغة Table (key/label/render).
 *  - F3: movementFund.currentBalance.
 */

import { useState, useEffect } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Star,
  ArrowUpCircle,
  ArrowDownCircle,
} from 'lucide-react';
import { useCashFundsContext } from '../context/CashFundsContext.jsx';
import { useToast } from '../hooks/useToast.js';
import Button from '../components/UI/Button.jsx';
import Table from '../components/UI/Table.jsx';
import Loading from '../components/UI/Loading.jsx';
import ConfirmDialog from '../components/UI/ConfirmDialog.jsx';
import CashFundForm from '../components/Finance/CashFundForm.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';

const CashFundsPage = () => {
  const {
    funds,
    loading,
    fetchFunds,
    createFund,
    updateFund,
    deleteFund,
    setAsDefault,
    movement,
  } = useCashFundsContext();
  const { success, error: showError } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingFund, setEditingFund] = useState(null);
  const [deletingFund, setDeletingFund] = useState(null);
  const [movementFund, setMovementFund] = useState(null);
  const [movementType, setMovementType] = useState('deposit');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementDescription, setMovementDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchFunds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = () => {
    setEditingFund(null);
    setIsFormOpen(true);
  };

  const handleEdit = (fund) => {
    setEditingFund(fund);
    setIsFormOpen(true);
  };

  const handleSubmit = async (payload) => {
    try {
      if (editingFund) {
        await updateFund(editingFund.id || editingFund._id, payload);
      } else {
        await createFund(payload);
      }
      setIsFormOpen(false);
      setEditingFund(null);
    } catch (err) {
      // Toast من Context
    }
  };

  const handleDelete = async () => {
    if (!deletingFund) return;
    try {
      await deleteFund(deletingFund.id || deletingFund._id);
      setDeletingFund(null);
    } catch (err) {
      showError(err?.error?.message || err?.message || 'فشل الحذف');
    }
  };

  const handleSetDefault = async (fund) => {
    try {
      await setAsDefault(fund.id || fund._id);
    } catch (err) {
      showError(err?.error?.message || err?.message || 'فشل التعيين');
    }
  };

  const handleMovementSubmit = async () => {
    if (!movementAmount || Number(movementAmount) <= 0) {
      showError('أدخل مبلغاً صحيحاً');
      return;
    }
    setSubmitting(true);
    try {
      await movement(movementFund.id || movementFund._id, {
        type: movementType,
        amount: Number(movementAmount),
        description:
          movementDescription ||
          (movementType === 'deposit' ? 'إيداع نقدي' : 'سحب نقدي'),
      });
      setMovementFund(null);
      setMovementAmount('');
      setMovementDescription('');
    } catch (err) {
      showError(err?.error?.message || err?.message || 'فشل العملية');
    } finally {
      setSubmitting(false);
    }
  };

  // ✅ F2: columns بصيغة Table (key/label/render)
  const columns = [
    {
      key: 'name',
      label: 'الاسم',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          {row.isDefault && (
            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full">
              افتراضي
            </span>
          )}
          {!row.isActive && (
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
              معطّل
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'code',
      label: 'الكود',
      render: (row) => row.code || '—',
    },
    {
      key: 'currentBalance',
      label: 'الرصيد',
      align: 'end',
      render: (row) => (
        <span className="font-bold text-green-700">
          {formatCurrency(row.currentBalance || 0)} SDG
        </span>
      ),
    },
    {
      key: 'openingBalance',
      label: 'الرصيد الافتتاحي',
      align: 'end',
      render: (row) => formatCurrency(row.openingBalance || 0),
    },
    {
      key: 'createdAt',
      label: 'تاريخ الإنشاء',
      render: (row) => formatDate(row.createdAt),
    },
    {
      key: 'actions',
      label: 'إجراءات',
      align: 'center',
      render: (row) => (
        <div className="flex gap-1 justify-center">
          {!row.isDefault && row.isActive && (
            <button
              onClick={() => handleSetDefault(row)}
              className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded"
              title="تعيين كافتراضي"
            >
              <Star size={16} />
            </button>
          )}
          <button
            onClick={() => {
              setMovementFund(row);
              setMovementType('deposit');
            }}
            className="p-1.5 text-green-600 hover:bg-green-50 rounded"
            title="إيداع"
            disabled={!row.isActive}
          >
            <ArrowUpCircle size={16} />
          </button>
          <button
            onClick={() => {
              setMovementFund(row);
              setMovementType('withdrawal');
            }}
            className="p-1.5 text-orange-600 hover:bg-orange-50 rounded"
            title="سحب"
            disabled={!row.isActive}
          >
            <ArrowDownCircle size={16} />
          </button>
          <button
            onClick={() => handleEdit(row)}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
            title="تعديل"
          >
            <Edit size={16} />
          </button>
          <button
            onClick={() => setDeletingFund(row)}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
            title="حذف"
            disabled={row.isDefault}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  if (loading && funds.length === 0) {
    return (
      <div className="p-6">
        <Loading text="جاري تحميل الصناديق..." />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الصناديق النقدية</h1>
          <p className="text-gray-600 text-sm mt-1">{funds.length} صندوق</p>
        </div>
        <Button onClick={handleCreate} variant="primary">
          <Plus size={18} className="inline ml-1" /> صندوق جديد
        </Button>
      </div>

      <Table
        columns={columns}
        data={funds}
        loading={loading}
        emptyMessage="لا توجد صناديق بعد — اضغط 'صندوق جديد' للبدء"
        rowKey="id"
      />

      <CashFundForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingFund(null);
        }}
        onSubmit={handleSubmit}
        initialData={editingFund}
        isEdit={!!editingFund}
      />

      <ConfirmDialog
        isOpen={!!deletingFund}
        onClose={() => setDeletingFund(null)}
        onConfirm={handleDelete}
        title="حذف الصندوق"
        message={`هل تريد حذف صندوق "${deletingFund?.name}"؟`}
        confirmText="حذف"
        variant="danger"
      />

      {/* نموذج الإيداع/السحب */}
      {movementFund && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">
              {movementType === 'deposit' ? 'إيداع نقدي' : 'سحب نقدي'} —{' '}
              {movementFund.name}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              الرصيد الحالي: {formatCurrency(movementFund.currentBalance || 0)} SDG
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">المبلغ (SDG)</label>
                <input
                  type="number"
                  step="0.01"
                  value={movementAmount}
                  onChange={(e) => setMovementAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">الوصف (اختياري)</label>
                <input
                  type="text"
                  value={movementDescription}
                  onChange={(e) => setMovementDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="وصف الحركة"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="secondary"
                onClick={() => setMovementFund(null)}
                disabled={submitting}
              >
                إلغاء
              </Button>
              <Button
                variant="primary"
                onClick={handleMovementSubmit}
                disabled={submitting}
              >
                {submitting ? 'جارٍ...' : movementType === 'deposit' ? 'إيداع' : 'سحب'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashFundsPage;