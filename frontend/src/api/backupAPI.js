/**
 * @file backupAPI.js
 * @description
 * طبقة الاتصال بـ Backup API (Phase 5).
 *
 * المسارات (backend: app.use('/api/backup', backupRoutes)):
 *   GET  /backup/info     → getBackupInfo
 *   GET  /backup/list     → listBackups
 *   GET  /backup/export   → exportBackup (JSON attachment)
 *   POST /backup/restore  → restoreBackup (body = parsed JSON)
 *
 * ملاحظات:
 *  - axiosInstance يضيف Authorization + معالجة 401 تلقائيًا.
 *  - baseURL يحتوي /api، لذلك المسارات هنا تبدأ بـ /backup فقط.
 *  - الاستعادة قد تستغرق وقتًا (حتى 50MB) → timeout أعلى.
 */

import axiosInstance from './axiosInstance.js';

// ═══════════════════════════════════════════════
// 1. معلومات البيانات الحالية
// ═══════════════════════════════════════════════

/**
 * جلب معلومات البيانات الحالية (عدد السجلات، المجموعات، إلخ).
 * @returns {Promise<{
 *   totalDocuments: number,
 *   collections: number,
 *   counts: Object<string, number>,
 * }>}
 */
export async function getBackupInfo() {
  const { data } = await axiosInstance.get('/backup/info');
  return data.data;
}

// ═══════════════════════════════════════════════
// 2. قائمة النسخ المحفوظة على القرص
// ═══════════════════════════════════════════════

/**
 * جلب قائمة النسخ الاحتياطية المحفوظة تلقائيًا.
 * @returns {Promise<Array<{ filename: string, size: number, createdAt: string }>>}
 */
export async function listBackups() {
  const { data } = await axiosInstance.get('/backup/list');
  return data.data;
}

// ═══════════════════════════════════════════════
// 3. التصدير (تنزيل ملف JSON)
// ═══════════════════════════════════════════════

/**
 * تصدير نسخة احتياطية كاملة (JSON) كملف للتنزيل.
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
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

// ═══════════════════════════════════════════════
// 4. الاستعادة (رفع JSON كـ body)
// ═══════════════════════════════════════════════

/**
 * استعادة قاعدة البيانات من كائن JSON مُحلَّل (parsed).
 * ⚠️ إجراء تدميري — يمسح البيانات الحالية أولاً.
 *
 * @param {Object} parsedBackup - الكائن الناتج من JSON.parse(file)
 * @returns {Promise<{
 *   success: boolean,
 *   message: string,
 *   data: {
 *     totals: { inserted: number, deleted: number, errors: number },
 *     duration: number,
 *     results: Object,
 *   },
 * }>}
 */
export async function restoreBackup(parsedBackup) {
  const { data } = await axiosInstance.post('/backup/restore', parsedBackup, {
    timeout: 15 * 60 * 1000,
  });
  return data;
}

// ═══════════════════════════════════════════════
// 5. تصدير افتراضي
// ═══════════════════════════════════════════════

export default {
  getBackupInfo,
  listBackups,
  exportBackup,
  restoreBackup,
};