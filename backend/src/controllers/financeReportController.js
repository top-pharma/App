/**
 * @file financeReportController.js
 * @description
 * 5 تقارير مالية (بعد 🅲):
 *   1. ميزان المراجعة (Trial Balance)
 *   2. الحركات النقدية (Cash Transactions)
 *   3. أرصدة الصناديق والبنك (Fund Balances)
 *   4. المصروفات (Expenses)
 *   5. الإيرادات - المصروفات (Income Summary)
 *
 * ✅ 🅲 (2026-11-08):
 * - حُذف تقرير الشيكات (getChecksReport) — Check أُلغي.
 * - حُذف import Check من '../models/Check.js'.
 * - حُذف CHECK_STATUS_LABELS + CHECK_TYPE_LABELS من reportService.js imports.
 * - حُذف 'شيك' من تسمية method في getCashTransactionsReport.
 *
 * المبادئ:
 *  - كل تقرير يدعم JSON + Excel + PDF (عبر query param format).
 *  - الصناديق تستخدم currentBalance (وليس balance).
 *  - ميزان المراجعة يستخدم accountingService.getTrialBalance.
 */

import AccountingEntry from '../models/AccountingEntry.js';
import CashTransaction from '../models/CashTransaction.js';
import CashFund from '../models/CashFund.js';
import BankAccount from '../models/BankAccount.js';
// ⚠️ 🅲: حُذف import Check

import accountingService from '../services/accountingService.js';
import cashService from '../services/cashService.js';
import {
  round2,
  validateRange,
  formatDate,
  formatDateTime,
  makeExportMeta,
  classifyAccount,
  ACCOUNT_TYPE_LABELS,
  ENTRY_TYPE_LABELS,
  // ⚠️ 🅲: حُذف CHECK_STATUS_LABELS
  // ⚠️ 🅲: حُذف CHECK_TYPE_LABELS
} from '../services/reportService.js';
import exportService from '../services/exportService.js';
const { exportToExcel, exportToPdf } = exportService;
import { ACCOUNTING_ENTRY_TYPES } from '../utils/constants.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { logger } from '../utils/logger.js';

/* ─────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

/**
 * تصدير موحد (JSON / Excel / PDF).
 */
async function respond({
  req,
  res,
  title,
  columns,
  rows,
  meta,
  summaryRows = [],
  jsonData,
}) {
  const format = req.query.format;

  if (!format) {
    return res.status(200).json({ success: true, data: jsonData });
  }

  try {
    if (format === 'pdf') {
      const buffer = await exportToPdf({
        title,
        columns,
        rows,
        meta,
        summaryRows,
        watermark: 'TOP PHARMA',
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(title)}.pdf"`
      );
      return res.send(buffer);
    }

    const buffer = await exportToExcel({
      title,
      columns,
      rows,
      meta,
      summaryRows,
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(title)}.xlsx"`
    );
    return res.send(buffer);
  } catch (err) {
    logger.error(`[financeReport] فشل تصدير ${title}: ${err.message}`);
    throw err;
  }
}

/* ─────────────────────────────────────────────────────────────
 * 1) ميزان المراجعة
 * ───────────────────────────────────────────────────────────── */

