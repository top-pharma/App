/**
 * @file purchaseReceiptController.js
 * @description
 * إيصالات استلام المشتريات — مسودة → تأكيد → (إلغاء).
 *
 * دورة الحياة:
 *  draft → (confirm) → received
 *        → (cancel)  → cancelled
 *
 * ⚠️ إصلاح 2026-11-10:
 *  - F1: `populate('supplier')` بدل `supplierId` — Model الحقل اسمه `supplier`.
 *  - F2: `populate('items.item')` بدل `items.itemId` — Model البند اسمه `item`.
 *  - F3: `create` يستخدم `supplier` + `discount` + `item` (أسماء Model).
 *  - F4: دعم `supplierId`/`supplier` + `itemId`/`item` من الـ payload.
 *  - F5: دعم `initialPayment` كائن أو رقم.
 *  - F6: `confirm` يقرأ `receipt.initialPayment.amount` (كائن).
 *  - F7: `confirm` يقرأ `receipt.items[].item` (لا itemId).
 *  - F8: `update` يستخدم `discount` (لا discountAmount) + `items[].item`.
 *
 * ملاحظة:
 * - لا يمكن تعديل إلا draft.
 * - لا يمكن إلغاء إلا draft.
 * - confirm لا رجعة فيه (استخدم مرتجع مورد بدلاً).
 */

import mongoose from 'mongoose';
import PurchaseReceipt from '../models/PurchaseReceipt.js';
import Supplier from '../models/Supplier.js';
import cashService from '../services/cashService.js';
import accountingService from '../services/accountingService.js';
import { returnStock } from '../services/stockService.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { AUDIT_ACTIONS } from '../utils/constants.js';
import logger from '../utils/logger.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/* ─────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

/**
 * يحسب المجاميع من items + discount + taxRate.
 * @param {Array} items
 * @param {number} discount
 * @param {number} taxRate
 * @returns {{subtotal: number, discountAmount: number, taxAmount: number, total: number}}
 */
const calculateTotals = (items, discount = 0, taxRate = 0) => {
  const subtotal = round2(
    items.reduce(
      (sum, it) => sum + Number(it.unitCost || 0) * Number(it.quantity || 0),
      0
    )
  );
  const discountAmount = round2(Number(discount) || 0);
  const taxable = round2(subtotal - discountAmount);
  const taxAmount = round2(taxable * (Number(taxRate) / 100));
  const total = round2(taxable + taxAmount);
  return { subtotal, discountAmount, taxAmount, total };
};

/**
 * يُولّد رقم إيصال فريد: PR-YYYYMM-000001
 * @returns {Promise<string>}
 */
const generateReceiptNumber = async () => {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `PR-${yyyymm}-`;

  const last = await PurchaseReceipt.findOne({
    receiptNumber: { $regex: `^${prefix}` },
  })
    .sort({ receiptNumber: -1 })
    .select('receiptNumber')
    .lean();

  let sequence = 1;
  if (last?.receiptNumber) {
    const lastSeq = parseInt(last.receiptNumber.split('-')[2], 10);
    if (!Number.isNaN(lastSeq)) sequence = lastSeq + 1;
  }

  return `${prefix}${String(sequence).padStart(6, '0')}`;
};

/**
 * يطبّع بنداً من الـ payload إلى شكل Model.
 * يدعم `itemId` أو `item`.
 */
const normalizeItem = (it) => ({
  item: it.itemId || it.item,                         // ✅ Model: item (لا itemId)
  batch: (it.batch || '').trim().toUpperCase(),
  productionDate: it.productionDate || null,
  expiry: it.expiry,
  quantity: Number(it.quantity),
  unit: it.unit || '',
  unitCost: Number(it.unitCost),
  unitPrice: Number(it.unitPrice || 0),
  total:
    Number(it.total) ||
    Math.round(Number(it.quantity) * Number(it.unitCost) * 100) / 100,
  location: it.location || '',
});

/**
 * يطبّع initialPayment (كائن أو رقم) إلى { amount, method }.
 */
