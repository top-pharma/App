/**
 * @file suppliersAPI.js
 * @description دوال API الخاصة بالموردين.
 */

import axiosInstance from './axiosInstance.js';

// ═══════════════════════════════════════════════
// 1. القراءة
// ═══════════════════════════════════════════════

/**
 * جلب قائمة الموردين.
 * @async
 * @param {Object} [params={}]
 * @returns {Promise<{ items: Array, pagination: Object }>}
 */
export async function listSuppliers(params = {}) {
  const { data } = await axiosInstance.get('/suppliers', { params });
  return data.data;
}

/**
 * جلب مورّد واحد.
 * @async
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getSupplier(id) {
  const { data } = await axiosInstance.get(`/suppliers/${id}`);
  return data.data;
}

/**
 * جلب سجل استلامات المورّد (stub حالياً — Phase 2).
 * @async
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getSupplierReceipts(id) {
  const { data } = await axiosInstance.get(`/suppliers/${id}/receipts`);
  return data.data;
}

// ═══════════════════════════════════════════════
// 2. الإنشاء
// ═══════════════════════════════════════════════

/**
 * إنشاء مورّد جديد.
 * @async
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function createSupplier(payload) {
  const { data } = await axiosInstance.post('/suppliers', payload);
  return data.data;
}

// ═══════════════════════════════════════════════
// 3. التعديل
// ═══════════════════════════════════════════════

/**
 * تعديل مورّد.
 * @async
 * @param {string} id
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function updateSupplier(id, payload) {
  const { data } = await axiosInstance.patch(`/suppliers/${id}`, payload);
  return data.data;
}

// ═══════════════════════════════════════════════
// 4. الحذف
// ═══════════════════════════════════════════════

/**
 * تعطيل مورّد.
 * @async
 * @param {string} id
 * @returns {Promise<{ message: string }>}
 */
export async function deleteSupplier(id) {
  const { data } = await axiosInstance.delete(`/suppliers/${id}`);
  return data.data;
}

export default {
  listSuppliers,
  getSupplier,
  getSupplierReceipts,
  createSupplier,
  updateSupplier,
  deleteSupplier,
};