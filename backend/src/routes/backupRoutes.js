/**
 * @file backupRoutes.js
 * @description مسارات النسخ الاحتياطي والاستعادة + قائمة النسخ.
 *
 * الحماية:
 * - requireAuth
 * - requirePermissions('settings.update') — admin فقط
 */

import express from 'express';
import * as backupController from '../controllers/backupController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/rbacMiddleware.js';

const router = express.Router();

router.use(requireAuth);
router.use(requirePermissions('settings.update'));

router.get('/info', backupController.getInfo);
router.get('/list', backupController.listBackups);
router.get('/export', backupController.exportBackup);
router.post('/restore', backupController.restoreBackup);

export default router;