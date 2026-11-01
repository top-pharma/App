/**
 * @file autoBackup.js
 * @description
 * Backup تلقائي يومي (JSON) — Phase 5.5.
 *
 * - يعمل 02:00 صباحاً (Africa/Khartoum).
 * - يحفظ في BACKUP_DIR (من .env).
 * - Retention: آخر 7 يومية + 4 أسبوعية (أحد) + 3 شهرية (أول الشهر).
 */

import cron from 'node-cron';
import fs from 'node:fs/promises';
import path from 'node:path';
import backupService from '../services/backupService.js';
import { logger } from '../utils/logger.js';

const BACKUP_DIR = process.env.BACKUP_DIR || 'E:\\Backups\\Pharma\\daily';

async function ensureDir() {
  try {
    await fs.access(BACKUP_DIR);
  } catch {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    logger.info(`[autoBackup] 📁 أنشئ مجلد: ${BACKUP_DIR}`);
  }
}

async function cleanupOldBackups() {
  try {
    const files = (await fs.readdir(BACKUP_DIR))
      .filter((f) => f.startsWith('pharma-backup_') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length <= 7) return;

    const now = Date.now();
    const keep = new Set(files.slice(0, 7));

    for (const file of files.slice(7)) {
      const stat = await fs.stat(path.join(BACKUP_DIR, file));
      const ageDays = (now - stat.mtime.getTime()) / (24 * 60 * 60 * 1000);
      const dayOfWeek = stat.mtime.getDay();
      const dayOfMonth = stat.mtime.getDate();

      if (dayOfWeek === 0 && ageDays <= 28) {
        keep.add(file);
        continue;
      }
      if (dayOfMonth === 1 && ageDays <= 92) {
        keep.add(file);
        continue;
      }

      await fs.unlink(path.join(BACKUP_DIR, file));
      logger.info(`[autoBackup] 🗑️ حذف قديم: ${file}`);
    }

    logger.info(`[autoBackup] ✅ Retention: ${keep.size} نسخة محفوظة`);
  } catch (err) {
    logger.warn(`[autoBackup] فشل cleanup: ${err.message}`);
  }
}

export async function runAutoBackup() {
  const startedAt = Date.now();
  try {
    await ensureDir();

    logger.info('[autoBackup] ⏳ بدء Backup...');
    const { buffer, filename, counts, size } = await backupService.exportAll({
      user: { email: 'system-cron' },
    });

    const fullPath = path.join(BACKUP_DIR, filename);
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
  logger.info(`[autoBackup] ⏰ Backup يومي (02:00 → ${BACKUP_DIR})`);
}

export default { startAutoBackupJob, runAutoBackup };