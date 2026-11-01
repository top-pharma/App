/**
 * @file dashboardService.js
 * @description
 * منطق الداشبورد التفاعلي — KPIs + رسوم + جداول مصغرة.
 *
 * لماذا هذا الملف؟
 * - يجمع كل بيانات الداشبورد في مكان واحد (aggregations محسّنة).
 * - يعالج Scope (sales_rep يرى بياناته فقط، pharmacy يرى فواتيره فقط).
 * - يحسب المقارنة بالفترة السابقة لكل KPI.
 * - يملأ الأيام الفارغة في رسم المبيعات بـ 0 (لتجربة مستخدم نظيفة).
 *
 * ⚠️ ملاحظات معمارية:
 * - لا يعتمد على AccountingEntry (لتقارير الميزان لاحقاً).
 * - يستخدم currentBalance في CashFund/BankAccount (الحقل الفعلي).
 * - يستخدم isReversed في CashTransaction (وليس isCancelled).
 * - يستخدم 'collected' في Check (وليس 'paid').
 */

import mongoose from 'mongoose';

import { Invoice, INVOICE_STATUSES } from '../models/Invoice.js';
import { Check, CHECK_STATUSES } from '../models/Check.js';
import { Stock } from '../models/Stock.js';
import { CashFund } from '../models/CashFund.js';
import { BankAccount } from '../models/BankAccount.js';
import { CashTransaction, CASH_DIRECTIONS } from '../models/CashTransaction.js';

import { AppError } from '../middlewares/errorMiddleware.js';
import { logger } from '../utils/logger.js';

// ============================================================
// Helpers
// ============================================================

/**
 * تقريب آمن لخانتين عشريتين.
 */
function round2(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * حساب نسبة التغيير بين قيمتين.
 * @returns {number|null} null إذا كانت القيمة السابقة 0.
 */
function pctChange(prev, curr) {
  if (!prev || prev === 0) {
    return curr > 0 ? 100 : null;
  }
  return round2(((curr - prev) / prev) * 100);
}

/**
 * تحديد الفترة الزمنية من period/from/to.
 */
function resolvePeriod(period, fromStr, toStr) {
  const now = new Date();

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  switch (period) {
    case 'today':
      return { from: startOfToday, to: endOfToday, label: 'اليوم' };
    case 'week': {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - 6);
      return { from: d, to: endOfToday, label: 'آخر 7 أيام' };
    }
    case 'month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: d, to: endOfToday, label: 'هذا الشهر' };
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const d = new Date(now.getFullYear(), q * 3, 1);
      return { from: d, to: endOfToday, label: 'هذا الربع' };
    }
    case 'year': {
      const d = new Date(now.getFullYear(), 0, 1);
      return { from: d, to: endOfToday, label: 'هذه السنة' };
    }
    case 'custom': {
      if (!fromStr || !toStr) {
        throw new AppError('يجب تحديد from و to للفترة المخصصة.', 400, 'INVALID_PERIOD');
      }
      const f = new Date(fromStr);
      const t = new Date(toStr);
      if (isNaN(f.getTime()) || isNaN(t.getTime())) {
        throw new AppError('صيغة التاريخ غير صالحة.', 400, 'INVALID_DATE');
      }
      if (f > t) {
        throw new AppError('تاريخ البداية يجب أن يسبق النهاية.', 400, 'INVALID_DATE_RANGE');
      }
      return { from: f, to: t, label: 'مخصص' };
    }
    default:
      throw new AppError('فترة غير معروفة.', 400, 'INVALID_PERIOD');
  }
}

/**
 * الفترة السابقة المكافئة (نفس المدة).
 */
function previousPeriod(from, to) {
  const duration = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - duration);
  return { from: prevFrom, to: prevTo };
}

/**
 * بناء شرط Scope حسب دور المستخدم.
 */
function buildScope(req) {
  if (!req?.user) return {};
  if (req.user.role === 'sales_rep') {
    return { salesRep: new mongoose.Types.ObjectId(req.user._id) };
  }
  if (req.user.role === 'pharmacy') {
    const customerId = req.user.linkedEntity?.id;
    if (customerId) {
      return { pharmacy: new mongoose.Types.ObjectId(customerId) };
    }
  }
  return {};
}

