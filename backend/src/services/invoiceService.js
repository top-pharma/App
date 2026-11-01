/**
 * @file invoiceService.js
 * @description
 * منطق الفواتير (Invoice) — نقدي / آجل / أقساط.
 *
 * Phase 2: إنشاء، اعتماد، دفع، إلغاء، عمولة، FEFO.
 * Phase 2.5: مسودات (draft)، تقييد أسعار، إصلاح double-deduction.
 * Phase 3: ربط بصندوق نقدي (cashFundId)، قيود محاسبية تلقائية، COGS.
 *
 * المبادئ:
 *  - كل فاتورة نقدية/جزئية → CashTransaction + SALE_CASH entry + COGS entry.
 *  - كل فاتورة آجلة → SALE_CREDIT entry + تحديث Customer.currentBalance.
 *  - لا نخصم Stock إذا Invoice.deliveryNote موجود (مخصوم في الإيصال).
 *  - العمولة تُحسب عند الاعتماد فقط.
 *  - القيود immutable — الإلغاء يُنشئ قيوداً عكسية.
 */

import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import Customer from '../models/Customer.js';
import Item from '../models/Item.js';
import DeliveryNote from '../models/DeliveryNote.js';
import Commission from '../models/Commission.js';
import SalesRepTransaction from '../models/SalesRepTransaction.js';
import cashService from './cashService.js';
import accountingService from './accountingService.js';
import priceValidationService from './priceValidationService.js';
import { issueStock, returnStock } from './stockService.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { AUDIT_ACTIONS } from '../utils/constants.js';
import logger from '../utils/logger.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/* ─────────────────────────────────────────────────────────────
 * 1) Helpers
 * ───────────────────────────────────────────────────────────── */

/**
 * يُولّد رقم فاتورة فريد: INV-YYYYMM-000001
 * @returns {Promise<string>}
 */
const generateInvoiceNumber = async () => {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `INV-${yyyymm}-`;

  const lastInvoice = await Invoice.findOne({
    invoiceNumber: { $regex: `^${prefix}` },
  })
    .sort({ invoiceNumber: -1 })
    .select('invoiceNumber')
    .lean();

  let sequence = 1;
  if (lastInvoice?.invoiceNumber) {
    const lastSeq = parseInt(lastInvoice.invoiceNumber.split('-')[2], 10);
    if (!Number.isNaN(lastSeq)) sequence = lastSeq + 1;
  }

  return `${prefix}${String(sequence).padStart(6, '0')}`;
};

/**
 * يحسب المجاميع من items + discount + taxRate.
 * @param {Array} items
 * @param {number} discount - قيمة الخصم (مبلغ ثابت)
 * @param {number} taxRate - نسبة الضريبة (0-100)
 * @returns {{ subtotal, discountAmount, taxAmount, total }}
 */
const calculateTotals = (items, discount = 0, taxRate = 0) => {
  const subtotal = round2(
    items.reduce((sum, it) => sum + Number(it.unitPrice) * Number(it.quantity), 0)
  );
  const discountAmount = round2(Number(discount) || 0);
  const taxableAmount = round2(subtotal - discountAmount);
  const taxAmount = round2(taxableAmount * (Number(taxRate) / 100));
  const total = round2(taxableAmount + taxAmount);
  return { subtotal, discountAmount, taxAmount, total };
};

/**
 * يحسب تكلفة البضاعة المباعة من الدفعات المصروفة.
 * @param {Array<{ quantity: number, unitCost: number }>} issuedLots
 * @returns {number}
 */
const calculateIssuedCost = (issuedLots) => {
  if (!Array.isArray(issuedLots)) return 0;
  return round2(
    issuedLots.reduce((sum, lot) => sum + Number(lot.unitCost || 0) * Number(lot.quantity || 0), 0)
  );
};

/**
 * يتحقق أن بنود الفاتورة متوافقة مع إيصال التسليم (لمنع double-deduction).
 * @param {string} deliveryNoteId
 * @param {Array} items
 * @returns {Promise<Object>} deliveryNote
 */
