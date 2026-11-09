/**
 * @file accountingService.js
 * @description
 * قلب النظام المحاسبي في Phase 3.
 *
 * كل عملية مالية (فاتورة، دفع، مرتجع، مشتريات، تحويل صندوق، مصروف)
 * يجب أن تمر من هنا لإنشاء القيد المحاسبي المناسب.
 *
 * المبادئ:
 *  - لا نُنشئ قيداً إلا إذا كان مجموع المدين = مجموع الدائن (Double-entry).
 *  - كل قيد مرتبط بمصدره (sourceType + sourceId) لمنع التكرار.
 *  - لا نستخدم MongoDB Transactions (standalone) → Rollback يدوي.
 *  - القيود immutable بعد الإنشاء — التصحيح بقيد عكسي.
 *
 * ✅ 🅲 (2026-11-08):
 *  - حُذفت دوال الشيكات:
 *    createCheckReceivedEntry / createCheckCollectedEntry / createCheckBouncedEntry.
 *  - حُذف CHECK_RECEIVABLE / CHECKS_PAYABLE من ACCOUNT_CODES.
 *  - createCustomerPaymentEntry — حُذف paymentMethod='check' (فقط cash + bank).
 */

import mongoose from 'mongoose';
import AccountingEntry from '../models/AccountingEntry.js';
import CashFund from '../models/CashFund.js';
import BankAccount from '../models/BankAccount.js';
import Settings from '../models/Settings.js';
import logger from '../utils/logger.js';
import { AppError } from '../middlewares/errorMiddleware.js';

/* ─────────────────────────────────────────────────────────────
 * 1) خريطة الحسابات (Chart of Accounts)
 * ─────────────────────────────────────────────────────────────
 * ✅ 🅲: حُذف CHECKS_RECEIVABLE + CHECKS_PAYABLE (Check أُلغي).
 */
export const ACCOUNT_CODES = Object.freeze({
  CASH: '1001',
  BANK: '1002',
  // ⚠️ 🅲: حُذف CHECKS_RECEIVABLE ('1003')
  // ⚠️ 🅲: حُذف CHECKS_PAYABLE ('2001')
  ACCOUNTS_RECEIVABLE: '1101',
  ACCOUNTS_PAYABLE: '2101',
  INVENTORY: '1201',
  SALES_REVENUE: '4001',
  SALES_RETURNS: '4002',
  COST_OF_GOODS_SOLD: '5001',
  PURCHASES: '5002',
  GENERAL_EXPENSE: '6001',
  OPENING_EQUITY: '3001',
});

/* ─────────────────────────────────────────────────────────────
 * 2) Helpers
 * ───────────────────────────────────────────────────────────── */

const round2 = (amount) => Math.round((Number(amount) + Number.EPSILON) * 100) / 100;

/**
 * يُولّد رقم قيد فريد: JE-YYYYMM-000001
 * @returns {Promise<string>}
 */
const generateEntryNumber = async () => {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `JE-${yyyymm}-`;

  const lastEntry = await AccountingEntry.findOne({
    entryNumber: { $regex: `^${prefix}` },
  })
    .sort({ entryNumber: -1 })
    .select('entryNumber')
    .lean();

  let sequence = 1;
  if (lastEntry && lastEntry.entryNumber) {
    const parts = lastEntry.entryNumber.split('-');
    const lastSeq = parseInt(parts[2], 10);
    if (!Number.isNaN(lastSeq)) sequence = lastSeq + 1;
  }

  return `${prefix}${String(sequence).padStart(6, '0')}`;
};

/**
 * يجلب الـ Settings ويُرجع تاريخ بداية السنة المالية.
 * @returns {Promise<Date>}
 */
const getFiscalYearStart = async () => {
  const settings = await Settings.findOne({ key: 'system' }).lean();
  if (settings?.fiscalYearStart) return new Date(settings.fiscalYearStart);
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1);
};

/* ─────────────────────────────────────────────────────────────
 * 3) الدالة الجوهرية: createEntry
 * ─────────────────────────────────────────────────────────────
 * @param {Object} params
 * @param {string} params.entryType
 * @param {Date}   [params.entryDate=new Date()]
 * @param {string} [params.description]
 * @param {Array<{accountCode:string, accountName:string, debit:number, credit:number, description?:string}>} params.lines
 * @param {string} [params.sourceType]
 * @param {mongoose.Types.ObjectId} [params.sourceId]
 * @param {mongoose.Types.ObjectId} [params.cashFundId]
 * @param {mongoose.Types.ObjectId} [params.bankAccountId]
 * @param {Object} [params.user]
 * @param {Object} [params.meta]
 * @returns {Promise<Object>}
 */
