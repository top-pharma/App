/**
 * @file backupService.js
 * @description
 * خدمة النسخ الاحتياطي والاستعادة (JSON) + عرض النسخ المحفوظة.
 *
 * المبادئ:
 *  - AuditLog مستبعَد دائماً (سجل غير قابل للاستعادة).
 *  - كلمة المرور مشمولة (نقرأ raw من collection، لا Mongoose).
 *  - Restore: deleteMany + insertMany (يحافظ على _id).
 *  - listLocalBackups: يقرأ من BACKUP_DIR (من .env).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';

import User from '../models/User.js';
import Role from '../models/Role.js';
import Settings from '../models/Settings.js';
import Notification from '../models/Notification.js';
import Category from '../models/Category.js';
import Warehouse from '../models/Warehouse.js';
import Item from '../models/Item.js';
import Supplier from '../models/Supplier.js';
import Customer from '../models/Customer.js';
import Stock from '../models/Stock.js';
import Invoice from '../models/Invoice.js';
import DeliveryNote from '../models/DeliveryNote.js';
import CustomerReturn from '../models/CustomerReturn.js';
import SupplierReturn from '../models/SupplierReturn.js';
import PurchaseReceipt from '../models/PurchaseReceipt.js';
import Commission from '../models/Commission.js';
import SalesRepTransaction from '../models/SalesRepTransaction.js';
import CashFund from '../models/CashFund.js';
import BankAccount from '../models/BankAccount.js';
import Check from '../models/Check.js';
import CashTransaction from '../models/CashTransaction.js';
import AccountingEntry from '../models/AccountingEntry.js';

import { logger } from '../utils/logger.js';

/**
 * ترتيب المجموعات: الآباء قبل الأبناء.
 * AuditLog غير موجود (لا يُنسَخ ولا يُستعاد).
 */
const MODELS = [
  { name: 'roles', Model: Role },
  { name: 'users', Model: User },
  { name: 'settings', Model: Settings },
  { name: 'categories', Model: Category },
  { name: 'warehouses', Model: Warehouse },
  { name: 'items', Model: Item },
  { name: 'suppliers', Model: Supplier },
  { name: 'customers', Model: Customer },
  { name: 'purchaseReceipts', Model: PurchaseReceipt },
  { name: 'stocks', Model: Stock },
  { name: 'invoices', Model: Invoice },
  { name: 'deliveryNotes', Model: DeliveryNote },
  { name: 'customerReturns', Model: CustomerReturn },
  { name: 'supplierReturns', Model: SupplierReturn },
  { name: 'commissions', Model: Commission },
  { name: 'salesRepTransactions', Model: SalesRepTransaction },
  { name: 'cashFunds', Model: CashFund },
  { name: 'bankAccounts', Model: BankAccount },
  { name: 'checks', Model: Check },
  { name: 'cashTransactions', Model: CashTransaction },
  { name: 'accountingEntries', Model: AccountingEntry },
  { name: 'notifications', Model: Notification },
];

/* ═════════════════════════════════════════════════════════════
 * 1) Export — بناء ملف JSON
 * ═════════════════════════════════════════════════════════════ */

/**
 * إنشاء نسخة احتياطية كاملة (JSON Buffer).
 * @param {Object} opts
 * @param {Object} opts.user
 * @returns {Promise<{ buffer: Buffer, filename: string, counts: Object, size: number }>}
 */
export async function exportAll({ user } = {}) {
  const startedAt = Date.now();
  const payload = {
    _meta: {
      app: 'Pharma System',
      version: '5.0.0',
      exportedAt: new Date().toISOString(),
      exportedBy: user?.email || 'unknown',
      collections: {},
    },
    data: {},
  };

  for (const { name, Model } of MODELS) {
    const docs = await Model.collection.find({}).toArray();
    payload.data[name] = docs;
    payload._meta.collections[name] = docs.length;
  }

  const json = JSON.stringify(payload, null, 2);
  const buffer = Buffer.from(json, 'utf-8');

  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  const filename = `pharma-backup_${ts}.json`;

  const totalDocs = Object.values(payload._meta.collections).reduce(
    (a, b) => a + b,
    0
  );

  logger.info(
    `[backupService] تصدير: ${buffer.length} bytes، ${totalDocs} سجل، ${Date.now() - startedAt}ms`
  );

  return {
    buffer,
    filename,
    counts: payload._meta.collections,
    size: buffer.length,
  };
}

