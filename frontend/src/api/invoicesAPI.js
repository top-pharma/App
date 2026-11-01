/**
 * @file invoicesAPI.js
 * @description دوال API للفواتير — Phase 2.5 (المسودات + التقييد السعري).
 */

import axiosInstance from './axiosInstance.js';

// ═══════════════════════════════════════════════
// 1. القراءة
// ═══════════════════════════════════════════════

export async function listInvoices(params = {}) {
  const { data } = await axiosInstance.get('/invoices', { params });
  return data.data;
}

export async function getMyInvoices(params = {}) {
  const { data } = await axiosInstance.get('/invoices/my-invoices', { params });
  return data.data;
}

export async function getInvoice(id) {
  const { data } = await axiosInstance.get(`/invoices/${id}`);
  return data.data;
}

// ═══════════════════════════════════════════════
// 2. الإنشاء (نهائية أو مسودة)
// ═══════════════════════════════════════════════

export async function createInvoice(payload) {
  const { data } = await axiosInstance.post('/invoices', payload);
  return data.data;
}

/**
 * Phase 2.5 — إنشاء مسودة (لا تأثير على المخزون/المال).
 */
export async function createDraftInvoice(payload) {
  const { data } = await axiosInstance.post('/invoices/draft', payload);
  return data.data;
}

// ═══════════════════════════════════════════════
// 3. التعديل
// ═══════════════════════════════════════════════

export async function updateDraftInvoice(id, payload) {
  const { data } = await axiosInstance.patch(`/invoices/${id}/draft`, payload);
  return data.data;
}

export async function updateInvoice(id, payload) {
  const { data } = await axiosInstance.patch(`/invoices/${id}`, payload);
  return data.data;
}

// ═══════════════════════════════════════════════
// 4. الإجراءات
// ═══════════════════════════════════════════════

export async function finalizeInvoice(id, payload) {
  const { data } = await axiosInstance.post(`/invoices/${id}/finalize`, payload);
  return data.data;
}

export async function cancelInvoice(id, payload) {
  const { data } = await axiosInstance.patch(`/invoices/${id}/cancel`, payload);
  return data.data;
}

export async function registerPayment(id, payload) {
  const { data } = await axiosInstance.post(`/invoices/${id}/payments`, payload);
  return data.data;
}

export default {
  listInvoices,
  getMyInvoices,
  getInvoice,
  createInvoice,
  createDraftInvoice,
  updateDraftInvoice,
  updateInvoice,
  finalizeInvoice,
  cancelInvoice,
  registerPayment,
};