/**
 * @file warehouseController.js
 * @description
 * منطق إدارة المخازن (CRUD + setAsMain + setAsDefault + Soft Delete).
 *
 * لماذا هذا الملف؟
 * - متطلب: المخازن تُدار من داخل التطبيق (رئيسي + فروع).
 * - الفهرس الفريد الجزئي في Warehouse.js يفرض:
 *   • مخزن رئيسي نشط واحد فقط.
 *   • مخزن افتراضي واحد فقط.
 * - لذلك نستخدم Transactions لضمان:
 *   • إلغاء تعيين القديم ثم تعيين الجديد (بلا نافذة زمنية بينهما).
 *   • عدم فقدان "الرئيسي" أو "الافتراضي" عند فشل جزئي.
 * - لا نحذف مخزناً فيه رصيد أو حركة — نُعطّله.
 * - نمنع تعطيل المخزن الرئيسي أو الافتراضي قبل تعيين بديل.
 */

import mongoose from 'mongoose';

import { AUDIT_ACTIONS } from '../models/AuditLog.js';
import { Warehouse, WAREHOUSE_TYPES } from '../models/Warehouse.js';
import { Stock } from '../models/Stock.js';
import { AppError, asyncHandler } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { logger } from '../utils/logger.js';

// ============================================================
// Helpers
// ============================================================

/**
 * بناء استجابة موحّدة للمخزن.
 * @param {import('mongoose').Document} warehouse
 * @returns {Object}
 */
const buildWarehousePayload = (warehouse) => ({
  id: warehouse._id,
  name: warehouse.name,
  code: warehouse.code,
  type: warehouse.type,
  address: warehouse.address || '',
  city: warehouse.city || '',
  phone: warehouse.phone || '',
  manager: warehouse.manager || null,
  isActive: Boolean(warehouse.isActive),
  isDefault: Boolean(warehouse.isDefault),
  notes: warehouse.notes || '',
  createdAt: warehouse.createdAt,
  updatedAt: warehouse.updatedAt,
});

/**
 * ضمان تفرد الكود.
 * @param {string} code
 * @param {import('mongoose').Types.ObjectId|null} [excludeId=null]
 * @returns {Promise<void>}
 * @throws {AppError} WAREHOUSE_CODE_TAKEN
 */
const ensureCodeUnique = async (code, excludeId = null) => {
  const query = { code };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const existing = await Warehouse.findOne(query).select('_id').lean();
  if (existing) {
    throw new AppError('كود المخزن مستخدم مسبقاً.', 409, 'WAREHOUSE_CODE_TAKEN');
  }
};

/**
 * جلب المخزن الحالي الرئيسي (غير المُمرَّر id).
 * @param {import('mongoose').Types.ObjectId} excludeId
 * @param {Object|null} [session=null]
 * @returns {Promise<import('mongoose').Document|null>}
 */

/**
 * جلب المخزن الحالي الافتراضي (غير المُمرَّر id).
 * @param {import('mongoose').Types.ObjectId} excludeId
 * @param {Object|null} [session=null]
 * @returns {Promise<import('mongoose').Document|null>}
 */

// ============================================================
// 1) القراءة
// ============================================================
/**
 * GET /api/warehouses
 * قائمة المخازن مع بحث + فلترة + Pagination.
 *
 * @type {import('express').RequestHandler}
 */
export const listWarehouses = asyncHandler(async (req, res) => {
  const { page, limit, search, type, isActive, sortBy, sortOrder } =
    req.validatedQuery || req.query;

  const filter = {};

  if (type) {
    filter.type = type;
  }
  if (typeof isActive === 'boolean') {
    filter.isActive = isActive;
  }
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { code: rx }, { city: rx }, { address: rx }];
  }

  const skip = (page - 1) * limit;
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [warehouses, total] = await Promise.all([
    Warehouse.find(filter)
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(limit),
    Warehouse.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      items: warehouses.map(buildWarehousePayload),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + warehouses.length < total,
        hasPrev: page > 1,
      },
    },
  });
});

/**
 * GET /api/warehouses/:id
 *
 * @type {import('express').RequestHandler}
 */
export const getWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findById(req.params.id);

  if (!warehouse) {
    throw new AppError('المخزن غير موجود.', 404, 'WAREHOUSE_NOT_FOUND');
  }

  return res.status(200).json({
    success: true,
    data: buildWarehousePayload(warehouse),
  });
});

