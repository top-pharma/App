/**
 * @file categoryController.js
 * @description
 * منطق إدارة التصنيفات (CRUD + Soft Delete).
 *
 * لماذا هذا الملف؟
 * - متطلب: تصنيفات الأصناف تُدار من داخل التطبيق (أدوية، مستحضرات، ...).
 * - التصنيفات النظامية (isSystem=true) محميّة من الحذف عبر SYSTEM_CATEGORIES.
 * - لا نحذف تصنيفاً فعلياً — نُعطّله (isActive=false) للحفاظ على السجل التاريخي.
 * - نمنع تعطيل تصنيف مرتبط بأصناف نشطة (لتفادي أيتام البيانات).
 * - نقرأ من req.validatedQuery (Express 4 يمنع الكتابة على req.query).
 * - نستخرج الحدود النظامية للنظام عبر ensureSystemCategories() (تُستدعى من seed).
 */

import { AUDIT_ACTIONS } from '../models/AuditLog.js';
import { Category, SYSTEM_CATEGORIES } from '../models/Category.js';
import { Item } from '../models/Item.js';
import { AppError, asyncHandler } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';

// ============================================================
// Helpers
// ============================================================

/**
 * بناء استجابة موحّدة للتصنيف (بلا حقول Mongo الداخلية).
 *
 * @param {import('mongoose').Document} category
 * @returns {Object}
 */
const buildCategoryPayload = (category) => ({
  id: category._id,
  name: category.name,
  label: category.label,
  description: category.description || '',
  icon: category.icon || '',
  order: category.order || 0,
  isSystem: Boolean(category.isSystem),
  isActive: Boolean(category.isActive),
  createdAt: category.createdAt,
  updatedAt: category.updatedAt,
});

/**
 * ضمان تفرد الاسم (name) قبل الحفظ.
 * نستخدم هذا التحقق لأجل رسالة عربية واضحة، رغم أن Mongoose يُطبّق
 * unique index تلقائياً.
 *
 * @param {string} name
 * @param {import('mongoose').Types.ObjectId|null} [excludeId=null]
 * @returns {Promise<void>}
 * @throws {AppError} CATEGORY_NAME_TAKEN
 */
const ensureNameUnique = async (name, excludeId = null) => {
  const query = { name };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const existing = await Category.findOne(query).select('_id').lean();
  if (existing) {
    throw new AppError('اسم التصنيف مستخدم مسبقاً.', 409, 'CATEGORY_NAME_TAKEN');
  }
};

/**
 * عدّ الأصناف المرتبطة بتصنيف.
 *
 * @param {import('mongoose').Types.ObjectId} categoryName
 * @returns {Promise<number>}
 */
const countItemsInCategory = async (categoryName) =>
  Item.countDocuments({ category: categoryName });

// ============================================================
// Seed Support
// ============================================================

/**
 * ضمان وجود التصنيفات النظامية الخمسة (Idempotent).
 * - تُستدعى من seed.js عند التهيئة.
 * - تُنشئ الناقص فقط (بلا مسح الموجود).
 * - تُحدّث التسمية العربية إن تغيّرت، لكن تحترم تعديلات الأدمن على الأيقونة/الترتيب.
 *
 * @returns {Promise<number>} عدد التصنيفات النظامية المُؤكَّدة.
 */
export const ensureSystemCategories = async () => {
  const ops = SYSTEM_CATEGORIES.map((cat, idx) =>
    Category.updateOne(
      { name: cat.name },
      {
        $setOnInsert: {
          name: cat.name,
          isSystem: true,
          isActive: true,
        },
        $set: {
          // نُحدّث التسمية والوصف فقط (نحترم تعديلات الأدمن على order/icon إن وُجدت).
          label: cat.label,
          description: cat.description,
        },
      },
      { upsert: true }
    )
  );
  const results = await Promise.all(ops);
  return results.length;
};

// ============================================================
// 1) القراءة (Read)
// ============================================================

/**
 * GET /api/categories
 * قائمة التصنيفات مع بحث + فلترة + Pagination.
 *
 * @type {import('express').RequestHandler}
 */
export const listCategories = asyncHandler(async (req, res) => {
  const { page, limit, search, isActive, sortBy, sortOrder } =
    req.validatedQuery || req.query;

  const filter = {};

  if (typeof isActive === 'boolean') {
    filter.isActive = isActive;
  }

  if (search) {
    // نهرب من رموز RegExp الخاصة لتفادي أخطاء الاستعلام.
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { label: rx }, { description: rx }];
  }

  const skip = (page - 1) * limit;
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [categories, total] = await Promise.all([
    Category.find(filter)
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(limit),
    Category.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      items: categories.map(buildCategoryPayload),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + categories.length < total,
        hasPrev: page > 1,
      },
    },
  });
});

