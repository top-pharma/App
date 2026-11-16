/**
 * @file SalesRepTransactionsContext.jsx
 * @description Context لإدارة حركات المندوب.
 *
 * ✅ v10.9 (2026-11-16) — جديد.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import * as api from '../api/salesRepTransactionsAPI.js';

export const SalesRepTransactionsContext = createContext(null);

export function SalesRepTransactionsProvider({ children }) {
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTransactions = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listTransactions(params);
      setTransactions(result.items || []);
      setPagination(result.pagination || {});
    } catch (err) {
      setError(err?.error?.message || err?.message || 'فشل تحميل الحركات.');
    } finally {
      setLoading(false);
    }
  }, []);

  const createTransaction = useCallback(async (payload) => {
    try {
      const created = await api.createTransaction(payload);
      return { success: true, data: created };
    } catch (err) {
      return { success: false, error: err?.error?.message || err?.message };
    }
  }, []);

  const approveTransaction = useCallback(async (id, payload) => {
    try {
      const updated = await api.approveTransaction(id, payload);
      return { success: true, data: updated };
    } catch (err) {
      return { success: false, error: err?.error?.message || err?.message };
    }
  }, []);

  const payTransaction = useCallback(async (id, payload) => {
    try {
      const updated = await api.payTransaction(id, payload);
      return { success: true, data: updated };
    } catch (err) {
      return { success: false, error: err?.error?.message || err?.message };
    }
  }, []);

  const cancelTransaction = useCallback(async (id, payload) => {
    try {
      const updated = await api.cancelTransaction(id, payload);
      return { success: true, data: updated };
    } catch (err) {
      return { success: false, error: err?.error?.message || err?.message };
    }
  }, []);

  const resetError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({
      transactions,
      pagination,
      loading,
      error,
      fetchTransactions,
      createTransaction,
      approveTransaction,
      payTransaction,
      cancelTransaction,
      resetError,
    }),
    [transactions, pagination, loading, error, fetchTransactions, createTransaction, approveTransaction, payTransaction, cancelTransaction, resetError]
  );

  return (
    <SalesRepTransactionsContext.Provider value={value}>
      {children}
    </SalesRepTransactionsContext.Provider>
  );
}

export function useSalesRepTransactions() {
  const ctx = useContext(SalesRepTransactionsContext);
  if (!ctx) {
    throw new Error('useSalesRepTransactions must be used within SalesRepTransactionsProvider');
  }
  return ctx;
}

export default SalesRepTransactionsContext;