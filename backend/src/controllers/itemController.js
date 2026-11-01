/**
 * @file itemController.js
 * @description منطق إدارة الأصناف (CRUD + البحث بالباركود + تحت حد الطلب).
 */

import { AUDIT_ACTIONS } from '../models/AuditLog.js';
import { Category } from '../models/Category.js';
import { Item } from '../models/Item.js';
import { Stock } from '../models/Stock.js';
import { Warehouse } from '../models/Warehouse.js';
import { AppError, asyncHandler } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';

// ============================================================
// Helpers
// ============================================================

const buildItemPayload = (item) => ({
  id: item._id,
  scientificName: item.scientificName,
  tradeName: item.tradeName,
  tradeNameEn: item.tradeNameEn || '',
  manufacturer: item.manufacturer || '',
  originCountry: item.originCountry || '',
  category: item.category,
  barcode: item.barcode || '',
  registrationNumber: item.registrationNumber || '',
  dosageForm: item.dosageForm || '',
  strength: item.strength || '',
  units: item.units || {
    base: { name: '', contains: 1, barcode: '', price: 0, cost: 0 },
    packaging: { name: '', contains: 1, barcode: '', price: 0, cost: 0 },
    smallest: { name: '', contains: 1, barcode: '', price: 0, cost: 0 },
  },
  supportedUnits: item.supportedUnits || [],
  defaultSaleUnit: item.defaultSaleUnit || '',
  reorderLevel: item.reorderLevel || 0,
  warehouse: item.warehouse || null,
  prescriptionRequired: Boolean(item.prescriptionRequired),
  storageConditions: item.storageConditions || '',
  isActive: Boolean(item.isActive),
  notes: item.notes || '',
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const ensureCategoryExists = async (categoryName) => {
  const exists = await Category.findOne({
    name: categoryName,
    isActive: true,
  })
    .select('_id')
    .lean();
  if (!exists) {
    throw new AppError(
      `التصنيف "${categoryName}" غير موجود أو معطّل.`,
      400,
      'CATEGORY_NOT_FOUND'
    );
  }
};

const ensureWarehouseExists = async (warehouseId) => {
  if (!warehouseId) return;
  const exists = await Warehouse.findOne({
    _id: warehouseId,
    isActive: true,
  })
    .select('_id')
    .lean();
  if (!exists) {
    throw new AppError('المخزن غير موجود أو معطّل.', 400, 'WAREHOUSE_NOT_FOUND');
  }
};

const ensureBarcodeUnique = async (barcode, excludeId = null) => {
  if (!barcode) return;
  const query = { barcode };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await Item.findOne(query).select('_id').lean();
  if (existing) {
    throw new AppError('الباركود مستخدم في صنف آخر.', 409, 'BARCODE_TAKEN');
  }
};

// ============================================================
// 1) القراءة
// ============================================================

export const listItems = asyncHandler(async (req, res) => {
  const { page, limit, search, category, isActive, lowStock, sortBy, sortOrder } =
    req.validatedQuery || req.query;

  const filter = {};

  if (category) filter.category = category;
  if (typeof isActive === 'boolean') filter.isActive = isActive;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { scientificName: rx },
      { tradeName: rx },
      { tradeNameEn: rx },
      { barcode: rx },
      { manufacturer: rx },
      { registrationNumber: rx },
    ];
  }

  const skip = (page - 1) * limit;
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  if (!lowStock) {
    const [items, total] = await Promise.all([
      Item.find(filter).sort({ [sortBy]: sortDirection }).skip(skip).limit(limit),
      Item.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        items: items.map(buildItemPayload),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: skip + items.length < total,
          hasPrev: page > 1,
        },
      },
    });
  }

  // lowStock = true: نحسب إجمالي Stock لكل صنف مطابق.
  const matchingItems = await Item.find(filter).select('_id reorderLevel');

  const totals = await Stock.aggregate([
    { $match: { item: { $in: matchingItems.map((i) => i._id) } } },
    { $group: { _id: '$item', totalQty: { $sum: '$quantity' } } },
  ]);

  const totalByItem = new Map(totals.map((t) => [String(t._id), t.totalQty]));

  const lowStockIds = matchingItems
    .filter((item) => {
      const totalQty = totalByItem.get(String(item._id)) || 0;
      return totalQty <= (item.reorderLevel || 0);
    })
    .map((i) => i._id);

  const [items, total] = await Promise.all([
    Item.find({ _id: { $in: lowStockIds } })
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(limit),
    Promise.resolve(lowStockIds.length),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      items: items.map(buildItemPayload),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + items.length < total,
        hasPrev: page > 1,
      },
    },
  });
});

export const getItem = asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item) throw new AppError('الصنف غير موجود.', 404, 'ITEM_NOT_FOUND');
  return res.status(200).json({ success: true, data: buildItemPayload(item) });
});

