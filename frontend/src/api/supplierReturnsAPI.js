/**
 * @file supplierReturnsAPI.js
 * @description دوال API الخاصة بمرتجعات الموردين (Supplier Returns).
 *
 * لماذا هذا الملف؟
 * - يفصل منطق الاتصال بالخادم عن المكونات.
 * - يُوحّد شكل الاستدعاءات مع بقية ملفات API.
 * - يدعم دورة حياة المرتجع كاملة (مسودة ← مُرسل ← مقبول/مرفوض).
 */

import axiosInstance from './axiosInstance.js';

// ═══════════════════════════════════════════════
// 1. القراءة (Read)
// ═══════════════════════════════════════════════

/**
 * جلب قائمة مرتجعات الموردين مع بحث + فلترة + Pagination.
 * @async
 * @param {Object} [params={}]
 * @returns {Promise<{ items: Array, pagination: Object }>}
 */
export async function listSupplierReturns(params = {}) {
  const { data } = await axiosInstance.get('/supplier-returns', { params });
  return data.data;
}

/**
 * جلب مرتجع مورد واحد.
 * @async
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getSupplierReturn(id) {
  const { data } = await axiosInstance.get(`/supplier-returns/${id}`);
  return data.data;
}

// ═══════════════════════════════════════════════
// 2. الإنشاء والتعديل (Create & Update)
// ═══════════════════════════════════════════════

/**
 * إنشاء مسودة مرتجع مورد جديد.
 * @async
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function createSupplierReturn(payload) {
  const { data } = await axiosInstance.post('/supplier-returns', payload);
  return data.data;
}

/**
 * تعديل مسودة مرتجع مورد (قبل الإرسال فقط).
 * @async
 * @param {string} id
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function updateSupplierReturn(id, payload) {
  const { data } = await axiosInstance.patch(`/supplier-returns/${id}`, payload);
  return data.data;
}

// ═══════════════════════════════════════════════
// 3. الإجراءات الخاصة (Actions)
// ═══════════════════════════════════════════════

/**
 * إرسال المرتجع إلى المورّد (draft ← sent).
 * @async
 * @param {string} id
 * @param {Object} payload - { notes? }
 * @returns {Promise<Object>}
 */
export async function sendSupplierReturn(id, payload) {
  const { data } = await axiosInstance.post(`/supplier-returns/${id}/send`, payload);
  return data.data;
}

/**
 * قبول المرتجع من المورّد (sent ← accepted).
 * يخصم من المخزون ويُسوّي مالياً.
 * @async
 * @param {string} id
 * @param {Object} payload - { settledAmount, replacementReference?, cashFund?, notes? }
 * @returns {Promise<Object>}
 */
export async function acceptSupplierReturn(id, payload) {
  const { data } = await axiosInstance.post(`/supplier-returns/${id}/accept`, payload);
  return data.data;
}

/**
 * رفض المرتجع من المورّد (sent ← rejected).
 * @async
 * @param {string} id
 * @param {Object} payload - { rejectionReason }
 * @returns {Promise<Object>}
 */
export async function rejectSupplierReturn(id, payload) {
  const { data } = await axiosInstance.post(`/supplier-returns/${id}/reject`, payload);
  return data.data;
}

// ═══════════════════════════════════════════════
// 4. تصدير موحّد
// ═══════════════════════════════════════════════

export default {
  listSupplierReturns,
  getSupplierReturn,
  createSupplierReturn,
  updateSupplierReturn,
  sendSupplierReturn,
  acceptSupplierReturn,
  rejectSupplierReturn,
};