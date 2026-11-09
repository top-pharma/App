/**
 * @file customersAPI.js
 * @description دوال API للصيدليات — Phase A.8.
 */

import axiosInstance from './axiosInstance.js';
import { normalizeListWithId, withId } from './_helpers.js';

// ═══════════════════════════════════════════════
// 1. القراءة
// ═══════════════════════════════════════════════

export async function listCustomers(params = {}) {
  const { data } = await axiosInstance.get('/customers', { params });
  return normalizeListWithId(data);
}

export async function getCustomer(id) {
  const { data } = await axiosInstance.get(`/customers/${id}`);
  return withId(data.data);
}

export async function getCustomerInvoices(id) {
  const { data } = await axiosInstance.get(`/customers/${id}/invoices`);
  return data.data;
}

export async function getCustomerBalance(id) {
  const { data } = await axiosInstance.get(`/customers/${id}/balance`);
  return data.data;
}

export async function getCustomerStatement(id) {
  const { data } = await axiosInstance.get(`/customers/${id}/statement`);
  return data.data;
}

// ═══════════════════════════════════════════════
// 2. الإنشاء
// ═══════════════════════════════════════════════

export async function createCustomer(payload) {
  const { data } = await axiosInstance.post('/customers', payload);
  return withId(data.data);
}

// ═══════════════════════════════════════════════
// 3. التعديل
// ═══════════════════════════════════════════════

export async function updateCustomer(id, payload) {
  const { data } = await axiosInstance.patch(`/customers/${id}`, payload);
  return withId(data.data);
}

// ═══════════════════════════════════════════════
// 4. الحذف
// ═══════════════════════════════════════════════

export async function deleteCustomer(id) {
  const { data } = await axiosInstance.delete(`/customers/${id}`);
  return data.data;
}

export default {
  listCustomers,
  getCustomer,
  getCustomerInvoices,
  getCustomerBalance,
  getCustomerStatement,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};