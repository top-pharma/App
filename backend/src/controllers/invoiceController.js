/**
 * @file invoiceController.js
 * @description
 * Controllers للفواتير — تمرير cashFundId و bankAccountId للخدمة.
 * المنطق كله في invoiceService.
 *
 * ⚠️ Phase A.5 (2026-11-07):
 * - نمرّر `req` كاملاً لـ invoiceService (لـ logAuditEvent + priceValidationService).
 * - نستخدم req.validatedQuery للقوائم.
 * - نُصلح populate('salesRep', 'fullName') → 'name'.
 * - نُصلح getMyInvoices → req.user.linkedEntity?.id.
 *
 * ✅ 🅳 C (2026-11-10):
 * - getInvoice: إضافة returnedQuantity + remainingQuantity لكل items[]
 *   (لـ CustomerReturnForm: منع تجاوز الكمية المُرجعة).
 *
 * ✅ 🅵 (2026-11-10) — إصلاح fetchStats (Dashboard KPIs):
 * - listInvoices: إضافة قراءة `unpaid` + `overdue` + `isDraft` + `hasReturns`
 *   من req.validatedQuery — لتُعيد كل KPI رقماً صحيحاً (بدل 10 لكل واحدة).
 * - السبب: fetchStats في InvoicesContext يستدعي 4 استدعاءات بـ unpaid/overdue/isDraft
 *   لكن controller لم يكن يقرأها → كلها تُرجع نفس النتيجة (10).
 */

import Invoice from '../models/Invoice.js';
import CustomerReturn, { RETURN_STATUSES } from '../models/CustomerReturn.js';
import invoiceService from '../services/invoiceService.js';
import { AppError } from '../middlewares/errorMiddleware.js';

/**
 * GET /api/invoices — قائمة الفواتير (مع Scope).
 *
 * ✅ 🅵: يدعم الآن unpaid / overdue / isDraft / hasReturns.
 */