/**
 * الشرط الأساسي للفواتير المعتمدة (غير مسودة/ملغاة).
 */
function invoiceBaseMatch(from, to, scope) {
  return {
    ...scope,
    invoiceDate: { $gte: from, $lte: to },
    status: { $nin: [INVOICE_STATUSES.DRAFT, INVOICE_STATUSES.CANCELLED] },
  };
}

// ============================================================
// 1) KPI المبيعات (فترة + مقارنة)
// ============================================================

async function computeSalesKPIs(from, to, scope) {
  const [result] = await Invoice.aggregate([
    { $match: invoiceBaseMatch(from, to, scope) },
    {
      $group: {
        _id: null,
        total: { $sum: '$total' },
        paid: { $sum: '$paidAmount' },
        remaining: { $sum: '$remainingAmount' },
        count: { $sum: 1 },
      },
    },
  ]);

  return {
    total: round2(result?.total || 0),
    paid: round2(result?.paid || 0),
    remaining: round2(result?.remaining || 0),
    count: result?.count || 0,
  };
}

// ============================================================
// 2) شيكات: معلقة + متأخرة + قريبة
// ============================================================

async function computeChecksKPIs() {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [pending, overdue, dueSoon] = await Promise.all([
    Check.aggregate([
      { $match: { status: CHECK_STATUSES.PENDING } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]),
    Check.aggregate([
      { $match: { status: CHECK_STATUSES.PENDING, dueDate: { $lt: now } } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]),
    Check.aggregate([
      {
        $match: {
          status: CHECK_STATUSES.PENDING,
          dueDate: { $gte: now, $lte: in7 },
        },
      },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]),
  ]);

  return {
    pending: {
      count: pending[0]?.count || 0,
      total: round2(pending[0]?.total || 0),
    },
    overdue: {
      count: overdue[0]?.count || 0,
      total: round2(overdue[0]?.total || 0),
    },
    dueSoon: {
      count: dueSoon[0]?.count || 0,
      total: round2(dueSoon[0]?.total || 0),
    },
  };
}

// ============================================================
// 3) أصناف تحت الحد الأدنى
// ============================================================

async function computeLowStock(limit) {
  const pipeline = [
    { $match: { isQuarantined: false } },
    {
      $group: {
        _id: '$item',
        totalQty: { $sum: '$quantity' },
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
    { $unwind: '$item' },
    {
      $match: {
        'item.isActive': true,
        'item.reorderLevel': { $gt: 0 },
        $expr: { $lte: ['$totalQty', '$item.reorderLevel'] },
      },
    },
  ];

  const [totalCount, items] = await Promise.all([
    Stock.aggregate([...pipeline, { $count: 'total' }]),
    Stock.aggregate([
      ...pipeline,
      {
        $project: {
          _id: 1,
          totalQty: 1,
          tradeName: '$item.tradeName',
          scientificName: '$item.scientificName',
          barcode: '$item.barcode',
          reorderLevel: '$item.reorderLevel',
          deficit: { $subtract: ['$item.reorderLevel', '$totalQty'] },
        },
      },
      { $sort: { totalQty: 1 } },
      { $limit: limit },
    ]),
  ]);

  return {
    total: totalCount[0]?.total || 0,
    items: items.map((r) => ({
      itemId: r._id,
      tradeName: r.tradeName,
      scientificName: r.scientificName,
      barcode: r.barcode || '',
      quantity: round2(r.totalQty),
      reorderLevel: r.reorderLevel,
      deficit: round2(r.deficit),
    })),
  };
}

// ============================================================
// 4) اللقطة المالية (أرصدة الصناديق + البنك)
// ============================================================

async function computeFinancialSnapshot() {
  const [funds, banks] = await Promise.all([
    CashFund.find({ isActive: true })
      .select('name code currentBalance isDefault')
      .lean(),
    BankAccount.find({ isActive: true })
      .select('name bankName accountNumber currentBalance')
      .lean(),
  ]);

  const totalCash = funds.reduce((sum, f) => sum + (f.currentBalance || 0), 0);
  const totalBank = banks.reduce((sum, b) => sum + (b.currentBalance || 0), 0);

  return {
    funds: funds.map((f) => ({
      _id: f._id,
      name: f.name,
      code: f.code,
      balance: round2(f.currentBalance || 0),
      isDefault: f.isDefault,
    })),
    banks: banks.map((b) => ({
      _id: b._id,
      name: b.name,
      bankName: b.bankName,
      accountNumber: b.accountNumber,
      balance: round2(b.currentBalance || 0),
    })),
    totalCash: round2(totalCash),
    totalBank: round2(totalBank),
    totalLiquid: round2(totalCash + totalBank),
  };
}

// ============================================================
// 5) الحركة النقدية (دخول/خروج) في الفترة
// ============================================================

async function computeCashFlow(from, to) {
  const results = await CashTransaction.aggregate([      // ← بدون [ ]
    {
      $match: {
        isReversed: { $ne: true },
        transactionDate: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: '$direction',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  // ✅ نتائج aggregate مصفوفة دائماً — حتى لو فارغة
  const byDir = results.reduce((acc, r) => {
    acc[r._id] = { total: round2(r.total), count: r.count };
    return acc;
  }, {});

  return {
    in: byDir[CASH_DIRECTIONS.IN] || { total: 0, count: 0 },
    out: byDir[CASH_DIRECTIONS.OUT] || { total: 0, count: 0 },
    net: round2((byDir[CASH_DIRECTIONS.IN]?.total || 0) - (byDir[CASH_DIRECTIONS.OUT]?.total || 0)),
  };
}

// ============================================================
// 6) رسم المبيعات اليومي (Line)
// ============================================================

async function computeSalesTrend(days, scope) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const results = await Invoice.aggregate([
    { $match: invoiceBaseMatch(start, end, scope) },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate' } },
        total: { $sum: '$total' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byDate = new Map(results.map((r) => [r._id, r]));

  const series = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    const entry = byDate.get(key);
    series.push({
      date: key,
      total: round2(entry?.total || 0),
      count: entry?.count || 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return series;
}

// ============================================================
// 7) توزيع المبيعات حسب التصنيف (Donut)
// ============================================================

async function computeCategoryDistribution(from, to, scope) {
  const results = await Invoice.aggregate([
    { $match: invoiceBaseMatch(from, to, scope) },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'items',
        localField: 'items.item',
        foreignField: '_id',
        as: 'itemDoc',
      },
    },
    { $unwind: '$itemDoc' },
    {
      $group: {
        _id: '$itemDoc.category',
        total: { $sum: '$items.total' },
        quantity: { $sum: '$items.quantity' },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]);

  return results.map((r) => ({
    category: r._id || 'other',
    total: round2(r.total),
    quantity: round2(r.quantity),
    count: r.count,
  }));
}

// ============================================================
// 8) توزيع المبيعات حسب المندوب (Bar)
// ============================================================

async function computeSalesByRep(from, to) {
  const results = await Invoice.aggregate([
    { $match: invoiceBaseMatch(from, to, {}) },
    {
      $group: {
        _id: '$salesRep',
        total: { $sum: '$total' },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'rep',
      },
    },
    { $unwind: { path: '$rep', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        total: 1,
        count: 1,
        name: '$rep.name',
        email: '$rep.email',
      },
    },
  ]);

  return results.map((r) => ({
    salesRepId: r._id,
    name: r.name || '—',
    email: r.email || '',
    total: round2(r.total),
    count: r.count,
  }));
}

// ============================================================
// 9) جداول مصغرة
// ============================================================

async function getMiniPendingInvoices(limit, scope) {
  const invoices = await Invoice.find({
    ...scope,
    status: {
      $in: [
        INVOICE_STATUSES.PENDING,
        INVOICE_STATUSES.PARTIAL,
        INVOICE_STATUSES.OVERDUE,
      ],
    },
    remainingAmount: { $gt: 0 },
  })
    .populate('pharmacy', 'name phone')
    .sort({ dueDate: 1 })
    .limit(limit)
    .lean();

  const now = Date.now();

  return invoices.map((inv) => ({
    _id: inv._id,
    invoiceNumber: inv.invoiceNumber,
    pharmacyName: inv.pharmacy?.name || '—',
    pharmacyPhone: inv.pharmacy?.phone || '',
    total: round2(inv.total),
    remainingAmount: round2(inv.remainingAmount),
    status: inv.status,
    dueDate: inv.dueDate,
    daysUntilDue: inv.dueDate
      ? Math.ceil((new Date(inv.dueDate).getTime() - now) / (1000 * 60 * 60 * 24))
      : null,
  }));
}

async function getMiniUpcomingChecks(limit, days = 30) {
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const checks = await Check.find({
    status: CHECK_STATUSES.PENDING,
    dueDate: { $gte: now, $lte: end },
  })
    .populate('customerId', 'name')
    .populate('supplierId', 'name')
    .sort({ dueDate: 1 })
    .limit(limit)
    .lean();

  return checks.map((c) => ({
    _id: c._id,
    checkNumber: c.checkNumber,
    type: c.type,
    bankName: c.bankName,
    drawerName: c.customerId?.name || c.supplierId?.name || '',
 
    amount: round2(c.amount),
    dueDate: c.dueDate,
    daysUntilDue: Math.ceil(
      (new Date(c.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    ),
  }));
}

// ============================================================
// Orchestrator
// ============================================================

/**
 * جمع كل بيانات الداشبورد.
 */
export async function getDashboardData({
  req,
  period = 'month',
  from,
  to,
  trendDays = 30,
  lowStockLimit = 5,
}) {
  const resolved = resolvePeriod(period, from, to);
  const prev = previousPeriod(resolved.from, resolved.to);
  const scope = buildScope(req);

  const [
    currentSales,
    previousSales,
    checksKPIs,
    lowStock,
    financialSnapshot,
    cashFlowCurrent,
    cashFlowPrevious,
    trend,
    categoryDistribution,
    salesByRep,
    pendingInvoices,
    upcomingChecks,
  ] = await Promise.all([
    computeSalesKPIs(resolved.from, resolved.to, scope),
    computeSalesKPIs(prev.from, prev.to, scope),
    computeChecksKPIs(),
    computeLowStock(lowStockLimit),
    computeFinancialSnapshot(),
    computeCashFlow(resolved.from, resolved.to),
    computeCashFlow(prev.from, prev.to),
    computeSalesTrend(trendDays, scope),
    computeCategoryDistribution(resolved.from, resolved.to, scope),
    req.user.role === 'sales_rep' ? Promise.resolve([]) : computeSalesByRep(resolved.from, resolved.to),
    getMiniPendingInvoices(5, scope),
    getMiniUpcomingChecks(5, 30),
  ]);

  return {
    period: {
      type: period,
      label: resolved.label,
      from: resolved.from,
      to: resolved.to,
      previousFrom: prev.from,
      previousTo: prev.to,
    },
    kpis: {
      sales: {
        ...currentSales,
        previous: previousSales,
        changePercent: pctChange(previousSales.total, currentSales.total),
      },
      paid: {
        total: currentSales.paid,
        previous: previousSales.paid,
        changePercent: pctChange(previousSales.paid, currentSales.paid),
      },
      cashFlow: {
        current: cashFlowCurrent,
        previous: cashFlowPrevious,
      },
      checks: checksKPIs,
      lowStock: {
        total: lowStock.total,
      },
      financial: financialSnapshot,
    },
    charts: {
      salesTrend: trend,
      categoryDistribution,
      salesByRep,
    },
    tables: {
      pendingInvoices,
      upcomingChecks,
      lowStockItems: lowStock.items,
    },
    meta: {
      generatedAt: new Date(),
      trendDays,
      scope: scope.salesRep ? 'sales_rep' : scope.pharmacy ? 'pharmacy' : 'all',
    },
  };
}

export default { getDashboardData };