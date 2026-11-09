/**
 * @file jobs/index.js
 * @description
 * مجدول المهام الخلفية (Cron Jobs).
 *
 * ✅ 🅲 (2026-11-08):
 * - حُذف checkDueAlert (Check أُلغي).
 * - المهام المتبقية: expiryAlert, reorderAlert, invoiceDueAlert (3×08:00) + autoBackup (1×02:00).
 *
 * المهام المُفعّلة:
 *  - 08:00 (Africa/Khartoum):
 *      • expiryAlert     : الدفعات القاربة على الانتهاء (Phase 1)
 *      • reorderAlert    : الأصناف تحت الحد الأدنى (Phase 1)
 *      • invoiceDueAlert : الفواتير المتأخرة (Phase 2)
 *  - 02:00 (Africa/Khartoum):
 *      • autoBackup      : نسخة JSON احتياطية (Phase 5.5)
 */

import cron from 'node-cron';
import runExpiryAlert from './expiryAlert.js';
import runReorderAlert from './reorderAlert.js';
import runInvoiceDueAlert from './invoiceDueAlert.js';
// ⚠️ 🅲: حُذف import runCheckDueAlert
import { startAutoBackupJob, runAutoBackup } from './autoBackup.js';
import logger from '../utils/logger.js';

/**
 * الغلاف الآمن لكل Job — يمنع فشل job من إسقاط الباقي.
 * @param {Function} jobFn
 * @param {string} jobName
 * @returns {Function}
 */
const safeJob = (jobFn, jobName) => async () => {
  const startedAt = Date.now();
  try {
    await jobFn();
    logger.info(`[jobs] ✅ ${jobName} اكتمل في ${Date.now() - startedAt}ms`);
  } catch (err) {
    logger.error(`[jobs] ❌ ${jobName} فشل: ${err.message}`);
    logger.error(err.stack);
  }
};

/**
 * يبدأ جميع المهام المجدولة.
 * يُستدعى مرة واحدة عند بدء السيرفر (من server.js).
 */
export const startJobs = () => {
  // ─── Phase 1: expiryAlert ───
  cron.schedule(
    '0 8 * * *',
    safeJob(runExpiryAlert, 'expiryAlert'),
    { timezone: 'Africa/Khartoum' }
  );

  // ─── Phase 1: reorderAlert ───
  cron.schedule(
    '0 8 * * *',
    safeJob(runReorderAlert, 'reorderAlert'),
    { timezone: 'Africa/Khartoum' }
  );

  // ─── Phase 2: invoiceDueAlert ───
  cron.schedule(
    '0 8 * * *',
    safeJob(runInvoiceDueAlert, 'invoiceDueAlert'),
    { timezone: 'Africa/Khartoum' }
  );

  // ⚠️ 🅲: حُذف checkDueAlert (Check أُلغي)

  // ─── Phase 5.5: autoBackup (02:00) ───
  startAutoBackupJob();

  logger.info('[jobs] ⏰ تم تفعيل 4 مهام مجدولة (3×08:00 + 1×02:00 Africa/Khartoum)');
};

/**
 * يُشغّل جميع المهام يدوياً (للاستخدام في scripts/test-jobs.js).
 * @returns {Promise<Object>} ملخص النتائج
 *
 * ✅ 🅲: حُذف checkDueAlert.
 */
export const runAllJobsManually = async () => {
  const results = {
    expiryAlert: null,
    reorderAlert: null,
    invoiceDueAlert: null,
    // ⚠️ 🅲: حُذف checkDueAlert
    autoBackup: null,
    errors: [],
  };

  const jobs = [
    { name: 'expiryAlert', fn: runExpiryAlert },
    { name: 'reorderAlert', fn: runReorderAlert },
    { name: 'invoiceDueAlert', fn: runInvoiceDueAlert },
    // ⚠️ 🅲: حُذف checkDueAlert
    { name: 'autoBackup', fn: runAutoBackup },
  ];

  for (const { name, fn } of jobs) {
    try {
      results[name] = await fn();
      logger.info(`[jobs-manual] ✅ ${name}`);
    } catch (err) {
      results.errors.push({ job: name, error: err.message });
      logger.error(`[jobs-manual] ❌ ${name}: ${err.message}`);
    }
  }

  return results;
};

export default { startJobs, runAllJobsManually };