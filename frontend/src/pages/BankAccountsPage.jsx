/**
 * BankAccountsPage.jsx
 *
 * صفحة إدارة الحساب البنكي (حساب واحد فقط).
 *
 * ⚠️ إصلاح 2026-11-12:
 *  - F1-F9: (سابقاً)
 *  - F11: حذف نظام تفعيل/تعطيل نهائياً.
 *         - حذف reactivatingAccount + handleReactivate + زر "تفعيل".
 *         - حذف deactivatingAccount + handleDeactivate + زر "تعطيل".
 *         - حذف عمود "الحالة" (isActive).
 *         - حذف تنبيه "لا يوجد حساب نشط".
 *         - activeAccount = accounts[0] (دائماً).
 *         - handleSubmit: بدون isActive (BankAccountForm لا يُرسله).
 */

import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, RefreshCw } from 'lucide-react';
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
    loading,
    fetchAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
  } = useBankAccountsContext();
  const { success, error: showError } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(null);

  useEffect(() => {
    fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ activeAccount = accounts[0] (دائماً — لا isActive)
  const currentAccount = accounts[0] || null;

  const handleCreate = () => {
    setEditingAccount(null);
    setIsFormOpen(true);
  };

  const handleEdit = (account) => {
    setEditingAccount(account);
    setIsFormOpen(true);
  };

  // ✅ handleSubmit — بدون isActive
  const handleSubmit = async (payload) => {
    try {
      if (editingAccount) {
        await updateAccount(editingAccount.id || editingAccount._id, payload);
      } else {
        await createAccount(payload);
      }
      setIsFormOpen(false);
      setEditingAccount(null);
    } catch (err) {
      // Toast من Context
    }
  };

  // ✅ handleDelete — حذف فعلي
  const handleDelete = async () => {
    if (!deletingAccount) return;
    try {
      await deleteAccount(deletingAccount.id || deletingAccount._id);
      success('تم حذف الحساب البنكي');
      setDeletingAccount(null);
    } catch (err) {
      showError(err?.error?.message || err?.message || 'فشل الحذف');
    }
  };

  // ✅ columns — بدون isActive
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
      render: (row) => (
        <span className="font-bold text-green-700">
          {formatCurrency(row.currentBalance || 0)}
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
          <button
            onClick={() => setDeletingAccount(row)}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
            title="حذف"
          >
            <Trash2 size={16} />
          </button>
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
              : `${accounts.length} حساب`}
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

      {/* ✅ بطاقة الرصيد — currentAccount = accounts[0] */}
      {currentAccount && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl p-6 mb-6">
          <p className="text-sm opacity-90 mb-1">الرصيد الحالي</p>
          <p className="text-3xl font-bold">
            {formatCurrency(currentAccount.currentBalance || 0)}
          </p>
          <p className="text-sm mt-2 opacity-90">
            {currentAccount.bankName} — {currentAccount.accountNumber}
          </p>
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

      {/* ✅ ConfirmDialog — حذف فقط */}
      <ConfirmDialog
        isOpen={!!deletingAccount}
        onClose={() => setDeletingAccount(null)}
        onConfirm={handleDelete}
        title="حذف الحساب البنكي"
        message={`هل تريد حذف "${deletingAccount?.bankName}"؟ لا يمكن التراجع.`}
        confirmText="حذف"
        variant="danger"
      />
    </div>
  );
};

export default BankAccountsPage;