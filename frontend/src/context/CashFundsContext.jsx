/**
 * CashFundsContext.jsx
 *
 * Context لإدارة صناديق النقدية في الواجهة.
 * يُوفّر: قائمة الصناديق، الصندوق الافتراضي، دوال CRUD، حركات.
 *
 * ⚠️ Phase A (2026-11-07): إصلاح showToast
 * - success/error بدل showToast.
 *
 * ⚠️ Phase A.8 (2026-11-07): إصلاح fetchFunds
 * - cashFundsAPI.getCashFunds الآن يعيد { items, pagination }.
 * - fetchFunds يقرأ result.items (وليس result.data).
 * - fallback: result.data (للتوافق مع أي API قديم).
 */

import { createContext, useState, useEffect, useCallback, useMemo, useContext } from 'react';
import cashFundsAPI from '../api/cashFundsAPI.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';

const CashFundsContext = createContext(null);

export const CashFundsProvider = ({ children }) => {
  const { user } = useAuth();
  const { success, error: showError } = useToast();

  const [funds, setFunds] = useState([]);
  const [defaultFund, setDefaultFund] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * جلب الصناديق من API.
   * ⚠️ Phase A.8: result = { items, pagination } (من normalizeListWithId).
   */
  const fetchFunds = useCallback(
    async (params = {}) => {
      setLoading(true);
      setError(null);
      try {
        const result = await cashFundsAPI.getCashFunds({ limit: 100, ...params });
        // ⚠️ Phase A.8: result.items (مع fallback لـ result.data)
        const list =
          (Array.isArray(result?.items) ? result.items : null) ||
          (Array.isArray(result?.data) ? result.data : null) ||
          [];
        setFunds(list);
        const def = list.find((f) => f.isDefault && f.isActive);
        setDefaultFund(def || null);
      } catch (err) {
        const msg =
          err?.error?.message ||
          err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          err?.message ||
          'فشل جلب الصناديق';
        setError(msg);
        showError(msg);
      } finally {
        setLoading(false);
      }
    },
    [showError]
  );

  // تحميل أولي عند تسجيل الدخول
  useEffect(() => {
    if (user) fetchFunds();
  }, [user, fetchFunds]);

  /**
   * إنشاء صندوق.
   */
  const createFund = useCallback(
    async (payload) => {
      try {
        const created = await cashFundsAPI.createCashFund(payload);
        await fetchFunds();
        success('تم إنشاء الصندوق');
        return created;
      } catch (err) {
        const msg =
          err?.error?.message ||
          err?.response?.data?.error?.message ||
          err?.message ||
          'فشل إنشاء الصندوق';
        showError(msg);
        throw err;
      }
    },
    [fetchFunds, success, showError]
  );

  /**
   * تحديث صندوق.
   */
  const updateFund = useCallback(
    async (id, payload) => {
      try {
        const updated = await cashFundsAPI.updateCashFund(id, payload);
        await fetchFunds();
        success('تم تحديث الصندوق');
        return updated;
      } catch (err) {
        const msg =
          err?.error?.message ||
          err?.response?.data?.error?.message ||
          err?.message ||
          'فشل تحديث الصندوق';
        showError(msg);
        throw err;
      }
    },
    [fetchFunds, success, showError]
  );

  /**
   * حذف صندوق.
   */
  const deleteFund = useCallback(
    async (id) => {
      try {
        await cashFundsAPI.deleteCashFund(id);
        await fetchFunds();
        success('تم حذف/تعطيل الصندوق');
      } catch (err) {
        const msg =
          err?.error?.message ||
          err?.response?.data?.error?.message ||
          err?.message ||
          'فشل حذف الصندوق';
        showError(msg);
        throw err;
      }
    },
    [fetchFunds, success, showError]
  );

  /**
   * تعيين كافتراضي.
   */
  const setAsDefault = useCallback(
    async (id) => {
      try {
        await cashFundsAPI.setDefaultCashFund(id);
        await fetchFunds();
        success('تم تعيين الصندوق كافتراضي');
      } catch (err) {
        const msg =
          err?.error?.message ||
          err?.response?.data?.error?.message ||
          err?.message ||
          'فشل تعيين الصندوق كافتراضي';
        showError(msg);
        throw err;
      }
    },
    [fetchFunds, success, showError]
  );

  /**
   * إيداع/سحب نقدي.
   */
  const movement = useCallback(
    async (id, payload) => {
      try {
        const result = await cashFundsAPI.cashFundMovement(id, payload);
        await fetchFunds();
        success(payload.type === 'deposit' ? 'تم الإيداع' : 'تم السحب');
        return result;
      } catch (err) {
        const msg =
          err?.error?.message ||
          err?.response?.data?.error?.message ||
          err?.message ||
          'فشل تنفيذ الحركة';
        showError(msg);
        throw err;
      }
    },
    [fetchFunds, success, showError]
  );

  const value = useMemo(
    () => ({
      funds,
      defaultFund,
      loading,
      error,
      fetchFunds,
      createFund,
      updateFund,
      deleteFund,
      setAsDefault,
      movement,
    }),
    [
      funds,
      defaultFund,
      loading,
      error,
      fetchFunds,
      createFund,
      updateFund,
      deleteFund,
      setAsDefault,
      movement,
    ]
  );

  return (
    <CashFundsContext.Provider value={value}>{children}</CashFundsContext.Provider>
  );
};

/**
 * Hook لاستخدام CashFundsContext.
 */
export const useCashFundsContext = () => {
  const ctx = useContext(CashFundsContext);
  if (!ctx) {
    throw new Error('useCashFundsContext must be used within CashFundsProvider');
  }
  return ctx;
};

export default CashFundsContext;