/**
 * GET /api/categories/:id
 *
 * @type {import('express').RequestHandler}
 */
export const getCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    throw new AppError('التصنيف غير موجود.', 404, 'CATEGORY_NOT_FOUND');
  }

  return res.status(200).json({
    success: true,
    data: buildCategoryPayload(category),
  });
});

// ============================================================
// 2) الإنشاء (Create)
// ============================================================

/**
 * POST /api/categories
 * - isSystem يُحدَّد داخلياً فقط (لا يقبله الـ validator).
 *
 * @type {import('express').RequestHandler}
 */
export const createCategory = asyncHandler(async (req, res) => {
  const { name, label, description, icon, order } = req.body;

  // تحقق استباقي لرسالة عربية واضحة.
  await ensureNameUnique(name);

  const category = await Category.create({
    name,
    label,
    description: description || '',
    icon: icon || '',
    order: order ?? 0,
    isSystem: false,
    isActive: true,
  });

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.CREATE,
    resource: 'Category',
    resourceId: category._id,
    description: `إنشاء تصنيف جديد: ${category.label} (${category.name})`,
    success: true,
    meta: {
      after: {
        name: category.name,
        label: category.label,
        isSystem: category.isSystem,
        isActive: category.isActive,
      },
    },
  });

  return res.status(201).json({
    success: true,
    data: buildCategoryPayload(category),
  });
});

// ============================================================
// 3) التعديل (Update)
// ============================================================

/**
 * PATCH /api/categories/:id
 * - isSystem غير قابل للتعديل.
 * - تغيير name يتطلب التحقق من التفرد.
 *
 * @type {import('express').RequestHandler}
 */
export const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const category = await Category.findById(id);

  if (!category) {
    throw new AppError('التصنيف غير موجود.', 404, 'CATEGORY_NOT_FOUND');
  }

  // نلتقط الحالة قبل التعديل لسجل التدقيق.
  const before = {
    name: category.name,
    label: category.label,
    description: category.description,
    icon: category.icon,
    order: category.order,
    isActive: category.isActive,
  };

  // إن تغيّر الاسم → نتحقق من التفرد.
  if (updates.name && updates.name !== category.name) {
    await ensureNameUnique(updates.name, category._id);
  }

  // الحقول المسموح تعديلها (isSystem مستثنى دائماً).
  const allowedFields = ['name', 'label', 'description', 'icon', 'order', 'isActive'];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      category[field] = updates[field];
    }
  }

  await category.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Category',
    resourceId: category._id,
    description: `تعديل تصنيف: ${category.label}`,
    success: true,
    meta: {
      before,
      after: {
        name: category.name,
        label: category.label,
        description: category.description,
        icon: category.icon,
        order: category.order,
        isActive: category.isActive,
      },
    },
  });

  return res.status(200).json({
    success: true,
    data: buildCategoryPayload(category),
  });
});

// ============================================================
// 4) الحذف (Soft Delete)
// ============================================================

/**
 * DELETE /api/categories/:id
 * - لا نحذف فعلياً — نُعطّل (isActive=false).
 * - نمنع تعطيل التصنيفات النظامية (isSystem=true).
 * - نمنع تعطيل تصنيف مرتبط بأصناف نشطة (لتفادي أيتام البيانات).
 *
 * @type {import('express').RequestHandler}
 */
export const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const category = await Category.findById(id);

  if (!category) {
    throw new AppError('التصنيف غير موجود.', 404, 'CATEGORY_NOT_FOUND');
  }

  // حماية التصنيفات النظامية.
  if (category.isSystem) {
    throw new AppError(
      'لا يمكن حذف تصنيف نظامي. يمكن تعطيله لاحقاً عند الحاجة.',
      403,
      'SYSTEM_CATEGORY_PROTECTED'
    );
  }

  // التحقق من عدم وجود أصناف نشطة مرتبطة.
  const linkedItems = await countItemsInCategory(category.name);
  if (linkedItems > 0) {
    throw new AppError(
      `لا يمكن حذف التصنيف — مرتبط بـ ${linkedItems} صنف.`,
      409,
      'CATEGORY_IN_USE'
    );
  }

  // تعطيل (Soft Delete).
  if (!category.isActive) {
    return res.status(200).json({
      success: true,
      data: { message: 'التصنيف معطّل بالفعل.' },
    });
  }

  category.isActive = false;
  await category.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.DELETE,
    resource: 'Category',
    resourceId: category._id,
    description: `تعطيل تصنيف: ${category.label}`,
    success: true,
    meta: {
      before: {
        name: category.name,
        label: category.label,
        isActive: true,
      },
      after: { isActive: false },
    },
  });

  return res.status(200).json({
    success: true,
    data: { message: 'تم تعطيل التصنيف.' },
  });
});

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  ensureSystemCategories,
};