export const getItemByBarcode = asyncHandler(async (req, res) => {
  const { barcode } = req.params;
  const item = await Item.findOne({ barcode, isActive: true });
  if (!item) throw new AppError('لا يوجد صنف بهذا الباركود.', 404, 'ITEM_NOT_FOUND');
  return res.status(200).json({ success: true, data: buildItemPayload(item) });
});

// ============================================================
// 2) الإنشاء
// ============================================================

export const createItem = asyncHandler(async (req, res) => {
  const data = req.body;

  await ensureCategoryExists(data.category);
  await ensureWarehouseExists(data.warehouse);
  await ensureBarcodeUnique(data.barcode);

  const item = await Item.create({
    scientificName: data.scientificName,
    tradeName: data.tradeName,
    tradeNameEn: data.tradeNameEn || '',
    manufacturer: data.manufacturer || '',
    originCountry: data.originCountry || '',
    category: data.category,
    barcode: data.barcode || undefined,
    registrationNumber: data.registrationNumber || '',
    dosageForm: data.dosageForm || '',
    strength: data.strength || '',
    units: data.units,
    supportedUnits: data.supportedUnits || [],
    defaultSaleUnit: data.defaultSaleUnit || '',
    reorderLevel: data.reorderLevel || 0,
    warehouse: data.warehouse || null,
    prescriptionRequired: Boolean(data.prescriptionRequired),
    storageConditions: data.storageConditions || '',
    notes: data.notes || '',
    isActive: true,
    createdBy: req.user._id,
  });

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.CREATE,
    resource: 'Item',
    resourceId: item._id,
    description: `إنشاء صنف: ${item.tradeName} (${item.scientificName})`,
    success: true,
    meta: {
      after: {
        tradeName: item.tradeName,
        scientificName: item.scientificName,
        category: item.category,
        barcode: item.barcode,
      },
    },
  });

  return res.status(201).json({ success: true, data: buildItemPayload(item) });
});

// ============================================================
// 3) التعديل
// ============================================================

export const updateItem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const item = await Item.findById(id);
  if (!item) throw new AppError('الصنف غير موجود.', 404, 'ITEM_NOT_FOUND');

  const before = {
    tradeName: item.tradeName,
    scientificName: item.scientificName,
    category: item.category,
    barcode: item.barcode,
    isActive: item.isActive,
  };

  if (updates.category && updates.category !== item.category) {
    await ensureCategoryExists(updates.category);
  }
  if (updates.warehouse !== undefined) {
    await ensureWarehouseExists(updates.warehouse || null);
  }
  if (updates.barcode !== undefined && updates.barcode !== item.barcode) {
    await ensureBarcodeUnique(updates.barcode || null, item._id);
  }

  const allowedFields = [
    'scientificName', 'tradeName', 'tradeNameEn', 'manufacturer', 'originCountry',
    'category', 'barcode', 'registrationNumber', 'dosageForm', 'strength',
    'units', 'supportedUnits', 'defaultSaleUnit', 'reorderLevel', 'warehouse',
    'prescriptionRequired', 'storageConditions', 'notes', 'isActive',
  ];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      if (field === 'barcode' && updates[field] === '') {
        item[field] = undefined;
      } else if (field === 'warehouse' && updates[field] === '') {
        item[field] = null;
      } else {
        item[field] = updates[field];
      }
    }
  }

  await item.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Item',
    resourceId: item._id,
    description: `تعديل صنف: ${item.tradeName}`,
    success: true,
    meta: {
      before,
      after: {
        tradeName: item.tradeName,
        scientificName: item.scientificName,
        category: item.category,
        barcode: item.barcode,
        isActive: item.isActive,
      },
    },
  });

  return res.status(200).json({ success: true, data: buildItemPayload(item) });
});

// ============================================================
// 4) الحذف (Soft Delete)
// ============================================================

export const deleteItem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await Item.findById(id);
  if (!item) throw new AppError('الصنف غير موجود.', 404, 'ITEM_NOT_FOUND');

  if (!item.isActive) {
    return res.status(200).json({
      success: true,
      data: { message: 'الصنف معطّل بالفعل.' },
    });
  }

  const stockCount = await Stock.countDocuments({
    item: item._id,
    quantity: { $gt: 0 },
  });
  if (stockCount > 0) {
    throw new AppError(
      `لا يمكن تعطيل الصنف — يوجد رصيد في ${stockCount} دفعة.`,
      409,
      'ITEM_HAS_STOCK'
    );
  }

  item.isActive = false;
  await item.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.DELETE,
    resource: 'Item',
    resourceId: item._id,
    description: `تعطيل صنف: ${item.tradeName}`,
    success: true,
    meta: {
      before: { tradeName: item.tradeName, isActive: true },
      after: { isActive: false },
    },
  });

  return res.status(200).json({
    success: true,
    data: { message: 'تم تعطيل الصنف.' },
  });
});

export default {
  listItems,
  getItem,
  getItemByBarcode,
  createItem,
  updateItem,
  deleteItem,
};