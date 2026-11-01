/**
 * cashFundsAPI.js
 *
 * طبقة الاتصال بـ API صناديق النقدية.
 */

import axiosInstance from './axiosInstance.js';

/**
 * جلب قائمة الصناديق.
 * @param {Object} [params] - { page, limit, search, isActive, sortBy, sortOrder }
 * @returns {Promise<Object>} { data, pagination }
 */
export const getCashFunds = async (params = {}) => {
  const { data } = await axiosInstance.get('/cash-funds', { params });
  return data;
};

/**
 * جلب صندوق واحد.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export const getCashFund = async (id) => {
  const { data } = await axiosInstance.get(`/cash-funds/${id}`);
  return data.data;
};

/**
 * إنشاء صندوق.
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export const createCashFund = async (payload) => {
  const { data } = await axiosInstance.post('/cash-funds', payload);
  return data.data;
};

/**
 * تحديث صندوق.
 * @param {string} id
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export const updateCashFund = async (id, payload) => {
  const { data } = await axiosInstance.patch(`/cash-funds/${id}`, payload);
  return data.data;
};

/**
 * حذف صندوق (soft delete).
 * @param {string} id
 * @returns {Promise<Object>}
 */
export const deleteCashFund = async (id) => {
  const { data } = await axiosInstance.delete(`/cash-funds/${id}`);
  return data;
};

/**
 * تعيين الصندوق كافتراضي.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export const setDefaultCashFund = async (id) => {
  const { data } = await axiosInstance.post(`/cash-funds/${id}/set-default`);
  return data.data;
};

/**
 * إيداع/سحب نقدي يدوي.
 * @param {string} id
 * @param {Object} payload - { type, amount, description, referenceType, date }
 * @returns {Promise<Object>}
 */
export const cashFundMovement = async (id, payload) => {
  const { data } = await axiosInstance.post(`/cash-funds/${id}/movement`, payload);
  return data.data;
};

/**
 * حركات صندوق محدد.
 * @param {string} id
 * @param {Object} [params]
 * @returns {Promise<Object>}
 */
export const getFundTransactions = async (id, params = {}) => {
  const { data } = await axiosInstance.get(`/cash-funds/${id}/transactions`, { params });
  return data;
};

export default {
  getCashFunds,
  getCashFund,
  createCashFund,
  updateCashFund,
  deleteCashFund,
  setDefaultCashFund,
  cashFundMovement,
  getFundTransactions,
};