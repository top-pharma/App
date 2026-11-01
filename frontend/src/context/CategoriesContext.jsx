/**
 * @file CategoriesContext.jsx
 * @description Context API لإدارة حالة التصنيفات.
 *
 * يُصدّر:
 *  - CategoriesContext
 *  - CategoriesProvider
 *  - useCategories (✅ جديد)
 *  - useCategoriesContext (✅ alias للتوافق)
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import * as categoriesAPI from '../api/categoriesAPI.js';

export const CategoriesContext = createContext(null);

const INITIAL_PAGINATION = Object.freeze({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
});

export function CategoriesProvider({ children }) {
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState(INITIAL_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCategories = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const result = await categoriesAPI.listCategories(params);
      setCategories(result.items || []);
      setPagination(result.pagination || INITIAL_PAGINATION);
      return { success: true, data: result };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل تحميل التصنيفات.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const createCategory = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const created = await categoriesAPI.createCategory(payload);
      setCategories((prev) => [...prev, created]);
      setPagination((prev) => ({ ...prev, total: prev.total + 1 }));
      return { success: true, data: created };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل إنشاء التصنيف.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const updateCategory = useCallback(async (id, payload) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await categoriesAPI.updateCategory(id, payload);
      setCategories((prev) =>
        prev.map((cat) => (cat.id === id ? updated : cat))
      );
      return { success: true, data: updated };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل تعديل التصنيف.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteCategory = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      await categoriesAPI.deleteCategory(id);
      setCategories((prev) =>
        prev.map((cat) =>
          cat.id === id ? { ...cat, isActive: false } : cat
        )
      );
      return { success: true };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل حذف التصنيف.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      categories,
      pagination,
      loading,
      error,
      fetchCategories,
      createCategory,
      updateCategory,
      deleteCategory,
      resetError: () => setError(null),
    }),
    [
      categories,
      pagination,
      loading,
      error,
      fetchCategories,
      createCategory,
      updateCategory,
      deleteCategory,
    ]
  );

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * Hooks
 * ═══════════════════════════════════════════════════════════════ */

export function useCategories() {
  const ctx = useContext(CategoriesContext);
  if (!ctx) {
    throw new Error('useCategories must be used within CategoriesProvider');
  }
  return ctx;
}

// ✅ Alias للتوافق
export const useCategoriesContext = useCategories;