const validateDeliveryNoteItems = async (deliveryNoteId, items) => {
  const dn = await DeliveryNote.findById(deliveryNoteId);
  if (!dn) {
    throw new AppError('إيصال التسليم غير موجود', 404, 'DELIVERY_NOTE_NOT_FOUND');
  }

  // كل بند في الفاتورة يجب أن يكون موجوداً في الإيصال بنفس الكمية أو أقل
  for (const invItem of items) {
    const dnItem = dn.items.find(
      (d) => String(d.itemId) === String(invItem.itemId) &&
             String(d.batch) === String(invItem.batch)
    );
    if (!dnItem) {
      throw new AppError(
        `البند ${invItem.itemId} (دفعة ${invItem.batch}) غير موجود في إيصال التسليم`,
        400,
        'ITEM_NOT_IN_DELIVERY_NOTE'
      );
    }
    if (invItem.quantity > dnItem.quantity) {
      throw new AppError(
        `كمية ${invItem.itemId} تتجاوز كمية الإيصال (${invItem.quantity} > ${dnItem.quantity})`,
        400,
        'QUANTITY_EXCEEDS_DELIVERY_NOTE'
      );
    }
  }

  return dn;
};

/**
 * يتحقق من صحة كل بند سعراً وكمية.
 * @param {Array} items
 * @param {Object} overrides - { overrideReason, user }
 */
const validateItemsPrices = async (items, { overrideReason, user }) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('الفاتورة تحتاج بنداً واحداً على الأقل', 400, 'EMPTY_ITEMS');
  }

  for (const line of items) {
    if (!line.itemId || !line.quantity || line.quantity <= 0) {
      throw new AppError('بند غير صحيح (itemId/quantity)', 400, 'INVALID_LINE');
    }
    if (typeof line.unitPrice !== 'number' || line.unitPrice < 0) {
      throw new AppError('سعر البند غير صحيح', 400, 'INVALID_UNIT_PRICE');
    }
  }

  // تقييد الأسعار (Phase 2.5) — يُمرَّر للـ priceValidationService
  try {
    await priceValidationService.validateInvoicePrices({
      items,
      user,
      overrideReason,
    });
  } catch (err) {
    // إذا كان الخطأ من نوع PRICE_BELOW_MINIMUM يحتاج override
    throw err;
  }
};

/**
 * يتحقق من حد الائتمان للعميل (يُستخدم في finalize فقط).
 */
const validateCreditLimit = async (customer, newTotal) => {
  if (!customer.creditLimit || customer.creditLimit <= 0) return;

  const projected = round2((customer.currentBalance || 0) + newTotal);
  if (projected > customer.creditLimit) {
    throw new AppError(
      `تجاوز حد الائتمان. الحد: ${customer.creditLimit} SDG، المتوقع: ${projected} SDG`,
      400,
      'CREDIT_LIMIT_EXCEEDED'
    );
  }
};

/**
 * يُنشئ Commission + SalesRepTransaction عند الاعتماد.
 */
const createCommissionForInvoice = async (invoice, user) => {
  if (!invoice.salesRep || !invoice.items?.length) return null;

  const commissionDoc = await Commission.findOne({
    salesRep: invoice.salesRep,
    isActive: true,
  }).lean();

  if (!commissionDoc) return null;

  let totalCommission = 0;

  // baseCommission: نسبة أو مبلغ ثابت
  const base = commissionDoc.baseCommission || {};
  if (base.type === 'percentage') {
    totalCommission += round2((invoice.subtotal * base.value) / 100);
  } else if (base.type === 'fixed') {
    totalCommission += round2(base.value || 0);
  }

  // tiers: بونص متدرج على أساس المبيعات
  if (Array.isArray(commissionDoc.tiers)) {
    for (const tier of commissionDoc.tiers) {
      if (invoice.subtotal >= tier.minAmount && invoice.subtotal < (tier.maxAmount || Infinity)) {
        totalCommission += round2(tier.bonus || 0);
        break;
      }
    }
  }

  if (totalCommission <= 0) return null;

  const transaction = await SalesRepTransaction.create({
    salesRep: invoice.salesRep,
    type: 'commission',
    amount: totalCommission,
    direction: 'in',
    description: `عمولة فاتورة ${invoice.invoiceNumber}`,
    referenceType: 'Invoice',
    referenceId: invoice._id,
    transactionDate: new Date(),
    createdBy: user?._id || null,
  });

  invoice.commission = {
    amount: totalCommission,
    transactionId: transaction._id,
    calculatedAt: new Date(),
  };
  await invoice.save();

  return transaction;
};

