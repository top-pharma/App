/**
 * @file backupService.js
 * @description
 * خدمة النسخ الاحتياطي والاستعادة (JSON) + عرض النسخ المحفوظة.
 *
 * ✅ v10.4 (2026-11-15):
 * - إزالة transaction — M0 Free Tier لا يدعمها.
 * - pre-restore backup يضمن rollback يدوياً عند الحاجة.
 * - بدون session — deleteMany + insertMany مباشرة.
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
import CustomerReturn from '../models/CustomerReturn.js';
import SupplierReturn from '../models/SupplierReturn.js';
import PurchaseReceipt from '../models/PurchaseReceipt.js';
import Commission from '../models/Commission.js';
import SalesRepTransaction from '../models/SalesRepTransaction.js';
import CashFund from '../models/CashFund.js';
import BankAccount from '../models/BankAccount.js';
import CashTransaction from '../models/CashTransaction.js';
import AccountingEntry from '../models/AccountingEntry.js';

import { logger } from '../utils/logger.js';

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
  { name: 'customerReturns', Model: CustomerReturn },
  { name: 'supplierReturns', Model: SupplierReturn },
  { name: 'commissions', Model: Commission },
  { name: 'salesRepTransactions', Model: SalesRepTransaction },
  { name: 'cashFunds', Model: CashFund },
  { name: 'bankAccounts', Model: BankAccount },
  { name: 'cashTransactions', Model: CashTransaction },
  { name: 'accountingEntries', Model: AccountingEntry },
  { name: 'notifications', Model: Notification },
];

const CRITICAL_COLLECTIONS = ['roles', 'users', 'settings'];

const BACKUP_DIR_DEFAULT = 'E:\\Backups\\Pharma\\daily';
const getBackupDir = () => process.env.BACKUP_DIR || BACKUP_DIR_DEFAULT;

/* ═════════════════════════════════════════════════════════════
 * 1) Export
 * ═════════════════════════════════════════════════════════════ */

export async function exportAll({ user } = {}) {
  const startedAt = Date.now();
  const payload = {
    _meta: {
      app: 'Pharma System',
      version: '5.1.0',
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
 * 2) Info
 * ═════════════════════════════════════════════════════════════ */

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
 * 3) Restore — ✅ v10.4: بدون transaction (M0 Free Tier)
 * ═════════════════════════════════════════════════════════════ */

export async function restoreAll(payload, { user } = {}) {
  if (!payload || typeof payload !== 'object' || !payload.data) {
    const err = new Error('الملف غير صالح: يجب أن يحتوي على مفتاح data.');
    err.statusCode = 400;
    err.code = 'INVALID_BACKUP_FILE';
    throw err;
  }

  for (const name of CRITICAL_COLLECTIONS) {
    const docs = payload.data[name];
    if (!Array.isArray(docs) || docs.length === 0) {
      const err = new Error(
        `الملف لا يحتوي مجموعة "${name}" (أو أنها فارغة) — الاستعادة مرفوضة لحماية النظام.\n` +
          `💡 الحل: شغّل "npm run seed" أولاً لتوليد الأدوار، ثم صدّر نسخة جديدة واستعدها.`
      );
      err.statusCode = 400;
      err.code = 'MISSING_CRITICAL_COLLECTION';
      throw err;
    }
  }

  if (payload._meta?.collections) {
    for (const [name, expected] of Object.entries(payload._meta.collections)) {
      const actual = Array.isArray(payload.data[name])
        ? payload.data[name].length
        : 0;
      if (typeof expected === 'number' && actual !== expected) {
        const err = new Error(
          `عدم تطابق في "${name}": _meta يقول ${expected} — الملف يحتوي ${actual}.`
        );
        err.statusCode = 400;
        err.code = 'COUNT_MISMATCH';
        throw err;
      }
    }
  }

  const startedAt = Date.now();
  const results = {};
  const totals = { inserted: 0, deleted: 0, errors: 0 };

  // ✅ v10.4 — بدون transaction (M0 Free Tier لا يدعمها)
  try {
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
          const res = await Model.insertMany(docs, {
            validateBeforeSave: false,
            ordered: true,
          });
          inserted = res.length;
        }

        results[name] = {
          ok: true,
          inserted,
          deleted: del.deletedCount || 0,
        };
        totals.inserted += inserted;
      } catch (err) {
        results[name] = { ok: false, error: String(err.message || err) };
        logger.error(`[backupService] فشل ${name}: ${err.message}`);
        totals.errors += 1;
        // ✅ v10.4 — نُكمل — pre-restore backup موجود
      }
    }

    logger.info(
      `[backupService] ${totals.errors === 0 ? '✅ استعادة ناجحة' : '⚠️ استعادة مع أخطاء'}: ${totals.inserted} إدراج، ${totals.deleted} حذف (${Date.now() - startedAt}ms) — بواسطة ${user?.email || 'unknown'}`
    );
  } catch (err) {
    totals.errors += 1;
    logger.error(`[backupService] ❌ فشل الاستعادة: ${err.message}`);

    const sanitizedError = new Error(err.message || 'فشل الاستعادة.');
    sanitizedError.statusCode = err.statusCode || 500;
    sanitizedError.code = err.code || 'RESTORE_ERROR';
    sanitizedError.name = 'RestoreError';
    throw sanitizedError;
  }

  return { results, duration: Date.now() - startedAt, totals };
}

/* ═════════════════════════════════════════════════════════════
 * 4) List Local Backups
 * ═════════════════════════════════════════════════════════════ */

export async function listLocalBackups() {
  const BACKUP_DIR = getBackupDir();

  try {
    const files = await fs.readdir(BACKUP_DIR);
    const backups = await Promise.all(
      files
        .filter((f) => f.startsWith('pharma-backup_') && f.endsWith('.json'))
        .map(async (f) => {
          const stat = await fs.stat(path.join(BACKUP_DIR, f));
          const createdAt =
            stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime;
          return {
            filename: f,
            size: stat.size,
            createdAt,
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
 * 5) Download
 * ═════════════════════════════════════════════════════════════ */

export async function readBackupFile(filename) {
  if (!/^(pharma-backup_|pre-restore_)[\d\-_T:]+\.json$/.test(filename)) {
    const err = new Error('اسم ملف غير صالح.');
    err.statusCode = 400;
    err.code = 'INVALID_FILENAME';
    throw err;
  }

  const fullPath = path.join(getBackupDir(), filename);
  const buffer = await fs.readFile(fullPath);
  return { buffer, filename };
}

/* ═════════════════════════════════════════════════════════════
 * 6) التصدير الافتراضي
 * ═════════════════════════════════════════════════════════════ */

export default {
  exportAll,
  getInfo,
  restoreAll,
  listLocalBackups,
  readBackupFile,
};