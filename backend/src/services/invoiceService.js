/**
 * @file invoiceService.js
 * @description
 * منطق الفواتير (Invoice) — نقدي / آجل / أقساط.
 *
 * Phase 2: إنشاء، اعتماد، دفع، إلغاء، عمولة، FEFO.
 * Phase 2.5: مسودات (draft)، تقييد أسعار، إصلاح double-deduction.
 * Phase 3: ربط بصندوق نقدي (cashFundId)، قيود محاسبية تلقائية، COGS.
 * Phase A (2026-11-07): إصلاح 7 تناقضات (A1-A7):
 *   A1. issueStock({ items, user }) → bulkIssueStock({ warehouseId, lines }) + بناء items
 *   A2. returnStock({ issuedLots, user }) → returnStock({ itemId, warehouseId, batch, quantity, meta }) × N
 *   A3. validateInvoicePrices({ items, user, overrideReason }) → validateInvoicePrices({ items, warehouseId, req })
 *   A4. Invoice.create({ discountAmount }) → Invoice.create({ discount: { computedAmount } })
 *   A5. items[].itemId → items[].item (يخالف Invoice.js)
 *   A6. finalizeInvoice يستدعي issueStock — نفس A1
 *   A7. cancelInvoice يستدعي returnStock — نفس A2
 *
 * ✅ Phase A.10 (2026-11-08):
 *   - issueStockAndBuildItems يمرّر `batch` لكل سطر إلى bulkIssueStock (manual mode).
 *   - حذف التحقق المزدوج `if (line._requestedBatch)` — issueStock يتولاه.
 *
 * المبادئ:
 *  - كل فاتورة نقدية/جزئية → CashTransaction + SALE_CASH + COGS.
 *  - كل فاتورة آجلة → SALE_CREDIT + تحديث Customer.currentBalance.
 *  - لا نخصم Stock إذا Invoice.deliveryNote موجود (Phase 2.5 — سيبقى حتى 🅱).
 *  - العمولة تُحسب عند الاعتماد فقط.
 *  - القيود immutable — الإلغاء يُنشئ قيوداً عكسية.
 */

import Invoice from '../models/Invoice.js';
import Customer from '../models/Customer.js';
import Commission from '../models/Commission.js';
import SalesRepTransaction from '../models/SalesRepTransaction.js';
import cashService from './cashService.js';
import accountingService from './accountingService.js';
import priceValidationService from './priceValidationService.js';
import { bulkIssueStock, returnStock } from './stockService.js';
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
 */
const calculateTotals = (items, discountAmount = 0, taxRate = 0) => {
  const subtotal = round2(
    items.reduce((sum, it) => sum + Number(it.unitPrice) * Number(it.quantity), 0)
  );
  const discount = round2(Number(discountAmount) || 0);
  const taxableAmount = round2(subtotal - discount);
  const taxAmount = round2(taxableAmount * (Number(taxRate) / 100));
  const total = round2(taxableAmount + taxAmount);
  return { subtotal, discountAmount: discount, taxAmount, total };
};

/**
 * يحسب تكلفة البضاعة المباعة من الدفعات المصروفة.
 */
const calculateIssuedCost = (issuedLots) => {
  if (!Array.isArray(issuedLots)) return 0;
  return round2(
    issuedLots.reduce(
      (sum, lot) => sum + Number(lot.unitCost || 0) * Number(lot.quantity || 0),
      0
    )
  );
};

/**
 * A1 + Phase A.10: يصرف المخزون عبر bulkIssueStock ثم يبني invoice items الحقيقية.
 *
 * ✅ Phase A.10:
 *   - يمرّر `batch` (manual) أو `null` (FEFO) إلى bulkIssueStock.
 *   - حذف التحقق المزدوج `if (line._requestedBatch)` — issueStock يتولاه الآن.
 *
 * @param {Object} params
 * @param {Array} params.items - items الفاتورة (بعد Zod: [{ item, batch, quantity, unitPrice, unitCost }])
 * @param {string} params.warehouseId
 * @param {Object} params.user
 * @returns {Promise<{ issuedLots: Array, invoiceItems: Array }>}
 *   issuedLots: [{ stockId, batch, expiry, quantity, unitCost }] — مسطّحة، للـ rollback و COGS
 *   invoiceItems: [{ item, batch, expiry, quantity, unitPrice, total, unitCost }] — للفاتورة
 */
