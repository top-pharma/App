/**
 * @file inventoryReportController.js
 * @description
 * 3 تقارير مخزون:
 *   1. أرصدة المخزون (Stock Balances)
 *   2. الدفعات القاربة على الانتهاء (Near Expiry)
 *   3. تحت الحد الأدنى (Below Reorder)
 */

// ─── Models ───
import Stock from '../models/Stock.js';
import Item from '../models/Item.js';
import Warehouse from '../models/Warehouse.js';

// ─── Services ───
import exportService from '../services/exportService.js';
const { exportToExcel, exportToPdf } = exportService;

import { round2, formatDate, makeExportMeta } from '../services/reportService.js';

// ─── Utils ───
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
    logger.error(`[inventoryReport] فشل تصدير ${title}: ${err.message}`);
    throw err;
  }
}

/* ─────────────────────────────────────────────────────────────
 * 1) أرصدة المخزون
 * ───────────────────────────────────────────────────────────── */

export async function getStockBalances(req, res, next) {
  try {
    const filter = { isQuarantined: false };
    if (req.query.warehouseId) filter.warehouse = req.query.warehouseId;

    const results = await Stock.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { item: '$item', warehouse: '$warehouse' },
          quantity: { $sum: '$quantity' },
          batchesCount: { $sum: 1 },
          totalCostValue: {
            $sum: { $multiply: ['$quantity', { $ifNull: ['$unitCost', 0] }] },
          },
          totalSaleValue: {
            $sum: { $multiply: ['$quantity', { $ifNull: ['$unitPrice', 0] }] },
          },
        },
      },
      {
        $lookup: {
          from: 'items',
          localField: '_id.item',
          foreignField: '_id',
          as: 'item',
        },
      },
      {
        $lookup: {
          from: 'warehouses',
          localField: '_id.warehouse',
          foreignField: '_id',
          as: 'warehouse',
        },
      },
      { $unwind: { path: '$item', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$warehouse', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          itemId: '$_id.item',
          tradeName: '$item.tradeName',
          scientificName: '$item.scientificName',
          barcode: '$item.barcode',
          warehouseName: '$warehouse.name',
          warehouseCode: '$warehouse.code',
          reorderLevel: { $ifNull: ['$item.reorderLevel', 0] },
          quantity: 1,
          batchesCount: 1,
          totalCostValue: 1,
          totalSaleValue: 1,
        },
      },
      { $sort: { tradeName: 1 } },
    ]);

    const lines = results.map((r) => ({
      itemId: r.itemId,
      tradeName: r.tradeName || '—',
      scientificName: r.scientificName || '',
      barcode: r.barcode || '',
      warehouseName: r.warehouseName || '—',
      quantity: round2(r.quantity),
      batchesCount: r.batchesCount,
      reorderLevel: r.reorderLevel,
      belowReorder: r.reorderLevel > 0 && r.quantity <= r.reorderLevel,
      costValue: round2(r.totalCostValue),
      saleValue: round2(r.totalSaleValue),
    }));

    const totals = {
      itemsCount: new Set(lines.map((l) => String(l.itemId))).size,
      totalQuantity: round2(lines.reduce((s, l) => s + l.quantity, 0)),
      totalCostValue: round2(lines.reduce((s, l) => s + l.costValue, 0)),
      totalSaleValue: round2(lines.reduce((s, l) => s + l.saleValue, 0)),
    };

    const meta = makeExportMeta({ title: 'أرصدة المخزون' });

    const rowsForExport = lines.map((l) => [
      l.tradeName,
      l.scientificName,
      l.warehouseName,
      l.quantity,
      l.batchesCount,
      l.reorderLevel,
      l.costValue,
      l.saleValue,
    ]);

    return respond({
      req,
      res,
      title: 'أرصدة المخزون',
      columns: [
        'الصنف',
        'الاسم العلمي',
        'المخزن',
        'الكمية',
        'الدفعات',
        'الحد الأدنى',
        'قيمة التكلفة',
        'قيمة البيع',
      ],
      rows: rowsForExport,
      meta,
      summaryRows: [
        [
          'الإجمالي',
          '',
          '',
          totals.totalQuantity,
          '',
          '',
          totals.totalCostValue,
          totals.totalSaleValue,
        ],
      ],
      jsonData: { lines, totals },
    });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────────────────────────────────────────────────
 * 2) الدفعات القاربة على الانتهاء
 * ───────────────────────────────────────────────────────────── */

