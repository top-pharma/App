/**
 * @file seed-all.js
 * @description
 * منسّق Seed شامل — يشغّل كل سكربتات الزرع بالترتيب الصحيح.
 *
 * ✅ v10.2 (2026-11-13):
 * - retry تلقائي عند فشل الاتصال (2 محاولات).
 * - MONGO_TIMEOUT أطول (60s).
 * - تخطي seed.js إذا roles موجودة (لتوفير الوقت).
 * - spawn مع env صحيح — cwd = backend/.
 *
 * التشغيل:
 *   node src/scripts/seed-all.js --yes --force
 *   npm run seed:all -- --yes --force
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BACKEND_DIR = join(__dirname, '..');

// ─── Parse CLI ───
const args = process.argv.slice(2);
const FORCE = args.includes('--force') || args.includes('-f');
const YES = args.includes('--yes') || args.includes('-y');
const SKIP_SEED_JS = args.includes('--skip-seed-js');

// ─── خطوات Seed ───
const STEPS = [
  {
    name: 'seed.js — أساسيات (roles, admin, categories, warehouse, settings)',
    script: 'seed.js',
    critical: true,
    optional: SKIP_SEED_JS, // تخطي إذا roles موجودة
  },
  {
    name: 'seed-test-users.js — 7 مستخدمين اختبار',
    script: 'seed-test-users.js',
    critical: true,
  },
  {
    name: 'seed-master-data.js — موردون، أصناف، صيدليات، مخزون',
    script: 'seed-master-data.js',
    critical: true,
  },
  {
    name: 'seed-phase3-finance.js — صناديق، بنك',
    script: 'seed-phase3-finance.js',
    critical: true,
  },
  {
    name: 'seed-test-invoices.js — فواتير، مرتجعات، حركات نقدية',
    script: 'seed-test-invoices.js',
    critical: false,
  },
];

// ─── Helpers ───
async function checkDatabaseState() {
  const db = mongoose.connection.db;
  const collections = ['roles', 'users', 'items', 'invoices', 'customers', 'stocks', 'cashfunds'];
  const counts = {};
  for (const col of collections) {
    try {
      counts[col] = await db.collection(col).countDocuments();
    } catch {
      counts[col] = 0;
    }
  }
  const totalDocs = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, totalDocs, hasData: totalDocs > 0 };
}

async function confirm(question) {
  if (YES) {
    logger.info(`${question} → YES (auto)`);
    return true;
  }
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`${question} [yes/no]: `);
    return ['y', 'yes', 'نعم'].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}

/**
 * تشغيل سكربت مع retry.
 * @param {string} scriptName
 * @param {number} maxRetries
 */
