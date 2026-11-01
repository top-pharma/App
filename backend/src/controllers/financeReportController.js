/**
 * @file financeReportController.js
 * @description
 * 6 ØªÙ‚Ø§Ø±ÙŠØ± Ù…Ø§Ù„ÙŠØ©:
 *   1. Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© (Trial Balance)
 *   2. Ø§Ù„Ø­Ø±ÙƒØ§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© (Cash Transactions)
 *   3. Ø£Ø±ØµØ¯Ø© Ø§Ù„ØµÙ†Ø§Ø¯ÙŠÙ‚ (Fund Balances)
 *   4. Ø§Ù„Ø´ÙŠÙƒØ§Øª (Checks)
 *   5. Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª (Expenses)
 *   6. Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª - Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª (Income Summary)
 *
 * Ø§Ù„Ù…Ø¨Ø§Ø¯Ø¦:
 *  - ÙƒÙ„ ØªÙ‚Ø±ÙŠØ± ÙŠØ¯Ø¹Ù… JSON + Excel + PDF (Ø¹Ø¨Ø± query param format).
 *  - Ø§Ù„Ø´ÙŠÙƒØ§Øª ØªÙÙ‚Ø±Ø£ Ù…Ù† Check Ù…Ø¨Ø§Ø´Ø±Ø© (Ù„Ø§ Ù…Ù† CashTransaction).
 *  - Ø§Ù„ØµÙ†Ø§Ø¯ÙŠÙ‚ ØªØ³ØªØ®Ø¯Ù… currentBalance (ÙˆÙ„ÙŠØ³ balance).
 *  - Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© ÙŠØ³ØªØ®Ø¯Ù… accountingService.getTrialBalance.
 *  - Ø§Ù„Ø­Ø±ÙƒØ§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© ØªØ³ØªØ®Ø¯Ù… cashService.getCashSummary Ù„Ù„Ù€ KPIs.
 */

