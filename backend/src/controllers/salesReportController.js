/**
 * @file salesReportController.js
 * @description
 * 7 تقارير مبيعات:
 *   1. الفواتير
 *   2. حسب المندوب
 *   3. حسب الصنف
 *   4. العمولات
 *   5. البونص
 *   6. أداء المناديب (NEW)
 *   7. كشف حساب مندوب (NEW)
 */

// ─── Models (default imports) ───
import Invoice, { INVOICE_STATUSES } from '../models/Invoice.js';
import CustomerReturn from '../models/CustomerReturn.js';
import SalesRepTransaction from '../models/SalesRepTransaction.js';
import User from '../models/User.js';
import Item from '../models/Item.js';

// ─── Services ───
import exportService from '../services/exportService.js';
const { exportToExcel, exportToPdf } = exportService;

import {
  round2,
  validateRange,
  formatDate,
  makeExportMeta,
  buildScope,
  INVOICE_STATUS_LABELS,
  PAYMENT_TYPE_LABELS,
  isValidObjectId,
  toObjectId,
} from '../services/reportService.js';

// ─── Utils ───
import { AppError } from '../middlewares/errorMiddleware.js';
import { logger } from '../utils/logger.js';

/* ─────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

const SALES_REP_TYPE_LABELS = Object.freeze({
  commission: 'عمولة',
  expense: 'مصروف',
  bonus: 'مكافأة',
  advance: 'سلفة',
  settlement: 'تسوية',
  salary: 'راتب',
});

const DIRECTION_LABELS = { credit: 'له', debit: 'عليه' };
const STATUS_LABELS = {
  pending: 'معلّق',
  approved: 'معتمد',
  paid: 'مدفوع',
  cancelled: 'ملغى',
};

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
    logger.error(`[salesReport] فشل تصدير ${title}: ${err.message}`);
    throw err;
  }
}

function baseInvoiceMatch(from, to, scope) {
  return {
    ...scope,
    invoiceDate: { $gte: from, $lte: to },
    status: { $nin: [INVOICE_STATUSES.DRAFT, INVOICE_STATUSES.CANCELLED] },
  };
}

/* ─────────────────────────────────────────────────────────────
 * 1) الفواتير
 * ───────────────────────────────────────────────────────────── */

