/**
 * @file salesRepTransactionsAPI.js
 * @description API client لحركات المندوب — 6 دوال.
 *
 * ✅ v10.9 (2026-11-16) — جديد.
 */

import axiosInstance from './axiosInstance.js';
import { normalizeListWithId, withId } from './_helpers.js';

export async function listTransactions(params = {}) {
  const { data } = await axiosInstance.get('/sales-rep-transactions', { params });
  return normalizeListWithId(data);
}

export async function getTransaction(id) {
  const { data } = await axiosInstance.get(`/sales-rep-transactions/${id}`);
  return withId(data.data);
}

export async function createTransaction(payload) {
  const { data } = await axiosInstance.post('/sales-rep-transactions', payload);
  return withId(data.data);
}

export async function approveTransaction(id, payload = {}) {
  const { data } = await axiosInstance.post(`/sales-rep-transactions/${id}/approve`, payload);
  return withId(data.data);
}

export async function payTransaction(id, payload) {
  const { data } = await axiosInstance.post(`/sales-rep-transactions/${id}/pay`, payload);
  return withId(data.data);
}

export async function cancelTransaction(id, payload) {
  const { data } = await axiosInstance.post(`/sales-rep-transactions/${id}/cancel`, payload);
  return withId(data.data);
}

export default {
  listTransactions,
  getTransaction,
  createTransaction,
  approveTransaction,
  payTransaction,
  cancelTransaction,
};