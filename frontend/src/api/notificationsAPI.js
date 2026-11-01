/**
 * @file notificationsAPI.js
 * @description طبقة الاتصال بـ API الإشعارات (Phase 5).
 *
 * ⚠️ axiosInstance يُعيد error.response.data مباشرة — لا error.response.data.data
 * ⚠️ getNotifications يُعيد الاستجابة الكاملة (success, data, pagination, meta).
 */

import axiosInstance from './axiosInstance.js';

/**
 * جلب قائمة الإشعارات (مرقّمة).
 * @param {Object} [params] - { page, limit, isRead, type }
 * @returns {Promise<Object>} - { success, data, pagination, meta }
 */
export const getNotifications = async (params = {}) => {
  const { data } = await axiosInstance.get('/notifications', { params });
  return data;
};

/**
 * عدد الإشعارات غير المقروءة (للـ Bell badge).
 * @returns {Promise<{count: number}>}
 */
export const getUnreadCount = async () => {
  const { data } = await axiosInstance.get('/notifications/unread-count');
  return data.data;
};

/**
 * تعليم إشعار واحد كمقروء.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export const markAsRead = async (id) => {
  const { data } = await axiosInstance.patch(`/notifications/${id}/read`);
  return data.data;
};

/**
 * تعليم كل الإشعارات كمقروءة.
 * @returns {Promise<{success: boolean, message: string, data: {modifiedCount: number}}>}
 */
export const markAllAsRead = async () => {
  const { data } = await axiosInstance.patch('/notifications/read-all');
  return data;
};

/**
 * حذف إشعار واحد.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export const deleteNotification = async (id) => {
  const { data } = await axiosInstance.delete(`/notifications/${id}`);
  return data;
};

/**
 * حذف كل الإشعارات المقروءة.
 * @returns {Promise<{success: boolean, message: string, data: {deletedCount: number}}>}
 */
export const deleteAllRead = async () => {
  const { data } = await axiosInstance.delete('/notifications/read');
  return data;
};

export default {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllRead,
};