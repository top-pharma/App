/**
 * BankAccountsPage.jsx
 *
 * صفحة إدارة الحساب البنكي (حساب واحد فقط).
 *
 * ⚠️ إصلاح 2026-11-12:
 *  - F1-F9: (سابقاً)
 *  - F10: handleSubmit — isActive: true دائماً عند التعديل
 *         (لأن BankAccountForm قد يُرسل isActive: false — يمنع تعطيل الحساب).
 */

import { useState, useEffect } from 'react';
import { Plus, Edit, Power, PowerOff, RefreshCw } from 'lucide-react';
import { useBankAccountsContext } from '../context/BankAccountsContext.jsx';
import { useToast } from '../hooks/useToast.js';
import Button from '../components/UI/Button.jsx';
import Table from '../components/UI/Table.jsx';
import Loading from '../components/UI/Loading.jsx';
import ConfirmDialog from '../components/UI/ConfirmDialog.jsx';
import BankAccountForm from '../components/Finance/BankAccountForm.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';

const BankAccountsPage = () => {
  const {
    accounts,
    activeAccount,
    loading,
    fetchAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
  } = useBankAccountsContext();
  const { success, error: showError } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [deactivatingAccount, setDeactivatingAccount] = useState(null);
  const [reactivatingAccount, setReactivatingAccount] = useState(null);

  useEffect(() => {
    fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = () => {
    setEditingAccount(null);
    setIsFormOpen(true);
  };

  const handleEdit = (account) => {
    setEditingAccount(account);
    setIsFormOpen(true);
  };

  // ✅ F10: handleSubmit — isActive: true دائماً عند التعديل
  const handleSubmit = async (payload) => {
    try {
      if (editingAccount) {
        // ← هنا: نُضيف isActive: true — يمنع تعطيل الحساب
        await updateAccount(editingAccount.id || editingAccount._id, {
          ...payload,
          isActive: true,
        });
      } else {
        await createAccount(payload);
      }
      setIsFormOpen(false);
      setEditingAccount(null);
    } catch (err) {
      // Toast من Context
    }
  };

  const handleDeactivate = async () => {
    if (!deactivatingAccount) return;
    try {
      await deleteAccount(deactivatingAccount.id || deactivatingAccount._id);
      setDeactivatingAccount(null);
    } catch (err) {
      showError(err?.error?.message || err?.message || 'فشل التعطيل');
    }
  };

  const handleReactivate = async () => {
    if (!reactivatingAccount) return;
    try {
      await updateAccount(reactivatingAccount.id || reactivatingAccount._id, {
        isActive: true,
      });
      success('تم تفعيل الحساب البنكي');
      setReactivatingAccount(null);
    } catch (err) {
      showError(err?.error?.message || err?.message || 'فشل التفعيل');
    }
  };

  // ✅ F7: columns بصيغة Table (key/label/render)
  const columns = [
    {
      key: 'bankName',
      label: 'البنك',
      render: (row) => (
        <div>
          <p className="font-medium">{row.bankName || '—'}</p>
          {row.branchName && <p className="text-xs text-gray-500">{row.branchName}</p>}
        </div>
      ),
    },
    {
      key: 'accountNumber',
      label: 'رقم الحساب',
      render: (row) => <span className="font-mono">{row.accountNumber || '—'}</span>,
    },
    {
      key: 'accountName',
      label: 'صاحب الحساب',
      render: (row) => row.accountName || row.name || '—',
    },
    {
      key: 'currentBalance',
      label: 'الرصيد',
      align: 'end',
      // ✅ F9: formatCurrency يُضيف "SDG" — لا نُضيفه مرة أخرى
      render: (row) => (
        <span className="font-bold text-green-700">
          {formatCurrency(row.currentBalance || 0)}
        </span>
      ),
    },
    {
      key: 'isActive',
      label: 'الحالة',
      align: 'center',
      render: (row) =>
        row.isActive ? (
          <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">
            نشط
          </span>
        ) : (
          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
            معطّل
          </span>
        ),
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
          <button
            onClick={() => handleEdit(row)}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
            title="تعديل"
          >
            <Edit size={16} />
          </button>
          {row.isActive ? (
            <button
              onClick={() => setDeactivatingAccount(row)}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded"
              title="تعطيل"
            >
              <Power size={16} />
            </button>
          ) : (
            <button
              onClick={() => setReactivatingAccount(row)}
              className="p-1.5 text-green-600 hover:bg-green-50 rounded"
              title="تفعيل"
            >
              <PowerOff size={16} />
            </button>
          )}
        </div>
      ),
    },
  ];

  if (loading && accounts.length === 0) {
    return (
      <div className="p-6">
        <Loading text="جاري تحميل الحسابات البنكية..." />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الحساب البنكي</h1>
          <p className="text-gray-600 text-sm mt-1">
            {accounts.length === 0
              ? 'لا يوجد حساب بنكي بعد'
              : `${accounts.length} حساب — حساب واحد نشط فقط`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => fetchAccounts()} disabled={loading}>
            <RefreshCw size={16} className="inline ml-1" />
            تحديث
          </Button>
          <Button onClick={handleCreate} variant="primary">
            <Plus size={18} className="inline ml-1" /> حساب جديد
          </Button>
        </div>
      </div>

      {activeAccount && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl p-6 mb-6">
          <p className="text-sm opacity-90 mb-1">الرصيد الحالي</p>
          {/* ✅ F9: formatCurrency يُضيف "SDG" — لا نُضيفه مرة أخرى */}
          <p className="text-3xl font-bold">
            {formatCurrency(activeAccount.currentBalance || 0)}
          </p>
          <p className="text-sm mt-2 opacity-90">
            {activeAccount.bankName} — {activeAccount.accountNumber}
          </p>
        </div>
      )}

      {accounts.length > 0 && !activeAccount && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 flex items-start gap-2">
          <Power size={18} className="text-yellow-700 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <p className="font-medium">لا يوجد حساب بنكي نشط</p>
            <p className="text-xs mt-1">
              يوجد {accounts.length} حساب معطّل — اضغط "تفعيل" على الحساب المطلوب.
            </p>
          </div>
        </div>
      )}

      <Table
        columns={columns}
        data={accounts}
        loading={loading}
        emptyMessage="لا يوجد حساب بنكي بعد — اضغط 'حساب جديد' للبدء"
        rowKey="id"
      />

      <BankAccountForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingAccount(null);
        }}
        onSubmit={handleSubmit}
        initialData={editingAccount}
        isEdit={!!editingAccount}
      />

      <ConfirmDialog
        isOpen={!!deactivatingAccount}
        onClose={() => setDeactivatingAccount(null)}
        onConfirm={handleDeactivate}
        title="تعطيل الحساب البنكي"
        message={`هل تريد تعطيل "${deactivatingAccount?.bankName}"؟`}
        confirmText="تعطيل"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={!!reactivatingAccount}
        onClose={() => setReactivatingAccount(null)}
        onConfirm={handleReactivate}
        title="تفعيل الحساب البنكي"
        message={`هل تريد تفعيل "${reactivatingAccount?.bankName}"؟`}
        confirmText="تفعيل"
        variant="primary"
      />
    </div>
  );
};

export default BankAccountsPage;