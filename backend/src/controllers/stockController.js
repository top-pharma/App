/**
 * @file stockController.js
 * @description
 * منطق إدارة المخزون (الدفعات) + FEFO — Phase 2.5.
 *
 * ⚠️ إضافة Phase 2.5:
 * - getBatchesWithFefo: يُرجع `priceLimits` لكل دفعة (min/max limits).
 *   هذا يسمح لـ FefoSelectorModal بعرض "الحد الأدنى X" فوراً.
 */

import mongoose from 'mongoose';

import { AUDIT_ACTIONS } from '../models/AuditLog.js';
import { Item } from '../models/Item.js';
import { Stock } from '../models/Stock.js';
import { Warehouse } from '../models/Warehouse.js';
import { Settings } from '../models/Settings.js';
import { AppError, asyncHandler } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { logger } from '../utils/logger.js';

// ============================================================
// Helpers
// ============================================================

/**
 * بناء استجابة موحّدة لدفعة.
 * ⚠️ Phase 2.5: + effectiveUnitPrice (batch price أو item price).
 */
const buildStockPayload = (stock) => {
  const now = Date.now();
  const expiryTime = stock.expiry ? new Date(stock.expiry).getTime() : null;
  const daysUntilExpiry =
    expiryTime !== null ? Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24)) : null;

  // السعر الفعّال = سعر الدفعة، أو سعر الصنف الافتراضي
  const itemPrice =
    stock.item && typeof stock.item === 'object'
      ? stock.item.units?.base?.price || 0
      : 0;
  const effectiveUnitPrice = stock.unitPrice > 0 ? stock.unitPrice : itemPrice;

  return {
    id: stock._id,
    item:
      typeof stock.item === 'object' && stock.item?._id
        ? {
            id: stock.item._id,
            tradeName: stock.item.tradeName,
            scientificName: stock.item.scientificName,
            category: stock.item.category,
            units: stock.item.units,
          }
        : stock.item,
    batch: stock.batch,
    productionDate: stock.productionDate || null,
    expiry: stock.expiry,
    daysUntilExpiry,
    isExpired: daysUntilExpiry !== null && daysUntilExpiry < 0,
    warehouse:
      typeof stock.warehouse === 'object' && stock.warehouse?._id
        ? { id: stock.warehouse._id, name: stock.warehouse.name, code: stock.warehouse.code }
        : stock.warehouse,
    quantity: stock.quantity || 0,
    location: stock.location || '',
    unitCost: stock.unitCost || 0,
    unitPrice: stock.unitPrice || 0,
    effectiveUnitPrice, // ✅ السعر الموصى به
    supplier: stock.supplier || null,
    purchaseReceipt: stock.purchaseReceipt || null,
    lastReceivedAt: stock.lastReceivedAt || null,
    lastIssuedAt: stock.lastIssuedAt || null,
    isQuarantined: Boolean(stock.isQuarantined),
    quarantineReason: stock.quarantineReason || '',
    notes: stock.notes || '',
    createdAt: stock.createdAt,
    updatedAt: stock.updatedAt,
  };
};

const ensureItemExists = async (itemId) => {
  const item = await Item.findOne({ _id: itemId, isActive: true })
    .select('_id tradeName reorderLevel')
    .lean();
  if (!item) throw new AppError('الصنف غير موجود أو معطّل.', 400, 'ITEM_NOT_FOUND');
  return item;
};

const ensureWarehouseExists = async (warehouseId) => {
  const warehouse = await Warehouse.findOne({ _id: warehouseId, isActive: true })
    .select('_id name code')
    .lean();
  if (!warehouse) throw new AppError('المخزن غير موجود أو معطّل.', 400, 'WAREHOUSE_NOT_FOUND');
  return warehouse;
};

// ============================================================
// 1) FEFO Core
// ============================================================

