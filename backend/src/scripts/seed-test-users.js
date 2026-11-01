/**
 * @file seed-test-users.js
 * @description
 * إنشاء مستخدمين اختبار لأدوار النظام الخمسة (بخلاف admin).
 *
 * ⚠️ تحديث 2026-10-19:
 * - 4 مناديب مبيعات بأسماء عربية واقعية (بدل مندوب واحد).
 * - توزيع أوسع للصيدليات على المناديب (في seed-master-data.js).
 * - كل المناديب بكلمة مرور موحّدة Rep@123456 للاختبار السريع.
 *
 * لماذا ملف منفصل عن seed.js؟
 * - seed.js للإنتاج فقط (Admin + Settings + Warehouse + Categories).
 * - هذا الملف للتطوير/الاختبار — لا يُشغَّل في الإنتاج.
 * - Idempotent: آمن للتشغيل المتكرر (يُحدّث الموجود).
 *
 * التشغيل:
 *   npm run seed:test
 *   أو: node src/scripts/seed-test-users.js
 */

import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { Role } from '../models/Role.js';
import { User, USER_ROLES } from '../models/User.js';
import { hashPassword } from '../utils/password.js';
import { logger } from '../utils/logger.js';

// ============================================================
// 1) بيانات المستخدمين الاختبار
// ============================================================

/**
 * المستخدمون الاختبار — كلمات مرور بسيطة للاختبار السريع.
 * @readonly
 */
const TEST_USERS = Object.freeze([
  // ─── غير المندوبين ───
  {
    name: 'أمين المخزن',
    email: 'store@pharma.local',
    phone: '+249900000001',
    password: 'Store@123',
    role: USER_ROLES.STOREKEEPER,
    notes: 'حساب اختبار — دور أمين مخزن',
  },
  {
    name: 'المحاسب',
    email: 'account@pharma.local',
    phone: '+249900000002',
    password: 'Account@123',
    role: USER_ROLES.ACCOUNTANT,
    notes: 'حساب اختبار — دور محاسب',
  },
  {
    name: 'صيدلية النور (حساب)',
    email: 'pharmacy@pharma.local',
    phone: '+249900000004',
    password: 'Pharma@123',
    role: USER_ROLES.PHARMACY,
    // ⚠️ linkedEntity ستُترك null — يُربط لاحقاً يدوياً من UI عند إنشاء الصيدلية
    linkedEntity: { type: null, id: null },
    notes: 'حساب اختبار — دور صيدلية (بلا ربط تلقائي)',
  },

  // ─── 4 مناديب بأسماء عربية واقعية ───
  {
    name: 'محمد أحمد عثمان',
    email: 'rep@pharma.local',
    phone: '+249900000003',
    password: 'Rep@123456',
    role: USER_ROLES.SALES_REP,
    notes: 'مندوب المبيعات الرئيسي — الخرطوم',
  },
  {
    name: 'عثمان إبراهيم علي',
    email: 'rep2@pharma.local',
    phone: '+249900000005',
    password: 'Rep@123456',
    role: USER_ROLES.SALES_REP,
    notes: 'مندوب المبيعات — أم درمان والخرطوم بحري',
  },
  {
    name: 'خالد عبدالله محمود',
    email: 'rep3@pharma.local',
    phone: '+249900000006',
    password: 'Rep@123456',
    role: USER_ROLES.SALES_REP,
    notes: 'مندوب المبيعات — بورتسودان والشرق',
  },
  {
    name: 'يوسف عمر الطيب',
    email: 'rep4@pharma.local',
    phone: '+249900000007',
    password: 'Rep@123456',
    role: USER_ROLES.SALES_REP,
    notes: 'مندوب المبيعات — ود مدني والجزيرة',
  },
]);

// ============================================================
// 2) زرع المستخدمين
// ============================================================

/**
 * إنشاء/تحديث المستخدمين الاختبار.
 * @returns {Promise<void>}
 */
