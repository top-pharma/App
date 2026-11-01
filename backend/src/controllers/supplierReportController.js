/**
 * @file supplierReportController.js
 * @description
 * 2 تقارير موردين:
 *   1. كشف حساب مورد (Supplier Statement)
 *   2. أرصدة الموردين (Supplier Balances)
 */

// ─── Models ───
import Supplier from '../models/Supplier.js';
import PurchaseReceipt from '../models/PurchaseReceipt.js';
import SupplierReturn from '../models/SupplierReturn.js';

// ─── Services ───
import exportService from '../services/exportService.js';
const { exportToExcel, exportToPdf } = exportService;

import {
  round2,
  validateRange,
  formatDate,
  makeExportMeta,
} from '../services/reportService.js';

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
    logger.error(`[supplierReport] فشل تصدير ${title}: ${err.message}`);
    throw err;
  }
}

/* ─────────────────────────────────────────────────────────────
 * 1) كشف حساب مورد
 * ───────────────────────────────────────────────────────────── */

export async function getSupplierStatement(req, res, next) {
  try {
    const { from, to } = validateRange(req.query.from, req.query.to);
    const supplierId = req.params.supplierId;

    const supplier = await Supplier.findById(supplierId).lean();
    if (!supplier) {
      throw new AppError('المورد غير موجود.', 404, 'SUPPLIER_NOT_FOUND');
    }

    // إيصالات الاستلام المعتمدة
    const receipts = await PurchaseReceipt.find({
      supplier: supplierId,
      receiptDate: { $gte: from, $lte: to },
      status: { $nin: ['cancelled', 'draft'] },
    })
      .sort({ receiptDate: 1 })
      .lean();

    // مرتجعات الموردين
    const returns = await SupplierReturn.find({
      supplier: supplierId,
      returnDate: { $gte: from, $lte: to },
      status: { $ne: 'cancelled' },
    })
      .sort({ returnDate: 1 })
      .lean();

    const movements = [
      ...receipts.map((r) => ({
        date: r.receiptDate,
        dateLabel: formatDate(r.receiptDate),
        type: 'purchase',
        typeLabel: 'مشتريات',
        ref: r.receiptNumber,
        debit: 0,
        credit: round2(r.total),
        description: 'استلام بضاعة',
      })),
      ...returns.map((r) => ({
        date: r.returnDate,
        dateLabel: formatDate(r.returnDate),
        type: 'return',
        typeLabel: 'مرتجع',
        ref: r.returnNumber,
        debit: round2(r.total),
        credit: 0,
        description: 'مرتجع مورد',
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const netMovements = movements.reduce((s, m) => s + m.debit - m.credit, 0);
    const openingBalance = round2((supplier.currentBalance || 0) - netMovements);

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
      title: `كشف حساب — ${supplier.name}`,
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
      title: `كشف حساب — ${supplier.name}`,
      columns: ['التاريخ', 'النوع', 'المرجع', 'مدين', 'دائن', 'الرصيد'],
      rows: rowsForExport,
      meta,
      summaryRows: [],
      jsonData: {
        supplier: {
          _id: supplier._id,
          name: supplier.name,
          phone: supplier.phone,
          code: supplier.code,
          currentBalance: round2(supplier.currentBalance || 0),
          paymentTerms: supplier.paymentTerms || 30,
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
 * 2) أرصدة الموردين
 * ───────────────────────────────────────────────────────────── */

export async function getSupplierBalances(req, res, next) {
  try {
    const suppliers = await Supplier.find({ isActive: true })
      .select('name code phone currentBalance paymentTerms')
      .lean();

    const lines = suppliers.map((s) => ({
      supplierId: s._id,
      name: s.name,
      code: s.code || '—',
      phone: s.phone || '—',
      currentBalance: round2(s.currentBalance || 0),
      paymentTerms: s.paymentTerms || 30,
    }));

    lines.sort((a, b) => Math.abs(b.currentBalance) - Math.abs(a.currentBalance));

    const positive = round2(
      lines.filter((l) => l.currentBalance > 0).reduce((s, l) => s + l.currentBalance, 0)
    );
    const negative = round2(
      lines.filter((l) => l.currentBalance < 0).reduce((s, l) => s + l.currentBalance, 0)
    );
    const net = round2(lines.reduce((s, l) => s + l.currentBalance, 0));

    const meta = makeExportMeta({ title: 'أرصدة الموردين' });

    const rowsForExport = lines.map((l) => [
      l.name,
      l.code,
      l.phone,
      l.currentBalance,
      l.paymentTerms,
    ]);

    return respond({
      req,
      res,
      title: 'أرصدة الموردين',
      columns: ['المورد', 'الكود', 'الهاتف', 'الرصيد', 'شروط الدفع (يوم)'],
      rows: rowsForExport,
      meta,
      summaryRows: [
        ['إجمالي الموجب', '', '', positive, ''],
        ['إجمالي السالب', '', '', negative, ''],
        ['الصافي', '', '', net, ''],
      ],
      jsonData: {
        lines,
        totals: {
          count: lines.length,
          positive,
          negative,
          net,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export default {
  getSupplierStatement,
  getSupplierBalances,
};