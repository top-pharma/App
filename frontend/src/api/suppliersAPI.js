/**
 * @file suppliersAPI.js
 * @description دوال API للموردين — Phase A.8.
 */

import axiosInstance from './axiosInstance.js';
import { normalizeListWithId, withId } from './_helpers.js';

// ═══════════════════════════════════════════════
// 1. القراءة
// ═══════════════════════════════════════════════

export async function listSuppliers(params = {}) {
  const { data } = await axiosInstance.get('/suppliers', { params });
  return normalizeListWithId(data);
}

export async function getSupplier(id) {
  const { data } = await axiosInstance.get(`/suppliers/${id}`);
  return withId(data.data);
}

export async function getSupplierReceipts(id) {
  const { data } = await axiosInstance.get(`/suppliers/${id}/receipts`);
  return data.data;
}

// ═══════════════════════════════════════════════
// 2. الإنشاء
// ═══════════════════════════════════════════════

export async function createSupplier(payload) {
  const { data } = await axiosInstance.post('/suppliers', payload);
  return withId(data.data);
}

// ═══════════════════════════════════════════════
// 3. التعديل
// ═══════════════════════════════════════════════

export async function updateSupplier(id, payload) {
  const { data } = await axiosInstance.patch(`/suppliers/${id}`, payload);
  return withId(data.data);
}

// ═══════════════════════════════════════════════
// 4. الحذف
// ═══════════════════════════════════════════════

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