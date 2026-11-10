/**
 * @file customerReturnController.js
 * @description
 * مرتجعات العملاء — 7 أيام فترة سماح.
 *
 * ✅ 🅳 (2026-11-09) — الإصلاحات:
 * - filter.customerId → filter.pharmacy
 * - filter.salesRepId → filter.createdBy
 * - populate('customerId') → populate('pharmacy')
 * - populate('invoiceId') → populate('originalInvoice')
 * - returnStock({ issuedLots }) → returnStock({ itemId, warehouseId, batch, quantity, meta }) × N
 * - CustomerReturn.create({ customerId, invoiceId }) → { pharmacy, originalInvoice, returnNumber, invoiceDate }
 * - returnDoc.items[].itemId → it.item
 * - returnDoc.status 'approved' → RETURN_STATUSES.CONFIRMED
 *
 * ✅ 🅳 B (2026-11-09) — منع تجاوز الفاتورة:
 * - create: مجموع المرتجعات (pending + confirmed) + الجديد ≤ invoice.total
 * - create: مجموع الكميات لكل بند + الجديد ≤ invoice.items[].quantity
 * - create: الفاتورة ليست draft ولا cancelled
 * - approve: مجموع المرتجعات confirmed + الجديد ≤ invoice.total
 * - approve: مجموع الكميات confirmed + الجديد ≤ invoice.items[].quantity
 */

import mongoose from 'mongoose';

import CustomerReturn, {
  RETURN_STATUSES,
  SETTLEMENT_TYPES,
} from '../models/CustomerReturn.js';
import Customer from '../models/Customer.js';
import Invoice from '../models/Invoice.js';
import cashService from '../services/cashService.js';
import accountingService from '../services/accountingService.js';
import { returnStock } from '../services/stockService.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { AUDIT_ACTIONS } from '../utils/constants.js';
import logger from '../utils/logger.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * يُولّد رقم مرتجع فريد: RET-YYYYMM-000001
 */
const generateReturnNumber = async () => {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `RET-${yyyymm}-`;

  const lastReturn = await CustomerReturn.findOne({
    returnNumber: { $regex: `^${prefix}` },
  })
    .sort({ returnNumber: -1 })
    .select('returnNumber')
    .lean();

  let sequence = 1;
  if (lastReturn?.returnNumber) {
    const lastSeq = parseInt(lastReturn.returnNumber.split('-')[2], 10);
    if (!Number.isNaN(lastSeq)) sequence = lastSeq + 1;
  }

  return `${prefix}${String(sequence).padStart(6, '0')}`;
};

/* ─────────────────────────────────────────────────────────────
 * Helpers — التحقق من حدود الفاتورة
 * ───────────────────────────────────────────────────────────── */

/**
 * مجموع المرتجعات (بحسب الحالة) لفاتورة محددة.
 * @param {string} invoiceId
 * @param {string[]} statuses - ['pending', 'confirmed']
 * @returns {Promise<number>}
 */
const sumReturnsTotal = async (invoiceId, statuses) => {
  const result = await CustomerReturn.aggregate([
    {
      $match: {
        originalInvoice: new mongoose.Types.ObjectId(String(invoiceId)),
        status: { $in: statuses },
      },
    },
    { $group: { _id: null, total: { $sum: '$total' } } },
  ]);
  return round2(result[0]?.total || 0);
};

/**
 * مجموع كميات كل بند (item + batch) من المرتجعات بحسب الحالة.
 * @param {string} invoiceId
 * @param {string[]} statuses
 * @returns {Promise<Map<string, number>>} key = `${itemId}:${batch}`, value = مجموع الكميات
 */
const sumReturnsQuantities = async (invoiceId, statuses) => {
  const result = await CustomerReturn.aggregate([
    {
      $match: {
        originalInvoice: new mongoose.Types.ObjectId(String(invoiceId)),
        status: { $in: statuses },
      },
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: {
          item: '$items.item',
          batch: '$items.batch',
        },
        quantity: { $sum: '$items.quantity' },
      },
    },
  ]);

  const map = new Map();
  for (const r of result) {
    const key = `${String(r._id.item)}:${String(r._id.batch)}`;
    map.set(key, round2(r.quantity));
  }
  return map;
};

