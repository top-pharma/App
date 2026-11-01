/**
 * @file settingsRoutes.js
 * @description
 * مسارات إعدادات النظام.
 *
 * - GET /api/settings → settings.view
 * - PATCH /api/settings → settings.update
 */

import { Router } from 'express';

import { getSettings, updateSettings } from '../controllers/settingsController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';
import { validate } from '../middlewares/validateMiddleware.js';
import { updateSettingsSchema } from '../validators/settingsValidator.js';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/settings
 */
router.get('/', requirePermissions('settings.view'), getSettings);

/**
 * PATCH /api/settings
 */
router.patch(
  '/',
  requirePermissions('settings.update'),
  validate(updateSettingsSchema),
  updateSettings
);

export default router;