/**
 * @file userController.js
 * @description
 * منطق إدارة المستخدمين (Admin only).
 *
 * لماذا هذا الملف؟
 * - متطلب: "المستخدمون (مدير، محاسب، مندوب، أمين مخزن، صيدلية) يُنشَؤون
 *   من داخل التطبيق بواسطة الأدمن".
 * - نُوفّر CRUD كاملاً + تفعيل/تعطيل + إعادة تعيين كلمة المرور.
 * - لا نحذف المستخدم فعلياً؛ نُعطّله فقط (isActive=false) للحفاظ على السجل.
 * - كلمة المرور تُولَّد تلقائياً إن لم تُمرَّر، وتُعاد في الاستجابة مرة واحدة.
 * - نمنع الأدمن من تعطيل نفسه أو تغيير دوره (تفادي قفل النظام).
 * - نقرأ قيم الاستعلام من req.validatedQuery (يعبّئها validateMiddleware)
 *   لأن Express 4 يمنع الكتابة على req.query مباشرة.
 */

import { AUDIT_ACTIONS } from '../models/AuditLog.js';
import { Customer } from '../models/Customer.js';
import { Role } from '../models/Role.js';
import { USER_ROLES, User } from '../models/User.js';
import { AppError, asyncHandler } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { sendWelcomeEmail } from '../utils/email.js';
import { generateRandomPassword, hashPassword } from '../utils/password.js';
import { logger } from '../utils/logger.js';

/**
 * بناء استجابة موحّدة للمستخدم (بلا حقول حساسة).
 * @param {import('mongoose').Document} user
 * @returns {Object}
 */
const buildUserPayload = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  role: user.role,
  isActive: user.isActive,
  linkedEntity: user.linkedEntity || { type: null, id: null },
  mustChangePassword: user.mustChangePassword || false,
  lastLoginAt: user.lastLoginAt || null,
  lastLoginIp: user.lastLoginIp || '',
  failedLoginAttempts: user.failedLoginAttempts || 0,
  isLocked: user.isLocked ? user.isLocked() : false,
  notes: user.notes || '',
  createdBy: user.createdBy || null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

/**
 * التحقق من صحة الدور والصلاحيات المرتبطة.
 * @param {string} roleName
 * @returns {Promise<import('mongoose').Document>}
 */
const ensureRoleExists = async (roleName) => {
  const role = await Role.findOne({ name: roleName, isActive: true });
  if (!role) {
    throw new AppError(`الدور "${roleName}" غير موجود أو معطّل.`, 400, 'ROLE_NOT_FOUND');
  }
  return role;
};

/**
 * التحقق من ربط الصيدلية بعميل موجود.
 * @param {Object} linkedEntity
 * @returns {Promise<import('mongoose').Document | null>}
 */
const ensureCustomerExists = async (linkedEntity) => {
  if (!linkedEntity || linkedEntity.type !== 'Customer' || !linkedEntity.id) {
    return null;
  }
  const customer = await Customer.findById(linkedEntity.id);
  if (!customer) {
    throw new AppError('العميل (الصيدلية) المرتبط غير موجود.', 400, 'CUSTOMER_NOT_FOUND');
  }
  return customer;
};

/**
 * GET /api/users
 * قائمة المستخدمين مع تصفية وبحث وصفحات.
 *
 * ملاحظة: نقرأ من req.validatedQuery لأن validateMiddleware يُخزّن
 * القيم المُحلَّلة (coerced) هناك، وليس في req.query (Express 4 للقراءة فقط).
 *
 * @type {import('express').RequestHandler}
 */
export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, search, role, isActive, sortBy, sortOrder } =
    req.validatedQuery || req.query;

  const filter = {};
  if (role) {
    filter.role = role;
  }
  if (typeof isActive === 'boolean') {
    filter.isActive = isActive;
  }
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  const skip = (page - 1) * limit;
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('-password -__v')
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      items: users.map(buildUserPayload),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + users.length < total,
        hasPrev: page > 1,
      },
    },
  });
});