/**
 * التحقق من أن مجموع المرتجعات (بحسب الحالة) + الجديد لا يتجاوز إجمالي الفاتورة.
 * @param {Object} params
 * @param {Object} params.invoice
 * @param {number} params.newTotal
 * @param {string[]} params.statuses
 */
const ensureInvoiceLimitNotExceeded = async ({ invoice, newTotal, statuses }) => {
  const existing = await sumReturnsTotal(invoice._id, statuses);
  const projected = round2(existing + newTotal);
  if (projected > round2(invoice.total) + 0.01) {
    throw new AppError(
      `مجموع المرتجعات سيتجاوز إجمالي الفاتورة. ` +
        `الفاتورة: ${round2(invoice.total)} SDG، ` +
        `المرتجعات الحالية: ${existing} SDG، ` +
        `الجديد: ${round2(newTotal)} SDG.`,
      400,
      'RETURN_EXCEEDS_INVOICE'
    );
  }
};

/**
 * التحقق من أن مجموع كميات كل بند (بحسب الحالة) + الجديد لا يتجاوز كمية الفاتورة.
 * @param {Object} params
 * @param {Object} params.invoice
 * @param {Array} params.items - [{ item, batch, quantity }]
 * @param {string[]} params.statuses
 */
const ensureItemQuantitiesNotExceeded = async ({ invoice, items, statuses }) => {
  // خريطة كميات الفاتورة: `${item}:${batch}` → quantity
  const invoiceQtyMap = new Map();
  for (const it of invoice.items || []) {
    const key = `${String(it.item)}:${String(it.batch).toUpperCase()}`;
    invoiceQtyMap.set(key, round2((invoiceQtyMap.get(key) || 0) + Number(it.quantity)));
  }

  // خريطة كميات المرتجعات السابقة
  const returnedQtyMap = await sumReturnsQuantities(invoice._id, statuses);

  // التحقق
  for (const it of items) {
    const key = `${String(it.item)}:${String(it.batch).toUpperCase()}`;
    const invoiceQty = invoiceQtyMap.get(key) || 0;
    const alreadyReturned = returnedQtyMap.get(key) || 0;
    const newQty = Number(it.quantity);
    const projected = round2(alreadyReturned + newQty);

    if (projected > invoiceQty + 0.01) {
      throw new AppError(
        `كمية الإرجاع للبند (${String(it.item)} — دفعة ${it.batch}) ` +
          `تتجاوز الكمية المُباعة. ` +
          `المُباع: ${invoiceQty}، المرتجع سابقاً: ${alreadyReturned}، ` +
          `الجديد: ${newQty}، الإجمالي: ${projected}.`,
        400,
        'RETURN_EXCEEDS_ITEM_QUANTITY'
      );
    }
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/customer-returns
 * ───────────────────────────────────────────────────────────── */
export const listCustomerReturns = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      pharmacy,
      originalInvoice,
      settlementType,
      dateFrom,
      dateTo,
      sortBy = 'returnDate',
      sortOrder = 'desc',
    } = req.query;

    const filter = {};

    if (pharmacy) filter.pharmacy = pharmacy;
    if (originalInvoice) filter.originalInvoice = originalInvoice;

    if (status && status !== 'all') filter.status = status;
    if (settlementType) filter.settlementType = settlementType;

    if (dateFrom || dateTo) {
      filter.returnDate = {};
      if (dateFrom) filter.returnDate.$gte = new Date(dateFrom);
      if (dateTo) filter.returnDate.$lte = new Date(dateTo);
    }

    if (req.scope?.salesRepId) filter.createdBy = req.scope.salesRepId;
    if (req.scope?.customerId) filter.pharmacy = req.scope.customerId;

    if (search) {
      filter.$or = [{ returnNumber: { $regex: search, $options: 'i' } }];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const sortField = ['createdAt', 'returnDate', 'total', 'settledAmount'].includes(sortBy)
      ? sortBy
      : 'returnDate';

    const [returns, total] = await Promise.all([
      CustomerReturn.find(filter)
        .populate('pharmacy', 'name phone code')
        .populate('originalInvoice', 'invoiceNumber')
        .populate('createdBy', 'name email')
        .populate('approvedBy', 'name')
        .populate('rejectedBy', 'name')
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      CustomerReturn.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: returns,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/customer-returns/:id
 * ───────────────────────────────────────────────────────────── */
export const getCustomerReturn = async (req, res, next) => {
  try {
    const returnDoc = await CustomerReturn.findById(req.params.id)
      .populate('pharmacy', 'name phone code address')
      .populate('originalInvoice', 'invoiceNumber total invoiceDate')
      .populate('items.item', 'tradeName scientificName units')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name')
      .populate('rejectedBy', 'name');

    if (!returnDoc) {
      throw new AppError('المرتجع غير موجود', 404, 'RETURN_NOT_FOUND');
    }

    res.status(200).json({ success: true, data: returnDoc });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/customer-returns
 * ───────────────────────────────────────────────────────────── */
export const createCustomerReturn = async (req, res, next) => {
  try {
    const {
      pharmacy,
      originalInvoice,
      items,
      settlementType,
      notes,
      returnDate,
    } = req.body;

    if (!pharmacy) throw new AppError('الصيدلية مطلوبة', 400, 'MISSING_PHARMACY');
    if (!originalInvoice) {
      throw new AppError('الفاتورة الأصلية مطلوبة', 400, 'MISSING_INVOICE');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('المرتجع يحتاج بنداً واحداً على الأقل', 400, 'EMPTY_ITEMS');
    }
    if (!['cash_refund', 'balance_deduction'].includes(settlementType)) {
      throw new AppError('طريقة التسوية غير صحيحة', 400, 'INVALID_SETTLEMENT');
    }

    const customer = await Customer.findById(pharmacy);
    if (!customer) throw new AppError('العميل غير موجود', 404, 'CUSTOMER_NOT_FOUND');

    const invoice = await Invoice.findById(originalInvoice).lean();
    if (!invoice) {
      throw new AppError('الفاتورة الأصلية غير موجودة', 404, 'INVOICE_NOT_FOUND');
    }

    // ⚠️ الفاتورة للصيدلية نفسها
    if (String(invoice.pharmacy) !== String(pharmacy)) {
      throw new AppError(
        'الفاتورة لا تنتمي لهذه الصيدلية',
        400,
        'INVOICE_PHARMACY_MISMATCH'
      );
    }

    // ✅ B: لا يمكن إرجاع مسودة أو ملغاة
    if (invoice.status === 'draft') {
      throw new AppError(
        'لا يمكن إرجاع فاتورة في حالة مسودة.',
        400,
        'INVOICE_IS_DRAFT'
      );
    }
    if (invoice.status === 'cancelled') {
      throw new AppError(
        'لا يمكن إرجاع فاتورة ملغاة.',
        400,
        'INVOICE_CANCELLED'
      );
    }

    // ✅ B: حساب الإجمالي
    const total = round2(
      items.reduce(
        (sum, it) => sum + Number(it.unitPrice) * Number(it.quantity),
        0
      )
    );

    // ✅ B: التحقق من الإجمالي (pending + confirmed) + الجديد ≤ invoice.total
    await ensureInvoiceLimitNotExceeded({
      invoice,
      newTotal: total,
      statuses: [RETURN_STATUSES.PENDING, RETURN_STATUSES.CONFIRMED],
    });

    // ✅ B: التحقق من كميات كل بند
    await ensureItemQuantitiesNotExceeded({
      invoice,
      items,
      statuses: [RETURN_STATUSES.PENDING, RETURN_STATUSES.CONFIRMED],
    });

    // ✅ B: توليد رقم المرتجع
    const returnNumber = await generateReturnNumber();

    const returnDoc = await CustomerReturn.create({
      returnNumber,
      pharmacy,
      originalInvoice,
      warehouse: invoice.warehouse || null,
      invoiceDate: invoice.invoiceDate || invoice.createdAt || new Date(),
      returnDate: returnDate || new Date(),
      items,
      total,
      settlementType,
      notes: notes || '',
      status: RETURN_STATUSES.PENDING,
      createdBy: req.user._id,
    });

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.CREATE,
      resource: 'CustomerReturn',
      resourceId: returnDoc._id,
      description: `مرتجع عميل جديد — ${returnNumber} — ${total} SDG`,
      success: true,
    });

    res.status(201).json({
      success: true,
      message: 'تم إنشاء المرتجع (بانتظار الموافقة)',
      data: returnDoc,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/customer-returns/:id/approve
 * ───────────────────────────────────────────────────────────── */
export const approveCustomerReturn = async (req, res, next) => {
  try {
    const { settledAmount, cashFund, bankAccount, notes } = req.body;

    const returnDoc = await CustomerReturn.findById(req.params.id);
    if (!returnDoc) throw new AppError('المرتجع غير موجود', 404, 'RETURN_NOT_FOUND');
    if (returnDoc.status !== RETURN_STATUSES.PENDING) {
      throw new AppError('المرتجع ليس في حالة pending', 409, 'INVALID_STATUS');
    }

    const amount = round2(settledAmount ?? returnDoc.total);

    // ✅ B: جلب الفاتورة للتحقق
    const invoice = await Invoice.findById(returnDoc.originalInvoice).lean();
    if (!invoice) {
      throw new AppError('الفاتورة الأصلية غير موجودة', 404, 'INVOICE_NOT_FOUND');
    }

    // ✅ B: التحقق من الإجمالي (confirmed فقط) + الجديد ≤ invoice.total
    await ensureInvoiceLimitNotExceeded({
      invoice,
      newTotal: returnDoc.total,
      statuses: [RETURN_STATUSES.CONFIRMED],
    });

    // ✅ B: التحقق من كميات كل بند
    await ensureItemQuantitiesNotExceeded({
      invoice,
      items: returnDoc.items,
      statuses: [RETURN_STATUSES.CONFIRMED],
    });

    // ─── 1) إرجاع Stock ───
    let warehouseId = returnDoc.warehouse || invoice.warehouse;
    if (!warehouseId) {
      throw new AppError(
        'المخزن غير محدد في الفاتورة الأصلية — لا يمكن إرجاع المخزون.',
        400,
        'MISSING_WAREHOUSE'
      );
    }

    const issuedLots = [];

    try {
      for (const it of returnDoc.items) {
        // eslint-disable-next-line no-await-in-loop
        await returnStock({
          itemId: it.item,
          warehouseId,
          batch: it.batch,
          quantity: it.quantity,
          meta: {
            unitCost: it.unitCost || 0,
            expiry: it.expiry || null,
            notes: `customer_return: ${returnDoc.returnNumber}`,
          },
        });

        issuedLots.push({
          itemId: it.item,
          batch: it.batch,
          quantity: it.quantity,
        });
      }
    } catch (err) {
      logger.error(`[customerReturn] فشل إرجاع Stock — Rollback: ${err.message}`);
      for (const lot of issuedLots) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await returnStock({
            itemId: lot.itemId,
            warehouseId,
            batch: lot.batch,
            quantity: lot.quantity,
            meta: { notes: 'rollback: customer_return approve failed' },
          });
        } catch (rbErr) {
          logger.warn(`[customerReturn] فشل Rollback: ${rbErr.message}`);
        }
      }
      throw new AppError('فشل إرجاع المخزون', 500, 'STOCK_RETURN_FAILED');
    }

    // ─── 2) التسوية المالية ───
    try {
      if (returnDoc.settlementType === SETTLEMENT_TYPES.CASH_REFUND) {
        await cashService.createCashTransaction({
          direction: 'out',
          amount,
          method: cashFund ? 'cash' : 'bank',
          cashFundId: cashFund || null,
          bankAccountId: bankAccount || null,
          transactionDate: new Date(),
          description: `رد نقدي مرتجع — ${returnDoc.returnNumber}`,
          referenceType: 'customer_return',
          referenceId: returnDoc._id,
          user: req.user,
          skipEntry: true,
        });

        await accountingService.createSaleReturnEntry({
          amount,
          refundType: 'cash',
          date: new Date(),
          sourceType: 'CustomerReturn',
          sourceId: returnDoc._id,
          cashFundId: cashFund || null,
          user: req.user,
          description: `مرتجع بيع نقدي — ${returnDoc.returnNumber}`,
        });
      } else if (returnDoc.settlementType === SETTLEMENT_TYPES.BALANCE_DEDUCTION) {
        await Customer.updateOne(
          { _id: returnDoc.pharmacy },
          { $inc: { currentBalance: -amount } }
        );

        await accountingService.createSaleReturnEntry({
          amount,
          refundType: 'balance',
          date: new Date(),
          sourceType: 'CustomerReturn',
          sourceId: returnDoc._id,
          user: req.user,
          description: `مرتجع بيع (خصم رصيد) — ${returnDoc.returnNumber}`,
        });
      }
    } catch (err) {
      logger.error(`[customerReturn] فشل التسوية المالية — Rollback: ${err.message}`);
      for (const lot of issuedLots) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await returnStock({
            itemId: lot.itemId,
            warehouseId,
            batch: lot.batch,
            quantity: lot.quantity,
            meta: { notes: 'rollback: customer_return approve failed' },
          });
        } catch (rbErr) {
          logger.warn(`[customerReturn] فشل Rollback: ${rbErr.message}`);
        }
      }
      throw err;
    }

    // ─── 3) تحديث الحالة ───
    returnDoc.status = RETURN_STATUSES.CONFIRMED;
    returnDoc.settledAmount = amount;
    returnDoc.approvedBy = req.user._id;
    returnDoc.approvedAt = new Date();
    if (notes !== undefined) returnDoc.notes = notes;
    await returnDoc.save();

    // ─── 4) Audit ───
    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'CustomerReturn',
      resourceId: returnDoc._id,
      description: `اعتماد مرتجع — ${returnDoc.returnNumber} — ${amount} SDG`,
      success: true,
    });

    res.status(200).json({
      success: true,
      message: 'تم اعتماد المرتجع',
      data: returnDoc,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/customer-returns/:id/reject
 * ───────────────────────────────────────────────────────────── */
export const rejectCustomerReturn = async (req, res, next) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason) {
      throw new AppError('سبب الرفض مطلوب', 400, 'MISSING_REASON');
    }

    const returnDoc = await CustomerReturn.findById(req.params.id);
    if (!returnDoc) throw new AppError('المرتجع غير موجود', 404, 'RETURN_NOT_FOUND');
    if (returnDoc.status !== RETURN_STATUSES.PENDING) {
      throw new AppError('المرتجع ليس في حالة pending', 409, 'INVALID_STATUS');
    }

    returnDoc.status = RETURN_STATUSES.REJECTED;
    returnDoc.rejectionReason = rejectionReason;
    returnDoc.rejectedBy = req.user._id;
    returnDoc.rejectedAt = new Date();
    await returnDoc.save();

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'CustomerReturn',
      resourceId: returnDoc._id,
      description: `رفض مرتجع — ${returnDoc.returnNumber} — ${rejectionReason}`,
      success: true,
    });

    res.status(200).json({
      success: true,
      message: 'تم رفض المرتجع',
      data: returnDoc,
    });
  } catch (error) {
    next(error);
  }
};