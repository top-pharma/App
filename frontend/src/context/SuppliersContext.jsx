/**
 * @file SuppliersContext.jsx
 * @description Context API لإدارة حالة الموردين.
 *
 * يُصدّر:
 *  - SuppliersContext
 *  - SuppliersProvider
 *  - useSuppliers (✅ جديد)
 *  - useSuppliersContext (✅ alias)
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import * as suppliersAPI from '../api/suppliersAPI.js';

export const SuppliersContext = createContext(null);

const INITIAL_PAGINATION = Object.freeze({
  page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false,
});

export function SuppliersProvider({ children }) {
  const [suppliers, setSuppliers] = useState([]);
  const [pagination, setPagination] = useState(INITIAL_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSuppliers = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const result = await suppliersAPI.listSuppliers(params);
      setSuppliers(result.items || []);
      setPagination(result.pagination || INITIAL_PAGINATION);
      return { success: true, data: result };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل تحميل الموردين.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const createSupplier = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const created = await suppliersAPI.createSupplier(payload);
      setSuppliers((prev) => [created, ...prev]);
      setPagination((prev) => ({ ...prev, total: prev.total + 1 }));
      return { success: true, data: created };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل إنشاء المورّد.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSupplier = useCallback(async (id, payload) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await suppliersAPI.updateSupplier(id, payload);
      setSuppliers((prev) => prev.map((s) => (s.id === id ? updated : s)));
      return { success: true, data: updated };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل تعديل المورّد.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteSupplier = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      await suppliersAPI.deleteSupplier(id);
      setSuppliers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isActive: false } : s))
      );
      return { success: true };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل تعطيل المورّد.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      suppliers, pagination, loading, error,
      fetchSuppliers, createSupplier, updateSupplier, deleteSupplier,
      resetError: () => setError(null),
    }),
    [suppliers, pagination, loading, error,
     fetchSuppliers, createSupplier, updateSupplier, deleteSupplier]
  );

  return (
    <SuppliersContext.Provider value={value}>
      {children}
    </SuppliersContext.Provider>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * Hooks
 * ═══════════════════════════════════════════════════════════════ */

export function useSuppliers() {
  const ctx = useContext(SuppliersContext);
  if (!ctx) {
    throw new Error('useSuppliers must be used within SuppliersProvider');
  }
  return ctx;
}

// ✅ Alias للتوافق
export const useSuppliersContext = useSuppliers;