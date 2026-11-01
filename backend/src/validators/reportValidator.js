/**
 * @file reportValidator.js
 * @description
 * مخططات Zod لمدخلات التقارير.
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
 * Finance Reports
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
    method: z.enum(['cash', 'bank', 'check', 'all']).default('all'),
    format: exportFormat,
  }),
});

export const fundBalancesSchema = z.object({
  query: z.object({
    format: exportFormat,
  }),
});

export const checksReportSchema = z.object({
  query: z.object({
    from: optionalDateString,
    to: optionalDateString,
    status: z.enum(['pending', 'paid', 'bounced', 'cancelled', 'all']).default('all'),
    type: z.enum(['incoming', 'outgoing', 'all']).default('all'),
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

export default {
  trialBalanceSchema,
  cashTransactionsSchema,
  fundBalancesSchema,
  checksReportSchema,
  expensesSchema,
  incomeSummarySchema,
};