/* ─────────────────────────────────────────────────────────────
 * 2) createInvoice — إنشاء فاتورة مباشرة (بلا مسودة)
 * ─────────────────────────────────────────────────────────────
 * @param {Object} params
 * @param {Object} params.body
 * @param {Object} params.user - req.user
 * @param {Object} [params.scope] - req.scope
 * @returns {Promise<Object>}
 */
export const createInvoice = async ({ body, user, scope }) => {
  const {
    pharmacy,
    salesRep,
    warehouse,
    items,
    discount = 0,
    taxRate = 0,
    paymentType,
    dueDate,
    totalInstallments,
    paidAmount = 0,
    paymentMethod,
    overrideReason,
    cashFundId,
    bankAccountId,
    deliveryNoteId,
    notes,
  } = body;

  // ─── 1) التحقق من الصيدلية ───
  if (!pharmacy) throw new AppError('الصيدلية مطلوبة', 400, 'MISSING_PHARMACY');
  const customer = await Customer.findById(pharmacy);
  if (!customer) throw new AppError('الصيدلية غير موجودة', 404, 'CUSTOMER_NOT_FOUND');
  if (!customer.isActive) throw new AppError('الصيدلية غير نشطة', 403, 'CUSTOMER_INACTIVE');
  if (customer.isBlocked) throw new AppError('الصيدلية محظورة', 403, 'CUSTOMER_BLOCKED');

  // ─── 2) التحقق من المخزن ───
  if (!warehouse) throw new AppError('المخزن مطلوب', 400, 'MISSING_WAREHOUSE');

  // ─── 3) التحقق من نوع الدفع ───
  if (!['cash', 'credit', 'installments'].includes(paymentType)) {
    throw new AppError('نوع الدفع غير صحيح', 400, 'INVALID_PAYMENT_TYPE');
  }
  if (paymentType === 'credit' && !dueDate) {
    throw new AppError('تاريخ الاستحقاق مطلوب للفاتورة الآجلة', 400, 'MISSING_DUE_DATE');
  }
  if (paymentType === 'installments' && (!totalInstallments || totalInstallments < 2)) {
    throw new AppError('عدد الأقساط يجب أن يكون 2 على الأقل', 400, 'INVALID_INSTALLMENTS');
  }

  // ─── 4) التحقق من الأسعار ───
  await validateItemsPrices(items, { overrideReason, user });

  // ─── 5) حساب المجاميع ───
  const { subtotal, discountAmount, taxAmount, total } = calculateTotals(items, discount, taxRate);

  // ─── 6) التحقق من حد الائتمان (إن آجل/أقساط) ───
  if (paymentType !== 'cash') {
    await validateCreditLimit(customer, total - paidAmount);
  }

  // ─── 7) فحص إيصال التسليم + خصم Stock ───
  let issuedLots = [];
  if (deliveryNoteId) {
    // منع double-deduction: نتحقق فقط
    await validateDeliveryNoteItems(deliveryNoteId, items);
    // لا نخصم Stock — مخصوم في الإيصال
  } else {
    // نخصم Stock عبر FEFO
    try {
      issuedLots = await issueStock({
        items: items.map((it) => ({
          itemId: it.itemId,
          warehouseId: warehouse,
          quantity: it.quantity,
          batch: it.batch, // إن محدد
        })),
        user,
      });
    } catch (err) {
      throw new AppError(`فشل صرف المخزون: ${err.message}`, 400, 'STOCK_ISSUE_FAILED');
    }
  }

  // ─── 8) حساب COGS ───
  const costAmount = calculateIssuedCost(issuedLots);

  // ─── 9) توليد رقم الفاتورة ───
  const invoiceNumber = await generateInvoiceNumber();

  // ─── 10) إنشاء الفاتورة ───
  let invoice;
  try {
    invoice = await Invoice.create({
      invoiceNumber,
      pharmacy,
      salesRep: salesRep || null,
      warehouse,
      items,
      subtotal,
      discountAmount,
      taxRate,
      taxAmount,
      total,
      paidAmount: round2(paidAmount),
      paymentType,
      dueDate: dueDate || null,
      totalInstallments: totalInstallments || null,
      paymentMethod: paymentMethod || null,
      deliveryNote: deliveryNoteId || null,
      status: 'pending',
      notes,
      createdBy: user?._id || null,
      ...(overrideReason && { overrideReason, overrideBy: user?._id }),
    });
  } catch (err) {
    // Rollback stock
    if (issuedLots.length > 0) {
      try {
        await returnStock({ issuedLots, user });
      } catch (rbErr) {
        logger.error(`[invoiceService] فشل Rollback المخزون: ${rbErr.message}`);
      }
    }
    throw err;
  }

  // ─── 11) إنشاء القيود المحاسبية + الحركة النقدية ───
  try {
    const remaining = round2(total - paidAmount);

    if (paidAmount > 0) {
      // حركة نقدية (فقط إذا لم يكن من إيصال تسليم — الإيصال أنشأها)
      if (!deliveryNoteId) {
        await cashService.createCashTransaction({
          direction: 'in',
          amount: paidAmount,
          method: paymentMethod || 'cash',
          cashFundId: paymentMethod === 'cash' ? cashFundId : null,
          bankAccountId: paymentMethod === 'bank' ? bankAccountId : null,
          transactionDate: new Date(),
          description: `دفعة فاتورة ${invoiceNumber}`,
          referenceType: 'invoice',
          referenceId: invoice._id,
          user,
          skipEntry: true, // سنُنشئ SALE_CASH يدوياً مع COGS
        });
      }

      // SALE_CASH + COGS entry
      await accountingService.createSaleCashEntry({
        amount: paidAmount,
        costAmount,
        date: new Date(),
        sourceType: 'Invoice',
        sourceId: invoice._id,
        cashFundId: paymentMethod === 'cash' ? cashFundId : null,
        user,
        description: `بيع نقدي — ${invoiceNumber}`,
      });
    }

    if (remaining > 0 && paymentType !== 'cash') {
      // SALE_CREDIT entry (بدون COGS لأنها سُجّلت أعلاه)
      await accountingService.createSaleCreditEntry({
        amount: remaining,
        costAmount: paidAmount > 0 ? 0 : costAmount, // إذا لم يدفع شيء، COGS هنا
        date: new Date(),
        sourceType: 'Invoice',
        sourceId: invoice._id,
        user,
        description: `بيع آجل — ${invoiceNumber}`,
      });

      // تحديث رصيد العميل
      await Customer.updateOne(
        { _id: pharmacy },
        { $inc: { currentBalance: remaining } }
      );
    }

    // إذا لم يدفع شيئاً وكان نقدياً (paidAmount=0, paymentType=cash) — نعتبرها آجلة
    if (paidAmount === 0 && paymentType === 'cash') {
      await accountingService.createSaleCreditEntry({
        amount: total,
        costAmount,
        date: new Date(),
        sourceType: 'Invoice',
        sourceId: invoice._id,
        user,
        description: `بيع (لم يُدفع) — ${invoiceNumber}`,
      });
      await Customer.updateOne(
        { _id: pharmacy },
        { $inc: { currentBalance: total } }
      );
    }
  } catch (err) {
    // Rollback: حذف الفاتورة + إرجاع Stock
    try {
      await Invoice.deleteOne({ _id: invoice._id });
      if (issuedLots.length > 0) {
        await returnStock({ issuedLots, user });
      }
    } catch (rbErr) {
      logger.error(`[invoiceService] Rollback فشل: ${rbErr.message}`);
    }
    throw err;
  }

  // ─── 12) تحديث الحالة ───
  if (paidAmount >= total - 0.01) invoice.status = 'paid';
  else if (paidAmount > 0) invoice.status = 'partial';
  else if (paymentType === 'cash') invoice.status = 'pending';
  await invoice.save();

  // ─── 13) Commission ───
  await createCommissionForInvoice(invoice, user);

  // ─── 14) Audit ───
  await logAuditEvent({
    req: { user },
    action: AUDIT_ACTIONS.CREATE,
    resource: 'Invoice',
    resourceId: invoice._id,
    description: `إنشاء فاتورة ${invoiceNumber} — ${total} SDG`,
    success: true,
    meta: {
      after: invoice.toObject(),
      override: overrideReason ? { reason: overrideReason, by: user?._id } : null,
    },
  });

  logger.info(`[invoiceService] فاتورة ${invoiceNumber} — ${total} SDG`);

  return invoice;
};