const seedTestUsers = async () => {
  logger.info('👥 زرع المستخدمين الاختبار...');

  for (const userData of TEST_USERS) {
    // التحقق من وجود الدور
    const roleExists = await Role.findOne({
      name: userData.role,
      isActive: true,
    })
      .select('_id')
      .lean();

    if (!roleExists) {
      logger.error(`   ❌ الدور "${userData.role}" غير موجود. شغّل: npm run seed`);
      throw new Error(`الدور ${userData.role} غير موجود.`);
    }

    const existing = await User.findOne({ email: userData.email });

    if (existing) {
      // نُحدّث البيانات (للاختبار السريع)
      existing.name = userData.name;
      existing.phone = userData.phone;
      existing.role = userData.role;
      existing.password = await hashPassword(userData.password);
      existing.isActive = true;
      existing.mustChangePassword = false;
      // نُبقي linkedEntity كما هو للمندوبين (إن كان مربوطاً)
      if (userData.role === USER_ROLES.PHARMACY) {
        existing.linkedEntity = userData.linkedEntity || { type: null, id: null };
      }
      existing.notes = userData.notes || '';
      existing.resetLoginAttempts();
      await existing.save();

      logger.debug(`   ↻ حُدّث: ${userData.email} (${userData.role})`);
    } else {
      await User.create({
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        password: await hashPassword(userData.password),
        role: userData.role,
        isActive: true,
        mustChangePassword: false,
        linkedEntity: userData.linkedEntity || { type: null, id: null },
        notes: userData.notes || '',
      });

      logger.success(`   ✚ أُنشئ: ${userData.email} (${userData.role})`);
    }
  }

  // ─── جدول بيانات الدخول ───
  logger.info('');
  logger.info('   ┌────────────────────────────────────────────────────────────────────┐');
  logger.info('   │  🔑 بيانات الدخول للاختبار                                          │');
  logger.info('   ├────────────────────────────────────────────────────────────────────┤');
  logger.info('   │  الدور        │ البريد                    │ كلمة المرور           │');
  logger.info('   ├────────────────────────────────────────────────────────────────────┤');
  logger.info('   │  admin        │ admin@pharma-system.local │ Admin@123456          │');
  logger.info('   │  storekeeper  │ store@pharma.local        │ Store@123             │');
  logger.info('   │  accountant   │ account@pharma.local      │ Account@123           │');
  logger.info('   │  pharmacy     │ pharmacy@pharma.local     │ Pharma@123            │');
  logger.info('   │  sales_rep 1  │ rep@pharma.local          │ Rep@123456            │');
  logger.info('   │  sales_rep 2  │ rep2@pharma.local         │ Rep@123456            │');
  logger.info('   │  sales_rep 3  │ rep3@pharma.local         │ Rep@123456            │');
  logger.info('   │  sales_rep 4  │ rep4@pharma.local         │ Rep@123456            │');
  logger.info('   └────────────────────────────────────────────────────────────────────┘');
};

// ============================================================
// 3) التشغيل الرئيسي
// ============================================================

const run = async () => {
  const startTime = Date.now();

  logger.info('🌱 بدء تعبئة المستخدمين الاختبار...');
  logger.info('');

  try {
    await connectDatabase();
    logger.info('');

    await seedTestUsers();
    logger.info('');

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.success(`✅ اكتمل في ${elapsed} ثانية.`);
    logger.info('');
    logger.info('📌 التالي: npm run seed:master (البيانات الرئيسية)');
    logger.info('');
  } catch (error) {
    logger.error('');
    logger.error(`❌ فشل: ${error.message}`);
    if (env.NODE_ENV !== 'production') {
      logger.error(error.stack || '');
    }
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
    await mongoose.connection.close();
  }
};

run().catch((error) => {
  logger.error(`❌ خطأ فادح: ${error.message}`);
  process.exit(1);
});