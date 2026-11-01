/**
 * @file checkDueAlert.js
 * @description
 * Job يومي 08:00 (Africa/Khartoum) — تنبيهات متدرجة للشيكات المعلّقة.
 *
 * المستويات:
 *  - 7 أيام قبل       → check_due_soon
 *  - 3 أيام قبل       → check_due_soon
 *  - يوم الاستحقاق    → check_due_today
 *  - بعد الاستحقاق    → check_overdue (يومياً)
 *
 * المستلمون: admin + accountant (النشطون).
 * Dedup: createNotificationIfNotRecent (24 ساعة).
 */

import Check from '../models/Check.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import logger from '../utils/logger.js';

/**
 * ينشئ إشعاراً إن لم يُنشأ مثله في آخر 24 ساعة.
 * @param {Object} params
 * @returns {Promise<Object|null>}
 */
const createNotificationIfNotRecent = async ({
  userId,
  type,
  title,
  message,
  meta = {},
}) => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const exists = await Notification.findOne({
    userId,
    type,
    createdAt: { $gte: oneDayAgo },
    'meta.checkId': meta.checkId,
  });
  if (exists) return null;

  return Notification.create({
    userId,
    type,
    title,
    message,
    meta,
    isRead: false,
  });
};

/**
 * الدالة الرئيسية للـ Job.
 * @returns {Promise<{notificationsCreated: number, errors: number, duration: number}>}
 */
export const runCheckDueAlert = async () => {
  const startTime = Date.now();
  let notificationsCreated = 0;
  let errors = 0;

  try {
    // ─── 1) جلب المستلمين ───
    const recipients = await User.find({
      role: { $in: ['admin', 'accountant'] },
      isActive: true,
    })
      .select('_id role fullName')
      .lean();

    if (recipients.length === 0) {
      logger.info('[checkDueAlert] لا يوجد مستلمون نشطون — تخطي');
      return { notificationsCreated: 0, errors: 0, duration: Date.now() - startTime };
    }

    // ─── 2) جلب الشيكات المعلّقة ───
    const pendingChecks = await Check.find({ status: 'pending' })
      .populate('customerId', 'name')
      .populate('supplierId', 'name')
      .lean();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const check of pendingChecks) {
      const dueDate = new Date(check.dueDate);
      const dueDay = new Date(
        dueDate.getFullYear(),
        dueDate.getMonth(),
        dueDate.getDate()
      );
      const daysDiff = Math.floor((dueDay - today) / (24 * 60 * 60 * 1000));

      let notifType = null;
      let title = null;
      let urgency = '';

      if (daysDiff < 0) {
        notifType = 'check_overdue';
        title = `⚠️ شيك ${check.type === 'incoming' ? 'وارد' : 'صادر'} متأخر`;
        urgency = `متأخر ${Math.abs(daysDiff)} يوماً`;
      } else if (daysDiff === 0) {
        notifType = 'check_due_today';
        title = `🔔 شيك ${check.type === 'incoming' ? 'وارد' : 'صادر'} يستحق اليوم`;
        urgency = 'يستحق اليوم';
      } else if (daysDiff <= 3) {
        notifType = 'check_due_soon';
        title = `⏰ شيك ${check.type === 'incoming' ? 'وارد' : 'صادر'} يستحق قريباً`;
        urgency = `يستحق خلال ${daysDiff} أيام`;
      } else if (daysDiff <= 7) {
        notifType = 'check_due_soon';
        title = `📅 شيك ${check.type === 'incoming' ? 'وارد' : 'صادر'} يقترب`;
        urgency = `يستحق خلال ${daysDiff} أيام`;
      }

      if (!notifType) continue;

      const counterparty =
        check.type === 'incoming'
          ? check.customerId?.name || 'عميل'
          : check.supplierId?.name || 'مورد';

      const message = `شيك رقم ${check.checkNumber} (${check.bankName}) من ${counterparty} بمبلغ ${check.amount} SDG — ${urgency}`;

      for (const user of recipients) {
        try {
          const notif = await createNotificationIfNotRecent({
            userId: user._id,
            type: notifType,
            title,
            message,
            meta: { checkId: check._id, dueDate: check.dueDate, daysDiff },
          });
          if (notif) notificationsCreated++;
        } catch (err) {
          errors++;
          logger.error(`[checkDueAlert] فشل إشعار: ${err.message}`);
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.info(
      `[checkDueAlert] اكتمل: ${notificationsCreated} إشعار، ${errors} خطأ، ${duration}ms`
    );

    return { notificationsCreated, errors, duration };
  } catch (error) {
    logger.error(`[checkDueAlert] فشل Job: ${error.message}`);
    throw error;
  }
};

export default runCheckDueAlert;