const issueStockAndBuildItems = async ({ items, warehouseId, user }) => {
  // ⚠️ Phase A.10: نبني lines لـ bulkIssueStock مع `batch` (manual) أو `null` (FEFO)
  const lines = items.map((it) => {
    // batch: 'FEFO-AUTO' → null (FEFO mode)
    // batch: 'BATCH-...' → 'BATCH-...' (manual mode)
    const requestedBatch =
      it.batch && it.batch !== 'FEFO-AUTO' ? String(it.batch).trim().toUpperCase() : null;

    return {
      itemId: it.item,        // A5: `item` (وليس `itemId`)
      quantity: Number(it.quantity),
      batch: requestedBatch,  // ⚠️ Phase A.10: batch محدد أو null
      _requestedUnitPrice: Number(it.unitPrice),
    };
  });

  // bulkIssueStock: [{ itemId, issuedBatches: [...] }]
  const bulkResult = await bulkIssueStock({
    warehouseId,
    lines: lines.map(({ itemId, quantity, batch }) => ({ itemId, quantity, batch })),
  });

  const issuedLots = [];
  const invoiceItems = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const result = bulkResult[i];
    const originalItem = items[i];

    const batches = Array.isArray(result?.issuedBatches) ? result.issuedBatches : [];

    if (batches.length === 0) {
      throw new AppError(
        `لم يتم صرف أي دفعة للصنف ${line.itemId}.`,
        400,
        'ISSUE_EMPTY'
      );
    }

    // ⚠️ Phase A.10: لا حاجة للتحقق من _requestedBatch هنا
    // لأن bulkIssueStock → issueStock(batch) يتحقق من:
    //   - وجود الدفعة (BATCH_NOT_AVAILABLE)
    //   - كفاية الكمية (BATCH_INSUFFICIENT)
    //   - الصلاحية (BATCH_EXPIRED)
    // التحقق المزدوج كان يسبب تناقضاً (FEFO vs manual).

    // نبني invoice item لكل دفعة مصروفة
    for (const b of batches) {
      const qty = Number(b.quantity);
      const unitCost = Number(b.unitCost || 0);
      const unitPrice = line._requestedUnitPrice;
      const lineTotal = round2(qty * unitPrice);

      issuedLots.push({
        stockId: b.stockId,
        itemId: line.itemId,
        batch: b.batch,
        expiry: b.expiry,
        quantity: qty,
        unitCost,
      });

      invoiceItems.push({
        item: line.itemId,
        batch: b.batch,
        expiry: b.expiry || null,
        quantity: qty,
        unit: originalItem.unit || '',
        unitPrice,
        total: lineTotal,
        unitCost,
      });
    }
  }

  return { issuedLots, invoiceItems };
};

/**
 * A2 fix: يُرجع الدفعات المصروفة عبر returnStock (× N).
 */
const rollbackIssuedLots = async ({ issuedLots, warehouseId, user }) => {
  if (!Array.isArray(issuedLots) || issuedLots.length === 0) return;
  for (const lot of issuedLots) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await returnStock({
        itemId: lot.itemId,
        warehouseId,
        batch: lot.batch,
        quantity: lot.quantity,
        meta: { unitCost: lot.unitCost, expiry: lot.expiry, notes: 'rollback' },
      });
    } catch (err) {
      logger.error(`[invoiceService] فشل Rollback للدفعة ${lot.batch}: ${err.message}`);
    }
  }
};

/**
 * يتحقق من حد الائتمان للعميل.
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
 * A3 fix: يتحقق من الأسعار عبر priceValidationService بالتواقيع الصحيحة.
 */
