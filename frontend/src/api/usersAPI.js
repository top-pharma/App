/**
 * @file usersAPI.js
 * @description دوال API الخاصة بالمستخدمين.
 * @description Phase C: 8 دوال (قراءة + CRUD + تعطيل + إعادة تعيين).
 */

import axiosInstance from './axiosInstance.js';

// ─── القراءة ───
export async function listUsers(params = {}) {
  const { data } = await axiosInstance.get('/users', { params });
  return data.data; // { items, pagination }
}

export async function listSalesReps() {
  const { items } = await listUsers({
    role: 'sales_rep',
    isActive: true,
    limit: 100,
    sortBy: 'name',
    sortOrder: 'asc',
  });
  return items;
}

export async function getUser(id) {
  const { data } = await axiosInstance.get(`/users/${id}`);
  return data.data;
}

// ─── الإنشاء / التعديل ───
export async function createUser(payload) {
  const { data } = await axiosInstance.post('/users', payload);
  return data.data; // { user, generatedPassword? }
}

export async function updateUser(id, payload) {
  const { data } = await axiosInstance.patch(`/users/${id}`, payload);
  return data.data; // updated user
}

// ─── الحالة ───
export async function toggleUserActive(id) {
  const { data } = await axiosInstance.patch(`/users/${id}/toggle-active`);
  return data.data; // updated user
}

export async function deleteUser(id) {
  const { data } = await axiosInstance.delete(`/users/${id}`);
  return data.data; // { message }
}

// ─── كلمة المرور ───
export async function adminResetPassword(id, payload = {}) {
  const { data } = await axiosInstance.post(`/users/${id}/reset-password`, payload);
  return data.data; // { message, generatedPassword? }
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