/* ─────────────────────────────────────────────────────────────
 * 3) createDraft — إنشاء مسودة (Phase 2.5)
 * ─────────────────────────────────────────────────────────────
 * لا حركة نقدية، لا قيد، لا stock، لا credit check.
 */
export const createDraft = async ({ body, user, scope }) => {
  const { pharmacy, salesRep, warehouse, items, discount = 0, taxRate = 0, notes } = body;

  if (!pharmacy) throw new AppError('الصيدلية مطلوبة', 400, 'MISSING_PHARMACY');
  const customer = await Customer.findById(pharmacy);
  if (!customer) throw new AppError('الصيدلية غير موجودة', 404, 'CUSTOMER_NOT_FOUND');
  if (!customer.isActive) throw new AppError('الصيدلية غير نشطة', 403, 'CUSTOMER_INACTIVE');

  if (!warehouse) throw new AppError('المخزن مطلوب في المسودة', 400, 'MISSING_WAREHOUSE');
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('المسودة تحتاج بنداً واحداً على الأقل', 400, 'EMPTY_ITEMS');
  }

  const { subtotal, discountAmount, taxAmount, total } = calculateTotals(items, discount, taxRate);
  const invoiceNumber = await generateInvoiceNumber();

  const draft = await Invoice.create({
    invoiceNumber,
    pharmacy,
    salesRep: salesRep || null,
    warehouse,
    items,
    subtotal,
    discountAmount,
    taxRate,
    taxAmount,
    total,
    paidAmount: 0,
    paymentType: null,
    status: 'draft',
    notes,
    createdBy: user?._id || null,
  });

  await logAuditEvent({
    req: { user },
    action: AUDIT_ACTIONS.CREATE,
    resource: 'Invoice',
    resourceId: draft._id,
    description: `إنشاء مسودة ${invoiceNumber}`,
    success: true,
    meta: { after: draft.toObject() },
  });

  return draft;
};