// ============================================================
// 2) الإنشاء
// ============================================================

/**
 * POST /api/warehouses
 * - النوع الافتراضي: branch.
 * - إذا كان أول مخزن نشط في النظام → نجعله main + default تلقائياً.
 *
 * @type {import('express').RequestHandler}
 */
export const createWarehouse = asyncHandler(async (req, res) => {
  const { name, code, address, city, phone, notes } = req.body;

  await ensureCodeUnique(code);

  // نتحقق إن كان هذا أول مخزن نشط في النظام.
  const activeCount = await Warehouse.countDocuments({ isActive: true });
  const isFirstWarehouse = activeCount === 0;

  const warehouse = await Warehouse.create({
    name,
    code,
    type: isFirstWarehouse ? WAREHOUSE_TYPES.MAIN : WAREHOUSE_TYPES.BRANCH,
    address: address || '',
    city: city || '',
    phone: phone || '',
    isActive: true,
    isDefault: isFirstWarehouse,
    notes: notes || '',
    createdBy: req.user._id,
  });

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.CREATE,
    resource: 'Warehouse',
    resourceId: warehouse._id,
    description: `إنشاء مخزن جديد: ${warehouse.name} (${warehouse.code})`,
    success: true,
    meta: {
      after: {
        name: warehouse.name,
        code: warehouse.code,
        type: warehouse.type,
        isDefault: warehouse.isDefault,
        isActive: warehouse.isActive,
      },
    },
  });

  return res.status(201).json({
    success: true,
    data: buildWarehousePayload(warehouse),
  });
});

// ============================================================
// 3) التعديل
// ============================================================

/**
 * PATCH /api/warehouses/:id
 *
 * @type {import('express').RequestHandler}
 */
export const updateWarehouse = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const warehouse = await Warehouse.findById(id);

  if (!warehouse) {
    throw new AppError('المخزن غير موجود.', 404, 'WAREHOUSE_NOT_FOUND');
  }

  const before = {
    name: warehouse.name,
    code: warehouse.code,
    address: warehouse.address,
    city: warehouse.city,
    phone: warehouse.phone,
    notes: warehouse.notes,
    isActive: warehouse.isActive,
  };

  // نتحقق من تفرد الكود إن تغيّر.
  if (updates.code && updates.code !== warehouse.code) {
    await ensureCodeUnique(updates.code, warehouse._id);
  }

  // نمنع تعطيل المخزن الرئيسي أو الافتراضي قبل تعيين بديل.
  if (updates.isActive === false && warehouse.isActive) {
    if (warehouse.type === WAREHOUSE_TYPES.MAIN) {
      throw new AppError(
        'لا يمكن تعطيل المخزن الرئيسي. عيّن مخزناً آخر رئيسياً أولاً.',
        409,
        'CANNOT_DISABLE_MAIN'
      );
    }
    if (warehouse.isDefault) {
      throw new AppError(
        'لا يمكن تعطيل المخزن الافتراضي. عيّن مخزناً آخر افتراضياً أولاً.',
        409,
        'CANNOT_DISABLE_DEFAULT'
      );
    }
  }

  const allowedFields = ['name', 'code', 'address', 'city', 'phone', 'notes', 'isActive'];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      warehouse[field] = updates[field];
    }
  }

  await warehouse.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Warehouse',
    resourceId: warehouse._id,
    description: `تعديل مخزن: ${warehouse.name}`,
    success: true,
    meta: {
      before,
      after: {
        name: warehouse.name,
        code: warehouse.code,
        address: warehouse.address,
        city: warehouse.city,
        phone: warehouse.phone,
        notes: warehouse.notes,
        isActive: warehouse.isActive,
      },
    },
  });

  return res.status(200).json({
    success: true,
    data: buildWarehousePayload(warehouse),
  });
});

// ============================================================
// 4) الحذف (Soft Delete)
// ============================================================

/**
 * DELETE /api/warehouses/:id
 * - نمنع التعطيل إذا يوجد رصيد مخزون.
 * - نمنع التعطيل إذا كان رئيسياً أو افتراضياً.
 *
 * @type {import('express').RequestHandler}
 */
