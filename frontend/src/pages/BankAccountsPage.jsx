/**
 * BankAccountsPage.jsx
 *
 * صفحة إدارة الحساب البنكي (حساب واحد فقط).
 */

import { useState, useEffect } from 'react';
import { Plus, Edit, Power } from 'lucide-react';
import { useBankAccountsContext } from '../context/BankAccountsContext.jsx';
import { useToast } from '../hooks/useToast.js';
import Button from '../components/UI/Button.jsx';
import Table from '../components/UI/Table.jsx';
import Loading from '../components/UI/Loading.jsx';
import ConfirmDialog from '../components/UI/ConfirmDialog.jsx';
import BankAccountForm from '../components/Finance/BankAccountForm.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';

const BankAccountsPage = () => {
  const { accounts, loading, fetchAccounts, createAccount, updateAccount, deleteAccount } = useBankAccountsContext();
  const { showToast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [deactivatingAccount, setDeactivatingAccount] = useState(null);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleCreate = () => {
    setEditingAccount(null);
    setIsFormOpen(true);
  };

  const handleEdit = (account) => {
    setEditingAccount(account);
    setIsFormOpen(true);
  };

  const handleSubmit = async (payload) => {
    if (editingAccount) {
      await updateAccount(editingAccount._id, payload);
    } else {
      await createAccount(payload);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivatingAccount) return;
    try {
      await deleteAccount(deactivatingAccount._id);
      setDeactivatingAccount(null);
    } catch (err) {
      showToast(err.response?.data?.message || 'فشل التعطيل', 'error');
    }
  };

  const columns = [
    {
      header: 'البنك',
      accessor: 'bankName',
      cell: (row) => (
        <div>
          <p className="font-medium">{row.bankName}</p>
          {row.branch && <p className="text-xs text-gray-500">{row.branch}</p>}
        </div>
      ),
    },
    {
      header: 'رقم الحساب',
      accessor: 'accountNumber',
      cell: (row) => <span className="font-mono">{row.accountNumber}</span>,
    },
    { header: 'صاحب الحساب', accessor: 'accountName' },
    {
      header: 'الرصيد',
      accessor: 'balance',
      cell: (row) => (
        <span className="font-bold text-green-700">{formatCurrency(row.balance)} SDG</span>
      ),
    },
    {
      header: 'الحالة',
      accessor: 'isActive',
      cell: (row) =>
        row.isActive ? (
          <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">نشط</span>
        ) : (
          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">معطّل</span>
        ),
    },
    {
      header: 'تاريخ الإنشاء',
      accessor: 'createdAt',
      cell: (row) => formatDate(row.createdAt),
    },
    {
      header: 'إجراءات',
      cell: (row) => (
        <div className="flex gap-1">
          <button
            onClick={() => handleEdit(row)}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
            title="تعديل"
          >
            <Edit size={16} />
          </button>
          {row.isActive && (
            <button
              onClick={() => setDeactivatingAccount(row)}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded"
              title="تعطيل"
            >
              <Power size={16} />
            </button>
          )}
        </div>
      ),
    },
  ];

  if (loading && accounts.length === 0) return <Loading />;

  const activeAccount = accounts.find((a) => a.isActive);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الحساب البنكي</h1>
          <p className="text-gray-600 text-sm mt-1">حساب واحد نشط فقط</p>
        </div>
        <Button onClick={handleCreate} variant="primary">
          <Plus size={18} className="inline ml-1" /> حساب جديد
        </Button>
      </div>

      {activeAccount && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl p-6 mb-6">
          <p className="text-sm opacity-90 mb-1">الرصيد الحالي</p>
          <p className="text-3xl font-bold">{formatCurrency(activeAccount.balance)} SDG</p>
          <p className="text-sm mt-2 opacity-90">
            {activeAccount.bankName} — {activeAccount.accountNumber}
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <Table columns={columns} data={accounts} emptyMessage="لا يوجد حساب بنكي بعد" />
      </div>

      <BankAccountForm
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingAccount(null); }}
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
    </div>
  );
};

export default BankAccountsPage;