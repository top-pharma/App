/**
 * @file notificationController.js
 * @description
 * Controllers للإشعارات الداخلية (Phase 5).
 *
 * المبدأ:
 * - كل مستخدم يرى فقط إشعاراته (recipient === req.user._id).
 * - الحماية عبر notifications.view — كافٍ لعرض/تعديل إشعارات المستخدم نفسه.
 *
 * ⚠️ الترتيب في routes: specific paths قبل parametrized paths.
 */

import Notification from '../models/Notification.js';
import { AppError } from '../middlewares/errorMiddleware.js';

/* ─────────────────────────────────────────────────────────────
 * GET /api/notifications
 * Query: page, limit, isRead ('true'|'false'|'all'), type
 * ───────────────────────────────────────────────────────────── */
export const listNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, isRead, type } = req.query;

    const filter = { recipient: req.user._id };
    if (isRead !== undefined && isRead !== 'all') {
      filter.isRead = isRead === 'true' || isRead === true;
    }
    if (type) filter.type = type;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipient: req.user._id, isRead: false }),
    ]);

    res.status(200).json({
      success: true,
      data: notifications,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      meta: { unreadCount },
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/notifications/unread-count
 * يُستخدم للـ Bell badge — كل 30 ثانية
 * ───────────────────────────────────────────────────────────── */
export const getUnreadCount = async (req, res, next) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });
    res.status(200).json({ success: true, data: { count } });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * PATCH /api/notifications/:id/read
 * ───────────────────────────────────────────────────────────── */
export const markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      throw new AppError('الإشعار غير موجود.', 404, 'NOTIFICATION_NOT_FOUND');
    }
    if (String(notification.recipient) !== String(req.user._id)) {
      throw new AppError('لا تملك صلاحية تعديل هذا الإشعار.', 403, 'FORBIDDEN');
    }

    notification.markAsRead();
    await notification.save();

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * PATCH /api/notifications/read-all
 * ───────────────────────────────────────────────────────────── */
export const markAllAsRead = async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    res.status(200).json({
      success: true,
      message: `تم تعليم ${result.modifiedCount} إشعاراً كمقروء.`,
      data: { modifiedCount: result.modifiedCount },
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * DELETE /api/notifications/:id
 * ───────────────────────────────────────────────────────────── */
export const deleteNotification = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      throw new AppError('الإشعار غير موجود.', 404, 'NOTIFICATION_NOT_FOUND');
    }
    if (String(notification.recipient) !== String(req.user._id)) {
      throw new AppError('لا تملك صلاحية حذف هذا الإشعار.', 403, 'FORBIDDEN');
    }

    await notification.deleteOne();

    res.status(200).json({ success: true, message: 'تم حذف الإشعار.' });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * DELETE /api/notifications/read
 * حذف كل الإشعارات المقروءة للمستخدم الحالي
 * ───────────────────────────────────────────────────────────── */
export const deleteAllRead = async (req, res, next) => {
  try {
    const result = await Notification.deleteMany({
      recipient: req.user._id,
      isRead: true,
    });

    res.status(200).json({
      success: true,
      message: `تم حذف ${result.deletedCount} إشعاراً مقروءاً.`,
      data: { deletedCount: result.deletedCount },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllRead,
};