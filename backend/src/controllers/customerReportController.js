/**
 * @file customerReportController.js
 * @description
 * 2 تقارير عملاء:
 *   1. كشف حساب عميل (Customer Statement)
 *   2. أعمار الديون (Aging Report)
 *
 * ⚠️ كل النماذج default imports.
 * ⚠️ INVOICE_STATUS من constants.js.
 */

// ─── Models ───
import Customer from '../models/Customer.js';
import Invoice from '../models/Invoice.js';
import CustomerReturn from '../models/CustomerReturn.js';

// ─── Services ───
import exportService from '../services/exportService.js';
const { exportToExcel, exportToPdf } = exportService;

import {
  round2,
  validateRange,
  formatDate,
  makeExportMeta,
  INVOICE_STATUS_LABELS,
} from '../services/reportService.js';

// ─── Constants ───
import { INVOICE_STATUS } from '../utils/constants.js';

// ─── Utils ───
import { AppError } from '../middlewares/errorMiddleware.js';
import { logger } from '../utils/logger.js';

/* ─────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

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
  if (!format) return res.status(200).json({ success: true, data: jsonData });
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
    const buffer = await exportToExcel({ title, columns, rows, meta, summaryRows });
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
    logger.error(`[customerReport] فشل تصدير ${title}: ${err.message}`);
    throw err;
  }
}

/* ─────────────────────────────────────────────────────────────
 * 1) كشف حساب عميل
 * ───────────────────────────────────────────────────────────── */

