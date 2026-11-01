/**
 * @file seed-all.js
 * @description
 * منسّق Seed شامل — يشغّل كل سكربتات الزرع بالترتيب الصحيح.
 *
 * البيئة:
 *  - MONGODB_URI: من .env (محلي أو Atlas — كلاهما يعمل)
 *  - لا توجد فحوصات Atlas خاصة
 *
 * الأمان:
 *  - يفحص عدد المستندات في users قبل البدء
 *  - يطلب تأكيداً عند وجود بيانات (interactive)
 *  - يدعم --force لتجاوز الحماية
 *
 * التشغيل:
 *   cd backend
 *   npm run seed:all              ← آمن (يطلب تأكيد عند وجود بيانات)
 *   npm run seed:all -- --force   ← متجاوز (استخدم بحذر)
 *   node src/scripts/seed-all.js --skip-jobs   ← بدون اختبار Jobs
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import mongoose from 'mongoose';

// ─── تحميل .env ───
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Parse CLI flags ───
const args = process.argv.slice(2);
const FORCE = args.includes('--force') || args.includes('-f');
const SKIP_JOBS = args.includes('--skip-jobs');
const YES = args.includes('--yes') || args.includes('-y');

// ─── Steps ───
const STEPS = [
  {
    name: 'seed.js (أساسيات: roles, admin, categories, warehouse, settings)',
    script: 'seed.js',
    critical: true,
  },
  {
    name: 'seed-test-users.js (5 مستخدمين اختبار)',
    script: 'seed-test-users.js',
    critical: true,
  },
  {
    name: 'seed-master-data.js (موردون، أصناف، عملاء، مخزون)',
    script: 'seed-master-data.js',
    critical: true,
  },
  {
    name: 'seed-phase3-finance.js (صناديق، بنك، شيكات)',
    script: 'seed-phase3-finance.js',
    critical: false,
  },
  {
    name: 'seed-test-invoices.js (فواتير، مرتجعات)',
    script: 'seed-test-invoices.js',
    critical: false,
  },
  ...(SKIP_JOBS
    ? []
    : [
        {
          name: 'test-jobs.js (اختبار Jobs + إشعارات)',
          script: 'test-jobs.js',
          critical: false,
        },
      ]),
];

// ─── Helpers ───
function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    const scriptPath = join(__dirname, scriptName);
    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      env: process.env,
      cwd: join(__dirname, '..', '..'), // backend/
    });

    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`سكربت ${scriptName} خرج برمز ${code}`));
    });

    child.on('error', reject);
  });
}

/**
 * فحص القاعدة الحالية — هل تحتوي بيانات؟
 */
async function checkDatabaseState() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI غير موجود في .env');
    process.exit(1);
  }

  const isLocal =
    uri.includes('localhost') ||
    uri.includes('127.0.0.1') ||
    uri.includes('0.0.0.0');
  const label = isLocal ? 'MongoDB محلي' : 'MongoDB Atlas';
  console.log(`\n🔍 فحص القاعدة: ${label}`);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 30000,
    });

    const db = mongoose.connection.db;
    const collections = ['users', 'items', 'invoices', 'customers', 'suppliers'];
    const counts = {};

    for (const col of collections) {
      try {
        counts[col] = await db.collection(col).countDocuments();
      } catch {
        counts[col] = 0;
      }
    }

    const totalDocs = Object.values(counts).reduce((a, b) => a + b, 0);

    console.log('📊 الحالة الحالية:');
    for (const [col, count] of Object.entries(counts)) {
      const icon = count > 0 ? '🟡' : '⚪';
      console.log(`   ${icon} ${col}: ${count}`);
    }
    console.log(`   📈 الإجمالي: ${totalDocs} مستند\n`);

    return { hasData: totalDocs > 0, counts, totalDocs, isLocal };
  } finally {
    await mongoose.disconnect();
  }
}

/**
 * طلب تأكيد من المستخدم.
 */
async function confirm(question) {
  if (YES) {
    console.log(`${question} → YES (auto)`);
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

// ─── Main ───
async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  🌱 Pharma System — Seed ALL (شامل)              ║');
  console.log('╚══════════════════════════════════════════════════╝');

  // ─── 1. فحص البيئة ───
  const env = process.env.NODE_ENV || 'development';
  console.log(`\n🌍 NODE_ENV: ${env}`);
  console.log(`🔧 FORCE: ${FORCE}`);
  console.log(`🔧 SKIP_JOBS: ${SKIP_JOBS}\n`);

  if (env === 'production' && !FORCE) {
    console.error('❌ NODE_ENV=production — استخدم --force للتجاوز');
    process.exit(1);
  }

  // ─── 2. فحص القاعدة ───
  const state = await checkDatabaseState();

  // ─── 3. تأكيد عند وجود بيانات ───
  if (state.hasData && !FORCE) {
    console.log('⚠️  ═══════════════════════════════════════════════════');
    console.log('⚠️  تحذير: القاعدة تحتوي بيانات!');
    console.log('⚠️  بعض السكربتات قد تمسح أو تكرر البيانات.');
    console.log('⚠️  ═══════════════════════════════════════════════════\n');

    const proceed = await confirm('هل تريد المتابعة مع ذلك؟');
    if (!proceed) {
      console.log('\n❌ أُلغي بواسطة المستخدم.\n');
      process.exit(0);
    }
  }

  // ─── 4. تنفيذ Steps ───
  const startTime = Date.now();
  const results = [];

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    console.log(`\n▶ [${i + 1}/${STEPS.length}] ${step.name}...\n`);

    const stepStart = Date.now();
    try {
      await runScript(step.script);
      const dur = ((Date.now() - stepStart) / 1000).toFixed(1);
      results.push({ ...step, ok: true, duration: dur });
      console.log(`✅ [${i + 1}/${STEPS.length}] ${step.name} — نجح (${dur}s)\n`);
    } catch (error) {
      const dur = ((Date.now() - stepStart) / 1000).toFixed(1);
      results.push({ ...step, ok: false, duration: dur, error: error.message });
      console.error(
        `❌ [${i + 1}/${STEPS.length}] ${step.name} — فشل: ${error.message} (${dur}s)\n`
      );

      if (step.critical) {
        console.error('🛑 خطوة حرجة فشلت — التوقف.\n');
        process.exit(1);
      }
    }
  }

  // ─── 5. الملخص ───
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  📊 الملخص النهائي                               ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  let successCount = 0;
  let failCount = 0;
  for (const r of results) {
    const icon = r.ok ? '✅' : '⚠️ ';
    console.log(`  ${icon} ${r.name} (${r.duration}s)`);
    if (r.ok) successCount++;
    else failCount++;
  }

  console.log(`\n⏱️  الإجمالي: ${elapsed}s`);
  console.log(`✅ نجح: ${successCount}/${results.length}`);
  console.log(`❌ فشل: ${failCount}/${results.length}\n`);

  if (failCount === 0) {
    console.log('🎉 Seed شامل اكتمل بنجاح!\n');
    console.log('🔐 بيانات الدخول:');
    console.log('   admin@pharma-system.local / Admin@123456\n');
    console.log('   store@pharma.local     / Store@123');
    console.log('   account@pharma.local   / Account@123');
    console.log('   pharmacy@pharma.local  / Pharma@123');
    console.log('   rep@pharma.local       / Rep@123456\n');
  } else {
    console.log('⚠️  بعض الخطوات فشلت — راجع السجل أعلاه.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n💥 خطأ غير متوقع: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});