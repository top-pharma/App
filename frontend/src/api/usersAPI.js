/**
 * @file usersAPI.js
 * @description دوال API للمستخدمين — Phase C + Phase A.8.
 */

import axiosInstance from './axiosInstance.js';
import { normalizeListWithId, withId } from './_helpers.js';

// ─── القراءة ───

export async function listUsers(params = {}) {
  const { data } = await axiosInstance.get('/users', { params });
  return normalizeListWithId(data);
}

export async function listSalesReps() {
  const result = await listUsers({
    role: 'sales_rep',
    isActive: true,
    limit: 100,
    sortBy: 'name',
    sortOrder: 'asc',
  });
  return result.items || [];
}

export async function getUser(id) {
  const { data } = await axiosInstance.get(`/users/${id}`);
  return withId(data.data);
}

// ─── الإنشاء / التعديل ───

export async function createUser(payload) {
  const { data } = await axiosInstance.post('/users', payload);
  return data.data;
}

export async function updateUser(id, payload) {
  const { data } = await axiosInstance.patch(`/users/${id}`, payload);
  return withId(data.data);
}

// ─── الحالة ───

export async function toggleUserActive(id) {
  const { data } = await axiosInstance.patch(`/users/${id}/toggle-active`);
  return withId(data.data);
}

export async function deleteUser(id) {
  const { data } = await axiosInstance.delete(`/users/${id}`);
  return data.data;
}

// ─── كلمة المرور ───

export async function adminResetPassword(id, payload = {}) {
  const { data } = await axiosInstance.post(`/users/${id}/reset-password`, payload);
  return data.data;
}

export default {
  listUsers,
  listSalesReps,
  getUser,
  createUser,
  updateUser,
  toggleUserActive,
  deleteUser,
  adminResetPassword,
};