export async function getCustomerStatement(req, res, next) {
  try {
    const { from, to } = validateRange(req.query.from, req.query.to);
    const customerId = req.params.customerId;

    const customer = await Customer.findById(customerId).lean();
    if (!customer) {
      throw new AppError('العميل غير موجود.', 404, 'CUSTOMER_NOT_FOUND');
    }

    // الفواتير المعتمدة فقط
    const invoices = await Invoice.find({
      pharmacy: customerId,
      invoiceDate: { $gte: from, $lte: to },
      status: { $nin: [INVOICE_STATUS.DRAFT, INVOICE_STATUS.CANCELLED] },
    })
      .sort({ invoiceDate: 1 })
      .lean();

    // المرتجعات المعتمدة
    const returns = await CustomerReturn.find({
      pharmacy: customerId,
      returnDate: { $gte: from, $lte: to },
      status: 'approved',
    })
      .sort({ returnDate: 1 })
      .lean();

    // دمج الحركات
    const movements = [
      ...invoices.map((inv) => ({
        date: inv.invoiceDate,
        dateLabel: formatDate(inv.invoiceDate),
        type: 'invoice',
        typeLabel: 'فاتورة',
        ref: inv.invoiceNumber,
        debit: round2(inv.total),
        credit: round2(inv.paidAmount || 0),
        description: `فاتورة ${INVOICE_STATUS_LABELS[inv.status] || inv.status}`,
      })),
      ...returns.map((r) => ({
        date: r.returnDate,
        dateLabel: formatDate(r.returnDate),
        type: 'return',
        typeLabel: 'مرتجع',
        ref: r.returnNumber,
        debit: 0,
        credit: round2(r.total),
        description: 'مرتجع معتمد',
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // الرصيد الافتتاحي = الرصيد الحالي - مجموع الحركات
    const netMovements = movements.reduce((s, m) => s + m.debit - m.credit, 0);
    const openingBalance = round2((customer.currentBalance || 0) - netMovements);

    let running = openingBalance;
    const lines = movements.map((m) => {
      running = round2(running + m.debit - m.credit);
      return { ...m, balance: running };
    });

    const totals = {
      debit: round2(movements.reduce((s, m) => s + m.debit, 0)),
      credit: round2(movements.reduce((s, m) => s + m.credit, 0)),
      openingBalance,
      closingBalance: round2(running),
    };

    const meta = makeExportMeta({
      title: `كشف حساب — ${customer.name}`,
      from,
      to,
    });

    const rowsForExport = [
      ['رصيد افتتاحي', '', '', openingBalance, 0, openingBalance],
      ...lines.map((l) => [
        l.dateLabel,
        l.typeLabel,
        l.ref,
        l.debit,
        l.credit,
        l.balance,
      ]),
      ['رصيد ختامي', '', '', 0, 0, totals.closingBalance],
    ];

    return respond({
      req,
      res,
      title: `كشف حساب — ${customer.name}`,
      columns: ['التاريخ', 'النوع', 'المرجع', 'مدين', 'دائن', 'الرصيد'],
      rows: rowsForExport,
      meta,
      summaryRows: [],
      jsonData: {
        customer: {
          _id: customer._id,
          name: customer.name,
          phone: customer.phone,
          creditLimit: round2(customer.creditLimit || 0),
          currentBalance: round2(customer.currentBalance || 0),
        },
        period: { from, to },
        openingBalance: totals.openingBalance,
        closingBalance: totals.closingBalance,
        totals,
        lines,
      },
    });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────────────────────────────────────────────────
 * 2) أعمار الديون
 * ───────────────────────────────────────────────────────────── */

export async function getAgingReport(req, res, next) {
  try {
    const asOf = req.query.asOf ? new Date(req.query.asOf) : new Date();
    asOf.setHours(23, 59, 59, 999);
    if (Number.isNaN(asOf.getTime())) {
      throw new AppError('صيغة التاريخ غير صالحة.', 400, 'INVALID_DATE');
    }

    // الفواتير غير المسددة بالكامل، والمستحقة قبل asOf
    const invoices = await Invoice.find({
      status: {
        $in: [INVOICE_STATUS.PENDING, INVOICE_STATUS.PARTIAL, INVOICE_STATUS.OVERDUE],
      },
      remainingAmount: { $gt: 0 },
      dueDate: { $lte: asOf },
    })
      .populate('pharmacy', 'name phone creditLimit')
      .lean();

    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    const byCustomer = new Map();

    for (const inv of invoices) {
      const customerId = String(inv.pharmacy?._id || inv.pharmacy);
      if (!byCustomer.has(customerId)) {
        byCustomer.set(customerId, {
          customerId,
          name: inv.pharmacy?.name || '—',
          phone: inv.pharmacy?.phone || '',
          invoicesCount: 0,
          current: 0,
          d30: 0,
          d60: 0,
          d90: 0,
          d90plus: 0,
          total: 0,
        });
      }
      const entry = byCustomer.get(customerId);
      const daysPastDue = Math.floor(
        (asOf.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      let bucket;
      if (daysPastDue <= 0) bucket = 'current';
      else if (daysPastDue <= 30) bucket = 'd30';
      else if (daysPastDue <= 60) bucket = 'd60';
      else if (daysPastDue <= 90) bucket = 'd90';
      else bucket = 'd90plus';

      entry[bucket] = round2(entry[bucket] + inv.remainingAmount);
      entry.total = round2(entry.total + inv.remainingAmount);
      entry.invoicesCount += 1;
      buckets[bucket] = round2(buckets[bucket] + inv.remainingAmount);
    }

    const lines = [...byCustomer.values()].sort((a, b) => b.total - a.total);
    const total = round2(lines.reduce((s, l) => s + l.total, 0));

    const meta = makeExportMeta({ title: 'أعمار الديون', from: null, to: asOf });

    const rowsForExport = lines.map((l) => [
      l.name,
      l.phone,
      l.invoicesCount,
      l.current,
      l.d30,
      l.d60,
      l.d90,
      l.d90plus,
      l.total,
    ]);

    return respond({
      req,
      res,
      title: 'أعمار الديون',
      columns: [
        'العميل',
        'الهاتف',
        'عدد الفواتير',
        'حالي',
        '1-30',
        '31-60',
        '61-90',
        '+90',
        'الإجمالي',
      ],
      rows: rowsForExport,
      meta,
      summaryRows: [
        [
          'الإجمالي',
          '',
          '',
          buckets.current,
          buckets.d30,
          buckets.d60,
          buckets.d90,
          buckets.d90plus,
          total,
        ],
      ],
      jsonData: {
        asOf,
        lines,
        buckets,
        total,
        count: lines.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

export default {
  getCustomerStatement,
  getAgingReport,
};