/**
 * @file customerReturnController.js
 * @description
 * مرتجعات العملاء — 7 أيام فترة سماح.
 *
 * عند approve:
 *  - Stock يُرجع
 *  - CashTransaction (إن refund cash) أو خصم رصيد (balance_deduction)
 *  - AccountingEntry (SALE_RETURN)
 */

import CustomerReturn from '../models/CustomerReturn.js';
import Customer from '../models/Customer.js';
import cashService from '../services/cashService.js';
import accountingService from '../services/accountingService.js';
import { returnStock } from '../services/stockService.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { AUDIT_ACTIONS } from '../utils/constants.js';
import logger from '../utils/logger.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/* ─────────────────────────────────────────────────────────────
 * GET /api/customer-returns
 * ───────────────────────────────────────────────────────────── */
export const listCustomerReturns = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, customerId, from, to } = req.query;

    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (customerId) filter.customerId = customerId;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }
    if (req.scope?.salesRepId) filter.salesRepId = req.scope.salesRepId;
    if (req.scope?.customerId) filter.customerId = req.scope.customerId;

    const skip = (Number(page) - 1) * Number(limit);
    const [returns, total] = await Promise.all([
      CustomerReturn.find(filter)
        .populate('customerId', 'name phone code')
        .populate('invoiceId', 'invoiceNumber')
        .sort({ createdAt: -1 })
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
      .populate('customerId', 'name phone code')
      .populate('invoiceId', 'invoiceNumber total')
      .populate('items.itemId', 'name code units')
      .populate('approvedBy', 'fullName');

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
    const { customerId, invoiceId, items, reason, settlementType, notes } = req.body;

    if (!customerId) throw new AppError('العميل مطلوب', 400, 'MISSING_CUSTOMER');
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('المرتجع يحتاج بنداً واحداً على الأقل', 400, 'EMPTY_ITEMS');
    }
    if (!['cash_refund', 'balance_deduction'].includes(settlementType)) {
      throw new AppError('طريقة التسوية غير صحيحة', 400, 'INVALID_SETTLEMENT');
    }

    const customer = await Customer.findById(customerId);
    if (!customer) throw new AppError('العميل غير موجود', 404, 'CUSTOMER_NOT_FOUND');

    const total = round2(
      items.reduce((sum, it) => sum + Number(it.unitPrice) * Number(it.quantity), 0)
    );

    const returnDoc = await CustomerReturn.create({
      customerId,
      invoiceId: invoiceId || null,
      items,
      total,
      reason,
      settlementType,
      notes,
      status: 'pending',
      createdBy: req.user._id,
    });

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.CREATE,
      resource: 'CustomerReturn',
      resourceId: returnDoc._id,
      description: `مرتجع عميل جديد — ${total} SDG`,
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
 * اعتماد مرتجع — Phase 3 integration
 * ───────────────────────────────────────────────────────────── */
export const approveCustomerReturn = async (req, res, next) => {
  try {
    const { settledAmount, cashFundId } = req.body;

    const returnDoc = await CustomerReturn.findById(req.params.id);
    if (!returnDoc) throw new AppError('المرتجع غير موجود', 404, 'RETURN_NOT_FOUND');
    if (returnDoc.status !== 'pending') {
      throw new AppError('المرتجع ليس في حالة pending', 409, 'INVALID_STATUS');
    }

    const amount = round2(settledAmount ?? returnDoc.total);

    // ─── 1) إرجاع Stock ───
    try {
      await returnStock({
        issuedLots: returnDoc.items.map((it) => ({
          itemId: it.itemId,
          warehouseId: returnDoc.warehouse || it.warehouse,
          batch: it.batch,
          quantity: it.quantity,
          unitCost: it.unitCost || 0,
        })),
        user: req.user,
      });
    } catch (err) {
      logger.warn(`[customerReturn] فشل إرجاع Stock: ${err.message}`);
      throw new AppError('فشل إرجاع المخزون', 500, 'STOCK_RETURN_FAILED');
    }

    // ─── 2) التسوية المالية ───
    if (returnDoc.settlementType === 'cash_refund') {
      // CashTransaction (خروج)
      await cashService.createCashTransaction({
        direction: 'out',
        amount,
        method: 'cash',
        cashFundId: cashFundId || null,
        transactionDate: new Date(),
        description: `رد نقدي مرتجع — ${returnDoc._id}`,
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
        cashFundId: cashFundId || null,
        user: req.user,
        description: `مرتجع بيع نقدي`,
      });
    } else if (returnDoc.settlementType === 'balance_deduction') {
      // خصم من رصيد العميل
      await Customer.updateOne(
        { _id: returnDoc.customerId },
        { $inc: { currentBalance: -amount } }
      );

      await accountingService.createSaleReturnEntry({
        amount,
        refundType: 'balance',
        date: new Date(),
        sourceType: 'CustomerReturn',
        sourceId: returnDoc._id,
        user: req.user,
        description: `مرتجع بيع (خصم رصيد)`,
      });
    }

    // ─── 3) تحديث الحالة ───
    returnDoc.status = 'approved';
    returnDoc.settledAmount = amount;
    returnDoc.approvedBy = req.user._id;
    returnDoc.approvedAt = new Date();
    await returnDoc.save();

    // ─── 4) Audit ───
    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'CustomerReturn',
      resourceId: returnDoc._id,
      description: `اعتماد مرتجع — ${amount} SDG`,
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
    if (returnDoc.status !== 'pending') {
      throw new AppError('المرتجع ليس في حالة pending', 409, 'INVALID_STATUS');
    }

    returnDoc.status = 'rejected';
    returnDoc.rejectionReason = rejectionReason;
    returnDoc.rejectedBy = req.user._id;
    returnDoc.rejectedAt = new Date();
    await returnDoc.save();

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'CustomerReturn',
      resourceId: returnDoc._id,
      description: `رفض مرتجع — ${rejectionReason}`,
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