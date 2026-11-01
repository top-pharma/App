/**
 * @file invoiceController.js
 * @description
 * Controllers للفواتير — تمرير cashFundId و bankAccountId للخدمة.
 * المنطق كله في invoiceService.
 */

import Invoice from '../models/Invoice.js';
import invoiceService from '../services/invoiceService.js';
import { AppError } from '../middlewares/errorMiddleware.js';

/**
 * GET /api/invoices — قائمة الفواتير (مع Scope).
 */
export const listInvoices = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, pharmacy, salesRep, from, to, search } = req.query;

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

    // Scope: sales_rep يرى فواتيره فقط
    if (req.scope?.salesRepId) {
      filter.salesRep = req.scope.salesRepId;
    }
    // Scope: pharmacy يرى فواتيره فقط
    if (req.scope?.customerId) {
      filter.pharmacy = req.scope.customerId;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .populate('pharmacy', 'name phone code')
        .populate('salesRep', 'fullName email')
        .sort({ invoiceDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Invoice.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: invoices,
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

/**
 * GET /api/invoices/my-invoices — فواتير المستخدم (sales_rep أو pharmacy).
 */
export const getMyInvoices = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'sales_rep') {
      filter.salesRep = req.user._id;
    } else if (req.user.role === 'pharmacy') {
      filter.pharmacy = req.user.customerId;
    } else {
      throw new AppError('هذا المسار للمندوبين والصيدليات فقط', 403, 'FORBIDDEN');
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
 */
export const getInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('pharmacy', 'name phone code address')
      .populate('salesRep', 'fullName email')
      .populate('warehouse', 'name code')
      .populate('finalizedBy', 'fullName');

    if (!invoice) {
      throw new AppError('الفاتورة غير موجودة', 404, 'INVOICE_NOT_FOUND');
    }

    // Scope
    if (req.scope?.salesRepId && String(invoice.salesRep?._id) !== String(req.scope.salesRepId)) {
      throw new AppError('غير مصرح', 403, 'FORBIDDEN');
    }
    if (req.scope?.customerId && String(invoice.pharmacy?._id) !== String(req.scope.customerId)) {
      throw new AppError('غير مصرح', 403, 'FORBIDDEN');
    }

    res.status(200).json({ success: true, data: invoice });
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
      scope: req.scope,
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
 * إنشاء مسودة.
 */
export const createDraft = async (req, res, next) => {
  try {
    const draft = await invoiceService.createDraft({
      body: req.body,
      user: req.user,
      scope: req.scope,
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
 * تعديل مسودة.
 */
export const updateDraft = async (req, res, next) => {
  try {
    const draft = await invoiceService.updateDraft({
      invoiceId: req.params.id,
      body: req.body,
      user: req.user,
      scope: req.scope,
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
 * اعتماد مسودة.
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
      scope: req.scope,
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
 * تحديث فاتورة قائمة (نادر — فقط notes/ملاحظات).
 */
export const updateInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) throw new AppError('الفاتورة غير موجودة', 404, 'INVOICE_NOT_FOUND');
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
 * تسجيل دفعة على فاتورة.
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
      scope: req.scope,
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
 * إلغاء فاتورة.
 */
export const cancelInvoice = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const invoice = await invoiceService.cancelInvoice({
      invoiceId: req.params.id,
      reason,
      user: req.user,
      scope: req.scope,
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