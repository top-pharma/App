/**
 * @file stocksAPI.js
 * @description دوال API للمخزون — Phase 2.5.
 *
 * الجديد:
 * - ✅ getBatchesWithFefo: طلب واحد يُرجع كل الدفعات + توصية FEFO + الإجمالي.
 */

import axiosInstance from './axiosInstance.js';

// ═══════════════════════════════════════════════
// 1. القراءة
// ═══════════════════════════════════════════════

export async function listStocks(params = {}) {
  const { data } = await axiosInstance.get('/stocks', { params });
  return data.data;
}

export async function getStock(id) {
  const { data } = await axiosInstance.get(`/stocks/${id}`);
  return data.data;
}

/**
 * ✅ Phase 2.5 — endpoint مدمج.
 * يُرجع: { batches, totalAvailable, fefoRecommendation } في طلب واحد.
 *
 * @param {Object} params
 * @param {string} params.itemId
 * @param {string} params.warehouseId
 * @param {number} [params.quantity=0]
 * @returns {Promise<{ batches: Array, totalAvailable: number, fefoRecommendation: Array }>}
 */
export async function getBatchesWithFefo({ itemId, warehouseId, quantity = 0 }) {
  const { data } = await axiosInstance.get(`/stocks/by-item/${itemId}`, {
    params: { warehouse: warehouseId, quantity },
  });
  return data.data;
}

export async function getExpiringSoon() {
  const { data } = await axiosInstance.get('/stocks/expiring-soon');
  return data.data;
}

export async function getBelowReorder() {
  const { data } = await axiosInstance.get('/stocks/below-reorder');
  return data.data;
}

export async function getSummary(params = {}) {
  const { data } = await axiosInstance.get('/stocks/summary', { params });
  return data.data;
}

// ═══════════════════════════════════════════════
// 2. الإنشاء
// ═══════════════════════════════════════════════

export async function createStock(payload) {
  const { data } = await axiosInstance.post('/stocks', payload);
  return data.data;
}

// ═══════════════════════════════════════════════
// 3. التعديل والحذف
// ═══════════════════════════════════════════════

export async function updateStock(id, payload) {
  const { data } = await axiosInstance.patch(`/stocks/${id}`, payload);
  return data.data;
}

export async function deleteStock(id) {
  const { data } = await axiosInstance.delete(`/stocks/${id}`);
  return data.data;
}

// ═══════════════════════════════════════════════
// 4. FEFO (اختبار — لا يزال متاحاً)
// ═══════════════════════════════════════════════

export async function selectFEFO(payload) {
  const { data } = await axiosInstance.post('/stocks/select-fefo', payload);
  return data.data;
}

// ═══════════════════════════════════════════════
// 5. تصدير موحّد
// ═══════════════════════════════════════════════

export default {
  listStocks,
  getStock,
  getBatchesWithFefo,
  getExpiringSoon,
  getBelowReorder,
  getSummary,
  createStock,
  updateStock,
  deleteStock,
  selectFEFO,
};