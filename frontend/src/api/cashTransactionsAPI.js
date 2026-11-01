/**
 * cashTransactionsAPI.js
 *
 * طبقة الاتصال بـ API حركات النقدية.
 */

import axiosInstance from './axiosInstance.js';

/**
 * جلب قائمة الحركات.
 * @param {Object} [params]
 * @returns {Promise<Object>}
 */
export const getCashTransactions = async (params = {}) => {
  const { data } = await axiosInstance.get('/cash-transactions', { params });
  return data;
};

/**
 * جلب حركة واحدة.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export const getCashTransaction = async (id) => {
  const { data } = await axiosInstance.get(`/cash-transactions/${id}`);
  return data.data;
};

/**
 * إنشاء حركة يدوية.
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export const createCashTransaction = async (payload) => {
  const { data } = await axiosInstance.post('/cash-transactions', payload);
  return data.data;
};

/**
 * عكس حركة.
 * @param {string} id
 * @param {string} reason
 * @returns {Promise<Object>}
 */
export const reverseCashTransaction = async (id, reason) => {
  const { data } = await axiosInstance.post(`/cash-transactions/${id}/reverse`, { reason });
  return data.data;
};

/**
 * ملخص الحركات.
 * @param {Object} [params]
 * @returns {Promise<Array>}
 */
export const getCashSummary = async (params = {}) => {
  const { data } = await axiosInstance.get('/cash-transactions/summary', { params });
  return data.data;
};

export default {
  getCashTransactions,
  getCashTransaction,
  createCashTransaction,
  reverseCashTransaction,
  getCashSummary,
};