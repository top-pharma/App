/**
 * @file backupController.js
 * @description Controllers للنسخ الاحتياطي والاستعادة + عرض النسخ + تنزيل.
 *
 * ✅ v10.0 (2026-11-12):
 * - restoreBackup: pre-restore backup تلقائي قبل الاستعادة.
 * - downloadBackup: GET /api/backup/download/:filename — آمن ضد path traversal.
 *
 * ✅ v10.1 (2026-11-13):
 * - pre-restore backup: ملاحظة في الاستجابة.
 *
 * ✅ v10.2 (2026-11-14):
 * - safeMeta + safeData — sanitize results (لا session/client).
 * - JSON.stringify مع replacer — احتياط ضد circular.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import backupService from '../services/backupService.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { AUDIT_ACTIONS } from '../utils/constants.js';
import { logger } from '../utils/logger.js';

const BACKUP_DIR_DEFAULT = 'E:\\Backups\\Pharma\\daily';
const getBackupDir = () => process.env.BACKUP_DIR || BACKUP_DIR_DEFAULT;

/* ─────────────────────────────────────────────────────────────
 * ✅ v10.2 — sanitize results — لا session/client
 * ───────────────────────────────────────────────────────────── */
const sanitizeResults = (results) => {
  if (!results || typeof results !== 'object') return {};
  const out = {};
  for (const [name, value] of Object.entries(results)) {
    if (!value || typeof value !== 'object') {
      out[name] = { raw: String(value) };
      continue;
    }
    out[name] = {
      ok: value.ok ?? undefined,
      inserted: value.inserted ?? undefined,
      deleted: value.deleted ?? undefined,
      skipped: value.skipped ?? undefined,
      reason: value.reason ?? undefined,
      error: value.error ? String(value.error) : undefined,
    };
  }
  return out;
};

/* ─────────────────────────────────────────────────────────────
 * ✅ v10.2 — stringify آمن — replacer
 * ───────────────────────────────────────────────────────────── */
const safeStringify = (obj) => {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (
      key === 'session' ||
      key === 'client' ||
      key === 'topology' ||
      key === 's' ||
      key === '$__' ||
      key === 'sessionPool'
    ) {
      return undefined;
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  });
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/backup/info
 * ───────────────────────────────────────────────────────────── */
export const getInfo = async (req, res, next) => {
  try {
    const info = await backupService.getInfo();
    res.status(200).json({ success: true, data: info });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/backup/list
 * ───────────────────────────────────────────────────────────── */
export const listBackups = async (req, res, next) => {
  try {
    const backups = await backupService.listLocalBackups();
    res.status(200).json({ success: true, data: backups });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/backup/export
 * ───────────────────────────────────────────────────────────── */
export const exportBackup = async (req, res, next) => {
  try {
    const { buffer, filename, counts, size } = await backupService.exportAll({
      user: req.user,
    });

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.EXPORT,
      resource: 'Backup',
      description: `تصدير نسخة احتياطية (${size} bytes، ${Object.values(
        counts
      ).reduce((a, b) => a + b, 0)} سجل)`,
      success: true,
      meta: { filename, size, totalDocs: Object.values(counts).reduce((a, b) => a + b, 0) },
    });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    res.setHeader('X-Backup-Size', String(size));
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/backup/download/:filename
 * ───────────────────────────────────────────────────────────── */
export const downloadBackup = async (req, res, next) => {
  try {
    const { filename } = req.params;
    const { buffer } = await backupService.readBackupFile(filename);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    res.send(buffer);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return next(new AppError('الملف غير موجود.', 404, 'NOT_FOUND'));
    }
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/backup/restore — ✅ v10.2
 * ───────────────────────────────────────────────────────────── */
export const restoreBackup = async (req, res, next) => {
  try {
    const payload = req.body;
    if (!payload) {
      throw new AppError('الطلب فارغ.', 400, 'EMPTY_BODY');
    }

    if (!payload._meta || payload._meta.app !== 'Pharma System') {
      throw new AppError(
        'الملف ليس نسخة احتياطية من Pharma System.',
        400,
        'INVALID_BACKUP_META'
      );
    }

    // ─── pre-restore backup ───
    let preRestorePath = null;
    let preRestoreError = null;
    try {
      const pre = await backupService.exportAll({ user: req.user });
      const ts = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
      const fname = `pre-restore_${ts}.json`;
      const dir = getBackupDir();
      await fs.mkdir(dir, { recursive: true });
      preRestorePath = path.join(dir, fname);
      await fs.writeFile(preRestorePath, pre.buffer);
      logger.info(`[backupController] 📦 pre-restore: ${fname}`);
    } catch (preErr) {
      preRestoreError = preErr.message;
      logger.warn(`[backupController] فشل pre-restore: ${preErr.message}`);
    }

    // ─── restore ───
    const result = await backupService.restoreAll(payload, {
      user: req.user,
    });

    // ─── ✅ sanitize ───
    const safeResults = sanitizeResults(result.results);

    // ─── audit (sanitized) ───
    try {
      await logAuditEvent({
        req,
        action: AUDIT_ACTIONS.IMPORT,
        resource: 'Backup',
        description: `استعادة نسخة احتياطية (${result.totals.inserted} سجل، ${result.totals.errors} خطأ)`,
        success: result.totals.errors === 0,
        meta: {
          totals: result.totals,
          results: safeResults,
          sourceExportedAt: payload._meta.exportedAt,
          preRestorePath,
          preRestoreError,
        },
      });
    } catch (auditErr) {
      logger.warn(`[backupController] فشل logAuditEvent: ${auditErr.message}`);
    }

    const message =
      result.totals.errors > 0
        ? `تمت الاستعادة مع ${result.totals.errors} خطأ — راجع التفاصيل.`
        : `تمت استعادة ${result.totals.inserted} سجلاً بنجاح.`;

    // ─── ✅ response — sanitized + safeStringify ───
    const responseBody = {
      success: result.totals.errors === 0,
      message,
      data: {
        totals: result.totals,
        duration: result.duration,
        results: safeResults,
        preRestorePath,
        preRestoreError,
      },
    };

    const jsonString = safeStringify(responseBody);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(jsonString);
  } catch (error) {
    // ✅ v10.2 — sanitize error — لا stack كامل
    logger.error(`[backupController.restoreBackup] فشل: ${error.message}`);

    const safeError = {
      success: false,
      error: {
        code: error.code || 'RESTORE_ERROR',
        message: error.message || 'فشل الاستعادة.',
      },
    };

    try {
      const jsonString = safeStringify(safeError);
      res.status(error.statusCode || 500).send(jsonString);
    } catch {
      res.status(500).json({
        success: false,
        error: { code: 'RESTORE_ERROR', message: 'فشل الاستعادة.' },
      });
    }
  }
};