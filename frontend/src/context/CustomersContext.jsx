/**
 * @file CustomersContext.jsx
 * @description Context API لإدارة حالة الصيدليات.
 *
 * يُصدّر:
 *  - CustomersContext
 *  - CustomersProvider
 *  - useCustomers
 *  - useCustomersContext (✅ alias)
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import * as customersAPI from '../api/customersAPI.js';

export const CustomersContext = createContext(null);

const INITIAL_PAGINATION = Object.freeze({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
});

export function CustomersProvider({ children }) {
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState(INITIAL_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCustomers = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const result = await customersAPI.listCustomers(params);
      setCustomers(result.items || []);
      setPagination(result.pagination || INITIAL_PAGINATION);
      return { success: true, data: result };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل تحميل الصيدليات.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const createCustomer = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const created = await customersAPI.createCustomer(payload);
      setCustomers((prev) => [created, ...prev]);
      setPagination((prev) => ({ ...prev, total: prev.total + 1 }));
      return { success: true, data: created };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل إنشاء الصيدلية.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const updateCustomer = useCallback(async (id, payload) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await customersAPI.updateCustomer(id, payload);
      setCustomers((prev) => prev.map((c) => (c.id === id ? updated : c)));
      return { success: true, data: updated };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل تعديل الصيدلية.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteCustomer = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      await customersAPI.deleteCustomer(id);
      setCustomers((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isActive: false } : c))
      );
      return { success: true };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل تعطيل الصيدلية.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const reactivateCustomer = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await customersAPI.updateCustomer(id, { isActive: true });
      setCustomers((prev) => prev.map((c) => (c.id === id ? updated : c)));
      return { success: true, data: updated };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل إعادة تفعيل الصيدلية.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      customers,
      pagination,
      loading,
      error,
      fetchCustomers,
      createCustomer,
      updateCustomer,
      deleteCustomer,
      reactivateCustomer,
      resetError: () => setError(null),
    }),
    [
      customers,
      pagination,
      loading,
      error,
      fetchCustomers,
      createCustomer,
      updateCustomer,
      deleteCustomer,
      reactivateCustomer,
    ]
  );

  return (
    <CustomersContext.Provider value={value}>
      {children}
    </CustomersContext.Provider>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * Hooks
 * ═══════════════════════════════════════════════════════════════ */

export function useCustomers() {
  const ctx = useContext(CustomersContext);
  if (!ctx) {
    throw new Error('useCustomers must be used within CustomersProvider');
  }
  return ctx;
}

// ✅ Alias للتوافق
export const useCustomersContext = useCustomers;

export default useCustomers;