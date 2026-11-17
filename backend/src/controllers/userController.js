/**
 * @file userController.js
 * @description
 * منطق إدارة المستخدمين (Admin only).
 *
 * ✅ v10.13 (2026-11-17):
 * - ensureRoleExists: name → code + حذف isActive.
 *   (السابق: Role.findOne({ name: roleName, isActive: true })
 *    لكن Role.name = 'مندوب' و Role.code = 'sales_rep'
 *    و Role لا يحتوي isActive → null → ROLE_NOT_FOUND)
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
 * ✅ v10.13: التحقق من صحة الدور — code (وليس name) — بدون isActive.
 */
const ensureRoleExists = async (roleCode) => {
  const role = await Role.findOne({ code: roleCode });
  if (!role) {
    throw new AppError(`الدور "${roleCode}" غير موجود.`, 400, 'ROLE_NOT_FOUND');
  }
  return role;
};

/**
 * التحقق من ربط الصيدلية بعميل موجود.
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
 */
export const createUser = asyncHandler(async (req, res) => {
  const { name, email, phone, role, password, mustChangePassword, linkedEntity, notes } = req.body;

  // ✅ v10.13: ensureRoleExists(role) — code
  await ensureRoleExists(role);

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError('البريد الإلكتروني مستخدم مسبقاً.', 409, 'EMAIL_TAKEN');
  }

  await ensureCustomerExists(linkedEntity);

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
    const roleDoc = await Role.findOne({ code: role }).select('name');
    await sendWelcomeEmail({
      to: user.email,
      name: user.name,
      roleLabel: roleDoc?.name || role,
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
      generatedPassword: isGenerated ? rawPassword : undefined,
    },
  });
});

/**
 * PATCH /api/users/:id
 */
export const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const user = await User.findById(id);

  if (!user) {
    throw new AppError('المستخدم غير موجود.', 404, 'USER_NOT_FOUND');
  }

  const before = {
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    linkedEntity: user.linkedEntity,
    notes: user.notes,
  };

  // ✅ v10.13: ensureRoleExists(updates.role) — code
  if (updates.role && updates.role !== user.role) {
    await ensureRoleExists(updates.role);
  }

  if (updates.email && updates.email !== user.email) {
    const existing = await User.findOne({ email: updates.email });
    if (existing) {
      throw new AppError('البريد الإلكتروني مستخدم مسبقاً.', 409, 'EMAIL_TAKEN');
    }
  }

  if (updates.linkedEntity) {
    await ensureCustomerExists(updates.linkedEntity);
  }

  if (updates.isActive === false && String(user._id) === String(req.user._id)) {
    throw new AppError('لا يمكنك تعطيل حسابك الخاص.', 400, 'CANNOT_DISABLE_SELF');
  }

  if (
    updates.role &&
    updates.role !== USER_ROLES.ADMIN &&
    String(user._id) === String(req.user._id)
  ) {
    throw new AppError('لا يمكنك تغيير دورك الخاص.', 400, 'CANNOT_CHANGE_OWN_ROLE');
  }

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