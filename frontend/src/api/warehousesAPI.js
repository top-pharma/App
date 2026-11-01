/**
 * @file warehousesAPI.js
 * @description
 * دوال API الخاصة بالمخازن.
 *
 * لماذا هذا الملف؟
 * - يفصل منطق الاتصال بالخادم عن المكونات.
 * - يُوحّد شكل الاستدعاءات مع بقية ملفات API.
 */

import axiosInstance from './axiosInstance.js';

// ═══════════════════════════════════════════════
// 1. القراءة
// ═══════════════════════════════════════════════

/**
 * جلب قائمة المخازن مع بحث + فلترة + Pagination.
 *
 * @async
 * @param {Object} [params={}]
 * @returns {Promise<{ items: Array, pagination: Object }>}
 */
export async function listWarehouses(params = {}) {
  const { data } = await axiosInstance.get('/warehouses', { params });
  return data.data;
}

/**
 * جلب مخزن واحد.
 * @async
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getWarehouse(id) {
  const { data } = await axiosInstance.get(`/warehouses/${id}`);
  return data.data;
}

// ═══════════════════════════════════════════════
// 2. الإنشاء
// ═══════════════════════════════════════════════

/**
 * إنشاء مخزن جديد.
 * @async
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function createWarehouse(payload) {
  const { data } = await axiosInstance.post('/warehouses', payload);
  return data.data;
}

// ═══════════════════════════════════════════════
// 3. التعديل
// ═══════════════════════════════════════════════

/**
 * تعديل مخزن.
 * @async
 * @param {string} id
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function updateWarehouse(id, payload) {
  const { data } = await axiosInstance.patch(`/warehouses/${id}`, payload);
  return data.data;
}

// ═══════════════════════════════════════════════
// 4. الحذف (Soft Delete)
// ═══════════════════════════════════════════════

/**
 * تعطيل مخزن.
 * @async
 * @param {string} id
 * @returns {Promise<{ message: string }>}
 */
export async function deleteWarehouse(id) {
  const { data } = await axiosInstance.delete(`/warehouses/${id}`);
  return data.data;
}

// ═══════════════════════════════════════════════
// 5. تعيين رئيسي / افتراضي
// ═══════════════════════════════════════════════

/**
 * تعيين مخزن كرئيسي.
 * @async
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function setWarehouseAsMain(id) {
  const { data } = await axiosInstance.post(`/warehouses/${id}/set-main`);
  return data.data;
}

/**
 * تعيين مخزن كافتراضي.
 * @async
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function setWarehouseAsDefault(id) {
  const { data } = await axiosInstance.post(`/warehouses/${id}/set-default`);
  return data.data;
}

export default {
  listWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  setWarehouseAsMain,
  setWarehouseAsDefault,
};