/**
 * @file seed-admin-only.js
 * @description
 * سكربت خطير: يمحو قاعدة البيانات بالكامل، ثم ينشئ:
 *   1. 6 Roles (من DEFAULT_ROLES — 67 صلاحية لـ admin)
 *   2. User: admin@pharma-system.local / Admin@123456 (admin — 67 صلاحية)
 *   3. Settings (الافتراضية)
 *   4. CashFund افتراضي + BankAccount افتراضي
 *   5. Warehouse الرئيسي
 *   6. 5 تصنيفات نظامية
 *
 * ⚠️ تحذير: لا يمكن التراجع. استخدمه فقط في بيئة التطوير.
 *
 * التشغيل:
 *   cd backend
 *   node src/scripts/seed-admin-only.js
 *
 * ✅ v10.12 (2026-11-17):
 * - ينشئ 6 roles (بدل admin فقط) — ليعمل UsersPage.
 * - ينشئ settings (لأن security.* تحتاجها).
 * - ينشئ cashfund + bankaccount + warehouse + categories.
 * - لا يحتاج seed.js + seed-test-users + seed-master-data.
 * - بعد التشغيل: admin فقط — أضف الباقي من UsersPage.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

dotenv.config();

// ═══════════════════════════════════════════════
// 1. الاتصال
// ═══════════════════════════════════════════════
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb://0.0.0.0:27017/Top-Pharma';

// ═══════════════════════════════════════════════
// 2. بيانات الأدمن
// ═══════════════════════════════════════════════
const ADMIN_EMAIL = 'admin@pharma-system.local';
const ADMIN_PASSWORD = 'Admin@123456';
const ADMIN_NAME = 'مدير النظام';

// ═══════════════════════════════════════════════
// 3. التنفيذ
// ═══════════════════════════════════════════════
async function seedAdminOnly() {
  console.log('═══════════════════════════════════════════════');
  console.log('⚠️  تحذير: هذا السكربت سيمحو كل قاعدة البيانات');
  console.log('═══════════════════════════════════════════════');
  console.log(`📡 الاتصال: ${MONGODB_URI.replace(/:[^@]+@/, ':****@')}`);
  console.log('');

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ متصل بقاعدة البيانات');
    console.log('');

    const db = mongoose.connection.db;

    // ─── 1) عرض + حذف Collections ───
    const collections = await db.listCollections().toArray();
    console.log(`📋 عدد Collections: ${collections.length}`);
    collections.forEach((c) => console.log(`   - ${c.name}`));
    console.log('');

    console.log('🗑️  حذف كل Collections...');
    for (const c of collections) {
      await db.collection(c.name).drop();
      console.log(`   ✅ حُذف: ${c.name}`);
    }
    console.log('');

    // ─── 2) استيراد Models ───
    const RoleModule = await import('../models/Role.js');
    const Role = RoleModule.default;
    const ALL_PERMISSIONS = RoleModule.ALL_PERMISSIONS;
    const DEFAULT_ROLES = RoleModule.DEFAULT_ROLES;

    if (!ALL_PERMISSIONS || !Array.isArray(ALL_PERMISSIONS)) {
      throw new Error('❌ ALL_PERMISSIONS غير موجود في Role.js');
    }
    if (!DEFAULT_ROLES || !Array.isArray(DEFAULT_ROLES)) {
      throw new Error('❌ DEFAULT_ROLES غير موجود في Role.js');
    }

    console.log(`📋 عدد الصلاحيات في Role.js: ${ALL_PERMISSIONS.length}`);
    console.log(`📋 عدد الأدوار الافتراضية: ${DEFAULT_ROLES.length}`);
    console.log('');

    // ─── 3) إنشاء 6 Roles ───
    console.log('🎭 إنشاء 6 Roles...');
    for (const roleData of DEFAULT_ROLES) {
      const role = await Role.create({
        code: roleData.code,
        name: roleData.name,
        description: roleData.description,
        permissions: roleData.permissions,
        isSystem: true,
      });
      console.log(
        `   ✅ ${role.code} — ${role.permissions.length} صلاحية`
      );
    }
    console.log('');

    // ─── 4) إنشاء User: admin ───
    console.log('👤 إنشاء User: admin...');
    const User = (await import('../models/User.js')).default;

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, salt);

    const user = await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: passwordHash,
      role: 'admin',
      isActive: true,
      mustChangePassword: false,
      linkedEntity: { type: null, id: null },
    });
    console.log(`   ✅ User: ${user.email}`);
    console.log(`   👤 الاسم: ${user.name}`);
    console.log(`   🔑 كلمة المرور: ${ADMIN_PASSWORD}`);
    console.log(`   🎭 الدور: ${user.role}`);
    console.log('');

    // ─── 5) إنشاء Settings ───
    console.log('⚙️  إنشاء Settings...');
    const Settings = (await import('../models/Settings.js')).default;
    await Settings.create({
      key: 'system',
      company: {
        name: 'TOP PHARMA MEDICAL COMPANY',
        nameEn: 'TOP PHARMA MEDICAL COMPANY',
        phone: '+249 123 456 789',
        email: 'info@toppharma.sd',
        address: 'الخرطوم - السودان',
        taxNumber: '',
        registrationNumber: '',
      },
      currency: { code: 'SDG', symbol: 'ج.س', decimals: 2 },
      locale: {
        language: 'ar',
        direction: 'rtl',
        calendar: 'gregorian',
        numerals: 'latin',
        timezone: 'Africa/Khartoum',
      },
      sales: {
        prefixes: {
          invoice: 'INV',
          customerReturn: 'RET',
          purchaseReceipt: 'PR',
          supplierReturn: 'SRET',
          cashTransaction: 'CT',
          salesRepTransaction: 'SRT',
        },
        defaultTaxRate: 0,
        returnGracePeriodDays: 7,
        defaultPaymentTerms: 30,
        allowNegativeStock: false,
        minMarginPercent: 10,
        maxDiscountPercent: 15,
        allowPriceOverrides: true,
        nearExpiryThresholdDays: 30,
        nearExpiryMaxDiscountPercent: 30,
      },
      inventory: {
        issuePolicy: 'FEFO',
        expiryWarningDays: 90,
        reorderWarningEnabled: true,
      },
      finance: {
        invoiceReminderDays: 3,
        remindersEnabled: true,
      },
      security: {
        sessionHours: 8,
        idleTimeoutMinutes: 30,
        maxFailedLogins: 5,
        lockDurationMinutes: 15,
        passwordMinLength: 8,
      },
      audit: { retentionDays: 365 },
      print: {
        showLogoWatermark: true,
        watermarkOpacity: 0.08,
        invoiceHeader: '',
        invoiceFooter: 'شكراً لتعاملكم معنا',
      },
    });
    console.log(`   ✅ Settings — key: system`);
    console.log('');

    // ─── 6) إنشاء Warehouse الرئيسي ───
    console.log('🏪 إنشاء Warehouse الرئيسي...');
    const Warehouse = (await import('../models/Warehouse.js')).default;
    const { WAREHOUSE_TYPES } = await import('../models/Warehouse.js');
    const warehouse = await Warehouse.create({
      name: 'المخزن الرئيسي',
      code: 'WH-MAIN',
      type: WAREHOUSE_TYPES.MAIN,
      isActive: true,
      isDefault: true,
      city: 'الخرطوم',
      address: 'الخرطوم - السودان',
      notes: 'المخزن الرئيسي للشركة',
      createdBy: user._id,
    });
    console.log(`   ✅ Warehouse: ${warehouse.code} — ${warehouse.name}`);
    console.log('');

    // ─── 7) إنشاء CashFund افتراضي ───
    console.log('💰 إنشاء CashFund افتراضي...');
    const CashFund = (await import('../models/CashFund.js')).default;
    const cashFund = await CashFund.create({
      name: 'الصندوق الرئيسي',
      code: 'CF-MAIN',
      notes: 'الصندوق الافتراضي للشركة',
      openingBalance: 0,
      currentBalance: 0,
      isDefault: true,
      isActive: true,
      createdBy: user._id,
    });
    console.log(`   ✅ CashFund: ${cashFund.code} — ${cashFund.name}`);
    console.log('');

    // ─── 8) إنشاء BankAccount افتراضي ───
    console.log('🏦 إنشاء BankAccount افتراضي...');
    const BankAccount = (await import('../models/BankAccount.js')).default;
    const bankAccount = await BankAccount.create({
      name: 'الحساب البنكي الرئيسي',
      bankName: 'بنك الخرطوم',
      accountNumber: '1234567890',
      branchName: 'الفرع الرئيسي',
      currency: 'SDG',
      openingBalance: 0,
      currentBalance: 0,
      createdBy: user._id,
    });
    console.log(`   ✅ BankAccount: ${bankAccount.accountNumber}`);
    console.log('');

    // ─── 9) إنشاء Categories النظامية ───
    console.log('📁 إنشاء Categories النظامية...');
    const Category = (await import('../models/Category.js')).default;
    const { SYSTEM_CATEGORIES } = await import('../models/Category.js');
    for (const cat of SYSTEM_CATEGORIES) {
      await Category.updateOne(
        { name: cat.name },
        {
          $setOnInsert: {
            name: cat.name,
            isSystem: true,
            isActive: true,
          },
          $set: {
            label: cat.label,
            description: cat.description,
          },
        },
        { upsert: true }
      );
    }
    console.log(`   ✅ ${SYSTEM_CATEGORIES.length} تصنيف نظامي`);
    console.log('');

    // ─── 10) التحقق النهائي ───
    console.log('🔍 التحقق النهائي:');
    const userCount = await User.countDocuments();
    const roleCount = await Role.countDocuments();
    const settingsCount = await Settings.countDocuments();
    const warehouseCount = await Warehouse.countDocuments();
    const cashFundCount = await CashFund.countDocuments();
    const bankAccountCount = await BankAccount.countDocuments();
    const categoryCount = await Category.countDocuments();
    console.log(`   - Users: ${userCount}`);
    console.log(`   - Roles: ${roleCount}`);
    console.log(`   - Settings: ${settingsCount}`);
    console.log(`   - Warehouses: ${warehouseCount}`);
    console.log(`   - CashFunds: ${cashFundCount}`);
    console.log(`   - BankAccounts: ${bankAccountCount}`);
    console.log(`   - Categories: ${categoryCount}`);
    console.log('');

    // ─── 11) اختبار كلمة المرور ───
    console.log('🧪 اختبار كلمة المرور...');
    const testUser = await User.findOne({ email: ADMIN_EMAIL }).select('+password');
    if (testUser) {
      const isMatch = await bcrypt.compare(ADMIN_PASSWORD, testUser.password);
      console.log(`   ${isMatch ? '✅' : '❌'} كلمة المرور ${isMatch ? 'صحيحة' : 'خاطئة'}`);
    }
    console.log('');

    console.log('═══════════════════════════════════════════════');
    console.log('✅ تم إعادة تعيين قاعدة البيانات بنجاح');
    console.log('═══════════════════════════════════════════════');
    console.log('');
    console.log('🔐 بيانات الدخول:');
    console.log(`   📧 Email: ${ADMIN_EMAIL}`);
    console.log(`   🔑 Password: ${ADMIN_PASSWORD}`);
    console.log('');
    console.log('📌 الخطوات التالية:');
    console.log('   1. سجّل دخول كـ admin');
    console.log('   2. اذهب إلى /users');
    console.log('   3. أضف المستخدمين (storekeeper, accountant, ...)');
    console.log('   4. كل الصلاحيات جاهزة من الأدوار الستة');
    console.log('');
    console.log('⚠️  تذكر: كلمة المرور ضعيفة — غيّرها فوراً بعد الدخول');
    console.log('');
  } catch (err) {
    console.error('');
    console.error('❌ خطأ:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 تم قطع الاتصال');
  }
}

// ═══════════════════════════════════════════════
// 4. تشغيل
// ═══════════════════════════════════════════════
seedAdminOnly();