/**
 * GET /api/users/:id
 *
 * @type {import('express').RequestHandler}
 */
export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password -__v');

  if (!user) {
    throw new AppError('المستخدم غير موجود.', 404, 'USER_NOT_FOUND');
  }

  return res.status(200).json({
    success: true,
    data: buildUserPayload(user),
  });
});

/**
 * POST /api/users
 * إنشاء مستخدم جديد.
 *
 * @type {import('express').RequestHandler}
 */
export const createUser = asyncHandler(async (req, res) => {
  const { name, email, phone, role, password, mustChangePassword, linkedEntity, notes } = req.body;

  // التحقق من الدور.
  await ensureRoleExists(role);

  // التحقق من البريد (فريد).
  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError('البريد الإلكتروني مستخدم مسبقاً.', 409, 'EMAIL_TAKEN');
  }

  // التحقق من ربط الصيدلية.
  await ensureCustomerExists(linkedEntity);

  // كلمة المرور: إما من الطلب أو مولّدة.
  const isGenerated = !password;
  const rawPassword = password || generateRandomPassword(12);
  const hashedPassword = await hashPassword(rawPassword);

  const user = await User.create({
    name,
    email,
    phone: phone || '',
    role,
    password: hashedPassword,
    isActive: true,
    mustChangePassword: mustChangePassword ?? isGenerated,
    linkedEntity: linkedEntity
      ? { type: linkedEntity.type || null, id: linkedEntity.id || null }
      : { type: null, id: null },
    notes: notes || '',
    createdBy: req.user._id,
  });

  // إرسال بريد ترحيبي (لا يُعطّل الإنشاء إن فشل).
  try {
    const roleDoc = await Role.findOne({ name: role }).select('label');
    await sendWelcomeEmail({
      to: user.email,
      name: user.name,
      roleLabel: roleDoc?.label || role,
      loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`,
      temporaryPassword: isGenerated ? rawPassword : undefined,
    });
  } catch (error) {
    logger.warn(`فشل إرسال بريد الترحيب: ${error.message}`);
  }

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.CREATE,
    resource: 'User',
    resourceId: user._id,
    description: `إنشاء مستخدم جديد: ${user.email} (${user.role})`,
    success: true,
    meta: {
      after: {
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
    },
  });

  return res.status(201).json({
    success: true,
    data: {
      user: buildUserPayload(user),
      /**
       * نُعيد كلمة المرور المؤقتة مرة واحدة فقط إن وُلّدت.
       */
      generatedPassword: isGenerated ? rawPassword : undefined,
    },
  });
});

/**
 * PATCH /api/users/:id
 * تعديل بيانات مستخدم.
 *
 * @type {import('express').RequestHandler}
 */
export const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const user = await User.findById(id);

  if (!user) {
    throw new AppError('المستخدم غير موجود.', 404, 'USER_NOT_FOUND');
  }

  // نلتقط الحالة قبل التعديل لسجل التدقيق.
  const before = {
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    linkedEntity: user.linkedEntity,
    notes: user.notes,
  };

  // التحقق من الدور الجديد إن وُجد.
  if (updates.role && updates.role !== user.role) {
    await ensureRoleExists(updates.role);
  }

  // التحقق من البريد الجديد إن وُجد.
  if (updates.email && updates.email !== user.email) {
    const existing = await User.findOne({ email: updates.email });
    if (existing) {
      throw new AppError('البريد الإلكتروني مستخدم مسبقاً.', 409, 'EMAIL_TAKEN');
    }
  }

  // التحقق من ربط الصيدلية.
  if (updates.linkedEntity) {
    await ensureCustomerExists(updates.linkedEntity);
  }

  // منع الأدمن من تعطيل نفسه.
  if (updates.isActive === false && String(user._id) === String(req.user._id)) {
    throw new AppError('لا يمكنك تعطيل حسابك الخاص.', 400, 'CANNOT_DISABLE_SELF');
  }

  // منع الأدمن من تغيير دوره الخاص إلى غير admin.
  if (
    updates.role &&
    updates.role !== USER_ROLES.ADMIN &&
    String(user._id) === String(req.user._id)
  ) {
    throw new AppError('لا يمكنك تغيير دورك الخاص.', 400, 'CANNOT_CHANGE_OWN_ROLE');
  }

  // تطبيق التعديلات.
  const allowedFields = ['name', 'email', 'phone', 'role', 'isActive', 'linkedEntity', 'notes'];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      user[field] = updates[field];
    }
  }

  await user.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'User',
    resourceId: user._id,
    description: `تعديل مستخدم: ${user.email}`,
    success: true,
    meta: {
      before,
      after: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        linkedEntity: user.linkedEntity,
        notes: user.notes,
      },
    },
  });

  return res.status(200).json({
    success: true,
    data: buildUserPayload(user),
  });
});

/**
 * DELETE /api/users/:id
 * تعطيل مستخدم (لا نحذف فعلياً للحفاظ على السجل).
 *
 * @type {import('express').RequestHandler}
 */
export const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (String(id) === String(req.user._id)) {
    throw new AppError('لا يمكنك تعطيل حسابك الخاص.', 400, 'CANNOT_DISABLE_SELF');
  }

  const user = await User.findById(id);

  if (!user) {
    throw new AppError('المستخدم غير موجود.', 404, 'USER_NOT_FOUND');
  }

  if (!user.isActive) {
    return res.status(200).json({
      success: true,
      data: { message: 'المستخدم معطّل بالفعل.' },
    });
  }

  user.isActive = false;
  user.invalidateSessions();
  await user.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.DELETE,
    resource: 'User',
    resourceId: user._id,
    description: `تعطيل مستخدم: ${user.email}`,
    success: true,
  });

  return res.status(200).json({
    success: true,
    data: { message: 'تم تعطيل المستخدم.' },
  });
});

/**
 * PATCH /api/users/:id/toggle-active
 * تبديل حالة التفعيل.
 *
 * @type {import('express').RequestHandler}
 */
export const toggleUserActive = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (String(id) === String(req.user._id)) {
    throw new AppError('لا يمكنك تعطيل حسابك الخاص.', 400, 'CANNOT_DISABLE_SELF');
  }

  const user = await User.findById(id);

  if (!user) {
    throw new AppError('المستخدم غير موجود.', 404, 'USER_NOT_FOUND');
  }

  user.isActive = !user.isActive;
  if (!user.isActive) {
    user.invalidateSessions();
  }
  await user.save();

  await logAuditEvent({
    req,
    action: user.isActive ? AUDIT_ACTIONS.ACCOUNT_UNLOCKED : AUDIT_ACTIONS.DELETE,
    resource: 'User',
    resourceId: user._id,
    description: `${user.isActive ? 'تفعيل' : 'تعطيل'} المستخدم: ${user.email}`,
    success: true,
  });

  return res.status(200).json({
    success: true,
    data: buildUserPayload(user),
  });
});

/**
 * POST /api/users/:id/reset-password
 * إعادة تعيين كلمة مرور مستخدم بواسطة الأدمن.
 *
 * @type {import('express').RequestHandler}
 */
export const adminResetPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newPassword, mustChangePassword } = req.body;

  const user = await User.findById(id);

  if (!user) {
    throw new AppError('المستخدم غير موجود.', 404, 'USER_NOT_FOUND');
  }

  const isGenerated = !newPassword;
  const rawPassword = newPassword || generateRandomPassword(12);
  user.password = await hashPassword(rawPassword);
  user.mustChangePassword = mustChangePassword ?? isGenerated;
  user.resetLoginAttempts();
  user.invalidateSessions();
  await user.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.PASSWORD_CHANGE,
    resource: 'User',
    resourceId: user._id,
    description: `إعادة تعيين كلمة مرور المستخدم: ${user.email}`,
    success: true,
  });

  return res.status(200).json({
    success: true,
    data: {
      message: 'تم إعادة تعيين كلمة المرور.',
      generatedPassword: isGenerated ? rawPassword : undefined,
    },
  });
});

export default {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  toggleUserActive,
  adminResetPassword,
};