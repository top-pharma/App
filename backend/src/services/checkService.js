/**
 * @file checkService.js
 * @description
 * منطق الشيكات — النسخة المبسطة (Phase 3).
 *
 * المبدأ:
 *  - الشيك = وعد بالدفع. لا يؤثر على أي رصيد حتى يُصرف فعلياً.
 *  - createCheck: تسجيل فقط — لا حركة نقدية، لا قيد، لا رصيد.
 *  - settleCheck: الحدث الوحيد المؤثر (يُنشئ CashTransaction + قيد).
 *  - bounceCheck: يعكس حركة الصرف.
 *  - cancelCheck: إلغاء بسيط (لا عكس).
 *
 * دورة الحياة:
 *  pending → (settle) → paid
 *          → (cancel) → cancelled
 *  paid    → (bounce) → bounced
 */

import Check from '../models/Check.js';
import accountingService from './accountingService.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import logger from '../utils/logger.js';

const round2 = (amount) => Math.round((Number(amount) + Number.EPSILON) * 100) / 100;

/* ─────────────────────────────────────────────────────────────
 * 1) createCheck — تسجيل فقط (لا حركة نقدية، لا قيد)
 * ─────────────────────────────────────────────────────────────
 * @param {Object} params
 * @param {string} params.type - 'incoming' | 'outgoing'
 * @param {string} params.checkNumber
 * @param {string} params.bankName
 * @param {number} params.amount
 * @param {Date} params.dueDate
 * @param {Date} [params.issueDate]
 * @param {string} [params.customerId]
 * @param {string} [params.supplierId]
 * @param {string} [params.invoiceId]
 * @param {string} [params.notes]
 * @param {Object} [params.user]
 * @returns {Promise<Object>}
 */
export const createCheck = async ({
  type,
  checkNumber,
  bankName,
  amount,
  dueDate,
  issueDate,
  customerId,
  supplierId,
  invoiceId,
  notes,
  user,
}) => {
  // ─── 1) التحقق ───
  if (!['incoming', 'outgoing'].includes(type)) {
    throw new AppError('نوع الشيك يجب أن يكون incoming أو outgoing', 400, 'INVALID_CHECK_TYPE');
  }
  const roundedAmount = round2(amount);
  if (roundedAmount <= 0) {
    throw new AppError('المبلغ يجب أن يكون أكبر من صفر', 400, 'INVALID_AMOUNT');
  }
  if (!dueDate) {
    throw new AppError('تاريخ الاستحقاق مطلوب', 400, 'MISSING_DUE_DATE');
  }
  if (type === 'incoming' && !customerId) {
    throw new AppError('الشيك الوارد يحتاج عميلاً', 400, 'MISSING_CUSTOMER');
  }
  if (type === 'outgoing' && !supplierId) {
    throw new AppError('الشيك الصادر يحتاج مورداً', 400, 'MISSING_SUPPLIER');
  }

  // ─── 2) منع تكرار رقم الشيك لنفس البنك ───
  const exists = await Check.findOne({ checkNumber, bankName });
  if (exists) {
    throw new AppError(
      `يوجد شيك بنفس الرقم (${checkNumber}) لنفس البنك`,
      400,
      'DUPLICATE_CHECK_NUMBER'
    );
  }

  // ─── 3) تسجيل الشيك فقط ───
  const check = await Check.create({
    type,
    checkNumber,
    bankName,
    amount: roundedAmount,
    dueDate,
    issueDate: issueDate || new Date(),
    customerId: type === 'incoming' ? customerId : null,
    supplierId: type === 'outgoing' ? supplierId : null,
    invoiceId: invoiceId || null,
    notes,
    status: 'pending',
    createdBy: user?._id || null,
  });

  logger.info(
    `[checkService] تسجيل شيك ${type}: ${checkNumber} — ${roundedAmount} SDG (بانتظار الصرف)`
  );

  return check;
};

/* ─────────────────────────────────────────────────────────────
 * 2) settleCheck — تسجيل الصرف (الحدث الوحيد المؤثر على الأرصدة)
 * ─────────────────────────────────────────────────────────────
 * - يُنشئ CashTransaction (cash/bank)
 * - يُحدّث رصيد الصندوق/البنك
 * - يُنشئ قيد CHECK_PAID
 * - إن وارد + مرتبط بفاتورة → يزيد paidAmount
 *
 * @param {Object} params
 * @param {string} params.checkId
 * @param {string} params.paymentMethod - 'cash' | 'bank'
 * @param {string} [params.cashFundId]
 * @param {string} [params.bankAccountId]
 * @param {Date} [params.paymentDate]
 * @param {Object} params.user
 * @returns {Promise<Object>}
 */