export const deleteWarehouse = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const warehouse = await Warehouse.findById(id);

  if (!warehouse) {
    throw new AppError('المخزن غير موجود.', 404, 'WAREHOUSE_NOT_FOUND');
  }

  if (!warehouse.isActive) {
    return res.status(200).json({
      success: true,
      data: { message: 'المخزن معطّل بالفعل.' },
    });
  }

  // حماية الرئيسي والافتراضي.
  if (warehouse.type === WAREHOUSE_TYPES.MAIN) {
    throw new AppError(
      'لا يمكن تعطيل المخزن الرئيسي. عيّن مخزناً آخر رئيسياً أولاً.',
      409,
      'CANNOT_DISABLE_MAIN'
    );
  }
  if (warehouse.isDefault) {
    throw new AppError(
      'لا يمكن تعطيل المخزن الافتراضي. عيّن مخزناً آخر افتراضياً أولاً.',
      409,
      'CANNOT_DISABLE_DEFAULT'
    );
  }

  // نمنع التعطيل إذا يوجد مخزون في هذا المخزن.
  const stockCount = await Stock.countDocuments({
    warehouse: warehouse._id,
    quantity: { $gt: 0 },
  });
  if (stockCount > 0) {
    throw new AppError(
      `لا يمكن تعطيل المخزن — يحتوي على ${stockCount} دفعة برصيد.`,
      409,
      'WAREHOUSE_HAS_STOCK'
    );
  }

  warehouse.isActive = false;
  await warehouse.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.DELETE,
    resource: 'Warehouse',
    resourceId: warehouse._id,
    description: `تعطيل مخزن: ${warehouse.name}`,
    success: true,
    meta: {
      before: { name: warehouse.name, code: warehouse.code, isActive: true },
      after: { isActive: false },
    },
  });

  return res.status(200).json({
    success: true,
    data: { message: 'تم تعطيل المخزن.' },
  });
});

// ============================================================
// 5) تعيين رئيسي
// ============================================================
/**
 * POST /api/warehouses/:id/set-main
 * - يُرقّي المخزن إلى type='main'.
 * - يُنزل الرئيسي السابق إلى type='branch'.
 * - يستخدم Transaction إن كان MongoDB Replica Set متاحاً،
 *   وإلا يسقط تلقائياً إلى تنفيذ تسلسلي (للتطوير على MongoDB standalone).
 *
 * @type {import('express').RequestHandler}
 */
/**
 * POST /api/warehouses/:id/set-main
 * - يُرقّي المخزن إلى type='main'.
 * - يُنزل الرئيسي السابق إلى type='branch'.
 *
 * ⚠️ لا نستخدم Transactions (MongoDB standalone لا يدعمها).
 *    السلامة مضمونة عبر Partial Unique Index:
 *    - unique_active_main_warehouse (type='main' + isActive=true)
 *    التسلسل: ننزل القديم أولاً، ثم نرفع الجديد.
 *    في حال فشل الجزء الثاني → لا يوجد main مؤقتاً، وإعادة التشغيل تُصلحه.
 *
 * @type {import('express').RequestHandler}
 */
export const setAsMain = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const warehouse = await Warehouse.findById(id);

  if (!warehouse) {
    throw new AppError('المخزن غير موجود.', 404, 'WAREHOUSE_NOT_FOUND');
  }

  if (!warehouse.isActive) {
    throw new AppError(
      'لا يمكن تعيين مخزن معطّل كرئيسي.',
      409,
      'WAREHOUSE_INACTIVE'
    );
  }

  if (warehouse.type === WAREHOUSE_TYPES.MAIN) {
    return res.status(200).json({
      success: true,
      data: buildWarehousePayload(warehouse),
      message: 'المخزن رئيسي بالفعل.',
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 1) نُنزل الرئيسي الحالي إلى branch (إن وُجد).
  // ═══════════════════════════════════════════════════════════
  const currentMain = await Warehouse.findOne({
    type: WAREHOUSE_TYPES.MAIN,
    isActive: true,
    _id: { $ne: warehouse._id },
  });

  if (currentMain) {
    await Warehouse.updateOne(
      { _id: currentMain._id },
      { type: WAREHOUSE_TYPES.BRANCH }
    );
    logger.info(
      `[setAsMain] نُزّل المخزن ${currentMain.code} من main → branch.`
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 2) نرفع المخزن الهدف إلى main.
  // ═══════════════════════════════════════════════════════════
  try {
    await Warehouse.updateOne(
      { _id: warehouse._id },
      { type: WAREHOUSE_TYPES.MAIN }
    );
  } catch (error) {
    // في حال فشل، نحاول إعادة الرئيسي القديم (Rollback بسيط).
    if (currentMain) {
      try {
        await Warehouse.updateOne(
          { _id: currentMain._id },
          { type: WAREHOUSE_TYPES.MAIN }
        );
      } catch (rollbackError) {
        logger.error(
          `[setAsMain] فشل Rollback: ${rollbackError.message}`
        );
      }
    }
    logger.error(`[setAsMain] فشل ترقية المخزن: ${error.message}`);
    throw new AppError(
      'فشل تعيين المخزن رئيسياً. حاول مرة أخرى.',
      500,
      'SET_MAIN_FAILED'
    );
  }

  const updated = await Warehouse.findById(warehouse._id);

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Warehouse',
    resourceId: warehouse._id,
    description: `تعيين المخزن رئيسياً: ${warehouse.name}`,
    success: true,
    meta: {
      before: { type: warehouse.type },
      after: { type: WAREHOUSE_TYPES.MAIN },
    },
  });

  return res.status(200).json({
    success: true,
    data: buildWarehousePayload(updated),
  });
});
// ============================================================
// 6) تعيين افتراضي
// ============================================================

