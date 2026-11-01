/**
 * @file invoiceDueAlert.js
 * @description
 * تنبيه تلقائي يومي للفواتير القريبة من الاستحقاق والمتأخرة.
 *
 * لماذا هذا الملف؟
 * - النظام المالي يحتاج إلى متابعة دقيقة للتحصيل لتجنب تراكم الديون.
 * - نُنبّه قبل استحقاق الفاتورة بـ (invoiceReminderDays) افتراضي 3 أيام.
 * - نُنبّه أيضاً عند التأخر (overdue) بشكل يومي حتى السداد.
 * - نُرسل:
 *   • إشعار داخلي للمحاسبين والمديرين.
 *   • إشعار داخلي للمندوب المسؤول عن الصيدلية.
 *   • إيميل تجميعي واحد لكل مستلم.
 * - الجدولة: يومياً الساعة 08:00 (توقيت الخرطوم).
 * - نستخدم `createNotificationIfNotRecent` لمنع السبام (Dedup).
 */

import cron from 'node-cron';

import { NOTIFICATION_TYPES, NOTIFICATION_LEVELS } from '../models/Notification.js';
import { INVOICE_STATUSES } from '../models/Invoice.js';
import { Invoice } from '../models/Invoice.js';
import { User, USER_ROLES } from '../models/User.js';
import { Settings } from '../models/Settings.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import {
  sendAlertEmail,
  wrapEmailHtml,
  createNotificationIfNotRecent,
  formatDateShort,
  daysUntil,
} from './jobUtils.js';

// ============================================================
// 1) جلب المستلمين المخصصين للفواتير
// ============================================================

/**
 * جلب المستلمين: المديرون + المحاسبون + المناديب النشطون.
 * @async
 * @returns {Promise<Array<{_id, name, email, role}>>}
 */
async function getInvoiceAlertRecipients() {
  try {
    return await User.find({
      role: { $in: [USER_ROLES.ADMIN, USER_ROLES.ACCOUNTANT, USER_ROLES.SALES_REP] },
      isActive: true,
    })
      .select('_id name email role')
      .lean();
  } catch (error) {
    logger.error(`فشل جلب مستلمي تنبيهات الفواتير: ${error.message}`);
    return [];
  }
}

// ============================================================
// 2) منطق التنبيه
// ============================================================

/**
 * تشغيل فحص استحقاق الفواتير.
 * @async
 * @returns {Promise<Object>}
 */
