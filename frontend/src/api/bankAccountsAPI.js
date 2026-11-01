/**
 * bankAccountsAPI.js
 *
 * طبقة الاتصال بـ API الحسابات البنكية.
 */

import axiosInstance from './axiosInstance.js';

/**
 * جلب قائمة الحسابات البنكية.
 * @param {Object} [params]
 * @returns {Promise<Object>}
 */
export const getBankAccounts = async (params = {}) => {
  const { data } = await axiosInstance.get('/bank-accounts', { params });
  return data;
};

/**
 * جلب الحساب البنكي النشط.
 * @returns {Promise<Object|null>}
 */
export const getActiveBankAccount = async () => {
  const { data } = await axiosInstance.get('/bank-accounts/active');
  return data.data;
};

/**
 * جلب حساب واحد.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export const getBankAccount = async (id) => {
  const { data } = await axiosInstance.get(`/bank-accounts/${id}`);
  return data.data;
};

/**
 * إنشاء حساب بنكي.
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export const createBankAccount = async (payload) => {
  const { data } = await axiosInstance.post('/bank-accounts', payload);
  return data.data;
};

/**
 * تحديث حساب بنكي.
 * @param {string} id
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export const updateBankAccount = async (id, payload) => {
  const { data } = await axiosInstance.patch(`/bank-accounts/${id}`, payload);
  return data.data;
};

/**
 * تعطيل حساب بنكي.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export const deleteBankAccount = async (id) => {
  const { data } = await axiosInstance.delete(`/bank-accounts/${id}`);
  return data.data;
};

export default {
  getBankAccounts,
  getActiveBankAccount,
  getBankAccount,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
};