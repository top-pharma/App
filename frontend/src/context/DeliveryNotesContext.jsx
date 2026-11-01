/**
 * @file DeliveryNotesContext.jsx
 * @description Context API لإدارة حالة إيصالات التسليم.
 *
 * يُصدّر:
 *  - DeliveryNotesContext
 *  - DeliveryNotesProvider
 *  - useDeliveryNotes (✅ جديد)
 *  - useDeliveryNotesContext (✅ alias)
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import * as deliveryNotesAPI from '../api/deliveryNotesAPI.js';

export const DeliveryNotesContext = createContext(null);

const INITIAL_PAGINATION = Object.freeze({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
});

const INITIAL_STATS = Object.freeze({
  total: 0,
  pending: 0,
  delivered: 0,
});

export function DeliveryNotesProvider({ children }) {
  const [deliveryNotes, setDeliveryNotes] = useState([]);
  const [pagination, setPagination] = useState(INITIAL_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(INITIAL_STATS);

  const fetchDeliveryNotes = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const result = await deliveryNotesAPI.listDeliveryNotes(params);
      setDeliveryNotes(result.items || []);
      setPagination(result.pagination || INITIAL_PAGINATION);
      if (!params.status && !params.paymentPlan && !params.notDelivered) {
        setStats((prev) => ({ ...prev, total: result.pagination?.total || 0 }));
      }
      return { success: true, data: result };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل تحميل إيصالات التسليم.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const [totalRes, pendingRes, deliveredRes] = await Promise.all([
        deliveryNotesAPI.listDeliveryNotes({ limit: 1 }),
        deliveryNotesAPI.listDeliveryNotes({ notDelivered: true, limit: 1 }),
        deliveryNotesAPI.listDeliveryNotes({ status: 'delivered', limit: 1 }),
      ]);
      setStats({
        total: totalRes.pagination?.total || 0,
        pending: pendingRes.pagination?.total || 0,
        delivered: deliveredRes.pagination?.total || 0,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message };
    }
  }, []);

  const createDeliveryNote = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const created = await deliveryNotesAPI.createDeliveryNote(payload);
      return { success: true, data: created, needsRefresh: true };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل إنشاء إيصال التسليم.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const updateDeliveryNote = useCallback(async (id, payload) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await deliveryNotesAPI.updateDeliveryNote(id, payload);
      setDeliveryNotes((prev) =>
        prev.map((note) => (note.id === id ? updated : note))
      );
      return { success: true, data: updated };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل تعديل إيصال التسليم.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const markDelivered = useCallback(async (id, payload) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await deliveryNotesAPI.markDelivered(id, payload);
      setDeliveryNotes((prev) =>
        prev.map((note) => (note.id === id ? updated : note))
      );
      return { success: true, data: updated, needsRefresh: true };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل تعليم الإيصال كمُسلَّم.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      deliveryNotes,
      pagination,
      loading,
      error,
      stats,
      fetchDeliveryNotes,
      fetchStats,
      createDeliveryNote,
      updateDeliveryNote,
      markDelivered,
      resetError: () => setError(null),
    }),
    [
      deliveryNotes,
      pagination,
      loading,
      error,
      stats,
      fetchDeliveryNotes,
      fetchStats,
      createDeliveryNote,
      updateDeliveryNote,
      markDelivered,
    ]
  );

  return (
    <DeliveryNotesContext.Provider value={value}>
      {children}
    </DeliveryNotesContext.Provider>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * Hooks
 * ═══════════════════════════════════════════════════════════════ */

export function useDeliveryNotes() {
  const ctx = useContext(DeliveryNotesContext);
  if (!ctx) {
    throw new Error(
      'useDeliveryNotes must be used within DeliveryNotesProvider'
    );
  }
  return ctx;
}

// ✅ Alias للتوافق
export const useDeliveryNotesContext = useDeliveryNotes;