export const createEntry = async ({
  entryType,
  entryDate = new Date(),
  description,
  lines,
  sourceType,
  sourceId,
  cashFundId,
  bankAccountId,
  user,
  meta = {},
}) => {
  // 1) التحقق من المدخلات
  if (!entryType) {
    throw new AppError('entryType مطلوب لإنشاء القيد', 400, 'MISSING_ENTRY_TYPE');
  }
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new AppError('القيد يحتاج سطرين على الأقل (مدين + دائن)', 400, 'INVALID_LINES');
  }

  // 2) التحقق من التوازن
  const totalDebit = round2(lines.reduce((s, l) => s + Number(l.debit || 0), 0));
  const totalCredit = round2(lines.reduce((s, l) => s + Number(l.credit || 0), 0));

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new AppError(
      `القيد غير متوازن: مدين=${totalDebit} دائن=${totalCredit}`,
      400,
      'UNBALANCED_ENTRY'
    );
  }

  if (totalDebit === 0) {
    throw new AppError('القيد لا يمكن أن يكون صفراً', 400, 'ZERO_ENTRY');
  }

  // 3) التحقق من صحة كل سطر
  for (const line of lines) {
    if (!line.accountCode) {
      throw new AppError('كل سطر يحتاج accountCode', 400, 'MISSING_ACCOUNT_CODE');
    }
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);
    if (debit < 0 || credit < 0) {
      throw new AppError('المبالغ لا يمكن أن تكون سالبة', 400, 'NEGATIVE_AMOUNT');
    }
    if (debit === 0 && credit === 0) {
      throw new AppError('السطر يحتاج مبلغاً في المدين أو الدائن', 400, 'EMPTY_LINE');
    }
    if (debit > 0 && credit > 0) {
      throw new AppError('السطر لا يمكن أن يحمل مدين ودائن معاً', 400, 'BOTH_SIDES');
    }
  }

  // 4) منع التكرار (sourceType + sourceId + entryType)
  if (sourceType && sourceId) {
    const existing = await AccountingEntry.findOne({
      sourceType,
      sourceId,
      entryType,
      isReversed: { $ne: true },
    }).lean();
    if (existing) {
      logger.warn(
        `[accountingService] قيد مكرر مُحاوَل: ${entryType} / ${sourceType} / ${sourceId} — تم تجاهله`
      );
      return existing;
    }
  }

  // 5) توليد رقم القيد
  const entryNumber = await generateEntryNumber();

  // 6) إنشاء القيد
  const entryDoc = await AccountingEntry.create({
    entryNumber,
    entryDate,
    entryType,
    description: description || `${entryType} — ${entryNumber}`,
    lines: lines.map((l) => ({
      accountCode: l.accountCode,
      accountName: l.accountName || l.accountCode,
      debit: round2(l.debit || 0),
      credit: round2(l.credit || 0),
      description: l.description || '',
    })),
    totalDebit,
    totalCredit,
    sourceType,
    sourceId,
    cashFundId: cashFundId || null,
    bankAccountId: bankAccountId || null,
    createdBy: user?._id || null,
    meta,
  });

  logger.info(
    `[accountingService] قيد جديد: ${entryNumber} | ${entryType} | مدين=${totalDebit} دائن=${totalCredit}`
  );

  return entryDoc;
};

/* ─────────────────────────────────────────────────────────────
 * 4) دوال جاهزة لكل نوع قيد
 * ───────────────────────────────────────────────────────────── */

/**
 * قيد بيع نقدي (صندوق مدين / إيرادات دائن + COGS).
 */
export const createSaleCashEntry = async ({
  amount,
  costAmount = 0,
  date = new Date(),
  sourceType,
  sourceId,
  cashFundId,
  user,
  description,
}) => {
  const lines = [
    {
      accountCode: ACCOUNT_CODES.CASH,
      accountName: 'الصندوق النقدي',
      debit: amount,
      credit: 0,
      description: 'استلام نقدي',
    },
    {
      accountCode: ACCOUNT_CODES.SALES_REVENUE,
      accountName: 'إيرادات المبيعات',
      debit: 0,
      credit: amount,
      description: 'إيراد بيع',
    },
  ];

  if (costAmount > 0) {
    lines.push(
      {
        accountCode: ACCOUNT_CODES.COST_OF_GOODS_SOLD,
        accountName: 'تكلفة البضاعة المباعة',
        debit: costAmount,
        credit: 0,
        description: 'تكلفة بضاعة مباعة',
      },
      {
        accountCode: ACCOUNT_CODES.INVENTORY,
        accountName: 'المخزون',
        debit: 0,
        credit: costAmount,
        description: 'خروج مخزون',
      }
    );
  }

  return createEntry({
    entryType: 'SALE_CASH',
    entryDate: date,
    description: description || 'بيع نقدي',
    lines,
    sourceType,
    sourceId,
    cashFundId,
    user,
  });
};

