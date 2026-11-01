/**
 * @file settingsAPI.js
 * @description دوال API الخاصة بإعدادات النظام (Phase D).
 *
 * - getSettings: قراءة الإعدادات الكاملة (settings.view)
 * - updateSettings: تحديث جزئي بـ dot-paths (settings.update)
 */

import axiosInstance from './axiosInstance.js';

/**
 * قراءة الإعدادات الكاملة.
 * @returns {Promise<Object>} { company, currency, locale, sales, inventory, finance, security, audit, print }
 */
export async function getSettings() {
  const { data } = await axiosInstance.get('/settings');
  return data.data;
}

/**
 * تحديث جزئي للإعدادات.
 * @param {Object} payload - أقسام جزئية (يمكن إرسال قسم واحد فقط)
 * @returns {Promise<Object>} الإعدادات بعد التحديث
 */
export async function updateSettings(payload) {
  const { data } = await axiosInstance.patch('/settings', payload);
  return data.data;
}

export default { getSettings, updateSettings };