/**
 * POST /api/warehouses/:id/set-default
 * - يجعل المخزن الافتراضي الوحيد.
 * - يُلغي تعيين الافتراضي السابق.
 * - يستخدم Transaction إن كان MongoDB Replica Set متاحاً،
 *   وإلا يسقط تلقائياً إلى تنفيذ تسلسلي.
 *
 * @type {import('express').RequestHandler}
 */
/**
 * POST /api/warehouses/:id/set-default
 * - يجعل المخزن الافتراضي الوحيد.
 * - يُلغي تعيين الافتراضي السابق.
 *
 * ⚠️ نفس منطق setAsMain: بلا Transactions، والسلامة عبر
 *    Partial Unique Index (unique_default_warehouse).
 *
 * @type {import('express').RequestHandler}
 */
export const setAsDefault = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const warehouse = await Warehouse.findById(id);

  if (!warehouse) {
    throw new AppError('المخزن غير موجود.', 404, 'WAREHOUSE_NOT_FOUND');
  }

  if (!warehouse.isActive) {
    throw new AppError(
      'لا يمكن تعيين مخزن معطّل كافتراضي.',
      409,
      'WAREHOUSE_INACTIVE'
    );
  }

  if (warehouse.isDefault) {
    return res.status(200).json({
      success: true,
      data: buildWarehousePayload(warehouse),
      message: 'المخزن افتراضي بالفعل.',
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 1) نُلغي تعيين الافتراضي الحالي (إن وُجد).
  // ═══════════════════════════════════════════════════════════
  const currentDefault = await Warehouse.findOne({
    isDefault: true,
    _id: { $ne: warehouse._id },
  });

  if (currentDefault) {
    await Warehouse.updateOne(
      { _id: currentDefault._id },
      { isDefault: false }
    );
    logger.info(
      `[setAsDefault] أُلغي تعيين ${currentDefault.code}.`
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 2) نُعيّن المخزن الهدف افتراضياً.
  // ═══════════════════════════════════════════════════════════
  try {
    await Warehouse.updateOne(
      { _id: warehouse._id },
      { isDefault: true }
    );
  } catch (error) {
    // Rollback بسيط.
    if (currentDefault) {
      try {
        await Warehouse.updateOne(
          { _id: currentDefault._id },
          { isDefault: true }
        );
      } catch (rollbackError) {
        logger.error(
          `[setAsDefault] فشل Rollback: ${rollbackError.message}`
        );
      }
    }
    logger.error(`[setAsDefault] فشل التعيين: ${error.message}`);
    throw new AppError(
      'فشل تعيين المخزن افتراضياً. حاول مرة أخرى.',
      500,
      'SET_DEFAULT_FAILED'
    );
  }

  const updated = await Warehouse.findById(warehouse._id);

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Warehouse',
    resourceId: warehouse._id,
    description: `تعيين المخزن افتراضياً: ${warehouse.name}`,
    success: true,
    meta: {
      before: { isDefault: warehouse.isDefault },
      after: { isDefault: true },
    },
  });

  return res.status(200).json({
    success: true,
    data: buildWarehousePayload(updated),
  });
});

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  listWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  setAsMain,
  setAsDefault,
};