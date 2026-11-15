/**
 * @file autoBackup.js
 * @description
 * Backup تلقائي يومي (JSON) — Phase 5.5.
 *
 * - يعمل 02:00 صباحاً (Africa/Khartoum).
 * - يحفظ في BACKUP_DIR (من .env).
 * - Retention: آخر 7 يومية + 4 أسبوعية (أحد) + 3 شهرية (أول الشهر).
 *
 * ✅ v10.0 (2026-11-12):
 * - cleanupOldBackups: منطق 7+4+3 صحيح (كان 7+(0-4)+(0-1)).
 * - استخدام birthtime بدل mtime لتحديد العمر.
 */

import cron from 'node-cron';
import fs from 'node:fs/promises';
import path from 'node:path';
import backupService from '../services/backupService.js';
import { logger } from '../utils/logger.js';

const BACKUP_DIR_DEFAULT = 'E:\\Backups\\Pharma\\daily';
const getBackupDir = () => process.env.BACKUP_DIR || BACKUP_DIR_DEFAULT;

async function ensureDir() {
  const dir = getBackupDir();
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
    logger.info(`[autoBackup] 📁 أنشئ مجلد: ${dir}`);
  }
}

/**
 * ✅ v10.0 — Retention 7 + 4 + 3.
 */
async function cleanupOldBackups() {
  const dir = getBackupDir();
  try {
    const files = (await fs.readdir(dir))
      .filter((f) => f.startsWith('pharma-backup_') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length <= 14) {
      logger.info(`[autoBackup] ✅ Retention: ${files.length}/14 — لا حذف`);
      return;
    }

    const stats = await Promise.all(
      files.map(async (f) => {
        const stat = await fs.stat(path.join(dir, f));
        return {
          f,
          createdAt: stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime,
        };
      })
    );

    const now = Date.now();
    const ageDays = (d) => (now - d.getTime()) / (24 * 60 * 60 * 1000);

    // 7 يومية — الأحدث دائماً
    const daily = stats.slice(0, 7);
    const dailySet = new Set(daily.map((d) => d.f));

    // 4 أسبوعية — أحد، أقدم من 7 أيام
    const weekly = stats
      .filter(
        ({ f, createdAt }) =>
          !dailySet.has(f) &&
          createdAt.getDay() === 0 &&
          ageDays(createdAt) > 7
      )
      .slice(0, 4);
    const weeklySet = new Set(weekly.map((w) => w.f));

    // 3 شهرية — أول الشهر، أقدم من 28 يوم
    const monthly = stats
      .filter(
        ({ f, createdAt }) =>
          !dailySet.has(f) &&
          !weeklySet.has(f) &&
          createdAt.getDate() === 1 &&
          ageDays(createdAt) > 28
      )
      .slice(0, 3);

    const keep = new Set([
      ...daily.map((d) => d.f),
      ...weeklySet,
      ...monthly.map((m) => m.f),
    ]);

    for (const { f } of stats) {
      if (!keep.has(f)) {
        await fs.unlink(path.join(dir, f));
        logger.info(`[autoBackup] 🗑️ حذف قديم: ${f}`);
      }
    }

    logger.info(
      `[autoBackup] ✅ Retention: ${keep.size} نسخة (7 يومية + ${weekly.length} أسبوعية + ${monthly.length} شهرية)`
    );
  } catch (err) {
    logger.warn(`[autoBackup] فشل cleanup: ${err.message}`);
  }
}

export async function runAutoBackup() {
  const startedAt = Date.now();
  const dir = getBackupDir();
  try {
    await ensureDir();

    logger.info('[autoBackup] ⏳ بدء Backup...');
    const { buffer, filename, counts, size } = await backupService.exportAll({
      user: { email: 'system-cron' },
    });

    const fullPath = path.join(dir, filename);
    await fs.writeFile(fullPath, buffer);

    const docCount = Object.values(counts || {}).reduce(
      (a, b) => a + (typeof b === 'number' ? b : 0),
      0
    );

    logger.info(
      `[autoBackup] ✅ ${filename} — ${docCount} سجل، ${(size / 1024).toFixed(1)} KB (${Date.now() - startedAt}ms)`
    );

    await cleanupOldBackups();
    return { ok: true, filename, size };
  } catch (err) {
    logger.error(`[autoBackup] ❌ ${err.message}`);
    return { ok: false, error: err.message };
  }
}

export function startAutoBackupJob() {
  cron.schedule('0 2 * * *', runAutoBackup, {
    timezone: 'Africa/Khartoum',
  });
  logger.info(`[autoBackup] ⏰ Backup يومي (02:00 → ${getBackupDir()})`);
}

export default { startAutoBackupJob, runAutoBackup };