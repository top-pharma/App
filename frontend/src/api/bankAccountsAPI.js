/**
 * @file bankAccountsAPI.js
 * @description دوال API للحسابات البنكية — Phase A.8.
 */

import axiosInstance from './axiosInstance.js';
import { normalizeListWithId, withId } from './_helpers.js';

export async function getBankAccounts(params = {}) {
  const { data } = await axiosInstance.get('/bank-accounts', { params });
  return normalizeListWithId(data);
}

export async function getActiveBankAccount() {
  const { data } = await axiosInstance.get('/bank-accounts/active');
  return withId(data.data);
}

export async function getBankAccount(id) {
  const { data } = await axiosInstance.get(`/bank-accounts/${id}`);
  return withId(data.data);
}

export async function createBankAccount(payload) {
  const { data } = await axiosInstance.post('/bank-accounts', payload);
  return withId(data.data);
}

export async function updateBankAccount(id, payload) {
  const { data } = await axiosInstance.patch(`/bank-accounts/${id}`, payload);
  return withId(data.data);
}

export async function deleteBankAccount(id) {
  const { data } = await axiosInstance.delete(`/bank-accounts/${id}`);
  return data.data;
}

export default {
  getBankAccounts,
  getActiveBankAccount,
  getBankAccount,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
};