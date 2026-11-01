/**
 * @file ItemsContext.jsx
 * @description Context API لإدارة حالة الأصناف.
 *
 * يُصدّر:
 *  - ItemsContext
 *  - ItemsProvider
 *  - useItems (✅ جديد)
 *  - useItemsContext (✅ alias)
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import * as itemsAPI from '../api/itemsAPI.js';

export const ItemsContext = createContext(null);

const INITIAL_PAGINATION = Object.freeze({
  page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false,
});

export function ItemsProvider({ children }) {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(INITIAL_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchItems = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const result = await itemsAPI.listItems(params);
      setItems(result.items || []);
      setPagination(result.pagination || INITIAL_PAGINATION);
      return { success: true, data: result };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل تحميل الأصناف.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const createItem = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const created = await itemsAPI.createItem(payload);
      setItems((prev) => [created, ...prev]);
      setPagination((prev) => ({ ...prev, total: prev.total + 1 }));
      return { success: true, data: created };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل إنشاء الصنف.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const updateItem = useCallback(async (id, payload) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await itemsAPI.updateItem(id, payload);
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      return { success: true, data: updated };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل تعديل الصنف.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteItem = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      await itemsAPI.deleteItem(id);
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isActive: false } : i)));
      return { success: true };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل تعطيل الصنف.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const reactivateItem = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await itemsAPI.updateItem(id, { isActive: true });
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      return { success: true, data: updated };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل إعادة تفعيل الصنف.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      items, pagination, loading, error,
      fetchItems, createItem, updateItem, deleteItem, reactivateItem,
      resetError: () => setError(null),
    }),
    [items, pagination, loading, error, fetchItems, createItem, updateItem, deleteItem, reactivateItem]
  );

  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>;
}

/* ═══════════════════════════════════════════════════════════════
 * Hooks
 * ═══════════════════════════════════════════════════════════════ */

export function useItems() {
  const ctx = useContext(ItemsContext);
  if (!ctx) {
    throw new Error('useItems must be used within ItemsProvider');
  }
  return ctx;
}

// ✅ Alias للتوافق
export const useItemsContext = useItems;