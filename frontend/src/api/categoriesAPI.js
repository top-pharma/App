/**
 * @file categoriesAPI.js
 * @description دوال API الخاصة بالتصنيفات.
 *
 * لماذا هذا الملف؟
 * - يفصل منطق الاتصال بالخادم عن المكونات.
 * - يُوحّد شكل الاستدعاءات مع بقية ملفات API.
 * - يُرجع data.data مباشرة لتبسيط الاستخدام في الـ Contexts.
 */

import axiosInstance from './axiosInstance.js';

// ═══════════════════════════════════════════════
// 1. القراءة
// ═══════════════════════════════════════════════

/**
 * جلب قائمة التصنيفات مع بحث + فلترة + Pagination.
 * @async
 * @param {Object} [params={}]
 * @returns {Promise<{ items: Array, pagination: Object }>}
 */
export async function listCategories(params = {}) {
  const { data } = await axiosInstance.get('/categories', { params });
  return data.data;
}

/**
 * جلب تصنيف واحد.
 * @async
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getCategory(id) {
  const { data } = await axiosInstance.get(`/categories/${id}`);
  return data.data;
}

// ═══════════════════════════════════════════════
// 2. الإنشاء
// ═══════════════════════════════════════════════

/**
 * إنشاء تصنيف جديد.
 * @async
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function createCategory(payload) {
  const { data } = await axiosInstance.post('/categories', payload);
  return data.data;
}

// ═══════════════════════════════════════════════
// 3. التعديل
// ═══════════════════════════════════════════════

/**
 * تعديل تصنيف.
 * @async
 * @param {string} id
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function updateCategory(id, payload) {
  const { data } = await axiosInstance.patch(`/categories/${id}`, payload);
  return data.data;
}

// ═══════════════════════════════════════════════
// 4. الحذف (Soft Delete)
// ═══════════════════════════════════════════════

/**
 * تعطيل تصنيف.
 * @async
 * @param {string} id
 * @returns {Promise<{ message: string }>}
 */
export async function deleteCategory(id) {
  const { data } = await axiosInstance.delete(`/categories/${id}`);
  return data.data;
}

export default {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
};