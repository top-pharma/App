/**
 * @file purchaseReceiptController.js
 * @description
 * إيصالات استلام المشتريات — مسودة → تأكيد → (إلغاء).
 *
 * لماذا هذا الملف؟
 * - Phase 2: draft → received (فقط).
 * - Phase 3: عند confirm → Stock + CashTransaction + AccountingEntry + Supplier.balance.
 *
 * دورة الحياة:
 *  draft → (confirm) → received
 *        → (cancel)  → cancelled
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
      warehouse,
      from,
      to,
      search,
    } = req.query;

    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (supplierId) filter.supplierId = supplierId;
    if (warehouse) filter.warehouse = warehouse;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }
    if (search) {
      filter.receiptNumber = { $regex: search, $options: 'i' };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [receipts, total] = await Promise.all([
      PurchaseReceipt.find(filter)
        .populate('supplierId', 'name phone code')
        .populate('warehouse', 'name code')
        .populate('createdBy', 'fullName')
        .sort({ createdAt: -1 })
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
 * ───────────────────────────────────────────────────────────── */
export const getPurchaseReceipt = async (req, res, next) => {
  try {
    const receipt = await PurchaseReceipt.findById(req.params.id)
      .populate('supplierId', 'name phone code address')
      .populate('warehouse', 'name code')
      .populate('items.itemId', 'name code units')
      .populate('createdBy', 'fullName')
      .populate('confirmedBy', 'fullName')
      .populate('cancelledBy', 'fullName');

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
      warehouse,
      items,
      discount = 0,
      taxRate = 0,
      notes,
      initialPayment = 0,
      initialPaymentMethod = 'cash',
    } = req.body;

    if (!supplierId) throw new AppError('المورد مطلوب', 400, 'MISSING_SUPPLIER');
    if (!warehouse) throw new AppError('المخزن مطلوب', 400, 'MISSING_WAREHOUSE');
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('الإيصال يحتاج بنداً واحداً على الأقل', 400, 'EMPTY_ITEMS');
    }

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) throw new AppError('المورد غير موجود', 404, 'SUPPLIER_NOT_FOUND');

    const { subtotal, discountAmount, taxAmount, total } = calculateTotals(
      items,
      discount,
      taxRate
    );

    const receiptNumber = await generateReceiptNumber();

    const receipt = await PurchaseReceipt.create({
      receiptNumber,
      supplierId,
      warehouse,
      items: items.map((it) => ({
        itemId: it.itemId,
        batch: it.batch,
        expiry: it.expiry,
        quantity: Number(it.quantity),
        unitCost: Number(it.unitCost),
        unitPrice: Number(it.unitPrice || 0),
      })),
      subtotal,
      discountAmount,
      taxRate: Number(taxRate) || 0,
      taxAmount,
      total,
      initialPayment: Number(initialPayment) || 0,
      initialPaymentMethod,
      status: 'draft',
      notes,
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
      throw new AppError(
        'يمكن تعديل المسودات فقط',
        400,
        'NOT_A_DRAFT'
      );
    }

    const before = receipt.toObject();

    const {
      supplierId,
      warehouse,
      items,
      discount,
      taxRate,
      notes,
      initialPayment,
      initialPaymentMethod,
    } = req.body;

    // ─── 1) تغيير المورد (إن طُلب) ───
    if (supplierId && String(supplierId) !== String(receipt.supplierId)) {
      const supplier = await Supplier.findById(supplierId);
      if (!supplier) throw new AppError('المورد غير موجود', 404, 'SUPPLIER_NOT_FOUND');
      receipt.supplierId = supplierId;
    }

    // ─── 2) تغيير المخزن ───
    if (warehouse) receipt.warehouse = warehouse;

    // ─── 3) تحديث البنود والمجاميع (إن طُلب) ───
    if (Array.isArray(items)) {
      if (items.length === 0) {
        throw new AppError('الإيصال يحتاج بنداً واحداً على الأقل', 400, 'EMPTY_ITEMS');
      }

      const newDiscount = discount !== undefined ? discount : receipt.discountAmount;
      const newTaxRate = taxRate !== undefined ? taxRate : receipt.taxRate;

      const { subtotal, discountAmount, taxAmount, total } = calculateTotals(
        items,
        newDiscount,
        newTaxRate
      );

      receipt.items = items.map((it) => ({
        itemId: it.itemId,
        batch: it.batch,
        expiry: it.expiry,
        quantity: Number(it.quantity),
        unitCost: Number(it.unitCost),
        unitPrice: Number(it.unitPrice || 0),
      }));
      receipt.subtotal = subtotal;
      receipt.discountAmount = discountAmount;
      receipt.taxRate = Number(newTaxRate) || 0;
      receipt.taxAmount = taxAmount;
      receipt.total = total;
    } else {
      // تحديث الخصم/الضريبة فقط (بدون تغيير البنود)
      if (discount !== undefined || taxRate !== undefined) {
        const newDiscount = discount !== undefined ? discount : receipt.discountAmount;
        const newTaxRate = taxRate !== undefined ? taxRate : receipt.taxRate;

        const { subtotal, discountAmount, taxAmount, total } = calculateTotals(
          receipt.items,
          newDiscount,
          newTaxRate
        );
        receipt.subtotal = subtotal;
        receipt.discountAmount = discountAmount;
        receipt.taxRate = Number(newTaxRate) || 0;
        receipt.taxAmount = taxAmount;
        receipt.total = total;
      }
    }

    // ─── 4) تحديث الدفعة الأولى ───
    if (initialPayment !== undefined) {
      receipt.initialPayment = Number(initialPayment) || 0;
    }
    if (initialPaymentMethod) {
      receipt.initialPaymentMethod = initialPaymentMethod;
    }

    // ─── 5) ملاحظات ───
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
 * تأكيد الإيصال — Phase 3: Stock + CashTransaction + PURCHASE entry.
 * ───────────────────────────────────────────────────────────── */
export const confirmPurchaseReceipt = async (req, res, next) => {
  try {
    const {
      initialPayment,
      initialPaymentMethod,
      cashFundId,
      bankAccountId,
    } = req.body;

    const receipt = await PurchaseReceipt.findById(req.params.id);
    if (!receipt) {
      throw new AppError('الإيصال غير موجود', 404, 'RECEIPT_NOT_FOUND');
    }
    if (receipt.status !== 'draft') {
      throw new AppError('يمكن تأكيد المسودات فقط', 409, 'INVALID_STATUS');
    }

    const paidAmount = round2(
      initialPayment !== undefined ? initialPayment : receipt.initialPayment || 0
    );
    const remainingAmount = round2(receipt.total - paidAmount);
    const method =
      initialPaymentMethod || receipt.initialPaymentMethod || 'cash';

    if (paidAmount > 0 && method === 'cash' && !cashFundId) {
      throw new AppError('الصندوق مطلوب للدفع النقدي', 400, 'MISSING_CASH_FUND');
    }
    if (paidAmount > 0 && method === 'bank' && !bankAccountId) {
      throw new AppError('الحساب البنكي مطلوب للدفع البنكي', 400, 'MISSING_BANK_ACCOUNT');
    }

    // ─── 1) إضافة Stock (عبر returnStock كـ Upsert) ───
    try {
      await returnStock({
        issuedLots: receipt.items.map((it) => ({
          itemId: it.itemId,
          warehouseId: receipt.warehouse,
          batch: it.batch,
          expiry: it.expiry,
          quantity: it.quantity,
          unitCost: it.unitCost,
        })),
        user: req.user,
      });
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
        { _id: receipt.supplierId },
        { $inc: { currentBalance: remainingAmount } }
      );
    }

    // ─── 4) PURCHASE entry (مخزون مدين / صندوق أو ذمم دائن) ───
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
      // Rollback Supplier
      if (remainingAmount > 0) {
        await Supplier.updateOne(
          { _id: receipt.supplierId },
          { $inc: { currentBalance: -remainingAmount } }
        );
      }
      throw err;
    }

    // ─── 5) تحديث الحالة ───
    receipt.status = 'received';
    receipt.confirmedBy = req.user._id;
    receipt.confirmedAt = new Date();
    receipt.initialPayment = paidAmount;
    receipt.initialPaymentMethod = method;
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