export async function selectFEFO(itemId, warehouseId, requiredQty, options = {}) {
  const { session = null, includeExpired = false } = options;

  const filter = {
    item: itemId,
    warehouse: warehouseId,
    quantity: { $gt: 0 },
    isQuarantined: false,
  };
  if (!includeExpired) filter.expiry = { $gt: new Date() };

  const query = Stock.find(filter).sort({ expiry: 1, createdAt: 1 });
  if (session) query.session(session);
  const batches = await query;

  const selected = [];
  let remaining = requiredQty;

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    selected.push({
      stockId: batch._id,
      batch: batch.batch,
      expiry: batch.expiry,
      quantity: take,
      unitCost: batch.unitCost,
    });
    remaining -= take;
  }

  if (remaining > 0.0001) {
    const available = requiredQty - remaining;
    throw new AppError(
      `الرصيد غير كافٍ. متاح: ${available} — مطلوب: ${requiredQty}.`,
      400,
      'INSUFFICIENT_STOCK'
    );
  }

  return selected;
}

// ============================================================
// 2) ✅ Endpoint مدمج (batches + FEFO + priceLimits)
// ============================================================

/**
 * GET /api/stocks/by-item/:itemId
 *
 * ⚠️ Phase 2.5:
 * - يُرجع كل دفعة مع `priceLimits` جاهزة (min/max).
 * - يوفر طلب منفصل لحساب الحدود.
 *
 * @type {import('express').RequestHandler}
 */
export const getBatchesWithFefo = asyncHandler(async (req, res) => {
  const { itemId } = req.params;
  const { warehouse: warehouseId, quantity = 0 } = req.validatedQuery || req.query;

  await ensureItemExists(itemId);
  await ensureWarehouseExists(warehouseId);

  // جلب الإعدادات (للحدود العامة)
  const settings = await Settings.getSettings();
  const salesSettings = settings.sales || {};
  const defaultMinMargin = salesSettings.minMarginPercent ?? 10;
  const defaultMaxDiscount = salesSettings.maxDiscountPercent ?? 15;
  const nearExpiryThresholdDays = salesSettings.nearExpiryThresholdDays ?? 30;
  const nearExpiryMaxDiscountPercent = salesSettings.nearExpiryMaxDiscountPercent ?? 30;

  // جلب الصنف (لـ overrides)
  const item = await Item.findById(itemId)
    .select('tradeName scientificName category units minMarginPercent maxDiscountPercent')
    .lean();

  // جلب الدفعات
  const batches = await Stock.find({
    item: itemId,
    warehouse: warehouseId,
    quantity: { $gt: 0 },
    isQuarantined: false,
    expiry: { $gt: new Date() },
  })
    .sort({ expiry: 1, createdAt: 1 })
    .populate('item', 'tradeName scientificName category units')
    .populate('warehouse', 'name code')
    .lean();

  const totalAvailable = batches.reduce((s, b) => s + (b.quantity || 0), 0);

  // ✅ Phase 2.5: إضافة priceLimits لكل دفعة
  const batchesWithPriceLimits = batches.map((batch) => {
    const payload = buildStockPayload(batch);

    const cost = batch.unitCost || item?.units?.base?.cost || 0;
    const listPrice = batch.unitPrice || item?.units?.base?.price || 0;
    const minMarginPercent = item?.minMarginPercent ?? defaultMinMargin;
    const maxDiscountPercent = item?.maxDiscountPercent ?? defaultMaxDiscount;

    const expiryTime = batch.expiry ? new Date(batch.expiry).getTime() : null;
    const daysUntilExpiry =
      expiryTime !== null ? Math.ceil((expiryTime - Date.now()) / (1000 * 60 * 60 * 24)) : null;
    const isNearExpiry =
      daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= nearExpiryThresholdDays;

    const absoluteMin = cost > 0 ? cost * (1 + minMarginPercent / 100) : 0;
    const effectiveMaxDiscountPercent = isNearExpiry
      ? nearExpiryMaxDiscountPercent
      : maxDiscountPercent;
    const minByList =
      listPrice > 0 ? listPrice * (1 - effectiveMaxDiscountPercent / 100) : 0;
    const recommendedMin = Math.max(absoluteMin, minByList);

    return {
      ...payload,
      priceLimits: {
        cost: Math.round(cost * 100) / 100,
        listPrice: Math.round(listPrice * 100) / 100,
        minMarginPercent,
        maxDiscountPercent: effectiveMaxDiscountPercent,
        absoluteMin: Math.round(absoluteMin * 100) / 100,
        recommendedMin: Math.round(recommendedMin * 100) / 100,
        isNearExpiry,
        daysUntilExpiry,
        nearExpiryThresholdDays,
      },
    };
  });

  // FEFO recommendation
  let fefoRecommendation = [];
  const quantityNum = Number(quantity) || 0;
  if (quantityNum > 0 && totalAvailable >= quantityNum) {
    try {
      fefoRecommendation = await selectFEFO(itemId, warehouseId, quantityNum);
    } catch (err) {
      logger.warn(`[getBatchesWithFefo] تعذّر حساب FEFO: ${err.message}`);
      fefoRecommendation = [];
    }
  }

  return res.status(200).json({
    success: true,
    data: {
      item: item
        ? {
            id: item._id,
            tradeName: item.tradeName,
            scientificName: item.scientificName,
            category: item.category,
            units: item.units,
            minMarginPercent: item.minMarginPercent,
            maxDiscountPercent: item.maxDiscountPercent,
          }
        : null,
      batches: batchesWithPriceLimits,
      totalAvailable,
      fefoRecommendation,
      globalSettings: {
        minMarginPercent: defaultMinMargin,
        maxDiscountPercent: defaultMaxDiscount,
        nearExpiryThresholdDays,
        nearExpiryMaxDiscountPercent,
      },
    },
  });
});

