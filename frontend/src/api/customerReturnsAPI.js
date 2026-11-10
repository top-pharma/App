/**
 * @file customerReturnsAPI.js
 * @description دوال API الخاصة بمرتجعات العملاء (Customer Returns).
 *
 * ✅ 🅳 (2026-11-09):
 * - listCustomerReturns → normalizeListWithId(data) — { items, pagination }
 *   (كان: return data.data — يُرجع مصفوفة فقط، ويفقد pagination)
 */

import axiosInstance from './axiosInstance.js';
import { normalizeListWithId } from './_helpers.js';

// ═══════════════════════════════════════════════
// 1. القراءة (Read)
// ═══════════════════════════════════════════════

/**
 * جلب قائمة مرتجعات العملاء مع بحث + فلترة + Pagination.
 * @async
 * @param {Object} [params={}]
 * @returns {Promise<{ items: Array, pagination: Object }>}
 */
export async function listCustomerReturns(params = {}) {
  const { data } = await axiosInstance.get('/customer-returns', { params });
  // ✅ 🅳: normalizeListWithId(data) — { items, pagination }
  return normalizeListWithId(data);
}

/**
 * جلب مرتجع عميل واحد.
 * @async
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getCustomerReturn(id) {
  const { data } = await axiosInstance.get(`/customer-returns/${id}`);
  return data.data;
}

// ═══════════════════════════════════════════════
// 2. الإنشاء (Create)
// ═══════════════════════════════════════════════

/**
 * إنشاء مرتجع عميل جديد (يبقى pending حتى الموافقة).
 * @async
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function createCustomerReturn(payload) {
  const { data } = await axiosInstance.post('/customer-returns', payload);
  return data.data;
}

// ═══════════════════════════════════════════════
// 3. الإجراءات الخاصة (Actions)
// ═══════════════════════════════════════════════

/**
 * الموافقة على المرتجع (يُعيد المخزون ويُسوّي مالياً).
 * @async
 * @param {string} id
 * @param {Object} payload - { settledAmount, cashFund?, bankAccount?, notes? }
 * @returns {Promise<Object>}
 */
export async function approveCustomerReturn(id, payload) {
  const { data } = await axiosInstance.post(`/customer-returns/${id}/approve`, payload);
  return data.data;
}

/**
 * رفض المرتجع (مع ذكر السبب).
 * @async
 * @param {string} id
 * @param {Object} payload - { rejectionReason }
 * @returns {Promise<Object>}
 */
export async function rejectCustomerReturn(id, payload) {
  const { data } = await axiosInstance.post(`/customer-returns/${id}/reject`, payload);
  return data.data;
}

// ═══════════════════════════════════════════════
// 4. تصدير موحّد
// ═══════════════════════════════════════════════

export default {
  listCustomerReturns,
  getCustomerReturn,
  createCustomerReturn,
  approveCustomerReturn,
  rejectCustomerReturn,
};