const normalizeInitialPayment = (initialPayment, initialPaymentMethod) => {
  if (initialPayment && typeof initialPayment === 'object') {
    return {
      amount: Number(initialPayment.amount) || 0,
      // ⚠️ Model يقبل cash/bank فقط — نحوّل check → cash
      method: initialPayment.method === 'check' ? 'cash' : (initialPayment.method || 'cash'),
    };
  }
  return {
    amount: Number(initialPayment) || 0,
    method:
      initialPaymentMethod === 'check'
        ? 'cash'
        : initialPaymentMethod || 'cash',
  };
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/purchase-receipts
 * ───────────────────────────────────────────────────────────── */
export const listPurchaseReceipts = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      supplierId,
      supplier: supplierQuery,
      warehouse,
      paymentType,
      from,
      to,
      dateFrom,
      dateTo,
      search,
      sortBy = 'receiptDate',
      sortOrder = 'desc',
    } = req.query;

    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (supplierId || supplierQuery) filter.supplier = supplierId || supplierQuery;   // ✅ Model: supplier
    if (warehouse) filter.warehouse = warehouse;
    if (paymentType) filter.paymentType = paymentType;

    const fromDate = from || dateFrom;
    const toDate = to || dateTo;
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = new Date(fromDate);
      if (toDate) filter.createdAt.$lte = new Date(toDate);
    }
    if (search) {
      filter.$or = [
        { receiptNumber: { $regex: search, $options: 'i' } },
        { supplierInvoiceNumber: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [receipts, total] = await Promise.all([
      PurchaseReceipt.find(filter)
        .populate('supplier', 'name phone code')        // ✅ supplier (لا supplierId)
        .populate('warehouse', 'name code')
        .populate('createdBy', 'fullName')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      PurchaseReceipt.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: receipts,
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
 * GET /api/purchase-receipts/:id
 *
 * ⚠️ إصلاح 2026-11-11:
 *  - إزالة `populate('confirmedBy')` + `populate('cancelledBy')` —
 *    غير موجودين في `PurchaseReceipt.js` Schema.
 *  - `receivedBy` موجود — يُستخدم بدلاً من `confirmedBy`.
 * ───────────────────────────────────────────────────────────── */
export const getPurchaseReceipt = async (req, res, next) => {
  try {
    const receipt = await PurchaseReceipt.findById(req.params.id)
      .populate('supplier', 'name phone code address')
      .populate('warehouse', 'name code')
      .populate('items.item', 'tradeName scientificName units barcode')
      .populate('createdBy', 'fullName')
      .populate('receivedBy', 'fullName');
      // ⚠️ confirmedBy / cancelledBy غير موجودين — لا populate

    if (!receipt) {
      throw new AppError('الإيصال غير موجود', 404, 'RECEIPT_NOT_FOUND');
    }

    res.status(200).json({ success: true, data: receipt });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/purchase-receipts
 * إنشاء إيصال (مسودة — لا تأثير على Stock أو المورد).
 * ───────────────────────────────────────────────────────────── */
export const createPurchaseReceipt = async (req, res, next) => {
  try {
    const {
      supplierId,
      supplier: supplierAlt,                // ✅ دعم الاسم البديل
      warehouse,
      supplierInvoiceNumber,
      receiptDate,
      items,
      discount = 0,
      taxRate = 0,
      notes,
      paymentType = 'cash',
      initialPayment,
      initialPaymentMethod,
      dueDate,
    } = req.body;

    // ✅ دعم الاسمين
    const supplierRef = supplierId || supplierAlt;

    if (!supplierRef) throw new AppError('المورد مطلوب', 400, 'MISSING_SUPPLIER');
    if (!warehouse) throw new AppError('المخزن مطلوب', 400, 'MISSING_WAREHOUSE');
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('الإيصال يحتاج بنداً واحداً على الأقل', 400, 'EMPTY_ITEMS');
    }

    const supplierDoc = await Supplier.findById(supplierRef);
    if (!supplierDoc) throw new AppError('المورد غير موجود', 404, 'SUPPLIER_NOT_FOUND');

    const { subtotal, discountAmount, taxAmount, total } = calculateTotals(
      items,
      discount,
      taxRate
    );

    // ✅ تطبيع initialPayment
    const { amount: paymentAmount, method: paymentMethod } =
      normalizeInitialPayment(initialPayment, initialPaymentMethod);

    const receiptNumber = await generateReceiptNumber();

    // ✅ تطبيع البنود
    const normalizedItems = items.map(normalizeItem);

    const receipt = await PurchaseReceipt.create({
      receiptNumber,
      supplier: supplierRef,                           // ✅ Model: supplier
      warehouse,
      supplierInvoiceNumber: supplierInvoiceNumber || '',
      receiptDate: receiptDate ? new Date(receiptDate) : new Date(),
      items: normalizedItems,
      subtotal,
      discount: discountAmount,                        // ✅ Model: discount
      taxRate: Number(taxRate) || 0,
      taxAmount,
      total,
      paymentType,
      // ✅ Model يتوقع كائن { amount, method, paidAt, paidBy }
      initialPayment: {
        amount: paymentAmount,
        method: paymentMethod,
        paidAt: null,
        paidBy: null,
      },
      paidAmount: paymentAmount,
      remainingAmount: round2(total - paymentAmount),
      dueDate: dueDate ? new Date(dueDate) : null,
      status: 'draft',
      notes: notes || '',
      createdBy: req.user._id,
    });

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.CREATE,
      resource: 'PurchaseReceipt',
      resourceId: receipt._id,
      description: `إنشاء إيصال استلام ${receiptNumber} — ${total} SDG`,
      success: true,
      meta: { after: receipt.toObject() },
    });

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الإيصال (مسودة)',
      data: receipt,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * PATCH /api/purchase-receipts/:id
 * تحديث مسودة (لا يمكن تحديث received/cancelled).
 * ───────────────────────────────────────────────────────────── */
export const updatePurchaseReceipt = async (req, res, next) => {
  try {
    const receipt = await PurchaseReceipt.findById(req.params.id);
    if (!receipt) {
      throw new AppError('الإيصال غير موجود', 404, 'RECEIPT_NOT_FOUND');
    }
    if (receipt.status !== 'draft') {
      throw new AppError('يمكن تعديل المسودات فقط', 400, 'NOT_A_DRAFT');
    }

    const before = receipt.toObject();

    const {
      supplierId,
      supplier: supplierAlt,
      warehouse,
      items,
      discount,
      taxRate,
      notes,
      paymentType,
      initialPayment,
      initialPaymentMethod,
      dueDate,
    } = req.body;

    // ─── 1) تغيير المورد (إن طُلب) ───
    const supplierRef = supplierId || supplierAlt;
    if (supplierRef && String(supplierRef) !== String(receipt.supplier)) {
      const supplierDoc = await Supplier.findById(supplierRef);
      if (!supplierDoc) throw new AppError('المورد غير موجود', 404, 'SUPPLIER_NOT_FOUND');
      receipt.supplier = supplierRef;                  // ✅ Model: supplier
    }

    // ─── 2) تغيير المخزن ───
    if (warehouse) receipt.warehouse = warehouse;

    // ─── 3) تحديث البنود والمجاميع (إن طُلب) ───
    if (Array.isArray(items)) {
      if (items.length === 0) {
        throw new AppError('الإيصال يحتاج بنداً واحداً على الأقل', 400, 'EMPTY_ITEMS');
      }

      const newDiscount = discount !== undefined ? discount : receipt.discount;
      const newTaxRate = taxRate !== undefined ? taxRate : receipt.taxRate;

      const { subtotal, discountAmount, taxAmount, total } = calculateTotals(
        items,
        newDiscount,
        newTaxRate
      );

      receipt.items = items.map(normalizeItem);        // ✅ item
      receipt.subtotal = subtotal;
      receipt.discount = discountAmount;               // ✅ Model: discount
      receipt.taxRate = Number(newTaxRate) || 0;
      receipt.taxAmount = taxAmount;
      receipt.total = total;
    } else if (discount !== undefined || taxRate !== undefined) {
      // تحديث الخصم/الضريبة فقط (بدون تغيير البنود)
      const newDiscount = discount !== undefined ? discount : receipt.discount;
      const newTaxRate = taxRate !== undefined ? taxRate : receipt.taxRate;

      const { subtotal, discountAmount, taxAmount, total } = calculateTotals(
        receipt.items,
        newDiscount,
        newTaxRate
      );
      receipt.subtotal = subtotal;
      receipt.discount = discountAmount;               // ✅ Model: discount
      receipt.taxRate = Number(newTaxRate) || 0;
      receipt.taxAmount = taxAmount;
      receipt.total = total;
    }

    // ─── 4) تحديث الدفعة الأولى ───
    if (initialPayment !== undefined || initialPaymentMethod !== undefined) {
      const { amount, method } = normalizeInitialPayment(
        initialPayment,
        initialPaymentMethod
      );
      receipt.initialPayment = {
        amount,
        method,
        paidAt: null,
        paidBy: null,
      };
      receipt.paidAmount = amount;
      receipt.remainingAmount = round2(receipt.total - amount);
    }

    // ─── 5) نوع الدفع + dueDate ───
    if (paymentType) receipt.paymentType = paymentType;
    if (dueDate !== undefined) {
      receipt.dueDate = dueDate ? new Date(dueDate) : null;
    }

    // ─── 6) ملاحظات ───
    if (notes !== undefined) receipt.notes = notes;

    await receipt.save();

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'PurchaseReceipt',
      resourceId: receipt._id,
      description: `تحديث مسودة إيصال ${receipt.receiptNumber}`,
      success: true,
      meta: { before, after: receipt.toObject() },
    });

    res.status(200).json({
      success: true,
      message: 'تم تحديث الإيصال',
      data: receipt,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/purchase-receipts/:id/confirm
 * تأكيد الإيصال — Stock + CashTransaction + PURCHASE entry.
 *
 * ⚠️ إصلاح 2026-11-11:
 *  - H11: `returnStock` تستدعى لكل بند (لأنها لدفعة واحدة — لا bulk).
 *  - H11: `meta` يحمل `expiry`/`unitCost`/`unitPrice` (للإنشاء التلقائي).
 * ───────────────────────────────────────────────────────────── */
export const confirmPurchaseReceipt = async (req, res, next) => {
  try {
    const {
      initialPayment,
      initialPaymentMethod,
      cashFundId,
      bankAccountId,
    } = req.body || {};

    const receipt = await PurchaseReceipt.findById(req.params.id);
    if (!receipt) {
      throw new AppError('الإيصال غير موجود', 404, 'RECEIPT_NOT_FOUND');
    }
    if (receipt.status !== 'draft') {
      throw new AppError('يمكن تأكيد المسودات فقط', 409, 'INVALID_STATUS');
    }

    // ✅ Model: initialPayment = { amount, method }
    let paidAmount;
    let method;
    if (initialPayment !== undefined) {
      const norm = normalizeInitialPayment(initialPayment, initialPaymentMethod);
      paidAmount = norm.amount;
      method = norm.method;
    } else {
      paidAmount = round2(Number(receipt.initialPayment?.amount) || 0);
      method = receipt.initialPayment?.method || 'cash';
    }

    const remainingAmount = round2(receipt.total - paidAmount);

    if (paidAmount > 0 && method === 'cash' && !cashFundId) {
      throw new AppError('الصندوق مطلوب للدفع النقدي', 400, 'MISSING_CASH_FUND');
    }
    if (paidAmount > 0 && method === 'bank' && !bankAccountId) {
      throw new AppError('الحساب البنكي مطلوب للدفع البنكي', 400, 'MISSING_BANK_ACCOUNT');
    }

    // ─── 1) إضافة Stock (returnStock لكل بند — لأنها لدفعة واحدة) ───
    try {
      for (const it of receipt.items) {
        // eslint-disable-next-line no-await-in-loop
        await returnStock({
          itemId: it.item,
          warehouseId: receipt.warehouse,
          batch: it.batch,
          quantity: it.quantity,
          meta: {
            expiry: it.expiry,
            unitCost: it.unitCost,
            unitPrice: it.unitPrice || 0,
            notes: `استلام من إيصال ${receipt.receiptNumber}`,
          },
        });
      }
    } catch (err) {
      logger.error(`[purchaseReceipt] فشل إدخال Stock: ${err.message}`);
      throw new AppError('فشل إدخال المخزون', 500, 'STOCK_ADD_FAILED');
    }

    // ─── 2) CashTransaction (إن دفع) ───
    if (paidAmount > 0) {
      try {
        await cashService.createCashTransaction({
          direction: 'out',
          amount: paidAmount,
          method,
          cashFundId: method === 'cash' ? cashFundId || null : null,
          bankAccountId: method === 'bank' ? bankAccountId || null : null,
          transactionDate: new Date(),
          description: `دفعة على إيصال استلام ${receipt.receiptNumber}`,
          referenceType: 'purchase',
          referenceId: receipt._id,
          user: req.user,
          skipEntry: true,
        });
      } catch (err) {
        logger.error(`[purchaseReceipt] فشل CashTransaction: ${err.message}`);
        throw err;
      }
    }

    // ─── 3) تحديث Supplier.currentBalance (إن متبقٍ) ───
    if (remainingAmount > 0) {
      await Supplier.updateOne(
        { _id: receipt.supplier },
        { $inc: { currentBalance: remainingAmount } }
      );
    }

    // ─── 4) PURCHASE entry ───
    try {
      const lines = [
        {
          accountCode: accountingService.ACCOUNT_CODES.INVENTORY,
          accountName: 'المخزون',
          debit: receipt.total,
          credit: 0,
          description: `إدخال مخزون — ${receipt.receiptNumber}`,
        },
      ];

      if (paidAmount > 0) {
        const cashAccount =
          method === 'bank'
            ? { code: accountingService.ACCOUNT_CODES.BANK, name: 'البنك' }
            : { code: accountingService.ACCOUNT_CODES.CASH, name: 'الصندوق النقدي' };
        lines.push({
          accountCode: cashAccount.code,
          accountName: cashAccount.name,
          debit: 0,
          credit: paidAmount,
          description: 'دفعة نقدية',
        });
      }
      if (remainingAmount > 0) {
        lines.push({
          accountCode: accountingService.ACCOUNT_CODES.ACCOUNTS_PAYABLE,
          accountName: 'ذمم الموردين',
          debit: 0,
          credit: remainingAmount,
          description: 'ذمة مورد',
        });
      }

      await accountingService.createEntry({
        entryType: 'PURCHASE',
        entryDate: new Date(),
        description: `مشتريات — ${receipt.receiptNumber}`,
        lines,
        sourceType: 'PurchaseReceipt',
        sourceId: receipt._id,
        cashFundId: method === 'cash' ? cashFundId || null : null,
        bankAccountId: method === 'bank' ? bankAccountId || null : null,
        user: req.user,
      });
    } catch (err) {
      if (remainingAmount > 0) {
        await Supplier.updateOne(
          { _id: receipt.supplier },
          { $inc: { currentBalance: -remainingAmount } }
        );
      }
      throw err;
    }

    // ─── 5) تحديث الحالة ───
    receipt.status = 'received';
    receipt.receivedAt = new Date();
    receipt.receivedBy = req.user._id;
    receipt.initialPayment = {
      amount: paidAmount,
      method,
      paidAt: paidAmount > 0 ? new Date() : null,
      paidBy: paidAmount > 0 ? req.user._id : null,
    };
    receipt.paidAmount = paidAmount;
    receipt.remainingAmount = remainingAmount;
    await receipt.save();

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'PurchaseReceipt',
      resourceId: receipt._id,
      description: `تأكيد إيصال ${receipt.receiptNumber} — ${receipt.total} SDG`,
      success: true,
    });

    res.status(200).json({
      success: true,
      message: 'تم تأكيد الإيصال (تم إدخال المخزون)',
      data: receipt,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/purchase-receipts/:id/cancel
 * إلغاء المسودة فقط.
 * ───────────────────────────────────────────────────────────── */
export const cancelPurchaseReceipt = async (req, res, next) => {
  try {
    const { cancelReason } = req.body;

    const receipt = await PurchaseReceipt.findById(req.params.id);
    if (!receipt) {
      throw new AppError('الإيصال غير موجود', 404, 'RECEIPT_NOT_FOUND');
    }
    if (receipt.status !== 'draft') {
      throw new AppError('يمكن إلغاء المسودات فقط', 409, 'INVALID_STATUS');
    }

    receipt.status = 'cancelled';
    receipt.cancelledBy = req.user._id;
    receipt.cancelledAt = new Date();
    receipt.cancelReason = cancelReason || '';
    await receipt.save();

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'PurchaseReceipt',
      resourceId: receipt._id,
      description: `إلغاء إيصال ${receipt.receiptNumber}`,
      success: true,
    });

    res.status(200).json({
      success: true,
      message: 'تم إلغاء الإيصال',
      data: receipt,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * التصدير الافتراضي (للتوافق)
 * ───────────────────────────────────────────────────────────── */
export default {
  listPurchaseReceipts,
  getPurchaseReceipt,
  createPurchaseReceipt,
  updatePurchaseReceipt,
  confirmPurchaseReceipt,
  cancelPurchaseReceipt,
};