// ============================================================
// 3) القراءة
// ============================================================

export const listStocks = asyncHandler(async (req, res) => {
  const {
    page, limit, item, warehouse, search, expiringIn, onlyExpired,
    onlyQuarantined, hideZero, sortBy, sortOrder,
  } = req.validatedQuery || req.query;

  const filter = {};
  if (item) filter.item = item;
  if (warehouse) filter.warehouse = warehouse;
  if (hideZero) filter.quantity = { $gt: 0 };
  if (onlyQuarantined) filter.isQuarantined = true;

  if (onlyExpired) {
    filter.expiry = { ...(filter.expiry || {}), $lt: new Date() };
  } else if (typeof expiringIn === 'number') {
    const threshold = new Date(Date.now() + expiringIn * 24 * 60 * 60 * 1000);
    filter.expiry = { ...(filter.expiry || {}), $lte: threshold };
  }

  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ batch: rx }, { location: rx }];
  }

  const skip = (page - 1) * limit;
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [stocks, total] = await Promise.all([
    Stock.find(filter)
      .populate('item', 'tradeName scientificName category units')
      .populate('warehouse', 'name code')
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(limit),
    Stock.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      items: stocks.map(buildStockPayload),
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + stocks.length < total,
        hasPrev: page > 1,
      },
    },
  });
});

export const getStock = asyncHandler(async (req, res) => {
  const stock = await Stock.findById(req.params.id)
    .populate('item', 'tradeName scientificName category units')
    .populate('warehouse', 'name code');
  if (!stock) throw new AppError('الدفعة غير موجودة.', 404, 'STOCK_NOT_FOUND');
  return res.status(200).json({ success: true, data: buildStockPayload(stock) });
});

export const getExpiringSoon = asyncHandler(async (req, res) => {
  const settings = await Settings.getSettings();
  const days = settings.inventory?.expiryWarningDays ?? 90;
  const threshold = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const batches = await Stock.find({
    quantity: { $gt: 0 }, isQuarantined: false, expiry: { $lte: threshold },
  })
    .populate('item', 'tradeName scientificName category units')
    .populate('warehouse', 'name code')
    .sort({ expiry: 1 })
    .limit(200);

  return res.status(200).json({
    success: true,
    data: { thresholdDays: days, count: batches.length, items: batches.map(buildStockPayload) },
  });
});

