/**
 * CashFundsContext.jsx
 *
 * Context لإدارة صناديق النقدية في الواجهة.
 * يُوفّر: قائمة الصناديق، الصندوق الافتراضي، دوال CRUD، حركات.
 */

import { createContext, useState, useEffect, useCallback, useMemo, useContext } from 'react';
import cashFundsAPI from '../api/cashFundsAPI.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';

const CashFundsContext = createContext(null);

export const CashFundsProvider = ({ children }) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [funds, setFunds] = useState([]);
  const [defaultFund, setDefaultFund] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * جلب الصناديق من API.
   */
  const fetchFunds = useCallback(
    async (params = {}) => {
      setLoading(true);
      setError(null);
      try {
        const result = await cashFundsAPI.getCashFunds({ limit: 100, ...params });
        setFunds(result.data || []);
        const def = (result.data || []).find((f) => f.isDefault && f.isActive);
        setDefaultFund(def || null);
      } catch (err) {
        setError(err.response?.data?.message || 'فشل جلب الصناديق');
      } finally {
        setLoading(false);
      }
    },
    []
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
      const created = await cashFundsAPI.createCashFund(payload);
      await fetchFunds();
      showToast('تم إنشاء الصندوق', 'success');
      return created;
    },
    [fetchFunds, showToast]
  );

  /**
   * تحديث صندوق.
   */
  const updateFund = useCallback(
    async (id, payload) => {
      const updated = await cashFundsAPI.updateCashFund(id, payload);
      await fetchFunds();
      showToast('تم تحديث الصندوق', 'success');
      return updated;
    },
    [fetchFunds, showToast]
  );

  /**
   * حذف صندوق.
   */
  const deleteFund = useCallback(
    async (id) => {
      await cashFundsAPI.deleteCashFund(id);
      await fetchFunds();
      showToast('تم حذف/تعطيل الصندوق', 'success');
    },
    [fetchFunds, showToast]
  );

  /**
   * تعيين كافتراضي.
   */
  const setAsDefault = useCallback(
    async (id) => {
      await cashFundsAPI.setDefaultCashFund(id);
      await fetchFunds();
      showToast('تم تعيين الصندوق كافتراضي', 'success');
    },
    [fetchFunds, showToast]
  );

  /**
   * إيداع/سحب نقدي.
   */
  const movement = useCallback(
    async (id, payload) => {
      const result = await cashFundsAPI.cashFundMovement(id, payload);
      await fetchFunds();
      showToast(payload.type === 'deposit' ? 'تم الإيداع' : 'تم السحب', 'success');
      return result;
    },
    [fetchFunds, showToast]
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
    [funds, defaultFund, loading, error, fetchFunds, createFund, updateFund, deleteFund, setAsDefault, movement]
  );

  return <CashFundsContext.Provider value={value}>{children}</CashFundsContext.Provider>;
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