/**
 * @file seed-phase3-finance.js
 * @description زرع بيانات Phase 3 (المالية) — دفاعي.
 *
 * ✅ v10.1 (2026-11-13):
 * - إزالة Check (أُلغي في 🅲).
 * - BankAccount بدون isActive/isDefault (بعد 🅹).
 * - CashFund بـ isDefault فقط.
 */

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { User, USER_ROLES } from '../models/User.js';
import { CashFund } from '../models/CashFund.js';
import { BankAccount } from '../models/BankAccount.js';

async function main() {
  logger.info('═══════════════════════════════════════════════');
  logger.info('🌱 Pharma System — Phase 3 Finance Seed');
  logger.info('═══════════════════════════════════════════════');

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

    // ─── BankAccount واحد (بدون isActive/isDefault) ───
    let bankAccount = await BankAccount.findOne({ accountNumber: '1234567890' });
    if (!bankAccount) {
      bankAccount = await BankAccount.create({
        name: 'الحساب البنكي الرئيسي',
        bankName: 'بنك الخرطوم',
        accountNumber: '1234567890',
        branchName: 'الفرع الرئيسي',
        currency: 'SDG',
        openingBalance: 0,
        currentBalance: 0,
        createdBy: admin._id,
      });
      logger.info('   ✅ BankAccount رئيسي.');
    } else {
      logger.info('   ℹ️  BankAccount موجود.');
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