/**
 * BankAccountsContext.jsx
 *
 * Context لإدارة الحسابات البنكية.
 *
 * ⚠️ Phase A (2026-11-07): إصلاح showToast
 * - success/error بدل showToast.
 *
 * ⚠️ Phase A.8 (2026-11-07): إصلاح fetchAccounts
 * - bankAccountsAPI.getBankAccounts الآن يعيد { items, pagination }.
 * - fetchAccounts يقرأ result.items (وليس result.data).
 * - fallback: result.data (للتوافق مع أي API قديم).
 *
 * ⚠️ إصلاح 2026-11-12:
 * - F1: حذف نظام تفعيل/تعطيل نهائياً.
 *       - activeAccount = accounts[0] (دائماً — لا isActive).
 *       - deleteAccount = حذف فعلي (بدل soft delete).
 *       - الرسائل: "حذف" بدل "تعطيل".
 */

import { createContext, useState, useEffect, useCallback, useMemo, useContext } from 'react';
import bankAccountsAPI from '../api/bankAccountsAPI.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';

const BankAccountsContext = createContext(null);

export const BankAccountsProvider = ({ children }) => {
  const { user } = useAuth();
  const { success, error: showError } = useToast();

  const [accounts, setAccounts] = useState([]);
  const [activeAccount, setActiveAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * جلب الحسابات البنكية.
   * ✅ F1: activeAccount = accounts[0] (دائماً — لا isActive).
   */
  const fetchAccounts = useCallback(
    async (params = {}) => {
      setLoading(true);
      setError(null);
      try {
        const result = await bankAccountsAPI.getBankAccounts({ limit: 100, ...params });
        const list =
          (Array.isArray(result?.items) ? result.items : null) ||
          (Array.isArray(result?.data) ? result.data : null) ||
          [];
        setAccounts(list);
        // ✅ F1: أول حساب (دائماً) — لا حاجة لـ isActive
        setActiveAccount(list[0] || null);
      } catch (err) {
        const msg =
          err?.error?.message ||
          err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          err?.message ||
          'فشل جلب الحسابات البنكية';
        setError(msg);
        showError(msg);
      } finally {
        setLoading(false);
      }
    },
    [showError]
  );

  useEffect(() => {
    if (user) fetchAccounts();
  }, [user, fetchAccounts]);

  const createAccount = useCallback(
    async (payload) => {
      try {
        const created = await bankAccountsAPI.createBankAccount(payload);
        await fetchAccounts();
        success('تم إنشاء الحساب البنكي');
        return created;
      } catch (err) {
        const msg =
          err?.error?.message ||
          err?.response?.data?.error?.message ||
          err?.message ||
          'فشل إنشاء الحساب البنكي';
        showError(msg);
        throw err;
      }
    },
    [fetchAccounts, success, showError]
  );

  const updateAccount = useCallback(
    async (id, payload) => {
      try {
        const updated = await bankAccountsAPI.updateBankAccount(id, payload);
        await fetchAccounts();
        success('تم تحديث الحساب البنكي');
        return updated;
      } catch (err) {
        const msg =
          err?.error?.message ||
          err?.response?.data?.error?.message ||
          err?.message ||
          'فشل تحديث الحساب البنكي';
        showError(msg);
        throw err;
      }
    },
    [fetchAccounts, success, showError]
  );

  // ✅ F1: deleteAccount = حذف فعلي
  const deleteAccount = useCallback(
    async (id) => {
      try {
        await bankAccountsAPI.deleteBankAccount(id);
        await fetchAccounts();
        success('تم حذف الحساب البنكي');
      } catch (err) {
        const msg =
          err?.error?.message ||
          err?.response?.data?.error?.message ||
          err?.message ||
          'فشل حذف الحساب البنكي';
        showError(msg);
        throw err;
      }
    },
    [fetchAccounts, success, showError]
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
    [
      accounts,
      activeAccount,
      loading,
      error,
      fetchAccounts,
      createAccount,
      updateAccount,
      deleteAccount,
    ]
  );

  return (
    <BankAccountsContext.Provider value={value}>
      {children}
    </BankAccountsContext.Provider>
  );
};

export const useBankAccountsContext = () => {
  const ctx = useContext(BankAccountsContext);
  if (!ctx) {
    throw new Error('useBankAccountsContext must be used within BankAccountsProvider');
  }
  return ctx;
};

export default BankAccountsContext;