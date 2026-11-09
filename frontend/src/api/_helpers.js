/**
 * @file _helpers.js
 * @description
 * مساعدات مشتركة لكل ملفات API — Phase A.8.
 *
 * ⚠️ Phase A.8 (2026-11-07):
 * - normalizeListResponse: يُعيد { items, pagination } بشكل موحّد.
 * - withId / withIds: إضافة `id` من `_id` (لأن .lean() لا يُضيف virtuals).
 * - normalizeListWithId: دمج الاثنين (shorthand).
 *
 * يتعامل مع 5 أشكال Response:
 *   1. [...]                                    (مصفوفة مباشرة)
 *   2. { items: [...], pagination: {...} }
 *   3. { data: [...], pagination: {...} }
 *   4. { data: { items: [...], pagination } }
 *   5. { success, data: [...], pagination }      ← النمط الحالي (invoiceController)
 *
 * لماذا؟
 * - كل Context يقرأ result.items + result.pagination.
 * - بعض APIs تعيد data.data (مصفوفة) — فيكون result.items = undefined.
 * - بعض Controllers تعيد { data: [...], pagination }.
 * - بعض Controllers تعيد { data: { items, pagination } }.
 * - هذا الـ helper يوحّد الكل.
 */

const DEFAULT_PAGINATION = Object.freeze({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
});

/**
 * استخراج { items, pagination } من أي شكل Response.
 *
 * @param {any} response - Response من axiosInstance (data أو data.data)
 * @returns {{ items: Array, pagination: Object }}
 */
export function normalizeListResponse(response) {
  let items = [];
  let pagination = DEFAULT_PAGINATION;

  // 1. مصفوفة مباشرة
  if (Array.isArray(response)) {
    items = response;
    pagination = { ...DEFAULT_PAGINATION, total: response.length, totalPages: 1 };
  }
  // 2. { items: [...], pagination: {...} }
  else if (Array.isArray(response?.items)) {
    items = response.items;
    pagination = response.pagination || DEFAULT_PAGINATION;
  }
  // 3. { data: { items: [...], pagination } }
  else if (Array.isArray(response?.data?.items)) {
    items = response.data.items;
    pagination =
      response.data.pagination || response.pagination || DEFAULT_PAGINATION;
  }
  // 4. { data: [...], pagination: {...} }
  else if (Array.isArray(response?.data)) {
    items = response.data;
    pagination =
      response.pagination ||
      { ...DEFAULT_PAGINATION, total: response.data.length };
  }

  return { items, pagination };
}

/**
 * إضافة `id` من `_id` لعنصر واحد.
 * (لأن Mongoose .lean() لا يُضيف virtual `id`).
 *
 * @param {Object} item
 * @returns {Object}
 */
export function withId(item) {
  if (!item || typeof item !== 'object') return item;
  return { ...item, id: item.id || item._id };
}

/**
 * إضافة `id` من `_id` لمصفوفة.
 *
 * @param {Array} items
 * @returns {Array}
 */
export function withIds(items) {
  return Array.isArray(items) ? items.map(withId) : [];
}

/**
 * دمج normalizeListResponse + withIds — shorthand.
 *
 * @param {any} response
 * @returns {{ items: Array, pagination: Object }}
 */
export function normalizeListWithId(response) {
  const { items, pagination } = normalizeListResponse(response);
  return { items: withIds(items), pagination };
}

export default {
  normalizeListResponse,
  withId,
  withIds,
  normalizeListWithId,
};