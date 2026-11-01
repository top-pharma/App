/**
 * @file salesReportValidator.js
 */

import { z } from 'zod';

const dateString = z
  .string()
  .trim()
  .refine((v) => !isNaN(new Date(v).getTime()), {
    message: 'صيغة التاريخ غير صالحة.',
  });

const exportFormat = z.enum(['xlsx', 'pdf']).optional();

export const dateOnlySchema = z.object({
  query: z.object({
    from: dateString,
    to: dateString,
    format: exportFormat,
  }),
});

export const invoicesReportSchema = z.object({
  query: z.object({
    from: dateString,
    to: dateString,
    status: z.string().trim().optional(),
    paymentType: z.string().trim().optional(),
    format: exportFormat,
  }),
});

export default {
  dateOnlySchema,
  invoicesReportSchema,
};