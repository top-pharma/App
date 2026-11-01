/**
 * @file seed-phase3-finance.js
 * @description زرع بيانات Phase 3 (المالية) — دفاعي.
 */

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { User, USER_ROLES } from '../models/User.js';

// ─── محاولة استيراد نماذج Phase 3 (قد تفشل) ───
let CashFund, BankAccount, Check, CashTransaction, Customer, Supplier;
let phase3Available = true;

try {
  ({ CashFund } = await import('../models/CashFund.js'));
  ({ BankAccount } = await import('../models/BankAccount.js'));
  ({ Check } = await import('../models/Check.js'));
  ({ CashTransaction } = await import('../models/CashTransaction.js'));
  ({ Customer } = await import('../models/Customer.js'));
  ({ Supplier } = await import('../models/Supplier.js'));

  // تحقق فعلي من نجاح الاستيراد
  if (
    typeof CashFund?.create !== 'function' ||
    typeof BankAccount?.create !== 'function' ||
    typeof Check?.create !== 'function' ||
    typeof CashTransaction?.create !== 'function'
  ) {
    phase3Available = false;
    logger.warn('⚠️  Phase 3 models مستوردة لكن الدوال غير متاحة');
  }
} catch (err) {
  phase3Available = false;
  logger.warn(`⚠️  Phase 3 models غير متوفرة: ${err.message}`);
}

async function main() {
  logger.info('═══════════════════════════════════════════════');
  logger.info('🌱 Pharma System — Phase 3 Finance Seed');
  logger.info('═══════════════════════════════════════════════');

  if (!phase3Available) {
    logger.warn('⚠️  Phase 3 غير مطبَّقة في الكود الحالي.');
    logger.warn('   تخطي الزرع بأمان.');
    process.exit(0);
  }

  await connectDatabase();

  try {
    const admin = await User.findOne({ role: USER_ROLES.ADMIN, isActive: true });
    if (!admin) throw new Error('❌ لا يوجد admin. شغّل: npm run seed');

    // ─── CashFund افتراضي ───
    let defaultFund = await CashFund.findOne({ isDefault: true });
    if (!defaultFund) {
      defaultFund = await CashFund.create({
        name: 'الصندوق الرئيسي',
        code: 'CF-MAIN',
        notes: 'الصندوق الافتراضي للشركة',
        openingBalance: 0,
        currentBalance: 0,
        isDefault: true,
        isActive: true,
        createdBy: admin._id,
      });
      logger.info('   ✅ CashFund افتراضي.');
    } else {
      logger.info('   ℹ️  CashFund افتراضي موجود.');
    }

    // ── تحقق من أن اسم الحقل الصحيح (قد يكون mainWarehouse في النموذج) ──
    // defaultFund موجود بالفعل، لا حاجة لتعديله.

    // ─── BankAccount واحد ───
    let bankAccount = await BankAccount.findOne({ isActive: true });
    if (!bankAccount) {
      bankAccount = await BankAccount.create({
        name: 'الحساب البنكي الرئيسي',
        bankName: 'بنك الخرطوم',
        accountNumber: '1234567890',
        branchName: 'الفرع الرئيسي',
        currency: 'SDG',
        openingBalance: 0,
        currentBalance: 0,
        isActive: true,
        isDefault: true,
        createdBy: admin._id,
      });
      logger.info('   ✅ BankAccount رئيسي.');
    } else {
      logger.info('   ℹ️  BankAccount موجود.');
    }

    // ─── شيكات تجريبية ───
    const existingChecks = await Check.countDocuments();
    if (existingChecks === 0) {
      const baseDate = new Date();
      const addDays = (n) =>
        new Date(baseDate.getTime() + n * 24 * 60 * 60 * 1000);

      const customer = Customer
        ? await Customer.findOne({ isActive: true }).lean()
        : null;
      const supplier = Supplier
        ? await Supplier.findOne({ isActive: true }).lean()
        : null;

      const checksToCreate = [];

      if (customer) {
        checksToCreate.push({
          checkNumber: 'CHK-IN-001',
          type: 'incoming',
          amount: 5000,
          bankName: 'بنك فيصل',
          issueDate: addDays(-5),
          dueDate: addDays(10),
          customerId: customer._id,
          status: 'pending',
          createdBy: admin._id,
        });
      }

      if (supplier) {
        checksToCreate.push({
          checkNumber: 'CHK-OUT-001',
          type: 'outgoing',
          amount: 8000,
          bankName: 'بنك أم درمان',
          issueDate: addDays(-20),
          dueDate: addDays(-2),
          supplierId: supplier._id,
          status: 'pending',
          createdBy: admin._id,
        });
      }

      if (checksToCreate.length > 0) {
        await Check.create(checksToCreate);
        logger.info(`   ✅ ${checksToCreate.length} شيك تجريبي.`);
      } else {
        logger.warn('   ⚠️  لا يوجد عملاء/موردين — تخطي الشيكات.');
      }
    } else {
      logger.info(`   ℹ️  ${existingChecks} شيك موجود بالفعل.`);
    }

    logger.info('');
    logger.info('🎉 اكتمل Phase 3 Finance Seed.');
    logger.info('');
  } catch (error) {
    logger.error(`❌ فشل: ${error.message}`);
    logger.error(error.stack || '');
    throw error;
  } finally {
    await disconnectDatabase();
  }
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));