export async function getNearExpiryBatches(req, res, next) {
  try {
    const days = Number(req.query.days) || 90;
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + days);

    const filter = {
      quantity: { $gt: 0 },
      isQuarantined: false,
      expiry: { $gte: new Date(), $lte: threshold },
    };
    if (req.query.warehouseId) filter.warehouse = req.query.warehouseId;

    const batches = await Stock.find(filter)
      .populate('item', 'tradeName scientificName barcode')
      .populate('warehouse', 'name code')
      .sort({ expiry: 1 })
      .lean();

    const now = new Date();
    const lines = batches.map((b) => {
      const daysUntilExpiry = Math.ceil(
        (new Date(b.expiry).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        _id: b._id,
        itemId: b.item?._id,
        tradeName: b.item?.tradeName || '—',
        scientificName: b.item?.scientificName || '',
        batch: b.batch,
        warehouseName: b.warehouse?.name || '—',
        expiry: b.expiry,
        expiryLabel: formatDate(b.expiry),
        daysUntilExpiry,
        quantity: round2(b.quantity),
        unitCost: round2(b.unitCost || 0),
        costValue: round2((b.quantity || 0) * (b.unitCost || 0)),
      };
    });

    const totals = {
      batchesCount: lines.length,
      totalQuantity: round2(lines.reduce((s, l) => s + l.quantity, 0)),
      totalCostValue: round2(lines.reduce((s, l) => s + l.costValue, 0)),
    };

    const meta = makeExportMeta({
      title: `الدفعات القاربة على الانتهاء (${days} يوم)`,
      to: threshold,
    });

    const rowsForExport = lines.map((l) => [
      l.tradeName,
      l.batch,
      l.warehouseName,
      l.expiryLabel,
      l.daysUntilExpiry,
      l.quantity,
      l.costValue,
    ]);

    return respond({
      req,
      res,
      title: `الدفعات القاربة على الانتهاء (${days} يوم)`,
      columns: [
        'الصنف',
        'الدفعة',
        'المخزن',
        'الانتهاء',
        'المتبقي (يوم)',
        'الكمية',
        'قيمة التكلفة',
      ],
      rows: rowsForExport,
      meta,
      summaryRows: [
        ['الإجمالي', '', '', '', '', totals.totalQuantity, totals.totalCostValue],
      ],
      jsonData: { days, threshold, lines, totals },
    });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────────────────────────────────────────────────
 * 3) تحت الحد الأدنى
 * ───────────────────────────────────────────────────────────── */

export async function getBelowReorder(req, res, next) {
  try {
    const results = await Stock.aggregate([
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
      {
        $project: {
          itemId: '$_id',
          tradeName: '$item.tradeName',
          scientificName: '$item.scientificName',
          barcode: '$item.barcode',
          reorderLevel: '$item.reorderLevel',
          quantity: '$totalQty',
          deficit: { $subtract: ['$item.reorderLevel', '$totalQty'] },
        },
      },
      { $sort: { deficit: -1 } },
    ]);

    const lines = results.map((r) => ({
      itemId: r.itemId,
      tradeName: r.tradeName || '—',
      scientificName: r.scientificName || '',
      barcode: r.barcode || '',
      quantity: round2(r.quantity),
      reorderLevel: r.reorderLevel,
      deficit: round2(r.deficit),
    }));

    const totals = {
      itemsCount: lines.length,
      totalDeficit: round2(lines.reduce((s, l) => s + l.deficit, 0)),
    };

    const meta = makeExportMeta({ title: 'أصناف تحت الحد الأدنى' });

    const rowsForExport = lines.map((l) => [
      l.tradeName,
      l.scientificName,
      l.barcode,
      l.quantity,
      l.reorderLevel,
      l.deficit,
    ]);

    return respond({
      req,
      res,
      title: 'أصناف تحت الحد الأدنى',
      columns: ['الصنف', 'الاسم العلمي', 'الباركود', 'الرصيد', 'الحد الأدنى', 'النقص'],
      rows: rowsForExport,
      meta,
      summaryRows: [['الإجمالي', '', '', '', '', totals.totalDeficit]],
      jsonData: { lines, totals },
    });
  } catch (err) {
    next(err);
  }
}

export default {
  getStockBalances,
  getNearExpiryBatches,
  getBelowReorder,
};