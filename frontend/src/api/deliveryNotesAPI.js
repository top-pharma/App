/**
 * @file deliveryNotesAPI.js
 * @description دوال API الخاصة بإيصالات التسليم (Delivery Notes).
 *
 * لماذا هذا الملف؟
 * - يفصل منطق الاتصال بالخادم عن المكونات.
 * - يُوحّد شكل الاستدعاءات مع بقية ملفات API.
 * - يدعم البحث، الفلترة، والصفحات.
 */

import axiosInstance from './axiosInstance.js';

// ═══════════════════════════════════════════════
// 1. القراءة (Read)
// ═══════════════════════════════════════════════

/**
 * جلب قائمة إيصالات التسليم مع بحث + فلترة + Pagination.
 * @async
 * @param {Object} [params={}]
 * @returns {Promise<{ items: Array, pagination: Object }>}
 */
export async function listDeliveryNotes(params = {}) {
  const { data } = await axiosInstance.get('/delivery-notes', { params });
  return data.data;
}

/**
 * جلب إيصال تسليم واحد.
 * @async
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getDeliveryNote(id) {
  const { data } = await axiosInstance.get(`/delivery-notes/${id}`);
  return data.data;
}

// ═══════════════════════════════════════════════
// 2. الإنشاء والتعديل (Create & Update)
// ═══════════════════════════════════════════════

/**
 * إنشاء إيصال تسليم جديد (يخصم المخزون فوراً).
 * @async
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function createDeliveryNote(payload) {
  const { data } = await axiosInstance.post('/delivery-notes', payload);
  return data.data;
}

/**
 * تعديل بيانات الإيصال (قبل التسليم فقط).
 * @async
 * @param {string} id
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function updateDeliveryNote(id, payload) {
  const { data } = await axiosInstance.patch(`/delivery-notes/${id}`, payload);
  return data.data;
}

// ═══════════════════════════════════════════════
// 3. الإجراءات الخاصة (Actions)
// ═══════════════════════════════════════════════

/**
 * تعليم الإيصال كمُسلَّم (تسجيل المستلم والتوقيع).
 * @async
 * @param {string} id
 * @param {Object} payload - { receivedBy, signature, deliveredAt, notes }
 * @returns {Promise<Object>}
 */
export async function markDelivered(id, payload) {
  const { data } = await axiosInstance.patch(`/delivery-notes/${id}/mark-delivered`, payload);
  return data.data;
}

// ═══════════════════════════════════════════════
// 4. تصدير موحّد
// ═══════════════════════════════════════════════

export default {
  listDeliveryNotes,
  getDeliveryNote,
  createDeliveryNote,
  updateDeliveryNote,
  markDelivered,
};