/* ─────────────────────────────────────────────────────────────
 * 4) updateDraft — تعديل مسودة
 * ─────────────────────────────────────────────────────────────
 * pharmacy ثابت — لا يمكن تغييره.
 */
export const updateDraft = async ({ invoiceId, body, user, scope }) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new AppError('الفاتورة غير موجودة', 404, 'INVOICE_NOT_FOUND');
  if (invoice.status !== 'draft') {
    throw new AppError('يمكن تعديل المسودات فقط', 400, 'NOT_A_DRAFT');
  }

  const { items, discount, taxRate, notes, salesRep, warehouse } = body;

  // pharmacy ثابت — نرفض تغييره
  if (body.pharmacy && String(body.pharmacy) !== String(invoice.pharmacy)) {
    throw new AppError('لا يمكن تغيير الصيدلية بعد الإنشاء', 400, 'PHARMACY_IMMUTABLE');
  }

  if (warehouse) invoice.warehouse = warehouse;
  if (salesRep !== undefined) invoice.salesRep = salesRep;
  if (notes !== undefined) invoice.notes = notes;

  if (items) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('المسودة تحتاج بنداً واحداً على الأقل', 400, 'EMPTY_ITEMS');
    }
    invoice.items = items;
    const { subtotal, discountAmount, taxAmount, total } = calculateTotals(items, discount, taxRate);
    invoice.subtotal = subtotal;
    invoice.discountAmount = discountAmount;
    invoice.taxRate = taxRate || 0;
    invoice.taxAmount = taxAmount;
    invoice.total = total;
  }

  await invoice.save();

  await logAuditEvent({
    req: { user },
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Invoice',
    resourceId: invoice._id,
    description: `تعديل مسودة ${invoice.invoiceNumber}`,
    success: true,
    meta: { after: invoice.toObject() },
  });

  return invoice;
};

