/**
 * bankAccountValidator.js
 *
 * Validators للحساب البنكي (BankAccount).
 * ملاحظة: النظام يدعم حساباً بنكياً واحداً فقط (متطلب من الذاكرة).
 */

import { z } from 'zod';

/**
 * مخطط إنشاء حساب بنكي.
 * - bankName إلزامي
 * - accountNumber إلزامي وفريد
 * - accountName إلزامي (اسم صاحب الحساب)
 * - currency ثابت SDG
 */
export const createBankAccountSchema = z.object({
  bankName: z
    .string()
    .trim()
    .min(2, 'اسم البنك يجب أن يكون حرفين على الأقل')
    .max(100, 'اسم البنك طويل جداً'),
  accountNumber: z
    .string()
    .trim()
    .min(5, 'رقم الحساب يجب أن يكون 5 أرقام على الأقل')
    .max(50, 'رقم الحساب طويل جداً'),
  accountName: z
    .string()
    .trim()
    .min(2, 'اسم صاحب الحساب مطلوب')
    .max(100),
  branch: z.string().trim().max(100).optional().nullable(),
  iban: z.string().trim().max(34).optional().nullable(),
  swift: z.string().trim().max(11).optional().nullable(),
  currency: z.literal('SDG').default('SDG'), // ثابت
  openingBalance: z.coerce.number().min(0).default(0),
  isActive: z.coerce.boolean().default(true),
  notes: z.string().trim().max(1000).optional().nullable(),
});

/**
 * مخطط تحديث الحساب البنكي.
 */
export const updateBankAccountSchema = z
  .object({
    bankName: z.string().trim().min(2).max(100).optional(),
    accountNumber: z.string().trim().min(5).max(50).optional(),
    accountName: z.string().trim().min(2).max(100).optional(),
    branch: z.string().trim().max(100).optional().nullable(),
    iban: z.string().trim().max(34).optional().nullable(),
    swift: z.string().trim().max(11).optional().nullable(),
    isActive: z.coerce.boolean().optional(),
    notes: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'يجب إرسال حقل واحد على الأقل للتحديث',
  });

/**
 * مخطط فلترة القائمة.
 */
export const listBankAccountsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  isActive: z.enum(['true', 'false', 'all']).default('all'),
});