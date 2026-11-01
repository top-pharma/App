/**
 * @file ChecksContext.jsx
 * @description
 * Context للشيكات — النسخة المبسطة (Phase 3).
 * استُبدل collect/pay بـ settle.
 */

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useContext,
} from 'react';
import checksAPI from '../api/checksAPI.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';

const ChecksContext = createContext(null);

export const ChecksProvider = ({ children }) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [checks, setChecks] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [overdue, setOverdue] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchChecks = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const result = await checksAPI.getChecks({ limit: 100, ...params });
      setChecks(result.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'فشل جلب الشيكات');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUpcoming = useCallback(async (days = 7) => {
    try {
      const result = await checksAPI.getUpcomingChecks(days);
      setUpcoming(result || []);
    } catch (err) {
      // صامت
    }
  }, []);

  const fetchOverdue = useCallback(async () => {
    try {
      const result = await checksAPI.getOverdueChecks();
      setOverdue(result || []);
    } catch (err) {
      // صامت
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchChecks();
      fetchUpcoming();
      fetchOverdue();
    }
  }, [user, fetchChecks, fetchUpcoming, fetchOverdue]);

  const createCheck = useCallback(
    async (payload) => {
      const created = await checksAPI.createCheck(payload);
      await Promise.all([fetchChecks(), fetchUpcoming(), fetchOverdue()]);
      showToast('تم تسجيل الشيك (بانتظار الصرف)', 'success');
      return created;
    },
    [fetchChecks, fetchUpcoming, fetchOverdue, showToast]
  );

  const settle = useCallback(
    async (id, payload) => {
      const result = await checksAPI.settleCheck(id, payload);
      await Promise.all([fetchChecks(), fetchUpcoming(), fetchOverdue()]);
      showToast('تم تسجيل صرف الشيك — تم تحديث الأرصدة', 'success');
      return result;
    },
    [fetchChecks, fetchUpcoming, fetchOverdue, showToast]
  );

  const bounce = useCallback(
    async (id, reason) => {
      const result = await checksAPI.bounceCheck(id, reason);
      await Promise.all([fetchChecks(), fetchUpcoming(), fetchOverdue()]);
      showToast('تم تسجيل ارتداد الشيك — تم عكس الحركة', 'warning');
      return result;
    },
    [fetchChecks, fetchUpcoming, fetchOverdue, showToast]
  );

  const cancel = useCallback(
    async (id, reason) => {
      const result = await checksAPI.cancelCheck(id, reason);
      await Promise.all([fetchChecks(), fetchUpcoming(), fetchOverdue()]);
      showToast('تم إلغاء الشيك', 'success');
      return result;
    },
    [fetchChecks, fetchUpcoming, fetchOverdue, showToast]
  );

  const value = useMemo(
    () => ({
      checks,
      upcoming,
      overdue,
      loading,
      error,
      fetchChecks,
      fetchUpcoming,
      fetchOverdue,
      createCheck,
      settle,
      bounce,
      cancel,
    }),
    [
      checks,
      upcoming,
      overdue,
      loading,
      error,
      fetchChecks,
      fetchUpcoming,
      fetchOverdue,
      createCheck,
      settle,
      bounce,
      cancel,
    ]
  );

  return (
    <ChecksContext.Provider value={value}>{children}</ChecksContext.Provider>
  );
};

export const useChecksContext = () => {
  const ctx = useContext(ChecksContext);
  if (!ctx) {
    throw new Error('useChecksContext must be used within ChecksProvider');
  }
  return ctx;
};

export default ChecksContext;