/* ─────────────────────────────────────────────────────────────
 * 5) finalizeInvoice — اعتماد مسودة (Phase 2.5 + 3)
 * ─────────────────────────────────────────────────────────────
 * هذا هو الحدث الذي "يفعّل" كل شيء:
 *  - فحص الائتمان
 *  - خصم Stock (إلا إذا deliveryNote)
 *  - CashTransaction
 *  - AccountingEntry
 *  - Commission
 *  - تحديث رصيد العميل
 */
export const finalizeInvoice = async ({ invoiceId, body, user, scope }) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new AppError('الفاتورة غير موجودة', 404, 'INVOICE_NOT_FOUND');
  if (invoice.status !== 'draft') {
    throw new AppError('يمكن اعتماد المسودات فقط', 400, 'NOT_A_DRAFT');
  }

  const {
    paymentType,
    dueDate,
    totalInstallments,
    paidAmount = 0,
    paymentMethod,
    overrideReason,
    cashFundId,
    bankAccountId,
  } = body;

  // ─── 1) التحقق ───
  if (!['cash', 'credit', 'installments'].includes(paymentType)) {
    throw new AppError('نوع الدفع غير صحيح', 400, 'INVALID_PAYMENT_TYPE');
  }
  if (paymentType === 'credit' && !dueDate) {
    throw new AppError('تاريخ الاستحقاق مطلوب', 400, 'MISSING_DUE_DATE');
  }
  if (paymentType === 'installments' && (!totalInstallments || totalInstallments < 2)) {
    throw new AppError('عدد الأقساط يجب أن يكون 2 على الأقل', 400, 'INVALID_INSTALLMENTS');
  }

  // ─── 2) التحقق من حد الائتمان ───
  const customer = await Customer.findById(invoice.pharmacy);
  if (paymentType !== 'cash') {
    await validateCreditLimit(customer, invoice.total - paidAmount);
  }

  // ─── 3) التحقق من الأسعار (مع overrideReason إن وُجد) ───
  await validateItemsPrices(invoice.items, { overrideReason, user });

  // ─── 4) خصم Stock (إلا إذا deliveryNote) ───
  let issuedLots = [];
  if (invoice.deliveryNote) {
    await validateDeliveryNoteItems(invoice.deliveryNote, invoice.items);
  } else {
    try {
      issuedLots = await issueStock({
        items: invoice.items.map((it) => ({
          itemId: it.itemId,
          warehouseId: invoice.warehouse,
          quantity: it.quantity,
          batch: it.batch,
        })),
        user,
      });
    } catch (err) {
      throw new AppError(`فشل صرف المخزون: ${err.message}`, 400, 'STOCK_ISSUE_FAILED');
    }
  }

  const costAmount = calculateIssuedCost(issuedLots);

  // ─── 5) تحديث الفاتورة ───
  invoice.paymentType = paymentType;
  invoice.dueDate = dueDate || null;
  invoice.totalInstallments = totalInstallments || null;
  invoice.paidAmount = round2(paidAmount);
  invoice.paymentMethod = paymentMethod || null;
  invoice.finalizedBy = user?._id || null;
  invoice.finalizedAt = new Date();
  if (overrideReason) {
    invoice.overrideReason = overrideReason;
    invoice.overrideBy = user?._id || null;
  }
  await invoice.save();

  // ─── 6) القيود + الحركة النقدية ───
  try {
    const remaining = round2(invoice.total - paidAmount);

    if (paidAmount > 0) {
      if (!invoice.deliveryNote) {
        await cashService.createCashTransaction({
          direction: 'in',
          amount: paidAmount,
          method: paymentMethod || 'cash',
          cashFundId: paymentMethod === 'cash' ? cashFundId : null,
          bankAccountId: paymentMethod === 'bank' ? bankAccountId : null,
          transactionDate: new Date(),
          description: `دفعة فاتورة ${invoice.invoiceNumber}`,
          referenceType: 'invoice',
          referenceId: invoice._id,
          user,
          skipEntry: true,
        });
      }
      await accountingService.createSaleCashEntry({
        amount: paidAmount,
        costAmount,
        date: new Date(),
        sourceType: 'Invoice',
        sourceId: invoice._id,
        cashFundId: paymentMethod === 'cash' ? cashFundId : null,
        user,
        description: `بيع نقدي — ${invoice.invoiceNumber}`,
      });
    }

    if (remaining > 0 && paymentType !== 'cash') {
      await accountingService.createSaleCreditEntry({
        amount: remaining,
        costAmount: paidAmount > 0 ? 0 : costAmount,
        date: new Date(),
        sourceType: 'Invoice',
        sourceId: invoice._id,
        user,
        description: `بيع آجل — ${invoice.invoiceNumber}`,
      });
      await Customer.updateOne(
        { _id: invoice.pharmacy },
        { $inc: { currentBalance: remaining } }
      );
    }

    if (paidAmount === 0 && paymentType === 'cash') {
      await accountingService.createSaleCreditEntry({
        amount: invoice.total,
        costAmount,
        date: new Date(),
        sourceType: 'Invoice',
        sourceId: invoice._id,
        user,
        description: `بيع (لم يُدفع) — ${invoice.invoiceNumber}`,
      });
      await Customer.updateOne(
        { _id: invoice.pharmacy },
        { $inc: { currentBalance: invoice.total } }
      );
    }
  } catch (err) {
    // Rollback: نرجع الحالة draft + نرجع Stock
    invoice.status = 'draft';
    await invoice.save();
    if (issuedLots.length > 0) {
      try { await returnStock({ issuedLots, user }); } catch (_) {}
    }
    throw err;
  }

  // ─── 7) تحديث الحالة ───
  if (paidAmount >= invoice.total - 0.01) invoice.status = 'paid';
  else if (paidAmount > 0) invoice.status = 'partial';
  else invoice.status = 'pending';
  await invoice.save();

  // ─── 8) Commission ───
  await createCommissionForInvoice(invoice, user);

  // ─── 9) Audit ───
  await logAuditEvent({
    req: { user },
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Invoice',
    resourceId: invoice._id,
    description: `اعتماد فاتورة ${invoice.invoiceNumber}`,
    success: true,
    meta: { after: invoice.toObject() },
  });

  return invoice;
};

