/**
 * @file WarehousesContext.jsx
 * @description Context API لإدارة حالة المخازن.
 *
 * يُصدّر:
 *  - WarehousesContext
 *  - WarehousesProvider
 *  - useWarehouses (✅ جديد)
 *  - useWarehousesContext (✅ alias)
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import * as warehousesAPI from '../api/warehousesAPI.js';

export const WarehousesContext = createContext(null);

const INITIAL_PAGINATION = Object.freeze({
  page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false,
});

export function WarehousesProvider({ children }) {
  const [warehouses, setWarehouses] = useState([]);
  const [pagination, setPagination] = useState(INITIAL_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchWarehouses = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const result = await warehousesAPI.listWarehouses(params);
      setWarehouses(result.items || []);
      setPagination(result.pagination || INITIAL_PAGINATION);
      return { success: true, data: result };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل تحميل المخازن.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const createWarehouse = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const created = await warehousesAPI.createWarehouse(payload);
      return { success: true, data: created, needsRefresh: true };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل إنشاء المخزن.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const updateWarehouse = useCallback(async (id, payload) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await warehousesAPI.updateWarehouse(id, payload);
      setWarehouses((prev) => prev.map((w) => (w.id === id ? updated : w)));
      return { success: true, data: updated };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل تعديل المخزن.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteWarehouse = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      await warehousesAPI.deleteWarehouse(id);
      setWarehouses((prev) =>
        prev.map((w) => (w.id === id ? { ...w, isActive: false } : w))
      );
      return { success: true };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل تعطيل المخزن.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const setAsMain = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      await warehousesAPI.setWarehouseAsMain(id);
      return { success: true, needsRefresh: true };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل تعيين المخزن رئيسياً.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const setAsDefault = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      await warehousesAPI.setWarehouseAsDefault(id);
      return { success: true, needsRefresh: true };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل تعيين المخزن افتراضياً.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const reactivateWarehouse = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await warehousesAPI.updateWarehouse(id, { isActive: true });
      setWarehouses((prev) => prev.map((w) => (w.id === id ? updated : w)));
      return { success: true, data: updated };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل إعادة تفعيل المخزن.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      warehouses, pagination, loading, error,
      fetchWarehouses, createWarehouse, updateWarehouse, deleteWarehouse,
      setAsMain, setAsDefault, reactivateWarehouse,
      resetError: () => setError(null),
    }),
    [warehouses, pagination, loading, error,
     fetchWarehouses, createWarehouse, updateWarehouse, deleteWarehouse,
     setAsMain, setAsDefault, reactivateWarehouse]
  );

  return (
    <WarehousesContext.Provider value={value}>
      {children}
    </WarehousesContext.Provider>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * Hooks
 * ═══════════════════════════════════════════════════════════════ */

export function useWarehouses() {
  const ctx = useContext(WarehousesContext);
  if (!ctx) {
    throw new Error('useWarehouses must be used within WarehousesProvider');
  }
  return ctx;
}

// ✅ Alias للتوافق
export const useWarehousesContext = useWarehouses;