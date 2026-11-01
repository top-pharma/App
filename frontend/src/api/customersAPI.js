/**
 * @file customersAPI.js
 * @description دوال API الخاصة بالصيدليات (العملاء).
 */

import axiosInstance from './axiosInstance.js';

// ═══════════════════════════════════════════════
// 1. القراءة
// ═══════════════════════════════════════════════

/**
 * جلب قائمة الصيدليات.
 * @async
 * @param {Object} [params={}]
 * @returns {Promise<{ items: Array, pagination: Object }>}
 */
export async function listCustomers(params = {}) {
  const { data } = await axiosInstance.get('/customers', { params });
  return data.data;
}

/**
 * جلب صيدلية واحدة.
 * @async
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getCustomer(id) {
  const { data } = await axiosInstance.get(`/customers/${id}`);
  return data.data;
}

/**
 * جلب فواتير الصيدلية (stub حالياً).
 * @async
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getCustomerInvoices(id) {
  const { data } = await axiosInstance.get(`/customers/${id}/invoices`);
  return data.data;
}

/**
 * جلب رصيد الصيدلية.
 * @async
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getCustomerBalance(id) {
  const { data } = await axiosInstance.get(`/customers/${id}/balance`);
  return data.data;
}

/**
 * جلب كشف حساب (stub حالياً).
 * @async
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getCustomerStatement(id) {
  const { data } = await axiosInstance.get(`/customers/${id}/statement`);
  return data.data;
}

// ═══════════════════════════════════════════════
// 2. الإنشاء
// ═══════════════════════════════════════════════

/**
 * إنشاء صيدلية جديدة.
 * @async
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function createCustomer(payload) {
  const { data } = await axiosInstance.post('/customers', payload);
  return data.data;
}

// ═══════════════════════════════════════════════
// 3. التعديل
// ═══════════════════════════════════════════════

/**
 * تعديل صيدلية.
 * @async
 * @param {string} id
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function updateCustomer(id, payload) {
  const { data } = await axiosInstance.patch(`/customers/${id}`, payload);
  return data.data;
}

// ═══════════════════════════════════════════════
// 4. الحذف
// ═══════════════════════════════════════════════

/**
 * تعطيل صيدلية.
 * @async
 * @param {string} id
 * @returns {Promise<{ message: string }>}
 */
export async function deleteCustomer(id) {
  const { data } = await axiosInstance.delete(`/customers/${id}`);
  return data.data;
}

export default {
  listCustomers,
  getCustomer,
  getCustomerInvoices,
  getCustomerBalance,
  getCustomerStatement,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};