/**
 * قيد بيع آجل (ذمم مدينة / إيرادات + COGS).
 */
export const createSaleCreditEntry = async ({
  amount,
  costAmount = 0,
  date = new Date(),
  sourceType,
  sourceId,
  user,
  description,
}) => {
  const lines = [
    {
      accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
      accountName: 'ذمم العملاء',
      debit: amount,
      credit: 0,
      description: 'بيع آجل',
    },
    {
      accountCode: ACCOUNT_CODES.SALES_REVENUE,
      accountName: 'إيرادات المبيعات',
      debit: 0,
      credit: amount,
      description: 'إيراد بيع',
    },
  ];

  if (costAmount > 0) {
    lines.push(
      {
        accountCode: ACCOUNT_CODES.COST_OF_GOODS_SOLD,
        accountName: 'تكلفة البضاعة المباعة',
        debit: costAmount,
        credit: 0,
        description: 'تكلفة بضاعة مباعة',
      },
      {
        accountCode: ACCOUNT_CODES.INVENTORY,
        accountName: 'المخزون',
        debit: 0,
        credit: costAmount,
        description: 'خروج مخزون',
      }
    );
  }

  return createEntry({
    entryType: 'SALE_CREDIT',
    entryDate: date,
    description: description || 'بيع آجل',
    lines,
    sourceType,
    sourceId,
    user,
  });
};

/**
 * قيد تحصيل من عميل (نقدي / بنكي).
 *
 * ✅ 🅲: حُذف paymentMethod === 'check' — فقط cash + bank.
 */
export const createCustomerPaymentEntry = async ({
  amount,
  paymentMethod = 'cash',
  date = new Date(),
  sourceType,
  sourceId,
  cashFundId,
  bankAccountId,
  user,
  description,
}) => {
  const debitAccount =
    paymentMethod === 'bank'
      ? { code: ACCOUNT_CODES.BANK, name: 'البنك' }
      : { code: ACCOUNT_CODES.CASH, name: 'الصندوق النقدي' };

  return createEntry({
    entryType: 'CUSTOMER_PAYMENT',
    entryDate: date,
    description: description || 'تحصيل من عميل',
    lines: [
      {
        accountCode: debitAccount.code,
        accountName: debitAccount.name,
        debit: amount,
        credit: 0,
        description: 'استلام دفعة',
      },
      {
        accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
        accountName: 'ذمم العملاء',
        debit: 0,
        credit: amount,
        description: 'تخفيض ذمم',
      },
    ],
    sourceType,
    sourceId,
    cashFundId,
    bankAccountId,
    user,
  });
};

/**
 * قيد مشتريات (مخزون مدين / مورد أو صندوق دائن).
 */
export const createPurchaseEntry = async ({
  amount,
  paymentType = 'credit',
  date = new Date(),
  sourceType,
  sourceId,
  cashFundId,
  user,
  description,
}) => {
  const creditAccount =
    paymentType === 'cash'
      ? { code: ACCOUNT_CODES.CASH, name: 'الصندوق النقدي' }
      : { code: ACCOUNT_CODES.ACCOUNTS_PAYABLE, name: 'ذمم الموردين' };

  return createEntry({
    entryType: 'PURCHASE',
    entryDate: date,
    description: description || 'مشتريات',
    lines: [
      {
        accountCode: ACCOUNT_CODES.INVENTORY,
        accountName: 'المخزون',
        debit: amount,
        credit: 0,
        description: 'إدخال مخزون',
      },
      {
        accountCode: creditAccount.code,
        accountName: creditAccount.name,
        debit: 0,
        credit: amount,
        description: paymentType === 'cash' ? 'دفع نقدي' : 'ذمة مورد',
      },
    ],
    sourceType,
    sourceId,
    cashFundId,
    user,
  });
};

/**
 * قيد مرتجع بيع (إيرادات مدينة / صندوق أو ذمم دائن).
 */