const validatePricesOrThrow = async ({ items, warehouseId, overrideReason, req }) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('الفاتورة تحتاج بنداً واحداً على الأقل', 400, 'EMPTY_ITEMS');
  }

  // التوقيع الصحيح: { items: [{ item, batch, unitPrice, quantity }], warehouseId, req }
  const lines = items.map((it) => ({
    item: it.item,
    batch: it.batch,
    unitPrice: Number(it.unitPrice),
    quantity: Number(it.quantity),
  }));

  const result = await priceValidationService.validateInvoicePrices({
    items: lines,
    warehouseId,
    req: req || { user: null, rolePermissions: [] },  // fail-safe
  });

  // أي بند BLOCKED → رفض
  const blocked = (result.results || []).filter((r) => r.status === 'BLOCKED');
  if (blocked.length > 0) {
    const first = blocked[0];
    throw new AppError(
      first.message || 'سعر أحد البنود غير مسموح.',
      400,
      'PRICE_BLOCKED'
    );
  }

  // أي بند WARN_OVERRIDE → يحتاج overrideReason
  if (result.needsOverride && (!overrideReason || overrideReason.trim().length < 5)) {
    throw new AppError(
      'أحد الأسعار أقل من الحد الموصى به. يجب إدخال سبب تجاوز (5 أحرف على الأقل).',
      400,
      'OVERRIDE_REASON_REQUIRED'
    );
  }

  return result;
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

  const base = commissionDoc.baseCommission || {};
  if (base.type === 'percentage') {
    totalCommission += round2((invoice.subtotal * base.value) / 100);
  } else if (base.type === 'fixed') {
    totalCommission += round2(base.value || 0);
  }

  if (Array.isArray(commissionDoc.tiers)) {
    for (const tier of commissionDoc.tiers) {
      if (
        invoice.subtotal >= tier.minAmount &&
        invoice.subtotal < (tier.maxAmount || Infinity)
      ) {
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
    rate: base.type === 'percentage' ? base.value : 0,
    amount: totalCommission,
    transactionId: transaction._id,
    calculatedAt: new Date(),
    isPaid: false,
  };
  await invoice.save();

  return transaction;
};

/**
 * A4 fix: يبني كائن discount المتوافق مع Invoice.js.
 */
const buildDiscountObject = ({ discount, computedAmount }) => {
  if (!discount) {
    return { type: null, value: 0, computedAmount: 0, freeItems: [] };
  }
  return {
    type: discount.type || null,
    value: Number(discount.value || 0),
    reason: discount.reason || '',
    approvedBy: discount.approvedBy || null,
    approvedAt: discount.approvedAt || null,
    computedAmount: round2(computedAmount || 0),
    freeItems: Array.isArray(discount.freeItems) ? discount.freeItems : [],
  };
};

/* ─────────────────────────────────────────────────────────────
 * 2) createInvoice — إنشاء فاتورة مباشرة
 * ───────────────────────────────────────────────────────────── */

/**
 * createInvoice — إنشاء فاتورة مباشرة (نقدي / آجل / أقساط).
 *
 * @param {Object} params
 * @param {Object} params.body
 * @param {Object} params.user
 * @param {Object} [params.req] - Express req (لـ priceValidationService + logAuditEvent)
 * @returns {Promise<Object>}
 */
export const createInvoice = async ({ body, user, req }) => {
  const {
    pharmacy,
    salesRep,
    warehouse,
    items,
    discount,
    taxRate = 0,
    paymentType,
    dueDate,
    totalInstallments,
    paidAmount = 0,
    paymentMethod,
    overrideReason,
    cashFundId,
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
  if (
    paymentType === 'installments' &&
    (!totalInstallments || totalInstallments < 2)
  ) {
    throw new AppError('عدد الأقساط يجب أن يكون 2 على الأقل', 400, 'INVALID_INSTALLMENTS');
  }

  // ─── 4) التحقق من الأسعار (A3) ───
  await validatePricesOrThrow({ items, warehouseId: warehouse, overrideReason, req });

  // ─── 5) صرف المخزون + بناء items الحقيقية (A1, A5, Phase A.4, Phase A.10) ───
  let issuedLots = [];
  let invoiceItems = [];

  try {
    const issueResult = await issueStockAndBuildItems({
      items,
      warehouseId: warehouse,
      user,
    });
    issuedLots = issueResult.issuedLots;
    invoiceItems = issueResult.invoiceItems;
  } catch (err) {
    throw new AppError(
      `فشل صرف المخزون: ${err.message}`,
      400,
      'STOCK_ISSUE_FAILED'
    );
  }

  // ─── 6) حساب المجاميع ───
  const { subtotal, discountAmount, taxAmount, total } = calculateTotals(
    invoiceItems,
    discount?.computedAmount || 0,
    taxRate
  );

  // ─── 7) التحقق من حد الائتمان ───
  if (paymentType !== 'cash') {
    await validateCreditLimit(customer, total - paidAmount);
  }

  // ─── 8) COGS ───
  const costAmount = calculateIssuedCost(issuedLots);

  // ─── 9) توليد رقم الفاتورة ───
  const invoiceNumber = await generateInvoiceNumber();

  // ─── 10) إنشاء الفاتورة (A4, A5) ───
  let invoice;
  try {
    invoice = await Invoice.create({
      invoiceNumber,
      pharmacy,
      salesRep: salesRep || null,
      warehouse,
      items: invoiceItems,
      subtotal,
      discount: buildDiscountObject({
        discount,
        computedAmount: discountAmount,
      }),
      taxRate,
      taxAmount,
      total,
      paidAmount: round2(paidAmount),
      remainingAmount: round2(total - paidAmount),
      paymentType,
      dueDate: dueDate || null,
      totalInstallments: totalInstallments || 0,
      paymentMethod: paymentMethod || '',
      status: 'pending',
      notes: notes || '',
      createdBy: user?._id || null,
    });
  } catch (err) {
    await rollbackIssuedLots({ issuedLots, warehouseId: warehouse, user });
    throw err;
  }

  // ─── 11) القيود + الحركة النقدية ───
  try {
    const remaining = round2(total - paidAmount);

    if (paidAmount > 0) {
      await cashService.createCashTransaction({
        direction: 'in',
        amount: paidAmount,
        method: paymentMethod || 'cash',
        cashFundId: paymentMethod === 'cash' ? cashFundId : null,
        bankAccountId: null,
        transactionDate: new Date(),
        description: `دفعة فاتورة ${invoiceNumber}`,
        referenceType: 'invoice',
        referenceId: invoice._id,
        user,
        skipEntry: true,
      });

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
      await accountingService.createSaleCreditEntry({
        amount: remaining,
        costAmount: paidAmount > 0 ? 0 : costAmount,
        date: new Date(),
        sourceType: 'Invoice',
        sourceId: invoice._id,
        user,
        description: `بيع آجل — ${invoiceNumber}`,
      });

      await Customer.updateOne(
        { _id: pharmacy },
        { $inc: { currentBalance: remaining } }
      );
    }

    // نقدي بلا دفع → نعتبرها آجلة
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
    try {
      await Invoice.deleteOne({ _id: invoice._id });
      await rollbackIssuedLots({ issuedLots, warehouseId: warehouse, user });
    } catch (rbErr) {
      logger.error(`[invoiceService] Rollback فشل: ${rbErr.message}`);
    }
    throw err;
  }

  // ─── 12) تحديث الحالة ───
  if (paidAmount >= total - 0.01) invoice.status = 'paid';
  else if (paidAmount > 0) invoice.status = 'partial';
  else invoice.status = 'pending';
  await invoice.save();

  // ─── 13) Commission ───
  await createCommissionForInvoice(invoice, user);

  // ─── 14) Audit ───
  await logAuditEvent({
    req: req || { user },
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
 * 3) createDraft — مسودة
 * ───────────────────────────────────────────────────────────── */
export const createDraft = async ({ body, user }) => {
  const { pharmacy, salesRep, warehouse, items, discount, taxRate = 0, notes } = body;

  if (!pharmacy) throw new AppError('الصيدلية مطلوبة', 400, 'MISSING_PHARMACY');
  const customer = await Customer.findById(pharmacy);
  if (!customer) throw new AppError('الصيدلية غير موجودة', 404, 'CUSTOMER_NOT_FOUND');
  if (!customer.isActive) throw new AppError('الصيدلية غير نشطة', 403, 'CUSTOMER_INACTIVE');

  if (!warehouse) throw new AppError('المخزن مطلوب في المسودة', 400, 'MISSING_WAREHOUSE');
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('المسودة تحتاج بنداً واحداً على الأقل', 400, 'EMPTY_ITEMS');
  }

  const draftItems = items.map((it) => ({
    item: it.item || it.itemId || it.item?._id,
    batch: it.batch,
    expiry: it.expiry || null,
    quantity: Number(it.quantity),
    unit: it.unit || '',
    unitPrice: Number(it.unitPrice),
    total: Number(it.total) || round2(Number(it.quantity) * Number(it.unitPrice)),
    unitCost: Number(it.unitCost || 0),
  }));

  const { subtotal, discountAmount, taxAmount, total } = calculateTotals(
    draftItems,
    discount?.computedAmount || 0,
    taxRate
  );
  const invoiceNumber = await generateInvoiceNumber();

  const draft = await Invoice.create({
    invoiceNumber,
    pharmacy,
    salesRep: salesRep || null,
    warehouse,
    items: draftItems,
    subtotal,
    discount: buildDiscountObject({ discount, computedAmount: discountAmount }),
    taxRate,
    taxAmount,
    total,
    paidAmount: 0,
    remainingAmount: total,
    paymentType: null,
    status: 'draft',
    notes: notes || '',
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
 * ───────────────────────────────────────────────────────────── */
export const updateDraft = async ({ invoiceId, body, user }) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new AppError('الفاتورة غير موجودة', 404, 'INVOICE_NOT_FOUND');
  if (invoice.status !== 'draft') {
    throw new AppError('يمكن تعديل المسودات فقط', 400, 'NOT_A_DRAFT');
  }

  const { items, discount, taxRate, notes, salesRep, warehouse } = body;

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
    const draftItems = items.map((it) => ({
      item: it.item || it.itemId || it.item?._id,
      batch: it.batch,
      expiry: it.expiry || null,
      quantity: Number(it.quantity),
      unit: it.unit || '',
      unitPrice: Number(it.unitPrice),
      total: Number(it.total) || round2(Number(it.quantity) * Number(it.unitPrice)),
      unitCost: Number(it.unitCost || 0),
    }));
    invoice.items = draftItems;
    const { subtotal, discountAmount, taxAmount, total } = calculateTotals(
      draftItems,
      discount?.computedAmount || 0,
      taxRate
    );
    invoice.subtotal = subtotal;
    invoice.discount = buildDiscountObject({
      discount,
      computedAmount: discountAmount,
    });
    invoice.taxRate = taxRate || 0;
    invoice.taxAmount = taxAmount;
    invoice.total = total;
    invoice.remainingAmount = total;
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
 * 5) finalizeInvoice — اعتماد مسودة (A6)
 * ───────────────────────────────────────────────────────────── */
export const finalizeInvoice = async ({ invoiceId, body, user, req }) => {
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
  } = body;

  // ─── 1) التحقق ───
  if (!['cash', 'credit', 'installments'].includes(paymentType)) {
    throw new AppError('نوع الدفع غير صحيح', 400, 'INVALID_PAYMENT_TYPE');
  }
  if (paymentType === 'credit' && !dueDate) {
    throw new AppError('تاريخ الاستحقاق مطلوب', 400, 'MISSING_DUE_DATE');
  }
  if (
    paymentType === 'installments' &&
    (!totalInstallments || totalInstallments < 2)
  ) {
    throw new AppError('عدد الأقساط يجب أن يكون 2 على الأقل', 400, 'INVALID_INSTALLMENTS');
  }

  // ─── 2) التحقق من الائتمان ───
  const customer = await Customer.findById(invoice.pharmacy);
  if (paymentType !== 'cash') {
    await validateCreditLimit(customer, invoice.total - paidAmount);
  }

  // ─── 3) التحقق من الأسعار (A3) ───
  await validatePricesOrThrow({
    items: invoice.items,
    warehouseId: invoice.warehouse,
    overrideReason,
    req,
  });

  // ─── 4) صرف المخزون (A6 — نفس A1 + Phase A.10) ───
  const { issuedLots, invoiceItems } = await issueStockAndBuildItems({
    items: invoice.items.map((it) => ({
      item: it.item,
      batch: it.batch,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      unitCost: it.unitCost,
    })),
    warehouseId: invoice.warehouse,
    user,
  });

  const costAmount = calculateIssuedCost(issuedLots);

  // ─── 5) تحديث الفاتورة ───
  invoice.items = invoiceItems;
  invoice.paymentType = paymentType;
  invoice.dueDate = dueDate || null;
  invoice.totalInstallments = totalInstallments || 0;
  invoice.paidAmount = round2(paidAmount);
  invoice.remainingAmount = round2(invoice.total - paidAmount);
  invoice.paymentMethod = paymentMethod || '';
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
      await cashService.createCashTransaction({
        direction: 'in',
        amount: paidAmount,
        method: paymentMethod || 'cash',
        cashFundId: paymentMethod === 'cash' ? cashFundId : null,
        bankAccountId: null,
        transactionDate: new Date(),
        description: `دفعة فاتورة ${invoice.invoiceNumber}`,
        referenceType: 'invoice',
        referenceId: invoice._id,
        user,
        skipEntry: true,
      });

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
    invoice.status = 'draft';
    await invoice.save();
    await rollbackIssuedLots({
      issuedLots,
      warehouseId: invoice.warehouse,
      user,
    });
    throw err;
  }

  // ─── 7) الحالة ───
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
 * ───────────────────────────────────────────────────────────── */
export const registerPayment = async ({
  invoiceId,
  amount,
  paymentMethod,
  cashFundId,
  user,
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

  // ─── 1) CashTransaction + CUSTOMER_PAYMENT ───
  await cashService.createCashTransaction({
    direction: 'in',
    amount,
    method: paymentMethod || 'cash',
    cashFundId: paymentMethod === 'cash' ? cashFundId : null,
    bankAccountId: null,
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
    bankAccountId: null,
    user,
    description: `تحصيل دفعة — ${invoice.invoiceNumber}`,
  });

  // ─── 2) تحديث الفاتورة ───
  invoice.paidAmount = round2(invoice.paidAmount + amount);
  invoice.remainingAmount = round2(invoice.total - invoice.paidAmount);
  if (invoice.paidAmount >= invoice.total - 0.01) {
    invoice.status = 'paid';
    invoice.paidAt = new Date();
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
 * 7) cancelInvoice — إلغاء فاتورة (A7)
 * ───────────────────────────────────────────────────────────── */
export const cancelInvoice = async ({ invoiceId, reason, user }) => {
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

  // ─── 1) عكس Stock (A7) ───
  if (invoice.items?.length > 0) {
    for (const it of invoice.items) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await returnStock({
          itemId: it.item,
          warehouseId: invoice.warehouse,
          batch: it.batch,
          quantity: it.quantity,
          meta: {
            unitCost: it.unitCost || 0,
            expiry: it.expiry,
            notes: `cancel: ${invoice.invoiceNumber}`,
          },
        });
      } catch (err) {
        logger.warn(`[invoiceService] فشل إرجاع Stock (${it.batch}): ${err.message}`);
      }
    }
  }

  // ─── 2) عكس رصيد العميل ───
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
      // eslint-disable-next-line no-await-in-loop
      await accountingService.reverseEntry({
        entryId: entry._id,
        user,
        reason: `إلغاء فاتورة ${invoice.invoiceNumber}: ${reason || ''}`.trim(),
      });
    }
  } catch (err) {
    logger.warn(`[invoiceService] فشل عكس قيود الفاتورة: ${err.message}`);
  }

  // ─── 4) الحالة ───
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