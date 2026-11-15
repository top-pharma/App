/**
 * @file seed-roles-only.js
 * @description
 * سكربت آمن — ينشئ/يحدّث roles فقط من DEFAULT_ROLES.
 * لا يمسح أي شيء. لا يمس أي collection أخرى.
 *
 * الاستخدام:
 *   node backend/src/scripts/seed-roles-only.js
 *
 * ✅ v10.1 (2026-11-13)
 */

import mongoose from 'mongoose';

import { connectDatabase } from '../config/database.js';
import { Role, DEFAULT_ROLES } from '../models/Role.js';
import { logger } from '../utils/logger.js';

async function seedRolesOnly() {
  await connectDatabase();
  logger.info('🔌 متصل بـ DB');

  const before = await Role.countDocuments({});
  logger.info(`📊 roles قبل: ${before}`);

  let created = 0;
  let updated = 0;

  for (const roleData of DEFAULT_ROLES) {
    const existing = await Role.findOne({ code: roleData.code });
    if (existing) {
      existing.name = roleData.name;
      existing.description = roleData.description;
      existing.permissions = roleData.permissions;
      existing.isSystem = true;
      await existing.save();
      updated++;
      logger.info(`   ♻️  ${roleData.code} — محدَّث (${roleData.permissions.length} صلاحية)`);
    } else {
      await Role.create(roleData);
      created++;
      logger.info(`   ✅ ${roleData.code} — جديد (${roleData.permissions.length} صلاحية)`);
    }
  }

  const after = await Role.countDocuments({});
  logger.info('');
  logger.info(`📊 roles بعد: ${after}`);
  logger.info(`   ✅ ${created} جديد، ${updated} محدَّث`);

  await mongoose.disconnect();
  logger.info('👋 انتهى.');
}

seedRolesOnly()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error(`❌ فشل: ${err.message}`);
    logger.error(err.stack);
    process.exit(1);
  });