async function runScript(scriptName, maxRetries = 2) {
  const scriptPath = join(__dirname, scriptName);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [scriptPath], {
        stdio: 'inherit',
        env: {
          ...process.env,
          // ✅ v10.2 — timeout أطول لـ Atlas
          MONGO_CONNECT_TIMEOUT_MS: '60000',
          MONGO_SOCKET_TIMEOUT_MS: '90000',
          MONGO_SERVER_SELECTION_TIMEOUT_MS: '60000',
        },
        cwd: BACKEND_DIR,
      });
      child.on('exit', (code) => resolve({ code, ok: code === 0 }));
      child.on('error', (err) => resolve({ code: -1, ok: false, error: err.message }));
    });

    if (result.ok) return;

    if (attempt < maxRetries) {
      logger.warn(`⚠️  محاولة ${attempt}/${maxRetries} فشلت — إعادة المحاولة بعد 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
    } else {
      throw new Error(`${scriptName} فشل بعد ${maxRetries} محاولات`);
    }
  }
}

// ─── Main ───
async function main() {
  logger.info('╔══════════════════════════════════════════════════╗');
  logger.info('║  🌱 Pharma System — Seed ALL (v10.2)             ║');
  logger.info('╚══════════════════════════════════════════════════╝');

  // 1) Connect DB
  await connectDatabase();

  // 2) Check state
  const state = await checkDatabaseState();
  logger.info('');
  logger.info('📊 الحالة الحالية:');
  for (const [col, count] of Object.entries(state.counts)) {
    const icon = count > 0 ? '🟡' : '⚪';
    logger.info(`   ${icon} ${col}: ${count}`);
  }
  logger.info(`   📈 الإجمالي: ${state.totalDocs}`);

  // 3) تخطي seed.js إذا roles موجودة
  const skipSeedJs = state.counts.roles >= 6;
  if (skipSeedJs) {
    logger.info('');
    logger.info('⏭️  roles: 6 موجودة — تخطي seed.js');
  }

  // 4) Confirm
  if (state.hasData && !FORCE) {
    logger.warn('');
    logger.warn('⚠️  القاعدة تحتوي بيانات — بعض السكربتات قد تكرر/تمسح.');
    const proceed = await confirm('هل تريد المتابعة؟');
    if (!proceed) {
      logger.info('❌ أُلغي.');
      await disconnectDatabase();
      process.exit(0);
    }
  }

  // 5) Run steps
  const startTime = Date.now();
  const results = [];

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];

    // تخطي seed.js إذا roles موجودة
    if (step.script === 'seed.js' && skipSeedJs) {
      results.push({ ...step, ok: true, skipped: true, duration: '0' });
      logger.info('');
      logger.info(`⏭️  [${i + 1}/${STEPS.length}] ${step.name} — متخطى`);
      continue;
    }

    logger.info('');
    logger.info(`▶ [${i + 1}/${STEPS.length}] ${step.name}...`);

    const stepStart = Date.now();
    try {
      await runScript(step.script);
      const dur = ((Date.now() - stepStart) / 1000).toFixed(1);
      results.push({ ...step, ok: true, duration: dur });
      logger.info(`✅ [${i + 1}/${STEPS.length}] نجح (${dur}s)`);
    } catch (error) {
      const dur = ((Date.now() - stepStart) / 1000).toFixed(1);
      results.push({ ...step, ok: false, duration: dur, error: error.message });
      logger.error(`❌ [${i + 1}/${STEPS.length}] فشل: ${error.message} (${dur}s)`);
      if (step.critical) {
        logger.error('🛑 خطوة حرجة فشلت — التوقف.');
        break;
      }
    }
  }

  // 6) Summary
  await disconnectDatabase();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info('');
  logger.info('╔══════════════════════════════════════════════════╗');
  logger.info('║  📊 الملخص النهائي                               ║');
  logger.info('╚══════════════════════════════════════════════════╝');
  let okCount = 0;
  for (const r of results) {
    const icon = r.skipped ? '⏭️ ' : r.ok ? '✅' : '⚠️ ';
    const label = r.skipped ? 'متخطى' : r.ok ? 'نجح' : 'فشل';
    logger.info(`  ${icon} ${r.name} — ${label} (${r.duration}s)`);
    if (r.ok) okCount++;
  }
  logger.info('');
  logger.info(`⏱️  الإجمالي: ${elapsed}s`);
  logger.info(`✅ نجح: ${okCount}/${results.length}`);
  logger.info('');

  if (okCount === results.length) {
    logger.info('🎉 Seed شامل اكتمل بنجاح!');
    logger.info('');
    logger.info('🔐 بيانات الدخول:');
    logger.info('   admin@pharma-system.local / Admin@123456');
    logger.info('   store@pharma.local        / Store@123');
    logger.info('   account@pharma.local      / Account@123');
    logger.info('   pharmacy@pharma.local     / Pharma@123');
    logger.info('   rep@pharma.local          / Rep@123456');
    logger.info('   rep2@pharma.local         / Rep@123456');
    logger.info('   rep3@pharma.local         / Rep@123456');
    logger.info('   rep4@pharma.local         / Rep@123456');
    process.exit(0);
  } else {
    logger.warn('⚠️  بعض الخطوات فشلت — راجع السجل أعلاه.');
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error(`💥 خطأ غير متوقع: ${err.message}`);
  logger.error(err.stack);
  process.exit(1);
});