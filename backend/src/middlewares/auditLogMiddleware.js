/**
 * @file auditLogMiddleware.js
 * @description
 * تسجيل العمليات الحساسة في AuditLog.
 *
 * ✅ v10.2 (2026-11-14):
 * - writeAudit: sanitize before/after/changes — لا session/client.
 * - logAuditEvent: sanitize meta — لا session.
 * - كل المدخلات تُمرَّر عبر JSON.parse(JSON.stringify()) — قبل AuditLog.create.
 */

import { AuditLog, AUDIT_ACTIONS } from '../models/AuditLog.js';
import { logger } from '../utils/logger.js';

/* ─────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

const getClientIp = (req) => {
  if (!req || !req.headers) return '';
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
};

const getUserAgent = (req) => {
  if (!req || !req.headers) return '';
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 500) : '';
};

/**
 * ✅ v10.2 — sanitize كائن — لا session/client/topology.
 * يُعيد كائناً آمناً — أو null إذا فشل.
 */
const sanitize = (obj) => {
  if (obj === null || obj === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (err) {
    logger.warn(`[auditLog] sanitize فشل: ${err.message}`);
    return null;
  }
};

/**
 * ✅ v10.2 — كتابة سجل التدقيق (sanitized — بلا رمي استثناءات).
 */
const writeAudit = async (payload) => {
  try {
    const safePayload = {
      action: payload.action,
      actor: payload.actor || null,
      actorName: payload.actorName || '',
      actorEmail: payload.actorEmail || '',
      actorRole: payload.actorRole || '',
      resource: payload.resource || '',
      resourceId: payload.resourceId || null,
      description: payload.description || '',
      success: Boolean(payload.success),
      errorCode: payload.errorCode || '',
      errorMessage: payload.errorMessage || '',
      before: sanitize(payload.before),
      after: sanitize(payload.after),
      changes: sanitize(payload.changes),
      ip: payload.ip || '',
      userAgent: payload.userAgent || '',
      method: payload.method || '',
      path: payload.path || '',
      occurredAt: payload.occurredAt || new Date(),
    };

    await AuditLog.create(safePayload);
  } catch (error) {
    logger.error(`فشل كتابة سجل التدقيق: ${error.message}`);
  }
};

/* ─────────────────────────────────────────────────────────────
 * 1) auditAction — middleware لتسجيل عملية محددة
 * ───────────────────────────────────────────────────────────── */

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
          description:
            typeof description === 'function'
              ? description(req, res)
              : description,
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

/* ─────────────────────────────────────────────────────────────
 * 2) auditLogin
 * ───────────────────────────────────────────────────────────── */

export const auditLogin = (req, res, next) => {
  res.on('finish', async () => {
    try {
      const success = res.statusCode >= 200 && res.statusCode < 400;

      const actor = req.user || {};
      const email = req.body?.email || '';

      await writeAudit({
        action: success
          ? AUDIT_ACTIONS.LOGIN_SUCCESS
          : AUDIT_ACTIONS.LOGIN_FAILED,
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

/* ─────────────────────────────────────────────────────────────
 * 3) auditLogout
 * ───────────────────────────────────────────────────────────── */

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

/* ─────────────────────────────────────────────────────────────
 * 4) autoAudit — تلقائي حسب method
 * ───────────────────────────────────────────────────────────── */

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

/* ─────────────────────────────────────────────────────────────
 * 5) logAuditEvent — تسجيل يدوي (✅ v10.2: sanitized meta)
 * ───────────────────────────────────────────────────────────── */

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
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
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