import AccountingEntry from '../models/AccountingEntry.js';
import CashTransaction from '../models/CashTransaction.js';
import CashFund from '../models/CashFund.js';
import BankAccount from '../models/BankAccount.js';
import Check from '../models/Check.js';

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
  CHECK_STATUS_LABELS,
  CHECK_TYPE_LABELS,
} from '../services/reportService.js';
import exportService from '../services/exportService.js';
const { exportToExcel, exportToPdf } = exportService;
import { ACCOUNTING_ENTRY_TYPES } from '../utils/constants.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { logger } from '../utils/logger.js';

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Helpers
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * ØªØµØ¯ÙŠØ± Ù…ÙˆØ­Ø¯ (JSON / Excel / PDF).
 * @param {Object} req
 * @param {Object} res
 * @param {Object} params
 * @param {string} params.title
 * @param {string[]} params.columns
 * @param {Array<Array>} params.rows
 * @param {Object} params.meta
 * @param {Array<Object>} [params.summaryRows]
 * @param {Object} params.jsonData - Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ØªÙŠ ØªÙØ±Ø³Ù„ Ø¥Ù† Ù„Ù… ÙŠÙƒÙ† format
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
    logger.error(`[financeReport] ÙØ´Ù„ ØªØµØ¯ÙŠØ± ${title}: ${err.message}`);
    throw err;
  }
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * 1) Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export async function getTrialBalance(req, res, next) {
  try {
    const { from, to } = validateRange(req.query.from, req.query.to);

    const raw = await accountingService.getTrialBalance({ from, to });

    const lines = raw.map((r) => {
      const type = classifyAccount(r.accountCode);
      return {
        accountCode: r.accountCode,
        accountName: r.accountName || 'â€”',
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

    const meta = makeExportMeta({ title: 'Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©', from, to });

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
      title: 'Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©',
      columns: ['ÙƒÙˆØ¯ Ø§Ù„Ø­Ø³Ø§Ø¨', 'Ø§Ø³Ù… Ø§Ù„Ø­Ø³Ø§Ø¨', 'Ø§Ù„Ù†ÙˆØ¹', 'Ù…Ø¯ÙŠÙ†', 'Ø¯Ø§Ø¦Ù†', 'Ø§Ù„Ø±ØµÙŠØ¯'],
      rows: rowsForExport,
      meta,
      summaryRows: [
        ['', 'Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ', '', totalDebit, totalCredit, round2(totalDebit - totalCredit)],
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * 2) Ø§Ù„Ø­Ø±ÙƒØ§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ©
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

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
          ? t.cashFundId?.name || 'â€”'
          : t.method === 'bank'
            ? t.bankAccountId?.name || t.bankAccountId?.bankName || 'â€”'
            : 'â€”';
      return {
        _id: t._id,
        transactionNumber: t.transactionNumber,
        date: t.transactionDate,
        dateLabel: formatDate(t.transactionDate),
        method: t.method,
        accountName,
        direction: t.direction,
        directionLabel: t.direction === 'in' ? 'Ø¯Ø®ÙˆÙ„' : 'Ø®Ø±ÙˆØ¬',
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

    const meta = makeExportMeta({ title: 'Ø§Ù„Ø­Ø±ÙƒØ§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ©', from, to });

    const rowsForExport = lines.map((l) => [
      l.dateLabel,
      l.transactionNumber,
      l.method === 'cash' ? 'ØµÙ†Ø¯ÙˆÙ‚' : l.method === 'bank' ? 'Ø¨Ù†Ùƒ' : 'Ø´ÙŠÙƒ',
      l.accountName,
      l.directionLabel,
      l.amount,
      l.description,
    ]);

    return respond({
      req,
      res,
      title: 'Ø§Ù„Ø­Ø±ÙƒØ§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ©',
      columns: ['Ø§Ù„ØªØ§Ø±ÙŠØ®', 'Ø±Ù‚Ù… Ø§Ù„Ø­Ø±ÙƒØ©', 'Ø§Ù„Ø·Ø±ÙŠÙ‚Ø©', 'Ø§Ù„Ø­Ø³Ø§Ø¨', 'Ø§Ù„Ø§ØªØ¬Ø§Ù‡', 'Ø§Ù„Ù…Ø¨Ù„Øº', 'Ø§Ù„ÙˆØµÙ'],
      rows: rowsForExport,
      meta,
      summaryRows: [
        ['', '', '', 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¯Ø®ÙˆÙ„', '', totalIn, ''],
        ['', '', '', 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø®Ø±ÙˆØ¬', '', totalOut, ''],
        ['', '', '', 'Ø§Ù„ØµØ§ÙÙŠ', '', net, ''],
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * 3) Ø£Ø±ØµØ¯Ø© Ø§Ù„ØµÙ†Ø§Ø¯ÙŠÙ‚ ÙˆØ§Ù„Ø¨Ù†Ùƒ
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

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
        typeLabel: 'ØµÙ†Ø¯ÙˆÙ‚',
        name: f.name,
        code: f.code,
        openingBalance: round2(f.openingBalance || 0),
        currentBalance: round2(f.currentBalance || 0), // âš ï¸ currentBalance
        isDefault: !!f.isDefault,
      })),
      ...banks.map((b) => ({
        type: 'bank',
        typeLabel: 'Ø¨Ù†Ùƒ',
        name: `${b.name} â€” ${b.bankName}`,
        code: b.accountNumber,
        openingBalance: round2(b.openingBalance || 0),
        currentBalance: round2(b.currentBalance || 0), // âš ï¸ currentBalance
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

    const meta = makeExportMeta({ title: 'Ø£Ø±ØµØ¯Ø© Ø§Ù„ØµÙ†Ø§Ø¯ÙŠÙ‚ ÙˆØ§Ù„Ø¨Ù†Ùƒ' });

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
      title: 'Ø£Ø±ØµØ¯Ø© Ø§Ù„ØµÙ†Ø§Ø¯ÙŠÙ‚ ÙˆØ§Ù„Ø¨Ù†Ùƒ',
      columns: ['Ø§Ù„Ù†ÙˆØ¹', 'Ø§Ù„Ø§Ø³Ù…', 'Ø§Ù„ÙƒÙˆØ¯', 'Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠ', 'Ø§Ù„Ø­Ø§Ù„ÙŠ'],
      rows: rowsForExport,
      meta,
      summaryRows: [
        ['', 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù†Ù‚Ø¯', '', '', totalCash],
        ['', 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¨Ù†Ùƒ', '', '', totalBank],
        ['', 'Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ', '', '', total],
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * 4) Ø§Ù„Ø´ÙŠÙƒØ§Øª
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export async function getChecksReport(req, res, next) {
  try {
    const filter = {};
    if (req.query.from || req.query.to) {
      const from = req.query.from ? new Date(req.query.from) : new Date('2000-01-01');
      const to = req.query.to ? new Date(req.query.to) : new Date();
      to.setHours(23, 59, 59, 999);
      filter.dueDate = { $gte: from, $lte: to };
    }
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    if (req.query.type && req.query.type !== 'all') filter.type = req.query.type;

    const checks = await Check.find(filter)
      .populate('customerId', 'name phone')
      .populate('supplierId', 'name phone')
      .populate('invoiceId', 'invoiceNumber')
      .sort({ dueDate: 1 })
      .limit(2000)
      .lean();

    const now = Date.now();
    const lines = checks.map((c) => {
      const isOverdue =
        c.status === 'pending' && c.dueDate && new Date(c.dueDate).getTime() < now;
      const daysUntilDue = c.dueDate
        ? Math.ceil((new Date(c.dueDate).getTime() - now) / (1000 * 60 * 60 * 24))
        : null;
      return {
        _id: c._id,
        checkNumber: c.checkNumber,
        type: c.type,
        typeLabel: CHECK_TYPE_LABELS[c.type] || c.type,
        bankName: c.bankName,
        amount: round2(c.amount),
        issueDate: c.issueDate,
        dueDate: c.dueDate,
        dueDateLabel: formatDate(c.dueDate),
        daysUntilDue,
        status: c.status,
        statusLabel: CHECK_STATUS_LABELS[c.status] || c.status,
        isOverdue,
        customerName: c.customerId?.name || '',
        supplierName: c.supplierId?.name || '',
        invoiceNumber: c.invoiceId?.invoiceNumber || '',
        paymentMethod: c.paymentMethod || '',
      };
    });

    const totals = {
      pending: round2(
        lines.filter((l) => l.status === 'pending').reduce((s, l) => s + l.amount, 0)
      ),
      paid: round2(
        lines.filter((l) => l.status === 'paid').reduce((s, l) => s + l.amount, 0)
      ),
      bounced: round2(
        lines.filter((l) => l.status === 'bounced').reduce((s, l) => s + l.amount, 0)
      ),
      overdue: round2(lines.filter((l) => l.isOverdue).reduce((s, l) => s + l.amount, 0)),
      pendingCount: lines.filter((l) => l.status === 'pending').length,
      paidCount: lines.filter((l) => l.status === 'paid').length,
      bouncedCount: lines.filter((l) => l.status === 'bounced').length,
      overdueCount: lines.filter((l) => l.isOverdue).length,
    };

    const meta = makeExportMeta({
      title: 'ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ø´ÙŠÙƒØ§Øª',
      from: req.query.from ? new Date(req.query.from) : undefined,
      to: req.query.to ? new Date(req.query.to) : undefined,
    });

    const rowsForExport = lines.map((l) => [
      l.checkNumber,
      l.typeLabel,
      l.bankName,
      l.type === 'incoming' ? l.customerName : l.supplierName,
      l.amount,
      l.dueDateLabel,
      l.statusLabel,
      l.isOverdue ? `Ù…ØªØ£Ø®Ø± ${Math.abs(l.daysUntilDue)} ÙŠÙˆÙ…` : '',
    ]);

    return respond({
      req,
      res,
      title: 'ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ø´ÙŠÙƒØ§Øª',
      columns: ['Ø§Ù„Ø±Ù‚Ù…', 'Ø§Ù„Ù†ÙˆØ¹', 'Ø§Ù„Ø¨Ù†Ùƒ', 'Ø§Ù„Ø·Ø±Ù', 'Ø§Ù„Ù…Ø¨Ù„Øº', 'Ø§Ù„Ø§Ø³ØªØ­Ù‚Ø§Ù‚', 'Ø§Ù„Ø­Ø§Ù„Ø©', 'Ù…Ù„Ø§Ø­Ø¸Ø©'],
      rows: rowsForExport,
      meta,
      summaryRows: [
        ['', 'Ù…Ø¹Ù„Ù‘Ù‚', '', '', totals.pending, '', `${totals.pendingCount} Ø´ÙŠÙƒ`, ''],
        ['', 'Ù…ØµØ±ÙˆÙ', '', '', totals.paid, '', `${totals.paidCount} Ø´ÙŠÙƒ`, ''],
        ['', 'Ù…Ø±ØªØ¯', '', '', totals.bounced, '', `${totals.bouncedCount} Ø´ÙŠÙƒ`, ''],
        ['', 'Ù…ØªØ£Ø®Ø±', '', '', totals.overdue, '', `${totals.overdueCount} Ø´ÙŠÙƒ`, ''],
      ],
      jsonData: {
        period: { from: req.query.from, to: req.query.to },
        lines,
        totals,
        count: lines.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * 5) Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export async function getExpensesReport(req, res, next) {
  try {
    const { from, to } = validateRange(req.query.from, req.query.to);

    // Ù…Ù† Ø§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠØ©
    const entries = await AccountingEntry.find({
      entryDate: { $gte: from, $lte: to },
      entryType: {
        $in: [ACCOUNTING_ENTRY_TYPES.EXPENSE, ACCOUNTING_ENTRY_TYPES.CASH_WITHDRAWAL],
      },
      isReversed: { $ne: true },
    })
      .sort({ entryDate: -1 })
      .lean();

    // Ù…Ù† Ø§Ù„Ø­Ø±ÙƒØ§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© (expense)
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
        typeLabel: 'Ù…ØµØ±ÙˆÙ',
        description: t.description || '',
        amount: round2(t.amount),
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const total = round2(lines.reduce((s, l) => s + l.amount, 0));

    const meta = makeExportMeta({ title: 'ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª', from, to });

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
      title: 'ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª',
      columns: ['Ø§Ù„ØªØ§Ø±ÙŠØ®', 'Ø§Ù„Ù…Ø±Ø¬Ø¹', 'Ø§Ù„Ù†ÙˆØ¹', 'Ø§Ù„ÙˆØµÙ', 'Ø§Ù„Ù…Ø¨Ù„Øº'],
      rows: rowsForExport,
      meta,
      summaryRows: [['', '', '', 'Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ', total]],
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * 6) Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª - Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª (Ø¨Ø³ÙŠØ·)
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

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

    // ØªØ¬Ù…ÙŠØ¹ Ø­Ø³Ø¨ Ø§Ù„Ù†ÙˆØ¹ (revenue / expense)
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
        accountName: r.accountName || 'â€”',
        amount: round2(r.credit - r.debit), // ØµØ§ÙÙŠ (credit - debit)
      };

      if (accountType === 'revenue' || REVENUE_TYPES.has(r._id.entryType)) {
        if (Math.abs(item.amount) > 0.01) revenueLines.push(item);
      } else if (accountType === 'expense' || EXPENSE_TYPES.has(r._id.entryType)) {
        // Ù„Ù„Ù…ØµØ±ÙˆÙØ§Øª: ØµØ§ÙÙŠ (debit - credit)
        item.amount = round2(r.debit - r.credit);
        if (Math.abs(item.amount) > 0.01) expenseLines.push(item);
      }
    }

    const totalRevenue = round2(revenueLines.reduce((s, l) => s + l.amount, 0));
    const totalExpenses = round2(expenseLines.reduce((s, l) => s + l.amount, 0));
    const net = round2(totalRevenue - totalExpenses);

    const meta = makeExportMeta({ title: 'Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª - Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª', from, to });

    const rowsForExport = [
      ...revenueLines.map((l) => ['Ø¥ÙŠØ±Ø§Ø¯', l.entryTypeLabel, l.accountName, l.amount]),
      ...expenseLines.map((l) => ['Ù…ØµØ±ÙˆÙ', l.entryTypeLabel, l.accountName, l.amount]),
    ];

    return respond({
      req,
      res,
      title: 'Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª - Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª',
      columns: ['Ø§Ù„Ù†ÙˆØ¹', 'Ø§Ù„ØªØµÙ†ÙŠÙ', 'Ø§Ù„Ø­Ø³Ø§Ø¨', 'Ø§Ù„Ù…Ø¨Ù„Øº'],
      rows: rowsForExport,
      meta,
      summaryRows: [
        ['', '', 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª', totalRevenue],
        ['', '', 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª', totalExpenses],
        ['', '', 'Ø§Ù„ØµØ§ÙÙŠ', net],
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

export default {
  getTrialBalance,
  getCashTransactionsReport,
  getFundBalancesReport,
  getChecksReport,
  getExpensesReport,
  getIncomeSummaryReport,
};
