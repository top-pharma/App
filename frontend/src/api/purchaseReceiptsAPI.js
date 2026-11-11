/**
 * @file purchaseReceiptsAPI.js
 * @description دوال API الخاصة بإيصالات استلام البضاعة من الموردين (المشتريات).
 *
 * ⚠️ إصلاح 2026-11-10:
 *  - `listPurchaseReceipts` تستخدم `normalizeListWithId` (مثل باقي APIs).
 *  - تُرجع `{ items, pagination }` بدل `data.data` (مصفوفة).
 *  - `getPurchaseReceipt` / `createPurchaseReceipt` / إلخ — تستخدم `withId` (لإضافة `id`).
 */

import axiosInstance from './axiosInstance.js';
import { normalizeListWithId, withId } from './_helpers.js';

// ═══════════════════════════════════════════════
// 1. القراءة (Read)
// ═══════════════════════════════════════════════

/**
 * جلب قائمة إيصالات الاستلام مع بحث + فلترة + Pagination.
 * @async
 * @param {Object} [params={}]
 * @returns {Promise<{ items: Array, pagination: Object }>}
 */
export async function listPurchaseReceipts(params = {}) {
  const { data } = await axiosInstance.get('/purchase-receipts', { params });
  return normalizeListWithId(data);
}

/**
 * جلب إيصال استلام واحد.
 * @async
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getPurchaseReceipt(id) {
  const { data } = await axiosInstance.get(`/purchase-receipts/${id}`);
  return withId(data.data);
}

// ═══════════════════════════════════════════════
// 2. الإنشاء والتعديل (Create & Update)
// ═══════════════════════════════════════════════

/**
 * إنشاء مسودة إيصال استلام جديد.
 * @async
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function createPurchaseReceipt(payload) {
  const { data } = await axiosInstance.post('/purchase-receipts', payload);
  return withId(data.data);
}

/**
 * تعديل مسودة إيصال الاستلام (قبل التأكيد فقط).
 * @async
 * @param {string} id
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function updatePurchaseReceipt(id, payload) {
  const { data } = await axiosInstance.patch(`/purchase-receipts/${id}`, payload);
  return withId(data.data);
}

// ═══════════════════════════════════════════════
// 3. الإجراءات الخاصة (Actions)
// ═══════════════════════════════════════════════

/**
 * تأكيد الاستلام (draft ← received).
 * @async
 * @param {string} id
 * @param {Object} payload - { receivedAt?, notes? }
 * @returns {Promise<Object>}
 */
export async function confirmPurchaseReceipt(id, payload) {
  const { data } = await axiosInstance.post(`/purchase-receipts/${id}/confirm`, payload);
  return withId(data.data);
}

/**
 * إلغاء مسودة إيصال الاستلام (draft ← cancelled).
 * @async
 * @param {string} id
 * @param {Object} payload - { cancelReason }
 * @returns {Promise<Object>}
 */
export async function cancelPurchaseReceipt(id, payload) {
  const { data } = await axiosInstance.post(`/purchase-receipts/${id}/cancel`, payload);
  return withId(data.data);
}

// ═══════════════════════════════════════════════
// 4. تصدير موحّد
// ═══════════════════════════════════════════════

export default {
  listPurchaseReceipts,
  getPurchaseReceipt,
  createPurchaseReceipt,
  updatePurchaseReceipt,
  confirmPurchaseReceipt,
  cancelPurchaseReceipt,
};