export async function getTrialBalance(req, res, next) {
  try {
    const { from, to } = validateRange(req.query.from, req.query.to);

    const raw = await accountingService.getTrialBalance({ from, to });

    const lines = raw.map((r) => {
      const type = classifyAccount(r.accountCode);
      return {
        accountCode: r.accountCode,
        accountName: r.accountName || '—',
        accountType: type,
        accountTypeLabel: ACCOUNT_TYPE_LABELS[type] || type,
        debit: round2(r.totalDebit),
        credit: round2(r.totalCredit),
        balance: round2(r.balance),
      };
    });

    const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
    const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

    const meta = makeExportMeta({ title: 'ميزان المراجعة', from, to });

    const rowsForExport = lines.map((l) => [
      l.accountCode,
      l.accountName,
      l.accountTypeLabel,
      l.debit,
      l.credit,
      l.balance,
    ]);

    return respond({
      req,
      res,
      title: 'ميزان المراجعة',
      columns: ['كود الحساب', 'اسم الحساب', 'النوع', 'مدين', 'دائن', 'الرصيد'],
      rows: rowsForExport,
      meta,
      summaryRows: [
        ['', 'الإجمالي', '', totalDebit, totalCredit, round2(totalDebit - totalCredit)],
      ],
      jsonData: {
        period: { from, to },
        lines,
        totals: { debit: totalDebit, credit: totalCredit, balanced },
      },
    });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────────────────────────────────────────────────
 * 2) الحركات النقدية
 * ───────────────────────────────────────────────────────────── */

export async function getCashTransactionsReport(req, res, next) {
  try {
    const { from, to } = validateRange(req.query.from, req.query.to);
    const direction = req.query.direction || 'all';
    const method = req.query.method || 'all';
    const cashFundId = req.query.cashFundId;
    const bankAccountId = req.query.bankAccountId;

    const match = {
      transactionDate: { $gte: from, $lte: to },
      isReversed: { $ne: true },
    };
    if (direction !== 'all') match.direction = direction;
    if (method !== 'all') match.method = method;
    if (cashFundId) match.cashFundId = cashFundId;
    if (bankAccountId) match.bankAccountId = bankAccountId;

    const transactions = await CashTransaction.find(match)
      .populate('cashFundId', 'name code')
      .populate('bankAccountId', 'name bankName')
      .sort({ transactionDate: -1, _id: -1 })
      .limit(2000)
      .lean();

    const lines = transactions.map((t) => {
      const accountName =
        t.method === 'cash'
          ? t.cashFundId?.name || '—'
          : t.method === 'bank'
            ? t.bankAccountId?.name || t.bankAccountId?.bankName || '—'
            : '—';
      return {
        _id: t._id,
        transactionNumber: t.transactionNumber,
        date: t.transactionDate,
        dateLabel: formatDate(t.transactionDate),
        method: t.method,
        accountName,
        direction: t.direction,
        directionLabel: t.direction === 'in' ? 'دخول' : 'خروج',
        amount: round2(t.amount),
        description: t.description || '',
        referenceType: t.referenceType || '',
      };
    });

    const totalIn = round2(
      lines.filter((l) => l.direction === 'in').reduce((s, l) => s + l.amount, 0)
    );
    const totalOut = round2(
      lines.filter((l) => l.direction === 'out').reduce((s, l) => s + l.amount, 0)
    );
    const net = round2(totalIn - totalOut);

    const meta = makeExportMeta({ title: 'الحركات النقدية', from, to });

    const rowsForExport = lines.map((l) => [
      l.dateLabel,
      l.transactionNumber,
      // ✅ 🅲: فقط صندوق/بنك (لا شيك)
      l.method === 'cash' ? 'صندوق' : 'بنك',
      l.accountName,
      l.directionLabel,
      l.amount,
      l.description,
    ]);

    return respond({
      req,
      res,
      title: 'الحركات النقدية',
      columns: ['التاريخ', 'رقم الحركة', 'الطريقة', 'الحساب', 'الاتجاه', 'المبلغ', 'الوصف'],
      rows: rowsForExport,
      meta,
      summaryRows: [
        ['', '', '', 'إجمالي الدخول', '', totalIn, ''],
        ['', '', '', 'إجمالي الخروج', '', totalOut, ''],
        ['', '', '', 'الصافي', '', net, ''],
      ],
      jsonData: {
        period: { from, to },
        filters: { direction, method, cashFundId, bankAccountId },
        lines,
        totals: { in: totalIn, out: totalOut, net },
        count: lines.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────────────────────────────────────────────────
 * 3) أرصدة الصناديق والبنك
 * ───────────────────────────────────────────────────────────── */

export async function getFundBalancesReport(req, res, next) {
  try {
    const funds = await CashFund.find({ isActive: true })
      .select('name code currentBalance openingBalance isDefault')
      .lean();

    const banks = await BankAccount.find({ isActive: true })
      .select('name bankName accountNumber currentBalance openingBalance isDefault')
      .lean();

    const lines = [
      ...funds.map((f) => ({
        type: 'cash',
        typeLabel: 'صندوق',
        name: f.name,
        code: f.code,
        openingBalance: round2(f.openingBalance || 0),
        currentBalance: round2(f.currentBalance || 0),
        isDefault: !!f.isDefault,
      })),
      ...banks.map((b) => ({
        type: 'bank',
        typeLabel: 'بنك',
        name: `${b.name} — ${b.bankName}`,
        code: b.accountNumber,
        openingBalance: round2(b.openingBalance || 0),
        currentBalance: round2(b.currentBalance || 0),
        isDefault: !!b.isDefault,
      })),
    ];

    const totalCash = round2(
      lines.filter((l) => l.type === 'cash').reduce((s, l) => s + l.currentBalance, 0)
    );
    const totalBank = round2(
      lines.filter((l) => l.type === 'bank').reduce((s, l) => s + l.currentBalance, 0)
    );
    const total = round2(totalCash + totalBank);

    const meta = makeExportMeta({ title: 'أرصدة الصناديق والبنك' });

    const rowsForExport = lines.map((l) => [
      l.typeLabel,
      l.name,
      l.code,
      l.openingBalance,
      l.currentBalance,
    ]);

    return respond({
      req,
      res,
      title: 'أرصدة الصناديق والبنك',
      columns: ['النوع', 'الاسم', 'الكود', 'الافتتاحي', 'الحالي'],
      rows: rowsForExport,
      meta,
      summaryRows: [
        ['', 'إجمالي النقد', '', '', totalCash],
        ['', 'إجمالي البنك', '', '', totalBank],
        ['', 'الإجمالي', '', '', total],
      ],
      jsonData: {
        lines,
        totals: { cash: totalCash, bank: totalBank, total },
      },
    });
  } catch (err) {
    next(err);
  }
}

// ⚠️ 🅲: getChecksReport() — محذوفة (Check أُلغي)

/* ─────────────────────────────────────────────────────────────
 * 4) المصروفات
 * ───────────────────────────────────────────────────────────── */

export async function getExpensesReport(req, res, next) {
  try {
    const { from, to } = validateRange(req.query.from, req.query.to);

    const entries = await AccountingEntry.find({
      entryDate: { $gte: from, $lte: to },
      entryType: {
        $in: [ACCOUNTING_ENTRY_TYPES.EXPENSE, ACCOUNTING_ENTRY_TYPES.CASH_WITHDRAWAL],
      },
      isReversed: { $ne: true },
    })
      .sort({ entryDate: -1 })
      .lean();

    const cashExpenses = await CashTransaction.find({
      transactionDate: { $gte: from, $lte: to },
      referenceType: 'expense',
      direction: 'out',
      isReversed: { $ne: true },
    })
      .sort({ transactionDate: -1 })
      .lean();

    const lines = [
      ...entries.map((e) => ({
        source: 'entry',
        date: e.entryDate,
        dateLabel: formatDate(e.entryDate),
        entryNumber: e.entryNumber,
        type: e.entryType,
        typeLabel: ENTRY_TYPE_LABELS[e.entryType] || e.entryType,
        description: e.description || '',
        amount: round2(e.totalDebit),
      })),
      ...cashExpenses.map((t) => ({
        source: 'cash',
        date: t.transactionDate,
        dateLabel: formatDate(t.transactionDate),
        entryNumber: t.transactionNumber,
        type: 'EXPENSE',
        typeLabel: 'مصروف',
        description: t.description || '',
        amount: round2(t.amount),
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const total = round2(lines.reduce((s, l) => s + l.amount, 0));

    const meta = makeExportMeta({ title: 'تقرير المصروفات', from, to });

    const rowsForExport = lines.map((l) => [
      l.dateLabel,
      l.entryNumber,
      l.typeLabel,
      l.description,
      l.amount,
    ]);

    return respond({
      req,
      res,
      title: 'تقرير المصروفات',
      columns: ['التاريخ', 'المرجع', 'النوع', 'الوصف', 'المبلغ'],
      rows: rowsForExport,
      meta,
      summaryRows: [['', '', '', 'الإجمالي', total]],
      jsonData: {
        period: { from, to },
        lines,
        total,
        count: lines.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────────────────────────────────────────────────
 * 5) الإيرادات - المصروفات
 * ───────────────────────────────────────────────────────────── */

export async function getIncomeSummaryReport(req, res, next) {
  try {
    const { from, to } = validateRange(req.query.from, req.query.to);

    const results = await AccountingEntry.aggregate([
      {
        $match: {
          entryDate: { $gte: from, $lte: to },
          isReversed: { $ne: true },
        },
      },
      { $unwind: '$lines' },
      {
        $group: {
          _id: {
            entryType: '$entryType',
            accountCode: '$lines.accountCode',
          },
          accountName: { $first: '$lines.accountName' },
          debit: { $sum: '$lines.debit' },
          credit: { $sum: '$lines.credit' },
        },
      },
    ]);

    const REVENUE_TYPES = new Set([
      ACCOUNTING_ENTRY_TYPES.SALE_CASH,
      ACCOUNTING_ENTRY_TYPES.SALE_CREDIT,
      ACCOUNTING_ENTRY_TYPES.CUSTOMER_PAYMENT,
    ]);
    const EXPENSE_TYPES = new Set([
      ACCOUNTING_ENTRY_TYPES.EXPENSE,
      ACCOUNTING_ENTRY_TYPES.PURCHASE,
      ACCOUNTING_ENTRY_TYPES.CASH_WITHDRAWAL,
    ]);

    const revenueLines = [];
    const expenseLines = [];

    for (const r of results) {
      const accountType = classifyAccount(r._id.accountCode);
      const item = {
        entryType: r._id.entryType,
        entryTypeLabel: ENTRY_TYPE_LABELS[r._id.entryType] || r._id.entryType,
        accountCode: r._id.accountCode,
        accountName: r.accountName || '—',
        amount: round2(r.credit - r.debit),
      };

      if (accountType === 'revenue' || REVENUE_TYPES.has(r._id.entryType)) {
        if (Math.abs(item.amount) > 0.01) revenueLines.push(item);
      } else if (accountType === 'expense' || EXPENSE_TYPES.has(r._id.entryType)) {
        item.amount = round2(r.debit - r.credit);
        if (Math.abs(item.amount) > 0.01) expenseLines.push(item);
      }
    }

    const totalRevenue = round2(revenueLines.reduce((s, l) => s + l.amount, 0));
    const totalExpenses = round2(expenseLines.reduce((s, l) => s + l.amount, 0));
    const net = round2(totalRevenue - totalExpenses);

    const meta = makeExportMeta({ title: 'الإيرادات - المصروفات', from, to });

    const rowsForExport = [
      ...revenueLines.map((l) => ['إيراد', l.entryTypeLabel, l.accountName, l.amount]),
      ...expenseLines.map((l) => ['مصروف', l.entryTypeLabel, l.accountName, l.amount]),
    ];

    return respond({
      req,
      res,
      title: 'الإيرادات - المصروفات',
      columns: ['النوع', 'التصنيف', 'الحساب', 'المبلغ'],
      rows: rowsForExport,
      meta,
      summaryRows: [
        ['', '', 'إجمالي الإيرادات', totalRevenue],
        ['', '', 'إجمالي المصروفات', totalExpenses],
        ['', '', 'الصافي', net],
      ],
      jsonData: {
        period: { from, to },
        revenueLines,
        expenseLines,
        totals: {
          revenue: totalRevenue,
          expenses: totalExpenses,
          net,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * ✅ 🅲: getChecksReport — محذوف.
 * Check أُلغي.
 */
export default {
  getTrialBalance,
  getCashTransactionsReport,
  getFundBalancesReport,
  // ⚠️ 🅲: getChecksReport — محذوف
  getExpensesReport,
  getIncomeSummaryReport,
};