export const createSaleReturnEntry = async ({
  amount,
  refundType = 'cash',
  date = new Date(),
  sourceType,
  sourceId,
  cashFundId,
  user,
  description,
}) => {
  const creditAccount =
    refundType === 'cash'
      ? { code: ACCOUNT_CODES.CASH, name: 'الصندوق النقدي' }
      : { code: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, name: 'ذمم العملاء' };

  return createEntry({
    entryType: 'SALE_RETURN',
    entryDate: date,
    description: description || 'مرتجع بيع',
    lines: [
      {
        accountCode: ACCOUNT_CODES.SALES_RETURNS,
        accountName: 'مردودات المبيعات',
        debit: amount,
        credit: 0,
        description: 'تخفيض إيراد',
      },
      {
        accountCode: creditAccount.code,
        accountName: creditAccount.name,
        debit: 0,
        credit: amount,
        description: refundType === 'cash' ? 'رد نقدي' : 'تخفيض ذمة',
      },
    ],
    sourceType,
    sourceId,
    cashFundId,
    user,
  });
};

/* ─────────────────────────────────────────────────────────────
 * ⚠️ 🅲: دوال الشيكات — محذوفة
 * ─────────────────────────────────────────────────────────────
 * - createCheckReceivedEntry  (CHECK_RECEIVED)
 * - createCheckCollectedEntry (CHECK_COLLECTED)
 * - createCheckBouncedEntry   (CHECK_BOUNCED)
 *
 * Check أُلغي — هذه الدوال لم تعد تُستخدم.
 */

/**
 * قيد تحويل بين صندوقين.
 */
export const createCashTransferEntry = async ({
  amount,
  fromFundId,
  toFundId,
  date = new Date(),
  user,
  description,
}) => {
  return createEntry({
    entryType: 'CASH_TRANSFER',
    entryDate: date,
    description: description || 'تحويل بين صناديق',
    lines: [
      {
        accountCode: ACCOUNT_CODES.CASH,
        accountName: `صندوق مستلم (${toFundId})`,
        debit: amount,
        credit: 0,
        description: 'استلام تحويل',
      },
      {
        accountCode: ACCOUNT_CODES.CASH,
        accountName: `صندوق مُرسل (${fromFundId})`,
        debit: 0,
        credit: amount,
        description: 'إرسال تحويل',
      },
    ],
    sourceType: 'CashTransfer',
    sourceId: null,
    cashFundId: toFundId,
    user,
    meta: { fromFundId, toFundId },
  });
};

/**
 * قيد مصروف (مصروف مدين / صندوق أو بنك دائن).
 */
export const createExpenseEntry = async ({
  amount,
  paymentMethod = 'cash',
  date = new Date(),
  sourceType,
  sourceId,
  cashFundId,
  bankAccountId,
  user,
  description,
  expenseAccountCode = ACCOUNT_CODES.GENERAL_EXPENSE,
  expenseAccountName = 'مصروفات عمومية',
}) => {
  const creditAccount =
    paymentMethod === 'bank'
      ? { code: ACCOUNT_CODES.BANK, name: 'البنك' }
      : { code: ACCOUNT_CODES.CASH, name: 'الصندوق النقدي' };

  return createEntry({
    entryType: 'EXPENSE',
    entryDate: date,
    description: description || 'مصروف',
    lines: [
      {
        accountCode: expenseAccountCode,
        accountName: expenseAccountName,
        debit: amount,
        credit: 0,
        description: 'مصروف',
      },
      {
        accountCode: creditAccount.code,
        accountName: creditAccount.name,
        debit: 0,
        credit: amount,
        description: 'دفع مصروف',
      },
    ],
    sourceType,
    sourceId,
    cashFundId,
    bankAccountId,
    user,
  });
};

/* ─────────────────────────────────────────────────────────────
 * 5) قيد عكسي (Reversal) — للتصحيح
 * ───────────────────────────────────────────────────────────── */