/* ─────────────────────────────────────────────────────────────
 * 6) registerPayment — دفعة على فاتورة قائمة
 * ─────────────────────────────────────────────────────────────
 */
export const registerPayment = async ({
  invoiceId,
  amount,
  paymentMethod,
  cashFundId,
  bankAccountId,
  user,
  scope,
}) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new AppError('الفاتورة غير موجودة', 404, 'INVOICE_NOT_FOUND');
  if (invoice.status === 'draft') {
    throw new AppError('لا يمكن الدفع على مسودة', 409, 'INVOICE_IS_DRAFT');
  }
  if (invoice.status === 'cancelled') {
    throw new AppError('الفاتورة ملغاة', 409, 'INVOICE_CANCELLED');
  }
  if (invoice.status === 'paid') {
    throw new AppError('الفاتورة مدفوعة بالكامل', 409, 'INVOICE_ALREADY_PAID');
  }

  const remaining = round2(invoice.total - invoice.paidAmount);
  if (amount > remaining + 0.01) {
    throw new AppError(
      `المبلغ يتجاوز المتبقي (${remaining} SDG)`,
      400,
      'AMOUNT_EXCEEDS_REMAINING'
    );
  }

  // ─── 1) CashTransaction + CUSTOMER_PAYMENT entry ───
  await cashService.createCashTransaction({
    direction: 'in',
    amount,
    method: paymentMethod || 'cash',
    cashFundId: paymentMethod === 'cash' ? cashFundId : null,
    bankAccountId: paymentMethod === 'bank' ? bankAccountId : null,
    transactionDate: new Date(),
    description: `دفعة على فاتورة ${invoice.invoiceNumber}`,
    referenceType: 'invoice',
    referenceId: invoice._id,
    user,
    skipEntry: true,
  });

  await accountingService.createCustomerPaymentEntry({
    amount,
    paymentMethod: paymentMethod || 'cash',
    date: new Date(),
    sourceType: 'Invoice',
    sourceId: invoice._id,
    cashFundId: paymentMethod === 'cash' ? cashFundId : null,
    bankAccountId: paymentMethod === 'bank' ? bankAccountId : null,
    user,
    description: `تحصيل دفعة — ${invoice.invoiceNumber}`,
  });

  // ─── 2) تحديث الفاتورة ───
  invoice.paidAmount = round2(invoice.paidAmount + amount);
  if (invoice.paidAmount >= invoice.total - 0.01) {
    invoice.status = 'paid';
  } else {
    invoice.status = 'partial';
  }
  await invoice.save();

  // ─── 3) تحديث رصيد العميل ───
  await Customer.updateOne(
    { _id: invoice.pharmacy },
    { $inc: { currentBalance: -amount } }
  );

  // ─── 4) Audit ───
  await logAuditEvent({
    req: { user },
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Invoice',
    resourceId: invoice._id,
    description: `دفعة ${amount} SDG على ${invoice.invoiceNumber}`,
    success: true,
  });

  return invoice;
};