export async function getInvoicesReport(req, res, next) {
  try {
    const { from, to } = validateRange(req.query.from, req.query.to);
    const scope = buildScope(req);

    const filter = baseInvoiceMatch(from, to, scope);
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    if (req.query.paymentType && req.query.paymentType !== 'all')
      filter.paymentType = req.query.paymentType;

    const invoices = await Invoice.find(filter)
      .populate('pharmacy', 'name phone')
      .populate('salesRep', 'name')
      .sort({ invoiceDate: -1 })
      .limit(3000)
      .lean();

    const lines = invoices.map((inv) => ({
      _id: inv._id,
      invoiceNumber: inv.invoiceNumber,
      date: inv.invoiceDate,
      dateLabel: formatDate(inv.invoiceDate),
      pharmacyName: inv.pharmacy?.name || '—',
      salesRepName: inv.salesRep?.name || '—',
      paymentType: inv.paymentType || '—',
      paymentTypeLabel: PAYMENT_TYPE_LABELS[inv.paymentType] || inv.paymentType || '—',
      status: inv.status,
      statusLabel: INVOICE_STATUS_LABELS[inv.status] || inv.status,
      total: round2(inv.total),
      paid: round2(inv.paidAmount || 0),
      remaining: round2(inv.remainingAmount || 0),
    }));

    const totals = {
      count: lines.length,
      total: round2(lines.reduce((s, l) => s + l.total, 0)),
      paid: round2(lines.reduce((s, l) => s + l.paid, 0)),
      remaining: round2(lines.reduce((s, l) => s + l.remaining, 0)),
    };

    const meta = makeExportMeta({ title: 'تقرير الفواتير', from, to });

    const rowsForExport = lines.map((l) => [
      l.invoiceNumber,
      l.dateLabel,
      l.pharmacyName,
      l.salesRepName,
      l.paymentTypeLabel,
      l.statusLabel,
      l.total,
      l.paid,
      l.remaining,
    ]);

    return respond({
      req,
      res,
      title: 'تقرير الفواتير',
      columns: [
        'الرقم',
        'التاريخ',
        'الصيدلية',
        'المندوب',
        'الدفع',
        'الحالة',
        'الإجمالي',
        'المدفوع',
        'المتبقي',
      ],
      rows: rowsForExport,
      meta,
      summaryRows: [
        ['', '', '', '', '', 'الإجمالي', totals.total, totals.paid, totals.remaining],
      ],
      jsonData: {
        period: { from, to },
        filters: { status: req.query.status, paymentType: req.query.paymentType },
        lines,
        totals,
      },
    });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────────────────────────────────────────────────
 * 2) حسب المندوب
 * ───────────────────────────────────────────────────────────── */

export async function getSalesByRepReport(req, res, next) {
  try {
    const { from, to } = validateRange(req.query.from, req.query.to);
    const scope = buildScope(req);

    const results = await Invoice.aggregate([
      { $match: baseInvoiceMatch(from, to, scope) },
      {
        $group: {
          _id: '$salesRep',
          count: { $sum: 1 },
          total: { $sum: '$total' },
          paid: { $sum: '$paidAmount' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'rep',
        },
      },
      { $unwind: { path: '$rep', preserveNullAndEmptyArrays: true } },
      { $sort: { total: -1 } },
    ]);

    const lines = results.map((r) => ({
      salesRepId: r._id,
      name: r.rep?.name || '—',
      email: r.rep?.email || '',
      count: r.count,
      total: round2(r.total),
      paid: round2(r.paid || 0),
      avgInvoice: r.count > 0 ? round2(r.total / r.count) : 0,
    }));

    const totals = {
      count: lines.reduce((s, l) => s + l.count, 0),
      total: round2(lines.reduce((s, l) => s + l.total, 0)),
      paid: round2(lines.reduce((s, l) => s + l.paid, 0)),
    };

    const meta = makeExportMeta({ title: 'المبيعات حسب المندوب', from, to });

    const rowsForExport = lines.map((l) => [
      l.name,
      l.email,
      l.count,
      l.total,
      l.avgInvoice,
      l.paid,
    ]);

    return respond({
      req,
      res,
      title: 'المبيعات حسب المندوب',
      columns: ['المندوب', 'البريد', 'عدد الفواتير', 'الإجمالي', 'متوسط الفاتورة', 'المدفوع'],
      rows: rowsForExport,
      meta,
      summaryRows: [['الإجمالي', '', totals.count, totals.total, '', totals.paid]],
      jsonData: { period: { from, to }, lines, totals },
    });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────────────────────────────────────────────────
 * 3) حسب الصنف
 * ───────────────────────────────────────────────────────────── */

export async function getSalesByItemReport(req, res, next) {
  try {
    const { from, to } = validateRange(req.query.from, req.query.to);
    const scope = buildScope(req);

    const results = await Invoice.aggregate([
      { $match: baseInvoiceMatch(from, to, scope) },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.item',
          quantity: { $sum: '$items.quantity' },
          total: { $sum: '$items.total' },
          cost: {
            $sum: { $multiply: ['$items.quantity', { $ifNull: ['$items.unitCost', 0] }] },
          },
          invoicesCount: { $addToSet: '$_id' },
        },
      },
      {
        $lookup: {
          from: 'items',
          localField: '_id',
          foreignField: '_id',
          as: 'item',
        },
      },
      { $unwind: { path: '$item', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          itemId: '$_id',
          tradeName: '$item.tradeName',
          scientificName: '$item.scientificName',
          quantity: 1,
          total: 1,
          cost: 1,
          profit: { $subtract: ['$total', '$cost'] },
          invoicesCount: { $size: '$invoicesCount' },
        },
      },
      { $sort: { total: -1 } },
    ]);

    const lines = results.map((r) => ({
      itemId: r.itemId,
      tradeName: r.tradeName || '—',
      scientificName: r.scientificName || '',
      quantity: round2(r.quantity),
      total: round2(r.total),
      cost: round2(r.cost),
      profit: round2(r.profit),
      marginPercent: r.total > 0 ? round2((r.profit / r.total) * 100) : 0,
      invoicesCount: r.invoicesCount,
    }));

    const totals = {
      quantity: round2(lines.reduce((s, l) => s + l.quantity, 0)),
      total: round2(lines.reduce((s, l) => s + l.total, 0)),
      profit: round2(lines.reduce((s, l) => s + l.profit, 0)),
    };

    const meta = makeExportMeta({ title: 'المبيعات حسب الصنف', from, to });

    const rowsForExport = lines.map((l) => [
      l.tradeName,
      l.scientificName,
      l.quantity,
      l.total,
      l.cost,
      l.profit,
      `${l.marginPercent.toFixed(2)}%`,
    ]);

    return respond({
      req,
      res,
      title: 'المبيعات حسب الصنف',
      columns: ['الصنف', 'الاسم العلمي', 'الكمية', 'الإجمالي', 'التكلفة', 'الربح', 'الهامش %'],
      rows: rowsForExport,
      meta,
      summaryRows: [['الإجمالي', '', totals.quantity, totals.total, '', totals.profit, '']],
      jsonData: { period: { from, to }, lines, totals },
    });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────────────────────────────────────────────────
 * 4) العمولات
 * ───────────────────────────────────────────────────────────── */

export async function getCommissionsReport(req, res, next) {
  try {
    const { from, to } = validateRange(req.query.from, req.query.to);
    const scope = buildScope(req);

    const match = {
      type: 'commission',
      transactionDate: { $gte: from, $lte: to },
      status: { $ne: 'cancelled' },
    };
    if (scope.salesRep) match.salesRep = scope.salesRep;

    const txs = await SalesRepTransaction.find(match)
      .populate('salesRep', 'name email')
      .populate('referenceId', 'invoiceNumber total')
      .sort({ transactionDate: -1 })
      .lean();

    const lines = txs.map((t) => ({
      _id: t._id,
      transactionNumber: t.transactionNumber,
      date: t.transactionDate,
      dateLabel: formatDate(t.transactionDate),
      salesRepName: t.salesRep?.name || '—',
      invoiceNumber: t.referenceId?.invoiceNumber || '—',
      invoiceTotal: round2(t.referenceId?.total || 0),
      amount: round2(t.amount),
      status: t.status,
    }));

    const totals = {
      count: lines.length,
      total: round2(lines.reduce((s, l) => s + l.amount, 0)),
      invoiceTotal: round2(lines.reduce((s, l) => s + l.invoiceTotal, 0)),
    };

    const meta = makeExportMeta({ title: 'تقرير العمولات', from, to });

    const rowsForExport = lines.map((l) => [
      l.transactionNumber,
      l.dateLabel,
      l.salesRepName,
      l.invoiceNumber,
      l.invoiceTotal,
      l.amount,
    ]);

    return respond({
      req,
      res,
      title: 'تقرير العمولات',
      columns: ['رقم الحركة', 'التاريخ', 'المندوب', 'الفاتورة', 'قيمة الفاتورة', 'العمولة'],
      rows: rowsForExport,
      meta,
      summaryRows: [['', '', 'الإجمالي', '', totals.invoiceTotal, totals.total]],
      jsonData: { period: { from, to }, lines, totals },
    });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────────────────────────────────────────────────
 * 5) البونص
 * ───────────────────────────────────────────────────────────── */

export async function getDiscountsReport(req, res, next) {
  try {
    const { from, to } = validateRange(req.query.from, req.query.to);
    const scope = buildScope(req);

    const filter = baseInvoiceMatch(from, to, scope);
    filter['discount.type'] = { $ne: null };

    const invoices = await Invoice.find(filter)
      .populate('pharmacy', 'name')
      .populate('salesRep', 'name')
      .sort({ invoiceDate: -1 })
      .limit(3000)
      .lean();

    const lines = invoices.map((inv) => ({
      _id: inv._id,
      invoiceNumber: inv.invoiceNumber,
      date: inv.invoiceDate,
      dateLabel: formatDate(inv.invoiceDate),
      pharmacyName: inv.pharmacy?.name || '—',
      salesRepName: inv.salesRep?.name || '—',
      discountType: inv.discount?.type || '—',
      discountValue: round2(inv.discount?.value || 0),
      discountAmount: round2(inv.discount?.computedAmount || 0),
      reason: inv.discount?.reason || '',
      total: round2(inv.total),
    }));

    const totals = {
      count: lines.length,
      amount: round2(lines.reduce((s, l) => s + l.discountAmount, 0)),
      invoiceTotal: round2(lines.reduce((s, l) => s + l.total, 0)),
    };

    const meta = makeExportMeta({ title: 'البونص والخصومات', from, to });

    const rowsForExport = lines.map((l) => [
      l.invoiceNumber,
      l.dateLabel,
      l.pharmacyName,
      l.salesRepName,
      l.discountType,
      l.discountValue,
      l.discountAmount,
      l.reason,
    ]);

    return respond({
      req,
      res,
      title: 'البونص والخصومات',
      columns: ['الفاتورة', 'التاريخ', 'الصيدلية', 'المندوب', 'النوع', 'القيمة', 'المبلغ المخصوم', 'السبب'],
      rows: rowsForExport,
      meta,
      summaryRows: [['', '', '', '', '', '', totals.amount, '']],
      jsonData: { period: { from, to }, lines, totals },
    });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────────────────────────────────────────────────
 * 6) أداء المناديب (NEW)
 * ───────────────────────────────────────────────────────────── */

export async function getRepsPerformanceReport(req, res, next) {
  try {
    const { from, to } = validateRange(req.query.from, req.query.to);
    const scope = buildScope(req);

    // 1. المبيعات
    const salesAgg = await Invoice.aggregate([
      { $match: baseInvoiceMatch(from, to, scope) },
      {
        $group: {
          _id: '$salesRep',
          invoicesCount: { $sum: 1 },
          totalSales: { $sum: '$total' },
          totalPaid: { $sum: '$paidAmount' },
        },
      },
    ]);

    // 2. عدد الأصناف
    const itemsAgg = await Invoice.aggregate([
      { $match: baseInvoiceMatch(from, to, scope) },
      { $unwind: '$items' },
      { $group: { _id: '$salesRep', itemsCount: { $sum: 1 } } },
    ]);

    // 3. العمولات
    const commAgg = await SalesRepTransaction.aggregate([
      {
        $match: {
          type: 'commission',
          transactionDate: { $gte: from, $lte: to },
          status: { $ne: 'cancelled' },
        },
      },
      {
        $group: {
          _id: '$salesRep',
          totalCommissions: { $sum: '$amount' },
          commissionsCount: { $sum: 1 },
        },
      },
    ]);

    // 4. قائمة المناديب النشطين
    const users = await User.find({ role: 'sales_rep', isActive: true })
      .select('name email')
      .lean();

    // 5. خرائط
    const salesMap = new Map(salesAgg.map((r) => [String(r._id), r]));
    const itemsMap = new Map(itemsAgg.map((r) => [String(r._id), r]));
    const commMap = new Map(commAgg.map((r) => [String(r._id), r]));

    // 6. بناء الصفوف
    const lines = users.map((u) => {
      const id = String(u._id);
      const sales = salesMap.get(id) || { invoicesCount: 0, totalSales: 0, totalPaid: 0 };
      const items = itemsMap.get(id) || { itemsCount: 0 };
      const comm = commMap.get(id) || { totalCommissions: 0, commissionsCount: 0 };

      const avgInvoice =
        sales.invoicesCount > 0 ? round2(sales.totalSales / sales.invoicesCount) : 0;

      return {
        salesRepId: u._id,
        name: u.name || '—',
        email: u.email || '',
        invoicesCount: sales.invoicesCount,
        totalSales: round2(sales.totalSales),
        totalPaid: round2(sales.totalPaid),
        remaining: round2(sales.totalSales - sales.totalPaid),
        avgInvoice,
        itemsCount: items.itemsCount,
        totalCommissions: round2(comm.totalCommissions),
        commissionsCount: comm.commissionsCount,
      };
    });

    lines.sort((a, b) => b.totalSales - a.totalSales);

    const totals = {
      repsCount: lines.length,
      invoicesCount: lines.reduce((s, l) => s + l.invoicesCount, 0),
      totalSales: round2(lines.reduce((s, l) => s + l.totalSales, 0)),
      totalPaid: round2(lines.reduce((s, l) => s + l.totalPaid, 0)),
      totalCommissions: round2(lines.reduce((s, l) => s + l.totalCommissions, 0)),
      itemsCount: lines.reduce((s, l) => s + l.itemsCount, 0),
    };

    const meta = makeExportMeta({ title: 'أداء المناديب', from, to });

    const rowsForExport = lines.map((l) => [
      l.name,
      l.email,
      l.invoicesCount,
      l.totalSales,
      l.avgInvoice,
      l.totalPaid,
      l.remaining,
      l.itemsCount,
      l.totalCommissions,
    ]);

    return respond({
      req,
      res,
      title: 'أداء المناديب',
      columns: [
        'المندوب',
        'البريد',
        'الفواتير',
        'إجمالي المبيعات',
        'متوسط الفاتورة',
        'المحصّل',
        'المتبقي',
        'عدد الأصناف',
        'العمولات',
      ],
      rows: rowsForExport,
      meta,
      summaryRows: [
        [
          'الإجمالي',
          '',
          totals.invoicesCount,
          totals.totalSales,
          '',
          totals.totalPaid,
          '',
          totals.itemsCount,
          totals.totalCommissions,
        ],
      ],
      jsonData: { period: { from, to }, lines, totals },
    });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────────────────────────────────────────────────
 * 7) كشف حساب مندوب (NEW)
 * ───────────────────────────────────────────────────────────── */

export async function getSalesRepStatement(req, res, next) {
  try {
    const { from, to } = validateRange(req.query.from, req.query.to);
    const salesRepId = req.params.salesRepId;

    if (!isValidObjectId(salesRepId)) {
      throw new AppError('salesRepId غير صالح.', 400, 'INVALID_ID');
    }

    // scope: مندوب يرى كشفه فقط
    if (
      req.user.role === 'sales_rep' &&
      String(req.user._id) !== String(salesRepId)
    ) {
      throw new AppError('لا تملك صلاحية عرض كشف حساب مندوب آخر.', 403, 'FORBIDDEN');
    }

    const repIdObj = toObjectId(salesRepId);
    const rep = await User.findById(repIdObj).select('name email phone role isActive').lean();
    if (!rep) {
      throw new AppError('المندوب غير موجود.', 404, 'SALES_REP_NOT_FOUND');
    }

    // الرصيد الافتتاحي
    const before = await SalesRepTransaction.aggregate([
      {
        $match: {
          salesRep: repIdObj,
          transactionDate: { $lt: from },
          status: { $ne: 'cancelled' },
        },
      },
      {
        $group: {
          _id: null,
          credit: { $sum: { $cond: [{ $eq: ['$direction', 'credit'] }, '$amount', 0] } },
          debit: { $sum: { $cond: [{ $eq: ['$direction', 'debit'] }, '$amount', 0] } },
        },
      },
    ]);

    const openingBalance = round2((before[0]?.credit || 0) - (before[0]?.debit || 0));

    // الحركات في الفترة
    const txs = await SalesRepTransaction.find({
      salesRep: repIdObj,
      transactionDate: { $gte: from, $lte: to },
      status: { $ne: 'cancelled' },
    })
      .sort({ transactionDate: 1, createdAt: 1 })
      .lean();

    let running = openingBalance;
    const lines = txs.map((t) => {
      const credit = t.direction === 'credit' ? round2(t.amount) : 0;
      const debit = t.direction === 'debit' ? round2(t.amount) : 0;
      running = round2(running + credit - debit);
      return {
        _id: t._id,
        transactionNumber: t.transactionNumber,
        date: t.transactionDate,
        dateLabel: formatDate(t.transactionDate),
        type: t.type,
        typeLabel: SALES_REP_TYPE_LABELS[t.type] || t.type,
        direction: t.direction,
        directionLabel: DIRECTION_LABELS[t.direction] || t.direction,
        amount: round2(t.amount),
        credit,
        debit,
        balance: running,
        status: t.status,
        statusLabel: STATUS_LABELS[t.status] || t.status,
        description: t.description || '',
      };
    });

    const closingBalance = round2(running);
    const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
    const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));

    const meta = makeExportMeta({
      title: `كشف حساب مندوب — ${rep.name}`,
      from,
      to,
    });

    const rowsForExport = [
      ['رصيد افتتاحي', '', '', '', '', openingBalance],
      ...lines.map((l) => [
        l.dateLabel,
        l.typeLabel,
        l.directionLabel,
        l.amount,
        l.statusLabel,
        l.balance,
      ]),
      ['رصيد ختامي', '', '', '', '', closingBalance],
    ];

    return respond({
      req,
      res,
      title: `كشف حساب مندوب — ${rep.name}`,
      columns: ['التاريخ', 'النوع', 'الاتجاه', 'المبلغ', 'الحالة', 'الرصيد'],
      rows: rowsForExport,
      meta,
      summaryRows: [],
      jsonData: {
        salesRep: {
          _id: rep._id,
          name: rep.name,
          email: rep.email,
          phone: rep.phone || '',
          role: rep.role,
          isActive: rep.isActive,
        },
        period: { from, to },
        openingBalance,
        closingBalance,
        totalCredit,
        totalDebit,
        lines,
        count: lines.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────────────────────────────────────────────────
 * Default Export — 7 دوال
 * ───────────────────────────────────────────────────────────── */

export default {
  getInvoicesReport,
  getSalesByRepReport,
  getSalesByItemReport,
  getCommissionsReport,
  getDiscountsReport,
  getRepsPerformanceReport,
  getSalesRepStatement,
};