export const getBelowReorder = asyncHandler(async (req, res) => {
  const items = await Item.find({ isActive: true })
    .select('_id tradeName scientificName category reorderLevel units').lean();

  const totals = await Stock.aggregate([
    { $match: { quantity: { $gt: 0 }, isQuarantined: false } },
    { $group: { _id: '$item', totalQty: { $sum: '$quantity' } } },
  ]);
  const totalByItem = new Map(totals.map((t) => [String(t._id), t.totalQty]));

  const below = items
    .map((item) => {
      const totalQty = totalByItem.get(String(item._id)) || 0;
      return {
        id: item._id, tradeName: item.tradeName, scientificName: item.scientificName,
        category: item.category, units: item.units,
        reorderLevel: item.reorderLevel || 0, totalQuantity: totalQty,
        shortage: Math.max(0, (item.reorderLevel || 0) - totalQty),
      };
    })
    .filter((i) => i.totalQuantity <= i.reorderLevel)
    .sort((a, b) => b.shortage - a.shortage);

  return res.status(200).json({ success: true, data: { count: below.length, items: below } });
});

export const getSummary = asyncHandler(async (req, res) => {
  const { item, warehouse } = req.validatedQuery || req.query;
  const match = { quantity: { $gt: 0 }, isQuarantined: false };
  if (item) match.item = item;
  if (warehouse) match.warehouse = warehouse;

  const agg = await Stock.aggregate([
    { $match: match },
    { $group: { _id: '$item', totalQuantity: { $sum: '$quantity' }, batchCount: { $sum: 1 }, nearestExpiry: { $min: '$expiry' } } },
    { $sort: { nearestExpiry: 1 } },
    { $limit: 200 },
  ]);

  const itemIds = agg.map((a) => a._id);
  const items = await Item.find({ _id: { $in: itemIds } })
    .select('tradeName scientificName category reorderLevel units').lean();
  const itemMap = new Map(items.map((i) => [String(i._id), i]));

  return res.status(200).json({
    success: true,
    data: {
      count: agg.length,
      items: agg.map((row) => {
        const it = itemMap.get(String(row._id));
        return {
          itemId: row._id, tradeName: it?.tradeName || '—', scientificName: it?.scientificName || '',
          category: it?.category || '', reorderLevel: it?.reorderLevel || 0,
          totalQuantity: row.totalQuantity, batchCount: row.batchCount,
          nearestExpiry: row.nearestExpiry,
          isBelowReorder: row.totalQuantity <= (it?.reorderLevel || 0),
        };
      }),
    },
  });
});

// ============================================================
// 4) الإنشاء / التحديث
// ============================================================

export const createStock = asyncHandler(async (req, res) => {
  const data = req.body;
  await ensureItemExists(data.item);
  await ensureWarehouseExists(data.warehouse);
  const newExpiry = new Date(data.expiry);

  const existing = await Stock.findOne({ item: data.item, batch: data.batch, warehouse: data.warehouse });

  if (existing) {
    const existingExpiry = new Date(existing.expiry).getTime();
    if (existingExpiry !== newExpiry.getTime()) {
      throw new AppError('نفس رقم الدفعة له تاريخ انتهاء مختلف.', 409, 'BATCH_EXPIRY_MISMATCH');
    }

    const before = { quantity: existing.quantity, unitCost: existing.unitCost, unitPrice: existing.unitPrice };
    existing.quantity = (existing.quantity || 0) + data.quantity;
    if (data.location) existing.location = data.location;
    if (data.unitCost > 0) existing.unitCost = data.unitCost;
    if (data.unitPrice > 0) existing.unitPrice = data.unitPrice;
    if (data.supplier) existing.supplier = data.supplier;
    if (data.notes) existing.notes = data.notes;
    existing.lastReceivedAt = new Date();
    await existing.save();

    await logAuditEvent({
      req, action: AUDIT_ACTIONS.UPDATE, resource: 'Stock', resourceId: existing._id,
      description: `دمج كمية في دفعة ${existing.batch}: +${data.quantity}`, success: true,
      meta: { before, after: { quantity: existing.quantity } },
    });

    const populated = await existing.populate([
      { path: 'item', select: 'tradeName scientificName category units' },
      { path: 'warehouse', select: 'name code' },
    ]);
    return res.status(200).json({ success: true, data: buildStockPayload(populated), merged: true });
  }

  const stock = await Stock.create({
    item: data.item, batch: data.batch, productionDate: data.productionDate || null,
    expiry: newExpiry, warehouse: data.warehouse, quantity: data.quantity,
    location: data.location || '', unitCost: data.unitCost || 0, unitPrice: data.unitPrice || 0,
    supplier: data.supplier || null, lastReceivedAt: new Date(),
    isQuarantined: false, notes: data.notes || '', createdBy: req.user._id,
  });

  await logAuditEvent({
    req, action: AUDIT_ACTIONS.CREATE, resource: 'Stock', resourceId: stock._id,
    description: `استلام دفعة جديدة: ${stock.batch} (كمية: ${stock.quantity})`, success: true,
  });

  const populated = await stock.populate([
    { path: 'item', select: 'tradeName scientificName category units' },
    { path: 'warehouse', select: 'name code' },
  ]);
  return res.status(201).json({ success: true, data: buildStockPayload(populated) });
});