export const settleCheck = async ({
  checkId,
  paymentMethod,
  cashFundId,
  bankAccountId,
  paymentDate,
  user,
}) => {
  const check = await Check.findById(checkId);
  if (!check) {
    throw new AppError('الشيك غير موجود', 404, 'CHECK_NOT_FOUND');
  }
  if (check.status !== 'pending') {
    throw new AppError(
      `لا يمكن صرف شيك بحالة ${check.status}`,
      400,
      'INVALID_CHECK_STATUS'
    );
  }
  if (!['cash', 'bank'].includes(paymentMethod)) {
    throw new AppError('طريقة الصرف غير صحيحة', 400, 'INVALID_PAYMENT_METHOD');
  }
  if (paymentMethod === 'cash' && !cashFundId) {
    throw new AppError('الصندوق مطلوب للصرف النقدي', 400, 'MISSING_CASH_FUND');
  }
  if (paymentMethod === 'bank' && !bankAccountId) {
    throw new AppError('الحساب البنكي مطلوب للصرف البنكي', 400, 'MISSING_BANK_ACCOUNT');
  }

  const date = paymentDate || new Date();
  const direction = check.type === 'incoming' ? 'in' : 'out';
  const cashService = (await import('./cashService.js')).default;

  // ─── 1) تحديد سطور القيد ───
  const debitAccount =
    check.type === 'incoming'
      ? paymentMethod === 'bank'
        ? { code: accountingService.ACCOUNT_CODES.BANK, name: 'البنك' }
        : { code: accountingService.ACCOUNT_CODES.CASH, name: 'الصندوق النقدي' }
      : { code: accountingService.ACCOUNT_CODES.ACCOUNTS_PAYABLE, name: 'ذمم الموردين' };

  const creditAccount =
    check.type === 'incoming'
      ? { code: accountingService.ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, name: 'ذمم العملاء' }
      : paymentMethod === 'bank'
        ? { code: accountingService.ACCOUNT_CODES.BANK, name: 'البنك' }
        : { code: accountingService.ACCOUNT_CODES.CASH, name: 'الصندوق النقدي' };

  // ─── 2) CashTransaction (skipEntry — سنُنشئه يدوياً) ───
  let cashTx = null;
  try {
    cashTx = await cashService.createCashTransaction({
      direction,
      amount: check.amount,
      method: paymentMethod,
      cashFundId: paymentMethod === 'cash' ? cashFundId : null,
      bankAccountId: paymentMethod === 'bank' ? bankAccountId : null,
      transactionDate: date,
      description: `صرف شيك ${check.type === 'incoming' ? 'وارد' : 'صادر'} رقم ${check.checkNumber}`,
      referenceType: 'check',
      referenceId: check._id,
      user,
      skipEntry: true,
    });

    // ─── 3) قيد CHECK_PAID ───
    await accountingService.createEntry({
      entryType: 'CHECK_PAID',
      entryDate: date,
      description: `صرف شيك ${check.type === 'incoming' ? 'وارد' : 'صادر'} — ${check.checkNumber}`,
      lines: [
        {
          accountCode: debitAccount.code,
          accountName: debitAccount.name,
          debit: check.amount,
          credit: 0,
          description: 'استلام/دفع شيك',
        },
        {
          accountCode: creditAccount.code,
          accountName: creditAccount.name,
          debit: 0,
          credit: check.amount,
          description: 'تخفيض الذمة',
        },
      ],
      sourceType: 'Check',
      sourceId: check._id,
      cashFundId: paymentMethod === 'cash' ? cashFundId : null,
      bankAccountId: paymentMethod === 'bank' ? bankAccountId : null,
      user,
    });
  } catch (err) {
    logger.error(`[checkService] فشل إنشاء الحركة/القيد: ${err.message}`);
    throw err;
  }

  // ─── 4) تحديث الشيك ───
  check.status = 'paid';
  check.paidAt = date;
  check.paidBy = user?._id || null;
  check.paymentMethod = paymentMethod;
  check.bankAccountId = paymentMethod === 'bank' ? bankAccountId : null;
  check.cashFundId = paymentMethod === 'cash' ? cashFundId : null;
  check.cashTransactionId = cashTx?._id || null;
  await check.save();

  // ─── 5) إن كان وارداً ومرتبطاً بفاتورة → زيادة paidAmount ───
  if (check.type === 'incoming' && check.invoiceId) {
    try {
      const Invoice = (await import('../models/Invoice.js')).default;
      const invoice = await Invoice.findById(check.invoiceId);
      if (invoice) {
        invoice.paidAmount = round2((invoice.paidAmount || 0) + check.amount);
        if (invoice.paidAmount >= invoice.total - 0.01) {
          invoice.status = 'paid';
        } else if (invoice.paidAmount > 0) {
          invoice.status = 'partial';
        }
        await invoice.save();
      }
    } catch (err) {
      logger.warn(`[checkService] فشل تحديث الفاتورة: ${err.message}`);
    }
  }

  logger.info(
    `[checkService] صُرف شيك ${check.checkNumber} — ${check.amount} SDG (${paymentMethod})`
  );
  return check;
};