export const listInvoices = async (req, res, next) => {
  try {
    const q = req.validatedQuery || req.query;
    const {
      page = 1,
      limit = 20,
      status,
      pharmacy,
      salesRep,
      from,
      to,
      search,
      unpaid,
      overdue,
      isDraft,
      hasReturns,
    } = q;

    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (pharmacy) filter.pharmacy = pharmacy;
    if (salesRep) filter.salesRep = salesRep;
    if (from || to) {
      filter.invoiceDate = {};
      if (from) filter.invoiceDate.$gte = new Date(from);
      if (to) filter.invoiceDate.$lte = new Date(to);
    }
    if (search) {
      filter.invoiceNumber = { $regex: search, $options: 'i' };
    }

    // ✅ 🅵: unpaid — فواتير لم تُدفع بالكامل (ليست مسودة/ملغاة/مدفوعة)
    if (unpaid === true) {
      filter.remainingAmount = { $gt: 0 };
      filter.status = { $nin: ['draft', 'cancelled', 'paid'] };
    }

    // ✅ 🅵: overdue — فواتير متأخرة (dueDate < now + remaining > 0)
    if (overdue === true) {
      filter.dueDate = { $lt: new Date() };
      filter.remainingAmount = { $gt: 0 };
      filter.status = { $nin: ['draft', 'cancelled', 'paid'] };
    }

    // ✅ 🅵: isDraft — فواتير مبدئية فقط
    if (isDraft === true) {
      filter.status = 'draft';
    }

    // ✅ 🅵: hasReturns — فواتير لها مرتجعات معتمدة
    // ⚠️ هذا يتطلب استعلاماً منفصلاً — نتركه لـ Phase لاحقة إذا لزم
    if (hasReturns === true) {
      // نجلب IDs الفواتير التي لها مرتجعات معتمدة
      const returnsWithInvoices = await CustomerReturn.find(
        { status: RETURN_STATUSES.CONFIRMED },
        { originalInvoice: 1 }
      ).lean();
      const invoiceIds = returnsWithInvoices
        .map((r) => r.originalInvoice)
        .filter(Boolean);
      filter._id = { $in: invoiceIds };
    }

    // Scope: sales_rep يرى فواتيره فقط
    if (req.scope?.salesRepId) {
      filter.salesRep = req.scope.salesRepId;
    }
    // Scope: pharmacy يرى فواتيره فقط
    if (req.scope?.customerId) {
      filter.pharmacy = req.scope.customerId;
    }

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .populate('pharmacy', 'name phone code')
        .populate('salesRep', 'name email')
        .sort({ invoiceDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Invoice.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: invoices,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/invoices/my-invoices — فواتير المستخدم (sales_rep أو pharmacy).
 */
export const getMyInvoices = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'sales_rep') {
      filter.salesRep = req.user._id;
    } else if (req.user.role === 'pharmacy') {
      const customerId = req.user.linkedEntity?.id;
      if (!customerId) {
        throw new AppError(
          'حساب الصيدلية غير مربوط بعميل.',
          403,
          'PHARMACY_NOT_LINKED'
        );
      }
      filter.pharmacy = customerId;
    } else {
      throw new AppError(
        'هذا المسار للمندوبين والصيدليات فقط',
        403,
        'FORBIDDEN'
      );
    }

    const invoices = await Invoice.find(filter)
      .populate('pharmacy', 'name phone')
      .sort({ invoiceDate: -1 })
      .limit(100)
      .lean();

    res.status(200).json({ success: true, data: invoices });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/invoices/:id
 *
 * ✅ 🅳 C: إضافة returnedQuantity + remainingQuantity لكل items[]
 * (لـ CustomerReturnForm: منع تجاوز الكمية المُرجعة).
 */
export const getInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('pharmacy', 'name phone code address')
      .populate('salesRep', 'name email')
      .populate('warehouse', 'name code')
      .populate('finalizedBy', 'name')
      .populate('items.item', 'tradeName scientificName units');

    if (!invoice) {
      throw new AppError('الفاتورة غير موجودة', 404, 'INVOICE_NOT_FOUND');
    }

    // Scope
    if (
      req.scope?.salesRepId &&
      String(invoice.salesRep?._id) !== String(req.scope.salesRepId)
    ) {
      throw new AppError('غير مصرح', 403, 'FORBIDDEN');
    }
    if (
      req.scope?.customerId &&
      String(invoice.pharmacy?._id) !== String(req.scope.customerId)
    ) {
      throw new AppError('غير مصرح', 403, 'FORBIDDEN');
    }

    // ✅ 🅳 C: حساب returnedQuantity + remainingQuantity لكل بند
    // (مجموع المرتجعات المعتمدة فقط — pending لا يُحسب)
    const returnedAgg = await CustomerReturn.aggregate([
      {
        $match: {
          originalInvoice: invoice._id,
          status: RETURN_STATUSES.CONFIRMED,
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

    const returnedMap = new Map();
    for (const r of returnedAgg) {
      const key = `${String(r._id.item)}:${String(r._id.batch).toUpperCase()}`;
      returnedMap.set(key, Math.round((Number(r.quantity) + Number.EPSILON) * 100) / 100);
    }

    // نسخة plain object من الفاتورة
    const invoiceObj = invoice.toObject();

    invoiceObj.items = (invoiceObj.items || []).map((it) => {
      const key = `${String(it.item?._id || it.item)}:${String(it.batch).toUpperCase()}`;
      const returned = returnedMap.get(key) || 0;
      const original = Number(it.quantity) || 0;
      const remaining = Math.max(0, Math.round((original - returned + Number.EPSILON) * 100) / 100);

      return {
        ...it,
        returnedQuantity: returned,
        remainingQuantity: remaining,
      };
    });

    res.status(200).json({ success: true, data: invoiceObj });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/invoices
 * إنشاء فاتورة مباشرة.
 */
export const createInvoice = async (req, res, next) => {
  try {
    const invoice = await invoiceService.createInvoice({
      body: {
        ...req.body,
        cashFundId: req.body.cashFundId || null,
        bankAccountId: req.body.bankAccountId || null,
      },
      user: req.user,
      req,
    });

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الفاتورة',
      data: invoice,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/invoices/draft
 */
export const createDraft = async (req, res, next) => {
  try {
    const draft = await invoiceService.createDraft({
      body: req.body,
      user: req.user,
      req,
    });

    res.status(201).json({
      success: true,
      message: 'تم إنشاء المسودة',
      data: draft,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/invoices/:id/draft
 */
export const updateDraft = async (req, res, next) => {
  try {
    const draft = await invoiceService.updateDraft({
      invoiceId: req.params.id,
      body: req.body,
      user: req.user,
      req,
    });

    res.status(200).json({
      success: true,
      message: 'تم تحديث المسودة',
      data: draft,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/invoices/:id/finalize
 */
export const finalizeInvoice = async (req, res, next) => {
  try {
    const invoice = await invoiceService.finalizeInvoice({
      invoiceId: req.params.id,
      body: {
        ...req.body,
        cashFundId: req.body.cashFundId || null,
        bankAccountId: req.body.bankAccountId || null,
      },
      user: req.user,
      req,
    });

    res.status(200).json({
      success: true,
      message: 'تم اعتماد الفاتورة',
      data: invoice,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/invoices/:id
 */
export const updateInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      throw new AppError('الفاتورة غير موجودة', 404, 'INVOICE_NOT_FOUND');
    }
    if (invoice.status !== 'draft') {
      throw new AppError('يمكن تعديل المسودات فقط', 400, 'NOT_A_DRAFT');
    }

    return updateDraft(req, res, next);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/invoices/:id/payments
 */
export const registerPayment = async (req, res, next) => {
  try {
    const { amount, paymentMethod, cashFundId, bankAccountId } = req.body;

    if (!amount || amount <= 0) {
      throw new AppError('المبلغ مطلوب وأكبر من صفر', 400, 'INVALID_AMOUNT');
    }

    const invoice = await invoiceService.registerPayment({
      invoiceId: req.params.id,
      amount,
      paymentMethod: paymentMethod || 'cash',
      cashFundId: cashFundId || null,
      bankAccountId: bankAccountId || null,
      user: req.user,
      req,
    });

    res.status(200).json({
      success: true,
      message: 'تم تسجيل الدفعة',
      data: invoice,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/invoices/:id/cancel
 */
export const cancelInvoice = async (req, res, next) => {
  try {
    const { cancelReason, reason } = req.body;
    const finalReason = cancelReason || reason || '';

    const invoice = await invoiceService.cancelInvoice({
      invoiceId: req.params.id,
      reason: finalReason,
      user: req.user,
      req,
    });

    res.status(200).json({
      success: true,
      message: 'تم إلغاء الفاتورة',
      data: invoice,
    });
  } catch (error) {
    next(error);
  }
};