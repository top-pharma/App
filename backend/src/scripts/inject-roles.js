/**
 * @file inject-roles.js
 * @description
 * سكربت مؤقت — يحقن roles من DB في ملف نسخة احتياطية قديم لا يحتويها.
 *
 * ⚠️ استخدمه فقط لملفات صُدِّرت قبل إصلاح roles.
 * الأفضل: شغّل seed ثم صدّر نسخة جديدة.
 *
 * الاستخدام:
 *   node backend/src/scripts/inject-roles.js <path-to-backup.json>
 *
 * ✅ v10.1 (2026-11-13)
 */

import fs from 'node:fs/promises';
import mongoose from 'mongoose';

import { connectDatabase } from '../config/database.js';
import { Role } from '../models/Role.js';
import { logger } from '../utils/logger.js';

async function injectRoles(filePath) {
  if (!filePath) {
    console.error('❌ الاستخدام: node inject-roles.js <path-to-backup.json>');
    process.exit(1);
  }

  logger.info(`📂 قراءة: ${filePath}`);
  const raw = await fs.readFile(filePath, 'utf-8');
  const json = JSON.parse(raw);

  if (!json._meta || json._meta.app !== 'Pharma System') {
    console.error('❌ الملف ليس نسخة Pharma System.');
    process.exit(1);
  }

  await connectDatabase();
  logger.info('🔌 متصل بـ DB');

  const roles = await Role.find({}).lean();
  if (roles.length === 0) {
    console.error(
      '❌ لا توجد roles في DB. شغّل "npm run seed" أولاً ثم أعد المحاولة.'
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  logger.info(`📋 وجدت ${roles.length} دور في DB`);

  // نسخة احتياطية من الملف الأصلي
  const backupPath = `${filePath}.backup-${Date.now()}`;
  await fs.writeFile(backupPath, raw);
  logger.info(`💾 نسخة احتياطية من الملف الأصلي: ${backupPath}`);

  // حقن roles
  json.data.roles = roles;
  json._meta.collections.roles = roles.length;

  // إعادة كتابة الملف
  await fs.writeFile(filePath, JSON.stringify(json, null, 2));
  logger.info(`✅ حُقن ${roles.length} دور في: ${filePath}`);
  logger.info(`📊 الحجم الجديد: ${(await fs.stat(filePath)).size} bytes`);

  await mongoose.disconnect();
  logger.info('👋 انتهى.');
}

injectRoles(process.argv[2])
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ فشل:', err.message);
    process.exit(1);
  });