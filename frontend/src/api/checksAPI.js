/**
 * @file checksAPI.js
 * @description
 * طبقة الاتصال بـ API الشيكات — النسخة المبسطة (Phase 3).
 * استُبدل collectCheck/payCheck بـ settleCheck.
 */

import axiosInstance from './axiosInstance.js';

/**
 * جلب قائمة الشيكات.
 * @param {Object} [params]
 * @returns {Promise<Object>}
 */
export const getChecks = async (params = {}) => {
  const { data } = await axiosInstance.get('/checks', { params });
  return data;
};

/**
 * جلب شيك واحد.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export const getCheck = async (id) => {
  const { data } = await axiosInstance.get(`/checks/${id}`);
  return data.data;
};

/**
 * إنشاء شيك (تسجيل فقط).
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export const createCheck = async (payload) => {
  const { data } = await axiosInstance.post('/checks', payload);
  return data.data;
};

/**
 * تسجيل صرف شيك — الحدث الوحيد المؤثر على الأرصدة.
 * @param {string} id
 * @param {Object} payload - { paymentMethod: 'cash'|'bank', cashFundId?, bankAccountId?, paymentDate? }
 * @returns {Promise<Object>}
 */
export const settleCheck = async (id, payload) => {
  const { data } = await axiosInstance.post(`/checks/${id}/settle`, payload);
  return data.data;
};

/**
 * ارتداد شيك.
 * @param {string} id
 * @param {string} bounceReason
 * @returns {Promise<Object>}
 */
export const bounceCheck = async (id, bounceReason) => {
  const { data } = await axiosInstance.post(`/checks/${id}/bounce`, {
    bounceReason,
  });
  return data.data;
};

/**
 * إلغاء شيك.
 * @param {string} id
 * @param {string} cancelReason
 * @returns {Promise<Object>}
 */
export const cancelCheck = async (id, cancelReason) => {
  const { data } = await axiosInstance.post(`/checks/${id}/cancel`, {
    cancelReason,
  });
  return data.data;
};

/**
 * الشيكات المستحقة قريباً.
 * @param {number} [days=7]
 * @returns {Promise<Array>}
 */
export const getUpcomingChecks = async (days = 7) => {
  const { data } = await axiosInstance.get('/checks/upcoming', {
    params: { days },
  });
  return data.data;
};

/**
 * الشيكات المتأخرة.
 * @returns {Promise<Array>}
 */
export const getOverdueChecks = async () => {
  const { data } = await axiosInstance.get('/checks/overdue');
  return data.data;
};

export default {
  getChecks,
  getCheck,
  createCheck,
  settleCheck,
  bounceCheck,
  cancelCheck,
  getUpcomingChecks,
  getOverdueChecks,
};