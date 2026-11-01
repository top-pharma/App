/**
 * @file authAPI.js
 * @description دوال API الخاصة بالمصادقة
 */

import axiosInstance from './axiosInstance.js';

// ═══════════════════════════════════════════════
// 1. تسجيل الدخول (skipAuth: true)
// ═══════════════════════════════════════════════
export async function login({ email, password }) {
  const { data } = await axiosInstance.post(
    '/auth/login',
    { email, password },
    { skipAuth: true }  // ✅ مهم: لا ترسل التوكن
  );
  return data.data;
}

// ═══════════════════════════════════════════════
// 2. تسجيل الخروج
// ═══════════════════════════════════════════════
export async function logout() {
  try {
    await axiosInstance.post('/auth/logout');
  } catch (error) {
    console.warn('فشل تسجيل الخروج:', error?.message);
  }
}

// ═══════════════════════════════════════════════
// 3. تجديد التوكن (skipAuth: true)
// ═══════════════════════════════════════════════
export async function refresh(refreshToken) {
  const { data } = await axiosInstance.post(
    '/auth/refresh',
    { refreshToken },
    { skipAuth: true }
  );
  return data.data;
}

// ═══════════════════════════════════════════════
// 4. بيانات المستخدم الحالي (يحتاج توكن)
// ═══════════════════════════════════════════════
export async function getCurrentUser() {
  const { data } = await axiosInstance.get('/auth/me');
  return data.data.user;
}

// ═══════════════════════════════════════════════
// 5. تغيير كلمة المرور
// ═══════════════════════════════════════════════
export async function changePassword({ currentPassword, newPassword }) {
  const { data } = await axiosInstance.patch('/auth/change-password', {
    currentPassword,
    newPassword,
  });
  return data;
}

// ═══════════════════════════════════════════════
// 6. طلب استرداد (skipAuth: true)
// ═══════════════════════════════════════════════
export async function forgotPassword(email) {
  const { data } = await axiosInstance.post(
    '/auth/forgot-password',
    { email },
    { skipAuth: true }
  );
  return data;
}

// ═══════════════════════════════════════════════
// 7. إعادة تعيين (skipAuth: true)
// ═══════════════════════════════════════════════
export async function resetPassword({ token, newPassword }) {
  const { data } = await axiosInstance.post(
    '/auth/reset-password',
    { token, newPassword },
    { skipAuth: true }
  );
  return data;
}

export default {
  login,
  logout,
  refresh,
  getCurrentUser,
  changePassword,
  forgotPassword,
  resetPassword,
};