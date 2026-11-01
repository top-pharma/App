/**
 * @file auditLogMiddleware.js
 * @description
 * تسجيل العمليات الحساسة في AuditLog.
 *
 * لماذا هذا الملف؟
 * - متطلب صريح: "تسجيل كل عملية (إنشاء، تعديل، حذف) + محاولات الفشل".
 * - نُوفّر طريقتين:
 *   1) auditAction(): middleware لتسجيل عملية محددة (يُستخدم قبل route).
 *   2) autoAudit(): يلتقط الاستجابة تلقائياً ويسجّل عند statusCode >= 200.
 * - التسجيل لا يُعطّل الطلب أبداً: أي خطأ في الكتابة يُسجَّل ولا يُمرَّر للأعلى.
 * - نخزّن IP + User-Agent + Method + Path لكل حدث.
 */

import { AuditLog, AUDIT_ACTIONS } from '../models/AuditLog.js';
import { logger } from '../utils/logger.js';

/**
 * استخراج IP الحقيقي للعميل.
 * @param {import('express').Request} req
 * @returns {string}
 */
const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
};

/**
 * استخراج User-Agent.
 * @param {import('express').Request} req
 * @returns {string}
 */
const getUserAgent = (req) => {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 500) : '';
};

/**
 * كتابة سجل التدقيق (بلا رمي استثناءات).
 *
 * @async
 * @param {Object} payload
 * @returns {Promise<void>}
 */
const writeAudit = async (payload) => {
  try {
    await AuditLog.create(payload);
  } catch (error) {
    logger.error(`فشل كتابة سجل التدقيق: ${error.message}`);
  }
};

/**
 * Middleware عام: يسجّل العملية بعد اكتمال الاستجابة تلقائياً.
 *
 * @param {Object} options
 * @param {string} options.action - نوع العملية (AUDIT_ACTIONS).
 * @param {string} options.resource - المورد المتأثر (User, Invoice, ...).
 * @param {string} [options.description] - وصف مختصر.
 * @param {(req: import('express').Request, res: import('express').Response) => string} [options.resourceIdGetter]
 * @param {(req: import('express').Request, res: import('express').Response) => Object} [options.beforeGetter]
 * @param {(req: import('express').Request, res: import('express').Response) => Object} [options.afterGetter]
 * @param {(req: import('express').Request, res: import('express').Response) => Object} [options.changesGetter]
 * @returns {import('express').RequestHandler}
 */
export const auditAction = (options) => {
  const {
    action,
    resource,
    description = '',
    resourceIdGetter = null,
    beforeGetter = null,
    afterGetter = null,
    changesGetter = null,
  } = options || {};

  return (req, res, next) => {
    const start = Date.now();

    // نلتقط الاستجابة عند الانتهاء.
    res.on('finish', async () => {
      try {
        const success = res.statusCode >= 200 && res.statusCode < 400;

        const resourceId = resourceIdGetter
          ? resourceIdGetter(req, res)
          : req.params?.id || null;

        const before = beforeGetter ? beforeGetter(req, res) : null;
        const after = afterGetter ? afterGetter(req, res) : null;
        const changes = changesGetter ? changesGetter(req, res) : null;

        const actor = req.user || {};

        await writeAudit({
          action,
          actor: actor._id || null,
          actorName: actor.name || '',
          actorEmail: actor.email || '',
          actorRole: actor.role || '',
          resource: resource || '',
          resourceId: resourceId || null,
          description: typeof description === 'function' ? description(req, res) : description,
          before,
          after,
          changes,
          success,
          ip: getClientIp(req),
          userAgent: getUserAgent(req),
          method: req.method,
          path: req.originalUrl,
          occurredAt: new Date(),
        });

        logger.debug(
          `[Audit] ${action} ${resource || ''} → ${res.statusCode} (${Date.now() - start}ms)`
        );
      } catch (error) {
        logger.error(`فشل في auditAction: ${error.message}`);
      }
    });

    next();
  };
};

/**
 * Middleware: يسجّل محاولات الدخول الناجحة والفاشلة.
 * نستخدمه في authRoutes للـ /login.
 *
 * @type {import('express').RequestHandler}
 */