export const reverseEntry = async ({ entryId, user, reason }) => {
  const original = await AccountingEntry.findById(entryId);
  if (!original) {
    throw new AppError('القيد غير موجود', 404, 'ENTRY_NOT_FOUND');
  }
  if (original.isReversed) {
    throw new AppError('القيد مُعكَس مسبقاً', 400, 'ALREADY_REVERSED');
  }

  const reversedLines = original.lines.map((l) => ({
    accountCode: l.accountCode,
    accountName: l.accountName,
    debit: l.credit,
    credit: l.debit,
    description: `عكس: ${l.description || ''}`.trim(),
  }));

  const reversal = await createEntry({
    entryType: original.entryType,
    entryDate: new Date(),
    description: `قيد عكسي للقيد ${original.entryNumber} — ${reason || ''}`.trim(),
    lines: reversedLines,
    sourceType: original.sourceType,
    sourceId: original.sourceId,
    cashFundId: original.cashFundId,
    bankAccountId: original.bankAccountId,
    user,
    meta: { reversesEntryId: original._id, reason },
  });

  original.isReversed = true;
  original.reversedBy = reversal._id;
  await original.save();

  return reversal;
};

/* ─────────────────────────────────────────────────────────────
 * 5.5) جلب القيود بالمصدر — جديد (Phase 3)
 * ───────────────────────────────────────────────────────────── */

/**
 * يجلب القيد المرتبط بمصدر محدد (غير المُعكَس) — واحد فقط.
 */
export const getEntryBySource = async ({ sourceType, sourceId }) => {
  if (!sourceType || !sourceId) return null;

  return AccountingEntry.findOne({
    sourceType,
    sourceId,
    isReversed: { $ne: true },
  }).lean();
};

/**
 * يجلب جميع القيود المرتبطة بمصدر محدد (غير المُعكسة).
 */
export const getEntriesBySource = async ({ sourceType, sourceId }) => {
  if (!sourceType || !sourceId) return [];

  return AccountingEntry.find({
    sourceType,
    sourceId,
    isReversed: { $ne: true },
  }).lean();
};

/* ─────────────────────────────────────────────────────────────
 * 6) ميزان المراجعة (Phase 4 — Stub)
 * ───────────────────────────────────────────────────────────── */
export const getTrialBalance = async ({ from, to } = {}) => {
  const match = {};
  if (from || to) {
    match.entryDate = {};
    if (from) match.entryDate.$gte = new Date(from);
    if (to) match.entryDate.$lte = new Date(to);
  }

  const result = await AccountingEntry.aggregate([
    { $match: { ...match, isReversed: { $ne: true } } },
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.accountCode',
        accountName: { $first: '$lines.accountName' },
        totalDebit: { $sum: '$lines.debit' },
        totalCredit: { $sum: '$lines.credit' },
      },
    },
    {
      $project: {
        accountCode: '$_id',
        accountName: 1,
        totalDebit: { $round: ['$totalDebit', 2] },
        totalCredit: { $round: ['$totalCredit', 2] },
        balance: {
          $round: [{ $subtract: ['$totalDebit', '$totalCredit'] }, 2],
        },
        _id: 0,
      },
    },
    { $sort: { accountCode: 1 } },
  ]);

  return result;
};

/* ─────────────────────────────────────────────────────────────
 * 7) Helpers للصناديق والبنوك
 * ───────────────────────────────────────────────────────────── */
export const getDefaultCashFund = async () => {
  const fund = await CashFund.findOne({ isDefault: true, isActive: true }).lean();
  if (!fund) {
    throw new AppError(
      'لا يوجد صندوق افتراضي نشط. يرجى إنشاء صندوق أولاً.',
      400,
      'NO_DEFAULT_CASH_FUND'
    );
  }
  return fund;
};

export const getDefaultBankAccount = async () => {
  const bank = await BankAccount.findOne({ isActive: true }).lean();
  if (!bank) {
    throw new AppError(
      'لا يوجد حساب بنكي نشط. يرجى إنشاء حساب بنكي أولاً.',
      400,
      'NO_ACTIVE_BANK_ACCOUNT'
    );
  }
  return bank;
};

/* ─────────────────────────────────────────────────────────────
 * 8) التصدير الافتراضي
 * ─────────────────────────────────────────────────────────────
 * ✅ 🅲: حُذفت 3 دوال createCheck*Entry.
 */
export default {
  ACCOUNT_CODES,
  createEntry,
  createSaleCashEntry,
  createSaleCreditEntry,
  createCustomerPaymentEntry,
  createPurchaseEntry,
  createSaleReturnEntry,
  // ⚠️ 🅲: createCheckReceivedEntry — محذوف
  // ⚠️ 🅲: createCheckCollectedEntry — محذوف
  // ⚠️ 🅲: createCheckBouncedEntry — محذوف
  createCashTransferEntry,
  createExpenseEntry,
  reverseEntry,
  getEntryBySource,
  getEntriesBySource,
  getTrialBalance,
  getDefaultCashFund,
  getDefaultBankAccount,
};