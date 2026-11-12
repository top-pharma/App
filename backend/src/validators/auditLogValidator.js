/**
 * @file auditLogValidator.js
 * @description
 * مخططات Zod للتحقق من مدخلات سجل التدقيق (AuditLog).
 *
 * لماذا هذا الملف؟
 * - نمنع تمرير حقول غير مسموحة في الاستعلام (مثل actorRole المباشر).
 * - نتحقق من صحة ObjectId في params.
 * - نحدد القيم المسموحة لـ action و success.
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════
// 1. قواعد مشتركة
// ═══════════════════════════════════════════════

const objectIdSchema = z
  .string({ required_error: 'المُعرّف مطلوب.' })
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'المُعرّف غير صالح.');

const optionalObjectIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'المُعرّف غير صالح.')
  .optional()
  .or(z.literal('').transform(() => undefined));

const optionalDateSchema = z
  .union([z.coerce.date({ invalid_type_error: 'تاريخ غير صالح.' }), z.null()])
  .optional();

// ═══════════════════════════════════════════════
// 2. قائمة سجلات التدقيق — GET /api/audit-logs
// ═══════════════════════════════════════════════

/**
 * معاملات الاستعلام المسموحة.
 *
 * - page/limit: الترقيم.
 * - action: نوع العملية (create/update/delete/login_success/...).
 * - resource: المورد (BankAccount/CashFund/User/...).
 * - resourceId: معرّف المورد.
 * - actor: معرّف المستخدم.
 * - success: true/false/all.
 * - from/to: نطاق زمني (occurredAt).
 * - search: بحث في description/actorName/actorEmail/path.
 * - sortBy: حقل الترتيب.
 * - sortOrder: asc/desc.
 */
export const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),

  // ─── فلاتر أساسية ───
  action: z
    .enum([
      'create',
      'update',
      'delete',
      'login_success',
      'login_failed',
      'logout',
      'password_change',
      'password_reset_request',
      'password_reset_complete',
      'permission_denied',
      'account_locked',
      'account_unlocked',
      'refresh_token',
      'export',
      'backup',
    ])
    .optional(),

  resource: z.string().trim().max(100).optional(),
  resourceId: optionalObjectIdSchema,
  actor: optionalObjectIdSchema,

  success: z.enum(['true', 'false', 'all']).default('all'),

  // ─── نطاق زمني ───
  from: optionalDateSchema,
  to: optionalDateSchema,

  // ─── بحث ───
  search: z.string().trim().max(200).optional(),

  // ─── ترتيب ───
  sortBy: z
    .enum(['occurredAt', 'createdAt', 'action', 'resource', 'success'])
    .default('occurredAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ═══════════════════════════════════════════════
// 3. معرّف سجل واحد — GET /api/audit-logs/:id
// ═══════════════════════════════════════════════

export const auditLogIdParamsSchema = z.object({
  id: objectIdSchema,
});

// ═══════════════════════════════════════════════
// 4. سجلات مورد محدد — GET /api/audit-logs/resource/:resource/:resourceId
// ═══════════════════════════════════════════════

export const resourceAuditLogsParamsSchema = z.object({
  resource: z.string().trim().min(1).max(100),
  resourceId: objectIdSchema,
});

// ═══════════════════════════════════════════════
// 5. تصدير موحّد
// ═══════════════════════════════════════════════

export default {
  listAuditLogsQuerySchema,
  auditLogIdParamsSchema,
  resourceAuditLogsParamsSchema,
};