export const auditLogin = (req, res, next) => {
  res.on('finish', async () => {
    try {
      const success = res.statusCode >= 200 && res.statusCode < 400;

      const actor = req.user || {};
      const email = req.body?.email || '';

      await writeAudit({
        action: success ? AUDIT_ACTIONS.LOGIN_SUCCESS : AUDIT_ACTIONS.LOGIN_FAILED,
        actor: actor._id || null,
        actorName: actor.name || '',
        actorEmail: actor.email || email,
        actorRole: actor.role || '',
        resource: 'User',
        resourceId: actor._id || null,
        description: success
          ? `تسجيل دخول ناجح: ${email}`
          : `محاولة دخول فاشلة: ${email}`,
        success,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        method: req.method,
        path: req.originalUrl,
        occurredAt: new Date(),
      });
    } catch (error) {
      logger.error(`فشل في auditLogin: ${error.message}`);
    }
  });

  next();
};

/**
 * Middleware: يسجّل تسجيل الخروج.
 * @type {import('express').RequestHandler}
 */
export const auditLogout = (req, res, next) => {
  res.on('finish', async () => {
    try {
      const actor = req.user || {};
      await writeAudit({
        action: AUDIT_ACTIONS.LOGOUT,
        actor: actor._id || null,
        actorName: actor.name || '',
        actorEmail: actor.email || '',
        actorRole: actor.role || '',
        resource: 'User',
        resourceId: actor._id || null,
        description: `تسجيل خروج: ${actor.email || ''}`,
        success: true,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        method: req.method,
        path: req.originalUrl,
        occurredAt: new Date(),
      });
    } catch (error) {
      logger.error(`فشل في auditLogout: ${error.message}`);
    }
  });

  next();
};

/**
 * Middleware: يسجّل أي عملية إنشاء/تحديث/حذف تلقائياً بناءً على method.
 * لا يحتاج وصفاً دقيقاً، مفيد لمسارات CRUD العامة.
 *
 * @param {string} resource
 * @returns {import('express').RequestHandler}
 */
export const autoAudit = (resource) => (req, res, next) => {
  const methodToAction = {
    POST: AUDIT_ACTIONS.CREATE,
    PATCH: AUDIT_ACTIONS.UPDATE,
    PUT: AUDIT_ACTIONS.UPDATE,
    DELETE: AUDIT_ACTIONS.DELETE,
  };

  const action = methodToAction[req.method];
  if (!action) {
    return next();
  }

  res.on('finish', async () => {
    try {
      const success = res.statusCode >= 200 && res.statusCode < 400;
      const actor = req.user || {};

      await writeAudit({
        action,
        actor: actor._id || null,
        actorName: actor.name || '',
        actorEmail: actor.email || '',
        actorRole: actor.role || '',
        resource,
        resourceId: req.params?.id || null,
        description: `${action} ${resource}`,
        success,
        errorCode: success ? '' : String(res.statusCode),
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        method: req.method,
        path: req.originalUrl,
        occurredAt: new Date(),
      });
    } catch (error) {
      logger.error(`فشل في autoAudit: ${error.message}`);
    }
  });

  next();
};

/**
 * دالة مساعدة لتسجيل حدث يدوياً من داخل controller.
 * مفيدة عندما نريد تسجيل حدث لا يمر عبر middleware (مثل حدث داخلي).
 *
 * @async
 * @param {Object} params
 * @param {import('express').Request} [params.req]
 * @param {string} params.action
 * @param {string} [params.resource]
 * @param {string|import('mongoose').Types.ObjectId} [params.resourceId]
 * @param {string} [params.description]
 * @param {boolean} [params.success]
 * @param {Object} [params.meta]
 * @returns {Promise<void>}
 */
export const logAuditEvent = async ({
  req,
  action,
  resource = '',
  resourceId = null,
  description = '',
  success = true,
  meta = null,
}) => {
  const actor = req?.user || {};
  await writeAudit({
    action,
    actor: actor._id || null,
    actorName: actor.name || '',
    actorEmail: actor.email || '',
    actorRole: actor.role || '',
    resource,
    resourceId,
    description,
    success,
    before: meta?.before || null,
    after: meta?.after || null,
    changes: meta?.changes || null,
    errorCode: meta?.errorCode || '',
    errorMessage: meta?.errorMessage || '',
    ip: req ? getClientIp(req) : '',
    userAgent: req ? getUserAgent(req) : '',
    method: req?.method || '',
    path: req?.originalUrl || '',
    occurredAt: new Date(),
  });
};

export default {
  auditAction,
  auditLogin,
  auditLogout,
  autoAudit,
  logAuditEvent,
};