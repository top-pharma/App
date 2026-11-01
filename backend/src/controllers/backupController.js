/**
 * @file backupController.js
 * @description Controllers للنسخ الاحتياطي والاستعادة + عرض النسخ.
 */

import backupService from '../services/backupService.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { AUDIT_ACTIONS } from '../utils/constants.js';

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
 * قائمة النسخ المحفوظة على القرص.
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
 * يُعيد ملف JSON كاملاً (Content-Disposition: attachment).
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
      meta: { filename, counts, size },
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
 * POST /api/backup/restore
 * Body: { _meta, data }  (بحد 50MB من express.json)
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

    const result = await backupService.restoreAll(payload, { user: req.user });

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.IMPORT,
      resource: 'Backup',
      description: `استعادة نسخة احتياطية (${result.totals.inserted} سجل، ${result.totals.errors} خطأ)`,
      success: result.totals.errors === 0,
      meta: {
        totals: result.totals,
        results: result.results,
        sourceExportedAt: payload._meta.exportedAt,
      },
    });

    const message =
      result.totals.errors > 0
        ? `تمت الاستعادة مع ${result.totals.errors} خطأ — راجع التفاصيل.`
        : `تمت استعادة ${result.totals.inserted} سجلاً بنجاح.`;

    res.status(200).json({
      success: result.totals.errors === 0,
      message,
      data: {
        totals: result.totals,
        duration: result.duration,
        results: result.results,
      },
    });
  } catch (error) {
    next(error);
  }
};