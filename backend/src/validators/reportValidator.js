/**
 * @file reportValidator.js
 * @description
 * مخططات Zod لمدخلات التقارير.
 *
 * ✅ v10.4 (2026-11-15):
 * - حُذف `checksReportSchema` (Check أُلغي في 🅲).
 * - حُذف `'check'` من `cashTransactionsSchema.method` (Check أُلغي في 🅲).
 */

import { z } from 'zod';

const dateString = z
  .string()
  .trim()
  .refine((v) => !isNaN(new Date(v).getTime()), { message: 'صيغة التاريخ غير صالحة.' });

const optionalDateString = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || !isNaN(new Date(v).getTime()), { message: 'صيغة التاريخ غير صالحة.' });

const optionalObjectId = z
  .string()
  .trim()
  .optional()
  .refine(
    (v) => !v || /^[a-fA-F0-9]{24}$/.test(v),
    { message: 'معرّف غير صالح.' }
  );

const exportFormat = z.enum(['xlsx', 'pdf']).optional();

/* ─────────────────────────────────────────────────────────────
 * Finance Reports — 5
 * ───────────────────────────────────────────────────────────── */

export const trialBalanceSchema = z.object({
  query: z.object({
    from: dateString,
    to: dateString,
    format: exportFormat,
  }),
});

export const cashTransactionsSchema = z.object({
  query: z.object({
    from: dateString,
    to: dateString,
    direction: z.enum(['in', 'out', 'all']).default('all'),
    cashFundId: optionalObjectId,
    bankAccountId: optionalObjectId,
    // ✅ v10.4: حُذف 'check' (Check أُلغي)
    method: z.enum(['cash', 'bank', 'all']).default('all'),
    format: exportFormat,
  }),
});

export const fundBalancesSchema = z.object({
  query: z.object({
    format: exportFormat,
  }),
});

export const expensesSchema = z.object({
  query: z.object({
    from: dateString,
    to: dateString,
    format: exportFormat,
  }),
});

export const incomeSummarySchema = z.object({
  query: z.object({
    from: dateString,
    to: dateString,
    format: exportFormat,
  }),
});

// ✅ v10.4: حُذف checksReportSchema

export default {
  trialBalanceSchema,
  cashTransactionsSchema,
  fundBalancesSchema,
  expensesSchema,
  incomeSummarySchema,
};