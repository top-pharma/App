/**
 * BankAccountsContext.jsx
 *
 * Context لإدارة الحسابات البنكية.
 */

import { createContext, useState, useEffect, useCallback, useMemo, useContext } from 'react';
import bankAccountsAPI from '../api/bankAccountsAPI.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';

const BankAccountsContext = createContext(null);

export const BankAccountsProvider = ({ children }) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [accounts, setAccounts] = useState([]);
  const [activeAccount, setActiveAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAccounts = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const result = await bankAccountsAPI.getBankAccounts({ limit: 100, ...params });
      setAccounts(result.data || []);
      const active = (result.data || []).find((a) => a.isActive);
      setActiveAccount(active || null);
    } catch (err) {
      setError(err.response?.data?.message || 'فشل جلب الحسابات البنكية');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchAccounts();
  }, [user, fetchAccounts]);

  const createAccount = useCallback(
    async (payload) => {
      const created = await bankAccountsAPI.createBankAccount(payload);
      await fetchAccounts();
      showToast('تم إنشاء الحساب البنكي', 'success');
      return created;
    },
    [fetchAccounts, showToast]
  );

  const updateAccount = useCallback(
    async (id, payload) => {
      const updated = await bankAccountsAPI.updateBankAccount(id, payload);
      await fetchAccounts();
      showToast('تم تحديث الحساب البنكي', 'success');
      return updated;
    },
    [fetchAccounts, showToast]
  );

  const deleteAccount = useCallback(
    async (id) => {
      await bankAccountsAPI.deleteBankAccount(id);
      await fetchAccounts();
      showToast('تم تعطيل الحساب البنكي', 'success');
    },
    [fetchAccounts, showToast]
  );

  const value = useMemo(
    () => ({
      accounts,
      activeAccount,
      loading,
      error,
      fetchAccounts,
      createAccount,
      updateAccount,
      deleteAccount,
    }),
    [accounts, activeAccount, loading, error, fetchAccounts, createAccount, updateAccount, deleteAccount]
  );

  return <BankAccountsContext.Provider value={value}>{children}</BankAccountsContext.Provider>;
};

export const useBankAccountsContext = () => {
  const ctx = useContext(BankAccountsContext);
  if (!ctx) {
    throw new Error('useBankAccountsContext must be used within BankAccountsProvider');
  }
  return ctx;
};

export default BankAccountsContext;