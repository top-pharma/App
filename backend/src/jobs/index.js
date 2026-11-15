/**
 * @file jobs/index.js
 * @description
 * مجدول المهام الخلفية (Cron Jobs).
 *
 * ✅ 🅲 (2026-11-08):
 * - حُذف checkDueAlert (Check أُلغي).
 *
 * ✅ v10.0 (2026-11-12):
 * - سجل أوضح — تم تضمين autoBackup صراحةً.
 */

import cron from 'node-cron';
import runExpiryAlert from './expiryAlert.js';
import runReorderAlert from './reorderAlert.js';
import runInvoiceDueAlert from './invoiceDueAlert.js';
import { startAutoBackupJob, runAutoBackup } from './autoBackup.js';
import logger from '../utils/logger.js';

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

  // ─── Phase 5.5: autoBackup (02:00) ───
  startAutoBackupJob();

  logger.info(
    '[jobs] ⏰ 4 مهام مجدولة: expiryAlert + reorderAlert + invoiceDueAlert (08:00) + autoBackup (02:00) — Africa/Khartoum'
  );
};

export const runAllJobsManually = async () => {
  const results = {
    expiryAlert: null,
    reorderAlert: null,
    invoiceDueAlert: null,
    autoBackup: null,
    errors: [],
  };

  const jobs = [
    { name: 'expiryAlert', fn: runExpiryAlert },
    { name: 'reorderAlert', fn: runReorderAlert },
    { name: 'invoiceDueAlert', fn: runInvoiceDueAlert },
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