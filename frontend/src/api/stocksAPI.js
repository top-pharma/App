/**
 * @file stocksAPI.js
 * @description دوال API للمخزون — Phase A.8.
 */

import axiosInstance from './axiosInstance.js';
import { normalizeListWithId, withId } from './_helpers.js';

// ═══════════════════════════════════════════════
// 1. القراءة
// ═══════════════════════════════════════════════

export async function listStocks(params = {}) {
  const { data } = await axiosInstance.get('/stocks', { params });
  return normalizeListWithId(data);
}

export async function getStock(id) {
  const { data } = await axiosInstance.get(`/stocks/${id}`);
  return withId(data.data);
}

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
  return withId(data.data);
}

// ═══════════════════════════════════════════════
// 3. التعديل والحذف
// ═══════════════════════════════════════════════

export async function updateStock(id, payload) {
  const { data } = await axiosInstance.patch(`/stocks/${id}`, payload);
  return withId(data.data);
}

export async function deleteStock(id) {
  const { data } = await axiosInstance.delete(`/stocks/${id}`);
  return data.data;
}

// ═══════════════════════════════════════════════
// 4. FEFO
// ═══════════════════════════════════════════════

export async function selectFEFO(payload) {
  const { data } = await axiosInstance.post('/stocks/select-fefo', payload);
  return data.data;
}

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