/* ─────────────────────────────────────────────────────────────
 * 3) bounceCheck — ارتداد شيك بعد الصرف
 * ─────────────────────────────────────────────────────────────
 * - يعكس CashTransaction (يُعكس القيد أيضاً)
 * - إن مرتبط بفاتورة → يخصم paidAmount
 */
export const bounceCheck = async ({ checkId, bounceReason, user }) => {
  const check = await Check.findById(checkId);
  if (!check) {
    throw new AppError('الشيك غير موجود', 404, 'CHECK_NOT_FOUND');
  }
  if (check.status !== 'paid') {
    throw new AppError(
      'لا يمكن ارتداد إلا شيك تم صرفه',
      400,
      'INVALID_CHECK_STATUS'
    );
  }

  // ─── 1) عكس CashTransaction (يُعكس القيد) ───
  if (check.cashTransactionId) {
    const cashService = (await import('./cashService.js')).default;
    try {
      await cashService.reverseCashTransaction({
        transactionId: check.cashTransactionId,
        user,
        reason: `ارتداد شيك: ${bounceReason || 'غير محدد'}`,
      });
    } catch (err) {
      logger.error(`[checkService] فشل عكس الحركة: ${err.message}`);
      throw new AppError('فشل عكس الحركة النقدية', 500, 'REVERSE_FAILED');
    }
  }

  // ─── 2) إن مرتبط بفاتورة → خصم paidAmount ───
  if (check.type === 'incoming' && check.invoiceId) {
    try {
      const Invoice = (await import('../models/Invoice.js')).default;
      const invoice = await Invoice.findById(check.invoiceId);
      if (invoice) {
        invoice.paidAmount = round2(
          Math.max(0, (invoice.paidAmount || 0) - check.amount)
        );
        if (invoice.paidAmount === 0) {
          invoice.status = 'pending';
        } else if (invoice.paidAmount < invoice.total - 0.01) {
          invoice.status = 'partial';
        }
        await invoice.save();
      }
    } catch (err) {
      logger.warn(`[checkService] فشل تحديث الفاتورة: ${err.message}`);
    }
  }

  // ─── 3) تحديث الشيك ───
  check.status = 'bounced';
  check.bouncedAt = new Date();
  check.bouncedBy = user?._id || null;
  check.bounceReason = bounceReason || 'غير محدد';
  await check.save();

  logger.info(`[checkService] ارتد شيك ${check.checkNumber} — ${check.amount} SDG`);
  return check;
};

/* ─────────────────────────────────────────────────────────────
 * 4) cancelCheck — إلغاء قبل الصرف
 * ─────────────────────────────────────────────────────────────
 * - لا عكس (لم يكن هناك شيء)
 */
export const cancelCheck = async ({ checkId, cancelReason, user }) => {
  const check = await Check.findById(checkId);
  if (!check) {
    throw new AppError('الشيك غير موجود', 404, 'CHECK_NOT_FOUND');
  }
  if (check.status !== 'pending') {
    throw new AppError('لا يمكن إلغاء إلا شيك معلّق', 400, 'INVALID_CHECK_STATUS');
  }

  check.status = 'cancelled';
  check.cancelledAt = new Date();
  check.cancelledBy = user?._id || null;
  check.cancelReason = cancelReason || 'غير محدد';
  await check.save();

  logger.info(`[checkService] أُلغي شيك ${check.checkNumber}`);
  return check;
};

/* ─────────────────────────────────────────────────────────────
 * 5) getUpcomingChecks — للـ Job
 * ───────────────────────────────────────────────────────────── */
export const getUpcomingChecks = async ({ thresholdDays = 7 } = {}) => {
  const now = new Date();
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + thresholdDays);

  return Check.find({
    status: 'pending',
    dueDate: { $lte: threshold, $gte: now },
  })
    .populate('customerId', 'name phone')
    .populate('supplierId', 'name phone')
    .lean();
};

/* ─────────────────────────────────────────────────────────────
 * 6) getOverdueChecks — للـ Job
 * ───────────────────────────────────────────────────────────── */
export const getOverdueChecks = async () => {
  return Check.find({
    status: 'pending',
    dueDate: { $lt: new Date() },
  })
    .populate('customerId', 'name phone')
    .populate('supplierId', 'name phone')
    .lean();
};

export default {
  createCheck,
  settleCheck,
  bounceCheck,
  cancelCheck,
  getUpcomingChecks,
  getOverdueChecks,
};