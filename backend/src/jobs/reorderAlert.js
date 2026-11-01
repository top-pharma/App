/**
 * @file reorderAlert.js
 * @description تنبيه تلقائي يومي للأصناف تحت حد إعادة الطلب.
 *
 * لماذا هذا الملف؟
 * - نمنع نفاد الأدوية من المخزن.
 * - نقارن مجموع رصيد كل صنف (عبر كل الدفعات غير المحجورة) بـ reorderLevel.
 * - نُرسل:
 *   • إشعار داخلي لكل مستلم لكل صنف تحت الحد.
 *   • إيميل تجميعي واحد لكل مستلم.
 * - الجدولة: يومياً الساعة 08:00 (توقيت الخرطوم).
 * - لا نُكرّر التنبيه إن كان الإشعار السابق غير مقروء.
 */

import cron from 'node-cron';

import {
  NOTIFICATION_TYPES,
  NOTIFICATION_LEVELS,
} from '../models/Notification.js';
import { Item } from '../models/Item.js';
import { Stock } from '../models/Stock.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import {
  getAlertRecipients,
  sendAlertEmail,
  wrapEmailHtml,
  createNotificationIfNotRecent,
} from './jobUtils.js';

// ============================================================
// 1) منطق التنبيه
// ============================================================

/**
 * تشغيل فحص الحد الأدنى.
 * @async
 * @returns {Promise<Object>}
 */
export async function runReorderAlert() {
  const startTime = Date.now();
  logger.info('📦 [reorderAlert] بدء فحص الحد الأدنى...');

  try {
    // 1) الأصناف النشطة مع reorderLevel > 0.
    const items = await Item.find({
      isActive: true,
      reorderLevel: { $gt: 0 },
    })
      .select('_id tradeName scientificName category units reorderLevel')
      .lean();

    if (items.length === 0) {
      logger.info('📦 [reorderAlert] لا توجد أصناف بحد أدنى محدد.');
      return {
        itemsChecked: 0,
        belowReorder: 0,
        notificationsCreated: 0,
        emailsSent: 0,
      };
    }

    // 2) جمع الرصيد لكل صنف (aggregate واحد).
    const totals = await Stock.aggregate([
      { $match: { quantity: { $gt: 0 }, isQuarantined: false } },
      { $group: { _id: '$item', totalQty: { $sum: '$quantity' } } },
    ]);
    const totalByItem = new Map(totals.map((t) => [String(t._id), t.totalQty]));

    // 3) تصفية الأصناف تحت الحد.
    const belowReorder = items
      .map((item) => {
        const totalQty = totalByItem.get(String(item._id)) || 0;
        return {
          ...item,
          totalQuantity: totalQty,
          shortage: Math.max(0, (item.reorderLevel || 0) - totalQty),
        };
      })
      .filter((item) => item.totalQuantity <= item.reorderLevel)
      .sort((a, b) => b.shortage - a.shortage);

    if (belowReorder.length === 0) {
      logger.info('📦 [reorderAlert] كل الأصناف فوق الحد الأدنى.');
      return {
        itemsChecked: items.length,
        belowReorder: 0,
        notificationsCreated: 0,
        emailsSent: 0,
      };
    }

    // 4) المستلمون.
    const recipients = await getAlertRecipients();
    if (recipients.length === 0) {
      logger.warn('📦 [reorderAlert] لا يوجد مستلمون نشطون.');
      return {
        itemsChecked: items.length,
        belowReorder: belowReorder.length,
        notificationsCreated: 0,
        emailsSent: 0,
      };
    }

    // 5) إشعارات داخلية.
    let notificationsCreated = 0;
    for (const item of belowReorder) {
      const isZero = item.totalQuantity <= 0;
      const level = isZero
        ? NOTIFICATION_LEVELS.DANGER
        : NOTIFICATION_LEVELS.WARNING;

      const title = `حد أدنى: ${item.tradeName}`;
      const message = isZero
        ? `الصنف "${item.tradeName}" نَفِد تماماً (الحد: ${item.reorderLevel}).`
        : `الصنف "${item.tradeName}" تحت الحد الأدنى — المتاح: ${item.totalQuantity} / الحد: ${item.reorderLevel}`;

      for (const recipient of recipients) {
        const created = await createNotificationIfNotRecent({
          recipient: recipient._id,
          type: NOTIFICATION_TYPES.STOCK_LOW,
          level,
          title,
          message,
          link: '/inventory/items?filter=lowStock',
          reference: { type: 'Item', id: item._id },
          meta: {
            itemId: item._id,
            totalQuantity: item.totalQuantity,
            reorderLevel: item.reorderLevel,
            shortage: item.shortage,
          },
        });
        if (created) notificationsCreated += 1;
      }
    }

    // 6) إيميل تجميعي واحد لكل مستلم.
    let emailsSent = 0;
    const ctaUrl = `${env.FRONTEND_URL}/inventory/items?filter=lowStock`;

    const rowsHtml = belowReorder
      .map((item) => {
        const isZero = item.totalQuantity <= 0;
        const badge = isZero
          ? '<span style="color:#b91c1c;font-weight:700;">نفد</span>'
          : '<span style="color:#b45309;font-weight:700;">تحت الحد</span>';
        return `<tr>
<td>${item.tradeName}</td>
<td>${item.scientificName || '—'}</td>
<td class="numeric">${item.totalQuantity}</td>
<td class="numeric">${item.reorderLevel}</td>
<td class="numeric">${item.shortage}</td>
<td>${badge}</td>
</tr>`;
      })
      .join('');

    const html = wrapEmailHtml({
      title: '📦 تنبيه: أصناف تحت الحد الأدنى',
      intro: `تم العثور على <strong>${belowReorder.length}</strong> صنف تحت حد إعادة الطلب. يرجى مراجعة المشتريات.`,
      bodyHtml: `<table><thead><tr><th>الصنف</th><th>الاسم العلمي</th><th>المتاح</th><th>الحد</th><th>النقص</th><th>الأولوية</th></tr></thead><tbody>${rowsHtml}</tbody></table>`,
      ctaText: 'عرض الأصناف',
      ctaUrl,
    });

    for (const recipient of recipients) {
      const result = await sendAlertEmail({
        to: recipient.email,
        subject: `📦 ${belowReorder.length} صنف تحت الحد الأدنى`,
        html,
      });
      if (result.sent) emailsSent += 1;
    }

    const duration = Date.now() - startTime;
    logger.info(
      `📦 [reorderAlert] اكتمل: ${belowReorder.length} صنف، ${notificationsCreated} إشعار، ${emailsSent} إيميل (${duration}ms)`
    );

    return {
      itemsChecked: items.length,
      belowReorder: belowReorder.length,
      notificationsCreated,
      emailsSent,
    };
  } catch (error) {
    logger.error(`📦 [reorderAlert] فشل: ${error.message}`);
    return {
      itemsChecked: 0,
      belowReorder: 0,
      notificationsCreated: 0,
      emailsSent: 0,
    };
  }
}

// ============================================================
// 2) الجدولة
// ============================================================

/**
 * بدء مهمة Cron لتنبيه الحد الأدنى.
 * يومياً الساعة 08:00 بتوقيت الخرطوم.
 * @returns {import('node-cron').ScheduledTask}
 */
export function startReorderAlertJob() {
  const task = cron.schedule('0 8 * * *', runReorderAlert, {
    timezone: 'Africa/Khartoum',
    scheduled: true,
  });
  logger.info('📦 [reorderAlert] جدولة المهمة (08:00 الخرطوم).');
  return task;
}

export default {
  runReorderAlert,
  startReorderAlertJob,
};