export async function runInvoiceDueAlert() {
  const startTime = Date.now();
  logger.info('💰 [invoiceDueAlert] بدء فحص الفواتير المستحقة...');

  try {
    // 1. قراءة عدد أيام التحذير من Settings.
    const settings = await Settings.getSettings();
    const reminderDays = settings.finance?.invoiceReminderDays ?? 3;
    const thresholdDate = new Date(Date.now() + reminderDays * 24 * 60 * 60 * 1000);
    const now = new Date();

    // 2. جلب الفواتير غير المسددة (pending, partial, overdue).
    // نستبعد الفواتير النقدية أو المدفوعة أو الملغاة.
    const invoices = await Invoice.find({
      status: {
        $in: [
          INVOICE_STATUSES.PENDING,
          INVOICE_STATUSES.PARTIAL,
          INVOICE_STATUSES.OVERDUE,
        ],
      },
      remainingAmount: { $gt: 0 },
      dueDate: { $ne: null, $lte: thresholdDate },
    })
      .populate('pharmacy', 'name code')
      .populate('salesRep', '_id name email')
      .sort({ dueDate: 1 })
      .lean();

    if (invoices.length === 0) {
      logger.info('💰 [invoiceDueAlert] لا توجد فواتير قريبة من الاستحقاق.');
      return { invoicesProcessed: 0, notificationsCreated: 0, emailsSent: 0 };
    }

    // 3. جلب المستلمين.
    const recipients = await getInvoiceAlertRecipients();
    if (recipients.length === 0) {
      logger.warn('💰 [invoiceDueAlert] لا يوجد مستلمون نشطون.');
      return { invoicesProcessed: invoices.length, notificationsCreated: 0, emailsSent: 0 };
    }

    // 4. إنشاء إشعارات داخلية.
    let notificationsCreated = 0;
    const invoicesByRep = new Map(); // لتجميع الإشعارات للمندوبين

    for (const invoice of invoices) {
      const isOverdue = invoice.dueDate.getTime() < now.getTime();
      const daysLeft = daysUntil(invoice.dueDate);
      
      const level = isOverdue
        ? NOTIFICATION_LEVELS.DANGER
        : NOTIFICATION_LEVELS.WARNING;

      const title = isOverdue 
        ? `فاتورة متأخرة: ${invoice.invoiceNumber}`
        : `فاتورة تستحق قريباً: ${invoice.invoiceNumber}`;
        
      const message = isOverdue
        ? `الفاتورة ${invoice.invoiceNumber} للصيدلية ${invoice.pharmacy?.name} متأخرة بـ ${Math.abs(daysLeft)} يوم. المتبقي: ${invoice.remainingAmount} SDG.`
        : `الفاتورة ${invoice.invoiceNumber} للصيدلية ${invoice.pharmacy?.name} تستحق خلال ${daysLeft} يوم. المتبقي: ${invoice.remainingAmount} SDG.`;

      const reference = { type: 'Invoice', id: invoice._id };

      // أ) إشعار للمحاسبين والمديرين
      const adminRecipients = recipients.filter(r => r.role === USER_ROLES.ADMIN || r.role === USER_ROLES.ACCOUNTANT);
      for (const recipient of adminRecipients) {
        const created = await createNotificationIfNotRecent({
          recipient: recipient._id,
          type: isOverdue ? NOTIFICATION_TYPES.INVOICE_OVERDUE : NOTIFICATION_TYPES.INVOICE_DUE,
          level,
          title,
          message,
          link: `/sales/invoices/${invoice._id}`,
          reference,
          meta: { invoiceNumber: invoice.invoiceNumber, daysLeft, remainingAmount: invoice.remainingAmount },
        });
        if (created) notificationsCreated += 1;
      }

      // ب) إشعار للمندوب المسؤول (إن وُجد)
      if (invoice.salesRep) {
        const created = await createNotificationIfNotRecent({
          recipient: invoice.salesRep._id,
          type: isOverdue ? NOTIFICATION_TYPES.INVOICE_OVERDUE : NOTIFICATION_TYPES.INVOICE_DUE,
          level,
          title,
          message,
          link: `/sales/invoices/${invoice._id}`,
          reference,
          meta: { invoiceNumber: invoice.invoiceNumber, daysLeft, remainingAmount: invoice.remainingAmount },
        });
        if (created) notificationsCreated += 1;
      }
    }

    // 5. إرسال إيميل تجميعي واحد لكل مستلم.
    let emailsSent = 0;
    const ctaUrl = `${env.FRONTEND_URL}/sales/invoices?filter=unpaid`;

    // بناء جدول HTML
    const rowsHtml = invoices.map((invoice) => {
      const d = daysUntil(invoice.dueDate);
      const isOverdue = d < 0;
      const badge = isOverdue
        ? '<span style="color:#b91c1c;font-weight:700;">متأخرة</span>'
        : '<span style="color:#b45309;font-weight:700;">قريبة</span>';
      
      return `<tr>
<td class="numeric">${invoice.invoiceNumber}</td>
<td>${invoice.pharmacy?.name || '—'}</td>
<td>${invoice.salesRep?.name || '—'}</td>
<td class="numeric">${formatDateShort(invoice.dueDate)}</td>
<td class="numeric">${isOverdue ? Math.abs(d) + ' يوم' : d + ' يوم'}</td>
<td class="numeric">${invoice.remainingAmount.toFixed(2)}</td>
<td>${badge}</td>
</tr>`;
    }).join('');

    const html = wrapEmailHtml({
      title: '💰 تنبيه: فواتير مستحقة',
      intro: `تم العثور على <strong>${invoices.length}</strong> فاتورة قريبة من الاستحقاق أو متأخرة. يرجى مراجعة التحصيل.`,
      bodyHtml: `<table><thead><tr><th>الفاتورة</th><th>الصيدلية</th><th>المندوب</th><th>الاستحقاق</th><th>المتبقي</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>${rowsHtml}</tbody></table>`,
      ctaText: 'عرض الفواتير',
      ctaUrl,
    });

    for (const recipient of recipients) {
      // إرسال فقط لمن لديهم صلاحية مالية أو مناديب لديهم فواتير
      if (recipient.role === USER_ROLES.SALES_REP) {
        const hasInvoices = invoices.some(inv => String(inv.salesRep?._id) === String(recipient._id));
        if (!hasInvoices) continue;
      }

      const result = await sendAlertEmail({
        to: recipient.email,
        subject: `💰 ${invoices.length} فاتورة بحاجة إلى متابعة`,
        html,
      });
      if (result.sent) emailsSent += 1;
    }

    const duration = Date.now() - startTime;
    logger.info(
      `💰 [invoiceDueAlert] اكتمل: ${invoices.length} فاتورة، ${notificationsCreated} إشعار، ${emailsSent} إيميل (${duration}ms)`
    );

    return {
      invoicesProcessed: invoices.length,
      notificationsCreated,
      emailsSent,
    };
  } catch (error) {
    logger.error(`💰 [invoiceDueAlert] فشل: ${error.message}`);
    return { invoicesProcessed: 0, notificationsCreated: 0, emailsSent: 0 };
  }
}

// ============================================================
// 3) الجدولة
// ============================================================

/**
 * بدء مهمة Cron لتنبيه استحقاق الفواتير.
 * يومياً الساعة 08:00 بتوقيت الخرطوم.
 * @returns {import('node-cron').ScheduledTask}
 */
export function startInvoiceDueAlertJob() {
  const task = cron.schedule('0 8 * * *', runInvoiceDueAlert, {
    timezone: 'Africa/Khartoum',
    scheduled: true,
  });
  logger.info('💰 [invoiceDueAlert] جدولة المهمة (08:00 الخرطوم).');
  return task;
}

export default {
  runInvoiceDueAlert,
  startInvoiceDueAlertJob,
};