/**
 * accountingEntriesAPI.js
 *
 * طبقة الاتصال بـ API القيود المحاسبية.
 */

import axiosInstance from './axiosInstance.js';

/**
 * جلب قائمة القيود.
 * @param {Object} [params]
 * @returns {Promise<Object>}
 */
export const getAccountingEntries = async (params = {}) => {
  const { data } = await axiosInstance.get('/accounting-entries', { params });
  return data;
};

/**
 * جلب قيد واحد.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export const getAccountingEntry = async (id) => {
  const { data } = await axiosInstance.get(`/accounting-entries/${id}`);
  return data.data;
};

/**
 * إنشاء قيد يدوي.
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export const createAccountingEntry = async (payload) => {
  const { data } = await axiosInstance.post('/accounting-entries', payload);
  return data.data;
};

/**
 * عكس قيد.
 * @param {string} id
 * @param {string} reason
 * @returns {Promise<Object>}
 */
export const reverseEntry = async (id, reason) => {
  const { data } = await axiosInstance.post(`/accounting-entries/${id}/reverse`, { reason });
  return data.data;
};

/**
 * ميزان المراجعة.
 * @param {Object} [params] - { from, to }
 * @returns {Promise<Array>}
 */
export const getTrialBalance = async (params = {}) => {
  const { data } = await axiosInstance.get('/accounting-entries/trial-balance', { params });
  return data.data;
};

export default {
  getAccountingEntries,
  getAccountingEntry,
  createAccountingEntry,
  reverseEntry,
  getTrialBalance,
};