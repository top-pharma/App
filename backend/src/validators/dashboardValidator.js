/**
 * @file dashboardValidator.js
 * @description
 * مخططات Zod لمدخلات Dashboard.
 * ⚠️ req.query مسطح — لا غلاف `query`.
 */

import { z } from 'zod';

const PERIODS = ['today', 'week', 'month', 'quarter', 'year', 'custom'];

export const dashboardQuerySchema = z
  .object({
    period: z.enum(PERIODS).default('month'),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    trendDays: z.coerce.number().int().min(7).max(365).default(30),
    lowStockLimit: z.coerce.number().int().min(1).max(50).default(5),
  })
  .refine(
    (data) => {
      if (data.period === 'custom') return Boolean(data.from && data.to);
      return true;
    },
    { message: 'في الوضع المخصص، يجب تحديد from و to.', path: ['period'] }
  )
  .refine(
    (data) => {
      if (data.from && isNaN(new Date(data.from).getTime())) return false;
      return true;
    },
    { message: 'صيغة from غير صالحة.', path: ['from'] }
  )
  .refine(
    (data) => {
      if (data.to && isNaN(new Date(data.to).getTime())) return false;
      return true;
    },
    { message: 'صيغة to غير صالحة.', path: ['to'] }
  );