/* ═════════════════════════════════════════════════════════════
 * 2) Info — حجم تقديري
 * ═════════════════════════════════════════════════════════════ */

/**
 * معلومات عن البيانات الحالية (counts + حجم تقديري).
 * @returns {Promise<Object>}
 */
export async function getInfo() {
  const counts = {};
  let total = 0;

  for (const { name, Model } of MODELS) {
    try {
      const c = await Model.estimatedDocumentCount();
      counts[name] = c;
      total += c;
    } catch (err) {
      counts[name] = { error: err.message };
    }
  }

  return {
    counts,
    totalDocuments: total,
    collections: MODELS.length,
  };
}

/* ═════════════════════════════════════════════════════════════
 * 3) Restore — استعادة من JSON
 * ═════════════════════════════════════════════════════════════ */

/**
 * استعادة بيانات كاملة من ملف JSON.
 *
 * ⚠️ خطير: يمسح كل المجموعات (عدا AuditLog) ثم يستعيد من الملف.
 *
 * @param {Object} payload - { _meta, data }
 * @param {Object} opts
 * @param {Object} opts.user
 * @returns {Promise<{ results: Object, duration: number, totals: Object }>}
 */
export async function restoreAll(payload, { user } = {}) {
  if (!payload || typeof payload !== 'object' || !payload.data) {
    const err = new Error('الملف غير صالح: يجب أن يحتوي على مفتاح data.');
    err.statusCode = 400;
    err.code = 'INVALID_BACKUP_FILE';
    throw err;
  }

  const startedAt = Date.now();
  const results = {};
  const totals = { inserted: 0, deleted: 0, errors: 0 };

  for (const { name, Model } of MODELS) {
    const docs = payload.data[name];
    if (!Array.isArray(docs)) {
      results[name] = { skipped: true, reason: 'not-in-file' };
      continue;
    }

    try {
      const del = await Model.deleteMany({});
      totals.deleted += del.deletedCount || 0;

      let inserted = 0;
      if (docs.length > 0) {
        try {
          const res = await Model.insertMany(docs, {
            validateBeforeSave: false,
            ordered: true,
          });
          inserted = res.length;
        } catch (insertErr) {
          results[name] = {
            ok: false,
            inserted: 0,
            deleted: del.deletedCount || 0,
            error: insertErr.message,
          };
          totals.errors += 1;
          logger.error(
            `[backupService] فشل استعادة ${name}: ${insertErr.message}`
          );
          continue;
        }
      }

      results[name] = {
        ok: true,
        inserted,
        deleted: del.deletedCount || 0,
      };
      totals.inserted += inserted;
    } catch (err) {
      results[name] = {
        ok: false,
        error: err.message,
      };
      totals.errors += 1;
      logger.error(`[backupService] فشل مجموعة ${name}: ${err.message}`);
    }
  }

  const duration = Date.now() - startedAt;
  logger.info(
    `[backupService] استعادة: ${totals.inserted} إدراج، ${totals.deleted} حذف، ${totals.errors} خطأ (${duration}ms) — بواسطة ${user?.email || 'unknown'}`
  );

  return { results, duration, totals };
}

/* ═════════════════════════════════════════════════════════════
 * 4) List Local Backups — عرض النسخ المحفوظة
 * ═════════════════════════════════════════════════════════════ */

/**
 * قائمة النسخ المحفوظة على القرص.
 * @returns {Promise<Array<{filename, size, createdAt}>>}
 */
export async function listLocalBackups() {
  const BACKUP_DIR =
    process.env.BACKUP_DIR || 'E:\\Backups\\Pharma\\daily';

  try {
    const files = await fs.readdir(BACKUP_DIR);
    const backups = await Promise.all(
      files
        .filter((f) => f.startsWith('pharma-backup_') && f.endsWith('.json'))
        .map(async (f) => {
          const stat = await fs.stat(path.join(BACKUP_DIR, f));
          return {
            filename: f,
            size: stat.size,
            createdAt: stat.mtime,
          };
        })
    );
    return backups.sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/* ═════════════════════════════════════════════════════════════
 * 5) التصدير الافتراضي
 * ═════════════════════════════════════════════════════════════ */

export default {
  exportAll,
  getInfo,
  restoreAll,
  listLocalBackups,
};