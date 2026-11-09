/**
 * @file cashFundsAPI.js
 * @description دوال API لصناديق النقدية — Phase A.8.
 *
 * ⚠️ Phase A.8: getCashFunds → normalizeListWithId (يُعيد { items, pagination }).
 *    CashFundsContext يجب أن يقرأ result.items (أو result.data fallback).
 */

import axiosInstance from './axiosInstance.js';
import { normalizeListWithId, withId } from './_helpers.js';

// ═══════════════════════════════════════════════
// 1. القراءة
// ═══════════════════════════════════════════════

export async function getCashFunds(params = {}) {
  const { data } = await axiosInstance.get('/cash-funds', { params });
  return normalizeListWithId(data);
}

export async function getCashFund(id) {
  const { data } = await axiosInstance.get(`/cash-funds/${id}`);
  return withId(data.data);
}

// ═══════════════════════════════════════════════
// 2. الإنشاء / التعديل / الحذف
// ═══════════════════════════════════════════════

export async function createCashFund(payload) {
  const { data } = await axiosInstance.post('/cash-funds', payload);
  return withId(data.data);
}

export async function updateCashFund(id, payload) {
  const { data } = await axiosInstance.patch(`/cash-funds/${id}`, payload);
  return withId(data.data);
}

export async function deleteCashFund(id) {
  const { data } = await axiosInstance.delete(`/cash-funds/${id}`);
  return data;
}

// ═══════════════════════════════════════════════
// 3. تعيين افتراضي / حركات
// ═══════════════════════════════════════════════

export async function setDefaultCashFund(id) {
  const { data } = await axiosInstance.post(`/cash-funds/${id}/set-default`);
  return withId(data.data);
}

export async function cashFundMovement(id, payload) {
  const { data } = await axiosInstance.post(`/cash-funds/${id}/movement`, payload);
  return data.data;
}

export async function getFundTransactions(id, params = {}) {
  const { data } = await axiosInstance.get(
    `/cash-funds/${id}/transactions`,
    { params }
  );
  return normalizeListWithId(data);
}

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