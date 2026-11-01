/**
 * @file settingsValidator.js
 * @description مخططات Zod لتحديث إعدادات النظام.
 *
 * ⚠️ كل قسم اختياري كلياً — يمكن إرسال قسم واحد فقط في PATCH.
 * ⚠️ كل حقل داخل القسم اختياري — partial update.
 */

import { z } from 'zod';

// ─── قواعد مشتركة ───
const stringMax = (max) => z.string().trim().max(max);
const emailRule = z.string().trim().email('صيغة البريد غير صحيحة.').or(z.literal(''));

// ─── 1. الشركة ───
const companySchema = z
  .object({
    name: stringMax(200),
    nameEn: stringMax(200),
    phone: stringMax(50),
    email: emailRule,
    address: stringMax(500),
    taxNumber: stringMax(100),
    registrationNumber: stringMax(100),
    logoUrl: stringMax(500),
  })
  .partial()
  .optional();

// ─── 2. العملة ───
const currencySchema = z
  .object({
    code: z.literal('SDG'),
    symbol: stringMax(10),
    decimals: z.coerce.number().int().min(0).max(4),
  })
  .partial()
  .optional();

// ─── 3. الموقع ───
const localeSchema = z
  .object({
    language: z.literal('ar'),
    direction: z.literal('rtl'),
    calendar: z.literal('gregorian'),
    numerals: z.literal('latin'),
    timezone: stringMax(100),
  })
  .partial()
  .optional();

// ─── 4. المبيعات (مع البادئات) ───
const prefixesSchema = z
  .object({
    invoice: stringMax(20),
    deliveryNote: stringMax(20),
    customerReturn: stringMax(20),
    purchaseReceipt: stringMax(20),
    supplierReturn: stringMax(20),
    cashTransaction: stringMax(20),
    salesRepTransaction: stringMax(20),
    check: stringMax(20),
  })
  .partial()
  .optional();

const salesSchema = z
  .object({
    prefixes: prefixesSchema,
    defaultTaxRate: z.coerce.number().min(0).max(100),
    returnGracePeriodDays: z.coerce.number().int().min(0).max(90),
    defaultPaymentTerms: z.coerce.number().int().min(0).max(365),
    allowNegativeStock: z.boolean(),
    minMarginPercent: z.coerce.number().min(0).max(100),
    maxDiscountPercent: z.coerce.number().min(0).max(100),
    allowPriceOverrides: z.boolean(),
    nearExpiryThresholdDays: z.coerce.number().int().min(1).max(365),
    nearExpiryMaxDiscountPercent: z.coerce.number().min(0).max(100),
  })
  .partial()
  .optional();

// ─── 5. المخزون ───
const inventorySchema = z
  .object({
    issuePolicy: z.literal('FEFO'),
    expiryWarningDays: z.coerce.number().int().min(1).max(365),
    reorderWarningEnabled: z.boolean(),
  })
  .partial()
  .optional();

// ─── 6. المالية ───
const financeSchema = z
  .object({
    checkReminderDays: z.coerce.number().int().min(0).max(30),
    invoiceReminderDays: z.coerce.number().int().min(0).max(30),
    remindersEnabled: z.boolean(),
  })
  .partial()
  .optional();

// ─── 7. الأمان ───
const securitySchema = z
  .object({
    sessionHours: z.coerce.number().int().min(1).max(72),
    idleTimeoutMinutes: z.coerce.number().int().min(5).max(240),
    maxFailedLogins: z.coerce.number().int().min(3).max(20),
    lockDurationMinutes: z.coerce.number().int().min(1).max(1440),
    passwordMinLength: z.coerce.number().int().min(6).max(32),
  })
  .partial()
  .optional();

// ─── 8. سجل التدقيق ───
const auditSchema = z
  .object({
    retentionDays: z.coerce.number().int().min(30).max(3650),
  })
  .partial()
  .optional();

// ─── 9. الطباعة ───
const printSchema = z
  .object({
    showLogoWatermark: z.boolean(),
    watermarkOpacity: z.coerce.number().min(0).max(0.5),
    invoiceHeader: stringMax(500),
    invoiceFooter: stringMax(500),
  })
  .partial()
  .optional();

// ─── المخطط الرئيسي ───
export const updateSettingsSchema = z
  .object({
    company: companySchema,
    currency: currencySchema,
    locale: localeSchema,
    sales: salesSchema,
    inventory: inventorySchema,
    finance: financeSchema,
    security: securitySchema,
    audit: auditSchema,
    print: printSchema,
  })
  .refine(
    (data) => Object.keys(data).some((k) => data[k] !== undefined),
    { message: 'لا توجد حقول للتحديث.' }
  );

export default { updateSettingsSchema };