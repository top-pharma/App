/**
 * @file cashService.js
 * @description
 * منطق الحركات النقدية (CashTransaction).
 *
 * كل حركة نقدية تمر من هنا:
 *  - فاتورة نقدية (invoiceService)
 *  - دفعة أولى في إيصال تسليم (deliveryNoteController)
 *  - تحصيل من عميل (invoiceController.registerPayment)
 *  - مرتجع بيع نقدي (customerReturnController)
 *  - مشتريات نقدية (purchaseReceiptController)
 *  - إيداع/سحب يدوي (cashFundController)
 *  - تسجيل صرف شيك (checkService)
 *
 * المبادئ:
 *  - كل حركة تُحدّث currentBalance ذرياً (عبر $inc).
 *  - كل حركة تُنشئ AccountingEntry تلقائياً (إلا skipEntry).
 *  - عند فشل القيد → Rollback لرصيد الصندوق/البنك.
 *  - لا نستخدم MongoDB Transactions (standalone) → Rollback يدوي.
 */

import CashTransaction from '../models/CashTransaction.js';
import CashFund from '../models/CashFund.js';
import BankAccount from '../models/BankAccount.js';
import accountingService from './accountingService.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import logger from '../utils/logger.js';

const round2 = (amount) => Math.round((Number(amount) + Number.EPSILON) * 100) / 100;

/* ─────────────────────────────────────────────────────────────
 * 1) createCashTransaction — الدالة الجوهرية
 * ─────────────────────────────────────────────────────────────
 * @param {Object} params
 * @param {string} params.direction - 'in' | 'out'
 * @param {number} params.amount
 * @param {string} [params.method='cash'] - 'cash' | 'bank' | 'check'
 * @param {string} [params.cashFundId]
 * @param {string} [params.bankAccountId]
 * @param {Date} [params.transactionDate]
 * @param {string} [params.description]
 * @param {string} [params.referenceType='manual']
 * @param {string} [params.referenceId]
 * @param {Object} [params.user]
 * @param {Object} [params.entryParams]
 * @param {boolean} [params.skipEntry=false]
 * @returns {Promise<Object>}
 */