/* ─────────────────────────────────────────────────────────────
 * 7) cancelInvoice — إلغاء فاتورة
 * ─────────────────────────────────────────────────────────────
 * - إذا كانت مدفوعة (paidAmount > 0): منع الإلغاء (استخدم مرتجع بدلاً)
 * - إذا كانت draft: حذف بسيط
 * - إذا كانت pending/partial: عكس Stock + عكس القيود
 */
export const cancelInvoice = async ({ invoiceId, reason, user, scope }) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new AppError('الفاتورة غير موجودة', 404, 'INVOICE_NOT_FOUND');
  if (invoice.status === 'cancelled') {
    throw new AppError('الفاتورة ملغاة مسبقاً', 409, 'ALREADY_CANCELLED');
  }
  if (invoice.paidAmount > 0) {
    throw new AppError(
      'لا يمكن إلغاء فاتورة مدفوعة — استخدم مرتجع بيع بدلاً',
      409,
      'INVOICE_HAS_PAYMENTS'
    );
  }

  // ─── 1) عكس Stock (إلا إذا deliveryNote) ───
  if (!invoice.deliveryNote && invoice.items?.length > 0) {
    try {
      // نرجع المخزون عبر returnStock (upsert)
      await returnStock({
        issuedLots: invoice.items.map((it) => ({
          itemId: it.itemId,
          warehouseId: invoice.warehouse,
          batch: it.batch,
          quantity: it.quantity,
          unitCost: it.unitCost || 0,
        })),
        user,
      });
    } catch (err) {
      logger.warn(`[invoiceService] فشل إرجاع Stock: ${err.message}`);
    }
  }

  // ─── 2) عكس رصيد العميل (إن آجل/أقساط) ───
  const remaining = round2(invoice.total - invoice.paidAmount);
  if (remaining > 0 && invoice.paymentType !== 'cash') {
    await Customer.updateOne(
      { _id: invoice.pharmacy },
      { $inc: { currentBalance: -remaining } }
    );
  }

  // ─── 3) عكس القيود ───
  try {
    const entries = await accountingService.getEntriesBySource({
      sourceType: 'Invoice',
      sourceId: invoice._id,
    });
    for (const entry of entries) {
      await accountingService.reverseEntry({
        entryId: entry._id,
        user,
        reason: `إلغاء فاتورة ${invoice.invoiceNumber}: ${reason || ''}`.trim(),
      });
    }
  } catch (err) {
    logger.warn(`[invoiceService] فشل عكس قيود الفاتورة: ${err.message}`);
  }

  // ─── 4) تحديث الحالة ───
  invoice.status = 'cancelled';
  invoice.cancelledAt = new Date();
  invoice.cancelledBy = user?._id || null;
  invoice.cancelReason = reason || '';
  await invoice.save();

  // ─── 5) Audit ───
  await logAuditEvent({
    req: { user },
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Invoice',
    resourceId: invoice._id,
    description: `إلغاء فاتورة ${invoice.invoiceNumber} — ${reason || ''}`,
    success: true,
  });

  return invoice;
};

export default {
  createInvoice,
  createDraft,
  updateDraft,
  finalizeInvoice,
  registerPayment,
  cancelInvoice,
};