/**
 * @file InvoicesContext.jsx
 * @description Context الفواتير — Phase 2.5.
 *
 * يُصدّر:
 *  - InvoicesContext
 *  - InvoicesProvider
 *  - useInvoices (✅ جديد)
 *  - useInvoicesContext (✅ alias)
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import * as invoicesAPI from '../api/invoicesAPI.js';

export const InvoicesContext = createContext(null);

const INITIAL_PAGINATION = Object.freeze({
  page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false,
});

const INITIAL_STATS = Object.freeze({
  total: 0, unpaid: 0, overdue: 0, drafts: 0,
});

export function InvoicesProvider({ children }) {
  const [invoices, setInvoices] = useState([]);
  const [pagination, setPagination] = useState(INITIAL_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(INITIAL_STATS);

  const fetchInvoices = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoicesAPI.listInvoices(params);
      setInvoices(result.items || []);
      setPagination(result.pagination || INITIAL_PAGINATION);
      if (!params.status && !params.paymentType && !params.overdue && !params.unpaid && !params.isDraft) {
        setStats((prev) => ({ ...prev, total: result.pagination?.total || 0 }));
      }
      return { success: true, data: result };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل تحميل الفواتير.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const [totalRes, unpaidRes, overdueRes, draftRes] = await Promise.all([
        invoicesAPI.listInvoices({ limit: 1 }),
        invoicesAPI.listInvoices({ unpaid: true, limit: 1 }),
        invoicesAPI.listInvoices({ overdue: true, limit: 1 }),
        invoicesAPI.listInvoices({ isDraft: true, limit: 1 }),
      ]);
      setStats({
        total: totalRes.pagination?.total || 0,
        unpaid: unpaidRes.pagination?.total || 0,
        overdue: overdueRes.pagination?.total || 0,
        drafts: draftRes.pagination?.total || 0,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message };
    }
  }, []);

  const createInvoice = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const created = await invoicesAPI.createInvoice(payload);
      return { success: true, data: created, needsRefresh: true };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل إنشاء الفاتورة.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const createDraft = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const created = await invoicesAPI.createDraftInvoice(payload);
      setInvoices((prev) => [created, ...prev]);
      setStats((prev) => ({ ...prev, total: prev.total + 1, drafts: prev.drafts + 1 }));
      return { success: true, data: created };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل إنشاء المسودة.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const updateDraft = useCallback(async (id, payload) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await invoicesAPI.updateDraftInvoice(id, payload);
      setInvoices((prev) => prev.map((inv) => (inv.id === id ? updated : inv)));
      return { success: true, data: updated };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل تعديل المسودة.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const finalize = useCallback(async (id, payload) => {
    setLoading(true);
    setError(null);
    try {
      const finalized = await invoicesAPI.finalizeInvoice(id, payload);
      setInvoices((prev) => prev.map((inv) => (inv.id === id ? finalized : inv)));
      setStats((prev) => ({
        ...prev,
        drafts: Math.max(0, prev.drafts - 1),
        unpaid: prev.unpaid + 1,
      }));
      return { success: true, data: finalized, needsRefresh: true };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل اعتماد المسودة.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const updateInvoice = useCallback(async (id, payload) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await invoicesAPI.updateInvoice(id, payload);
      setInvoices((prev) => prev.map((inv) => (inv.id === id ? updated : inv)));
      return { success: true, data: updated };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل تعديل الفاتورة.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const cancelInvoice = useCallback(async (id, payload) => {
    setLoading(true);
    setError(null);
    try {
      const cancelled = await invoicesAPI.cancelInvoice(id, payload);
      setInvoices((prev) => prev.map((inv) => (inv.id === id ? cancelled : inv)));
      return { success: true, data: cancelled, needsRefresh: true };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل إلغاء الفاتورة.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const registerPayment = useCallback(async (id, payload) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await invoicesAPI.registerPayment(id, payload);
      setInvoices((prev) => prev.map((inv) => (inv.id === id ? updated : inv)));
      return { success: true, data: updated, needsRefresh: true };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل تسجيل الدفعة.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      invoices, pagination, loading, error, stats,
      fetchInvoices, fetchStats,
      createInvoice,
      createDraft,
      updateDraft,
      finalize,
      updateInvoice,
      cancelInvoice,
      registerPayment,
      resetError: () => setError(null),
    }),
    [invoices, pagination, loading, error, stats, fetchInvoices, fetchStats,
     createInvoice, createDraft, updateDraft, finalize, updateInvoice,
     cancelInvoice, registerPayment]
  );

  return (
    <InvoicesContext.Provider value={value}>
      {children}
    </InvoicesContext.Provider>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * Hooks
 * ═══════════════════════════════════════════════════════════════ */

export function useInvoices() {
  const ctx = useContext(InvoicesContext);
  if (!ctx) {
    throw new Error('useInvoices must be used within InvoicesProvider');
  }
  return ctx;
}

// ✅ Alias للتوافق
export const useInvoicesContext = useInvoices;