export const createCashTransaction = async ({
  direction,
  amount,
  method = 'cash',
  cashFundId,
  bankAccountId,
  transactionDate = new Date(),
  description,
  referenceType = 'manual',
  referenceId = null,
  user,
  entryParams = {},
  skipEntry = false,
}) => {
  // ─── 1) التحقق ───
  if (!['in', 'out'].includes(direction)) {
    throw new AppError('الاتجاه يجب أن يكون in أو out', 400, 'INVALID_DIRECTION');
  }
  const roundedAmount = round2(amount);
  if (roundedAmount <= 0) {
    throw new AppError('المبلغ يجب أن يكون أكبر من صفر', 400, 'INVALID_AMOUNT');
  }
  if (!['cash', 'bank', 'check'].includes(method)) {
    throw new AppError('طريقة الدفع غير صحيحة', 400, 'INVALID_METHOD');
  }

  // ─── 2) تحديد الهدف ───
  let targetDoc = null;

  if (method === 'cash') {
    if (!cashFundId) {
      const defaultFund = await accountingService.getDefaultCashFund();
      cashFundId = defaultFund._id;
    }
    targetDoc = await CashFund.findById(cashFundId);
    if (!targetDoc) {
      throw new AppError('الصندوق غير موجود', 404, 'CASH_FUND_NOT_FOUND');
    }
    if (!targetDoc.isActive) {
      throw new AppError('الصندوق معطّل', 400, 'CASH_FUND_INACTIVE');
    }
  } else if (method === 'bank') {
    if (!bankAccountId) {
      const activeBank = await accountingService.getDefaultBankAccount();
      bankAccountId = activeBank._id;
    }
    targetDoc = await BankAccount.findById(bankAccountId);
    if (!targetDoc) {
      throw new AppError('الحساب البنكي غير موجود', 404, 'BANK_ACCOUNT_NOT_FOUND');
    }
    if (!targetDoc.isActive) {
      throw new AppError('الحساب البنكي معطّل', 400, 'BANK_ACCOUNT_INACTIVE');
    }
  }
  // method === 'check' → لا targetDoc (لا يؤثر على رصيد)

  // ─── 3) التحقق من كفاية الرصيد (للصرف) ───
  if (direction === 'out' && targetDoc) {
    const current = targetDoc.currentBalance || 0;
    if (current < roundedAmount) {
      throw new AppError(
        `الرصيد غير كافٍ. المتاح: ${current} SDG`,
        400,
        method === 'cash' ? 'INSUFFICIENT_FUND_BALANCE' : 'INSUFFICIENT_BANK_BALANCE'
      );
    }
  }

  // ─── 4) إنشاء CashTransaction ───
  const tx = await CashTransaction.create({
    cashFundId: method === 'cash' ? cashFundId : null,
    bankAccountId: method === 'bank' ? bankAccountId : null,
    direction,
    amount: roundedAmount,
    method,
    transactionDate,
    description: description || (direction === 'in' ? 'دخل نقدي' : 'خرج نقدي'),
    referenceType,
    referenceId,
    createdBy: user?._id || null,
  });

  // ─── 5) تحديث currentBalance ذرياً ───
  let balanceUpdated = false;
  try {
    if (method === 'cash') {
      const delta = direction === 'in' ? roundedAmount : -roundedAmount;
      // ⚠️ نستخدم currentBalance (الحقل الفعلي) وليس balance (virtual)
      await CashFund.updateOne(
        { _id: cashFundId },
        { $inc: { currentBalance: delta } }
      );
      balanceUpdated = true;
    } else if (method === 'bank') {
      const delta = direction === 'in' ? roundedAmount : -roundedAmount;
      await BankAccount.updateOne(
        { _id: bankAccountId },
        { $inc: { currentBalance: delta } }
      );
      balanceUpdated = true;
    }
  } catch (err) {
    await CashTransaction.deleteOne({ _id: tx._id });
    logger.error(`[cashService] فشل تحديث الرصيد — Rollback: ${err.message}`);
    throw new AppError('فشل تحديث الرصيد', 500, 'BALANCE_UPDATE_FAILED');
  }

  // ─── 6) إنشاء القيد (إلا إذا skipEntry) ───
  if (!skipEntry) {
    try {
      await createEntryForTransaction({
        tx,
        direction,
        method,
        amount: roundedAmount,
        cashFundId: method === 'cash' ? cashFundId : undefined,
        bankAccountId: method === 'bank' ? bankAccountId : undefined,
        user,
        entryParams,
      });
    } catch (entryErr) {
      // Rollback
      if (balanceUpdated) {
        try {
          const delta = direction === 'in' ? -roundedAmount : roundedAmount;
          if (method === 'cash') {
            await CashFund.updateOne(
              { _id: cashFundId },
              { $inc: { currentBalance: delta } }
            );
          } else if (method === 'bank') {
            await BankAccount.updateOne(
              { _id: bankAccountId },
              { $inc: { currentBalance: delta } }
            );
          }
        } catch (rbErr) {
          logger.error(`[cashService] فشل Rollback: ${rbErr.message}`);
        }
      }
      await CashTransaction.deleteOne({ _id: tx._id });
      logger.error(`[cashService] فشل إنشاء القيد — Rollback: ${entryErr.message}`);
      throw new AppError('فشل إنشاء القيد المحاسبي', 500, 'ENTRY_CREATE_FAILED');
    }
  }

  logger.info(
    `[cashService] حركة نقدية: ${direction} ${roundedAmount} SDG (${method}) — ${referenceType}`
  );

  return tx;
};

/* ─────────────────────────────────────────────────────────────
 * 2) createEntryForTransaction — إنشاء القيد حسب نوع المرجع
 * ─────────────────────────────────────────────────────────────
 * @private
 */
