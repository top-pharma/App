/**
 * @file backupAPI.js
 * @description
 * طبقة الاتصال بـ Backup API (Phase 5).
 *
 * ✅ v10.0 (2026-11-12):
 * - إضافة downloadBackup(filename).
 */

import axiosInstance from './axiosInstance.js';

/* 1. معلومات البيانات الحالية */
export async function getBackupInfo() {
  const { data } = await axiosInstance.get('/backup/info');
  return data.data;
}

/* 2. قائمة النسخ المحفوظة على القرص */
export async function listBackups() {
  const { data } = await axiosInstance.get('/backup/list');
  return data.data;
}

/* 3. التصدير (تنزيل ملف JSON) */
export async function exportBackup() {
  const response = await axiosInstance.get('/backup/export', {
    responseType: 'blob',
    timeout: 5 * 60 * 1000,
  });

  const cd = response.headers?.['content-disposition'] || '';
  let filename = `pharma-backup-${Date.now()}.json`;
  const match = cd.match(/filename="?([^";]+)"?/);
  if (match && match[1]) {
    try {
      filename = decodeURIComponent(match[1]);
    } catch {
      filename = match[1];
    }
  }

  return { blob: response.data, filename };
}

/* 4. التنزيل من القائمة — ✅ v10.0 جديد */
export async function downloadBackup(filename) {
  const response = await axiosInstance.get(
    `/backup/download/${encodeURIComponent(filename)}`,
    {
      responseType: 'blob',
      timeout: 5 * 60 * 1000,
    }
  );
  return { blob: response.data, filename };
}

/* 5. الاستعادة (رفع JSON كـ body) */
export async function restoreBackup(parsedBackup) {
  const { data } = await axiosInstance.post('/backup/restore', parsedBackup, {
    timeout: 15 * 60 * 1000,
  });
  return data;
}

/* 6. تصدير افتراضي */
export default {
  getBackupInfo,
  listBackups,
  exportBackup,
  downloadBackup,
  restoreBackup,
};