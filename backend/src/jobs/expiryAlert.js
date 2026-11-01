/**
 * @file expiryAlert.js
 * @description تنبيه تلقائي يومي للدفعات القاربة على الانتهاء.
 *
 * لماذا هذا الملف؟
 * - قطاع الأدوية يتطلب تتبّعاً صارماً لتواريخ الصلاحية (FEFO).
 * - نُنبّه قبل انتهاء الدفعة بـ expiryWarningDays (افتراضي 90 يوماً).
 * - نُرسل:
 *   • إشعار داخلي لكل مستلم لكل دفعة.
 *   • إيميل تجميعي واحد لكل مستلم (بكل الدفعات القاربة).
 * - الجدولة: يومياً الساعة 08:00 (توقيت الخرطوم).
 * - لا نُكرّر التنبيه عن نفس الدفعة إن كان الإشعار السابق غير مقروء.
 */

import cron from 'node-cron';

import {
  NOTIFICATION_TYPES,
  NOTIFICATION_LEVELS,
} from '../models/Notification.js';
import { Settings } from '../models/Settings.js';
import { Stock } from '../models/Stock.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import {
  getAlertRecipients,
  sendAlertEmail,
  wrapEmailHtml,
  createNotificationIfNotRecent,
  formatDateShort,
  daysUntil,
} from './jobUtils.js';

// ============================================================
// 1) منطق التنبيه
// ============================================================

/**
 * تشغيل فحص انتهاء الصلاحية.
 * @async
 * @returns {Promise<{batchesProcessed: number, notificationsCreated: number, emailsSent: number}>}
 */
export async function runExpiryAlert() {
  const startTime = Date.now();
  logger.info('🔔 [expiryAlert] بدء فحص انتهاء الصلاحية...');

  try {
    // 1) قراءة عدد أيام التحذير من Settings.
    const settings = await Settings.getSettings();
    const warningDays = settings.inventory?.expiryWarningDays ?? 90;
    const threshold = new Date(Date.now() + warningDays * 24 * 60 * 60 * 1000);

    // 2) جلب الدفعات القاربة (غير منتهية، غير محجورة، بها رصيد).
    const batches = await Stock.find({
      quantity: { $gt: 0 },
      isQuarantined: false,
      expiry: { $gt: new Date(), $lte: threshold },
    })
      .populate('item', 'tradeName scientificName category')
      .populate('warehouse', 'name code')
      .sort({ expiry: 1 })
      .lean();

    if (batches.length === 0) {
      logger.info('🔔 [expiryAlert] لا توجد دفعات قاربة.');
      return { batchesProcessed: 0, notificationsCreated: 0, emailsSent: 0 };
    }

    // 3) جلب المستلمين.
    const recipients = await getAlertRecipients();
    if (recipients.length === 0) {
      logger.warn('🔔 [expiryAlert] لا يوجد مستلمون نشطون.');
      return {
        batchesProcessed: batches.length,
        notificationsCreated: 0,
        emailsSent: 0,
      };
    }

    // 4) إنشاء إشعارات داخلية لكل مستلم لكل دفعة.
    let notificationsCreated = 0;
    for (const batch of batches) {
      const itemName = batch.item?.tradeName || '—';
      const warehouseName = batch.warehouse?.name || '—';
      const daysLeft = daysUntil(batch.expiry);
      const level =
        daysLeft <= 30 ? NOTIFICATION_LEVELS.DANGER : NOTIFICATION_LEVELS.WARNING;

      const title = `دفعة قاربة الانتهاء: ${itemName}`;
      const message = `الدفعة ${batch.batch} تنتهي خلال ${daysLeft} يوم (${formatDateShort(batch.expiry)}) — الكمية: ${batch.quantity} — المخزن: ${warehouseName}`;

      for (const recipient of recipients) {
        const created = await createNotificationIfNotRecent({
          recipient: recipient._id,
          type: NOTIFICATION_TYPES.STOCK_EXPIRING,
          level,
          title,
          message,
          link: '/inventory/stock?filter=expiring',
          reference: { type: 'Stock', id: batch._id },
          meta: {
            batch: batch.batch,
            expiry: batch.expiry,
            daysLeft,
            quantity: batch.quantity,
            itemId: batch.item?._id,
            warehouseId: batch.warehouse?._id,
          },
        });
        if (created) notificationsCreated += 1;
      }
    }

    // 5) إرسال إيميل تجميعي واحد لكل مستلم.
    let emailsSent = 0;
    const ctaUrl = `${env.FRONTEND_URL}/inventory/stock?filter=expiring`;

    const rowsHtml = batches
      .map((batch) => {
        const d = daysUntil(batch.expiry);
        const badge =
          d <= 30
            ? '<span style="color:#b91c1c;font-weight:700;">عاجل</span>'
            : '<span style="color:#b45309;font-weight:700;">تنبيه</span>';
        return `<tr>
<td>${batch.item?.tradeName || '—'}</td>
<td class="numeric">${batch.batch}</td>
<td>${batch.warehouse?.name || '—'}</td>
<td class="numeric">${formatDateShort(batch.expiry)}</td>
<td class="numeric">${d} يوم</td>
<td class="numeric">${batch.quantity}</td>
<td>${badge}</td>
</tr>`;
      })
      .join('');

    const html = wrapEmailHtml({
      title: '🔔 تنبيه: دفعات قاربة على الانتهاء',
      intro: `تم العثور على <strong>${batches.length}</strong> دفعة تنتهي خلال ${warningDays} يوماً. يرجى مراجعة المخزون واتخاذ الإجراء المناسب.`,
      bodyHtml: `<table><thead><tr><th>الصنف</th><th>الدفعة</th><th>المخزن</th><th>الانتهاء</th><th>متبقٍ</th><th>الكمية</th><th>الأولوية</th></tr></thead><tbody>${rowsHtml}</tbody></table>`,
      ctaText: 'عرض المخزون',
      ctaUrl,
    });

    for (const recipient of recipients) {
      const result = await sendAlertEmail({
        to: recipient.email,
        subject: `🔔 ${batches.length} دفعة قاربة على الانتهاء`,
        html,
      });
      if (result.sent) emailsSent += 1;
    }

    const duration = Date.now() - startTime;
    logger.info(
      `🔔 [expiryAlert] اكتمل: ${batches.length} دفعة، ${notificationsCreated} إشعار، ${emailsSent} إيميل (${duration}ms)`
    );

    return {
      batchesProcessed: batches.length,
      notificationsCreated,
      emailsSent,
    };
  } catch (error) {
    logger.error(`🔔 [expiryAlert] فشل: ${error.message}`);
    return { batchesProcessed: 0, notificationsCreated: 0, emailsSent: 0 };
  }
}

// ============================================================
// 2) الجدولة
// ============================================================

/**
 * بدء مهمة Cron لتنبيه انتهاء الصلاحية.
 * يومياً الساعة 08:00 بتوقيت الخرطوم.
 * @returns {import('node-cron').ScheduledTask}
 */
export function startExpiryAlertJob() {
  const task = cron.schedule('0 8 * * *', runExpiryAlert, {
    timezone: 'Africa/Khartoum',
    scheduled: true,
  });
  logger.info('🔔 [expiryAlert] جدولة المهمة (08:00 الخرطوم).');
  return task;
}

export default {
  runExpiryAlert,
  startExpiryAlertJob,
};