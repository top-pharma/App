/**
 * @file settingsController.js
 * @description
 * منطق إعدادات النظام (Singleton).
 *
 * - GET /api/settings → قراءة الإعدادات (settings.view)
 * - PATCH /api/settings → تحديث جزئي (settings.update)
 *
 * ⚠️ التحديث يستخدم dot-paths ($set: { 'sales.minMarginPercent': 10 })
 *    لتجنّب استبدال الأقسام كاملة.
 */

import { AUDIT_ACTIONS } from '../models/AuditLog.js';
import { Settings, SETTINGS_KEY } from '../models/Settings.js';
import { AppError, asyncHandler } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';

/**
 * GET /api/settings
 * قراءة الإعدادات الكاملة.
 */
export const getSettings = asyncHandler(async (req, res) => {
  let settings = await Settings.findOne({ key: SETTINGS_KEY }).lean();

  // إنشاء تلقائي إن لم تكن موجودة (fail-safe)
  if (!settings) {
    const created = await Settings.create({ key: SETTINGS_KEY });
    settings = created.toObject();
  }

  return res.status(200).json({
    success: true,
    data: settings,
  });
});

/**
 * PATCH /api/settings
 * تحديث جزئي (dot-paths).
 */
export const updateSettings = asyncHandler(async (req, res) => {
  const updates = req.body || {};

  const before = await Settings.findOne({ key: SETTINGS_KEY }).lean();
  if (!before) {
    throw new AppError(
      'الإعدادات غير مهيأة. شغّل Seed أولاً.',
      404,
      'SETTINGS_NOT_FOUND'
    );
  }

  // ─── بناء كائن التحديث (dot-paths) ───
  const setObj = {};
  const SECTIONS = [
    'company',
    'currency',
    'locale',
    'sales',
    'inventory',
    'finance',
    'security',
    'audit',
    'print',
  ];

  for (const section of SECTIONS) {
    const sectionData = updates[section];
    if (!sectionData || typeof sectionData !== 'object') continue;

    for (const [key, value] of Object.entries(sectionData)) {
      if (value === undefined) continue;

      if (section === 'sales' && key === 'prefixes' && value && typeof value === 'object') {
        for (const [pKey, pVal] of Object.entries(value)) {
          if (pVal === undefined) continue;
          setObj[`sales.prefixes.${pKey}`] = pVal;
        }
      } else {
        setObj[`${section}.${key}`] = value;
      }
    }
  }

  if (Object.keys(setObj).length === 0) {
    throw new AppError('لا توجد حقول للتحديث.', 400, 'NO_FIELDS_TO_UPDATE');
  }

  setObj.updatedBy = req.user._id;

  const settings = await Settings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: setObj },
    { new: true, runValidators: true }
  ).lean();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Settings',
    resourceId: settings._id,
    description: `تحديث إعدادات النظام (${Object.keys(setObj).length} حقل)`,
    success: true,
    meta: { before, after: settings },
  });

  return res.status(200).json({
    success: true,
    data: settings,
  });
});

export default { getSettings, updateSettings };