export const updateStock = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const stock = await Stock.findById(id);
  if (!stock) throw new AppError('الدفعة غير موجودة.', 404, 'STOCK_NOT_FOUND');

  const before = { quantity: stock.quantity, unitCost: stock.unitCost, unitPrice: stock.unitPrice, expiry: stock.expiry, isQuarantined: stock.isQuarantined };

  if (updates.isQuarantined === true && !updates.quarantineReason && !stock.quarantineReason) {
    throw new AppError('يجب إدخال سبب الحجر عند حجر الدفعة.', 400, 'QUARANTINE_REASON_REQUIRED');
  }
  if (updates.isQuarantined === false) stock.quarantineReason = '';

  const allowedFields = ['productionDate', 'expiry', 'quantity', 'location', 'unitCost', 'unitPrice', 'isQuarantined', 'quarantineReason', 'notes'];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) stock[field] = updates[field];
  }
  await stock.save();

  await logAuditEvent({
    req, action: AUDIT_ACTIONS.UPDATE, resource: 'Stock', resourceId: stock._id,
    description: `تعديل دفعة: ${stock.batch}`, success: true,
    meta: { before, after: { quantity: stock.quantity, isQuarantined: stock.isQuarantined } },
  });

  const populated = await stock.populate([
    { path: 'item', select: 'tradeName scientificName category units' },
    { path: 'warehouse', select: 'name code' },
  ]);
  return res.status(200).json({ success: true, data: buildStockPayload(populated) });
});

export const deleteStock = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const stock = await Stock.findById(id);
  if (!stock) throw new AppError('الدفعة غير موجودة.', 404, 'STOCK_NOT_FOUND');

  if ((stock.quantity || 0) > 0 && !stock.isQuarantined) {
    throw new AppError(`لا يمكن حذف دفعة بها رصيد (${stock.quantity}).`, 409, 'STOCK_HAS_QUANTITY');
  }

  await Stock.deleteOne({ _id: stock._id });
  await logAuditEvent({
    req, action: AUDIT_ACTIONS.DELETE, resource: 'Stock', resourceId: stock._id,
    description: `حذف دفعة: ${stock.batch}`, success: true,
  });
  return res.status(200).json({ success: true, data: { message: 'تم حذف الدفعة.' } });
});

export const selectFefoRoute = asyncHandler(async (req, res) => {
  const { item, warehouse, quantity } = req.body;
  const result = await selectFEFO(item, warehouse, quantity);
  return res.status(200).json({ success: true, data: { requiredQuantity: quantity, selections: result } });
});

export default {
  listStocks, getStock, getBatchesWithFefo, getExpiringSoon, getBelowReorder, getSummary,
  createStock, updateStock, deleteStock, selectFefoRoute, selectFEFO,
};