const createEntryForTransaction = async ({
  tx,
  direction,
  method,
  amount,
  cashFundId,
  bankAccountId,
  user,
  entryParams,
}) => {
  const { referenceType } = tx;
  const date = tx.transactionDate;

  // إذا حدد المستدعي نوع القيد
  if (entryParams.entryType) {
    await accountingService.createEntry({
      entryType: entryParams.entryType,
      entryDate: date,
      description: entryParams.description || tx.description,
      lines: entryParams.lines,
      sourceType: 'CashTransaction',
      sourceId: tx._id,
      cashFundId,
      bankAccountId,
      user,
      meta: entryParams.meta || {},
    });
    return;
  }

  switch (referenceType) {
    case 'invoice':
      if (direction === 'in') {
        await accountingService.createCustomerPaymentEntry({
          amount,
          paymentMethod: method,
          date,
          sourceType: 'CashTransaction',
          sourceId: tx._id,
          cashFundId,
          bankAccountId,
          user,
          description: tx.description,
        });
      }
      break;

    case 'customer_return':
      if (direction === 'out') {
        await accountingService.createSaleReturnEntry({
          amount,
          refundType: 'cash',
          date,
          sourceType: 'CashTransaction',
          sourceId: tx._id,
          cashFundId,
          user,
          description: tx.description,
        });
      }
      break;

    case 'purchase':
      if (direction === 'out') {
        await accountingService.createPurchaseEntry({
          amount,
          paymentType: 'cash',
          date,
          sourceType: 'CashTransaction',
          sourceId: tx._id,
          cashFundId,
          user,
          description: tx.description,
        });
      }
      break;

    case 'check':
      // checkService يُنشئ القيد يدوياً (skipEntry=true)
      break;

    case 'manual':
    case 'expense':
      if (direction === 'out') {
        await accountingService.createExpenseEntry({
          amount,
          paymentMethod: method,
          date,
          sourceType: 'CashTransaction',
          sourceId: tx._id,
          cashFundId,
          bankAccountId,
          user,
          description: tx.description,
          expenseAccountCode: entryParams.expenseAccountCode,
          expenseAccountName: entryParams.expenseAccountName,
        });
      }
      break;

    default:
      logger.debug(`[cashService] لا قيد تلقائي لـ referenceType=${referenceType}`);
  }
};

/* ─────────────────────────────────────────────────────────────
 * 3) reverseCashTransaction — عكس حركة
 * ─────────────────────────────────────────────────────────────
 */
export const reverseCashTransaction = async ({ transactionId, user, reason }) => {
  const original = await CashTransaction.findById(transactionId);
  if (!original) {
    throw new AppError('الحركة غير موجودة', 404, 'TRANSACTION_NOT_FOUND');
  }
  if (original.isReversed) {
    throw new AppError('الحركة مُعكسة مسبقاً', 400, 'ALREADY_REVERSED');
  }

  // نُنشئ حركة عكسية (بلا قيد تلقائي — سنعكس الأصل)
  const reversal = await createCashTransaction({
    direction: original.direction === 'in' ? 'out' : 'in',
    amount: original.amount,
    method: original.method,
    cashFundId: original.cashFundId,
    bankAccountId: original.bankAccountId,
    transactionDate: new Date(),
    description: `عكس: ${original.description}${reason ? ` — ${reason}` : ''}`,
    referenceType: original.referenceType,
    referenceId: original.referenceId,
    user,
    skipEntry: true,
  });

  // عكس القيد الأصلي (إن وُجد)
  try {
    const originalEntry = await accountingService.getEntryBySource({
      sourceType: 'CashTransaction',
      sourceId: original._id,
    });
    if (originalEntry) {
      await accountingService.reverseEntry({
        entryId: originalEntry._id,
        user,
        reason: reason || 'عكس حركة نقدية',
      });
    }
  } catch (err) {
    logger.warn(`[cashService] لم يُعكس القيد الأصلي: ${err.message}`);
  }

  // نعلّم الأصل
  original.isReversed = true;
  original.reversedBy = reversal._id;
  await original.save();

  return reversal;
};

/* ─────────────────────────────────────────────────────────────
 * 4) getCashSummary — ملخص (Phase 4)
 * ─────────────────────────────────────────────────────────────
 */
export const getCashSummary = async ({ from, to, cashFundId, method } = {}) => {
  const match = {};
  if (from || to) {
    match.transactionDate = {};
    if (from) match.transactionDate.$gte = new Date(from);
    if (to) match.transactionDate.$lte = new Date(to);
  }
  if (cashFundId) match.cashFundId = cashFundId;
  if (method) match.method = method;

  const result = await CashTransaction.aggregate([
    { $match: { ...match, isReversed: { $ne: true } } },
    {
      $group: {
        _id: { direction: '$direction', method: '$method' },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  return result;
};

export default {
  createCashTransaction,
  reverseCashTransaction,
  getCashSummary,
};