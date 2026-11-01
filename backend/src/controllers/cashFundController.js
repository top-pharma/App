/**
 * cashFundController.js
 *
 * إدارة صناديق النقدية (CashFund):
 *  - CRUD كامل
 *  - setAsDefault (صندوق افتراضي واحد فقط)
 *  - deposit / withdrawal (حركات يدوية)
 *
 * كل حركة تُنشئ CashTransaction + AccountingEntry تلقائياً.
 */

import CashFund from '../models/CashFund.js';
import CashTransaction from '../models/CashTransaction.js';
import accountingService from '../services/accountingService.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { AUDIT_ACTIONS } from '../utils/constants.js';
import logger from '../utils/logger.js';

/* ─────────────────────────────────────────────────────────────
 * GET /api/cash-funds
 * قائمة الصناديق مع Pagination + فلترة + بحث
 * ───────────────────────────────────────────────────────────── */
export const listCashFunds = async (req, res, next) => {
  try {
    const { page, limit, search, isActive, sortBy, sortOrder } = req.query;

    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }
    if (isActive !== 'all') {
      filter.isActive = isActive === 'true';
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [funds, total] = await Promise.all([
      CashFund.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      CashFund.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: funds,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/cash-funds/:id
 * ───────────────────────────────────────────────────────────── */
export const getCashFund = async (req, res, next) => {
  try {
    const fund = await CashFund.findById(req.params.id);
    if (!fund) {
      throw new AppError('الصندوق غير موجود', 404, 'CASH_FUND_NOT_FOUND');
    }
    res.status(200).json({ success: true, data: fund });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/cash-funds
 * إنشاء صندوق جديد
 * ───────────────────────────────────────────────────────────── */
export const createCashFund = async (req, res, next) => {
  try {
    // 1) منع تكرار الاسم
    const exists = await CashFund.findOne({ name: req.body.name });
    if (exists) {
      throw new AppError('يوجد صندوق بنفس الاسم', 400, 'DUPLICATE_FUND_NAME');
    }

    // 2) توليد كود تلقائي إن لم يُمرَّر
    let code = req.body.code;
    if (!code) {
      const count = await CashFund.countDocuments();
      code = `CF-${String(count + 1).padStart(4, '0')}`;
    }

    // 3) إنشاء الصندوق
    const fund = await CashFund.create({ ...req.body, code });

    // 4) إذا طُلب isDefault = true، نُلغي default من غيره
    if (fund.isDefault) {
      await CashFund.updateMany(
        { _id: { $ne: fund._id } },
        { $set: { isDefault: false } }
      );
    }

    // 5) قيد افتتاحي إذا كان الرصيد > 0
    if (fund.openingBalance > 0) {
      try {
        await accountingService.createEntry({
          entryType: 'OPENING',
          description: `رصيد افتتاحي — صندوق ${fund.name}`,
          lines: [
            {
              accountCode: accountingService.ACCOUNT_CODES.CASH,
              accountName: 'الصندوق النقدي',
              debit: fund.openingBalance,
              credit: 0,
              description: 'رصيد افتتاحي',
            },
            {
              accountCode: accountingService.ACCOUNT_CODES.OPENING_EQUITY,
              accountName: 'حقوق الملكية الافتتاحية',
              debit: 0,
              credit: fund.openingBalance,
              description: 'رصيد افتتاحي',
            },
          ],
          sourceType: 'CashFund',
          sourceId: fund._id,
          cashFundId: fund._id,
          user: req.user,
        });
      } catch (err) {
        logger.warn(`فشل إنشاء قيد افتتاحي للصندوق ${fund._id}: ${err.message}`);
      }
    }

    // 6) Audit
    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.CREATE,
      resource: 'CashFund',
      resourceId: fund._id,
      description: `إنشاء صندوق: ${fund.name}`,
      success: true,
      meta: { after: fund.toObject() },
    });

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الصندوق بنجاح',
      data: fund,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * PATCH /api/cash-funds/:id
 * ───────────────────────────────────────────────────────────── */
export const updateCashFund = async (req, res, next) => {
  try {
    const fund = await CashFund.findById(req.params.id);
    if (!fund) {
      throw new AppError('الصندوق غير موجود', 404, 'CASH_FUND_NOT_FOUND');
    }

    const before = fund.toObject();

    // منع تعديل openingBalance بعد الإنشاء
    delete req.body.openingBalance;
    delete req.body.balance;

    // منع تكرار الاسم
    if (req.body.name && req.body.name !== fund.name) {
      const exists = await CashFund.findOne({
        name: req.body.name,
        _id: { $ne: fund._id },
      });
      if (exists) {
        throw new AppError('يوجد صندوق آخر بنفس الاسم', 400, 'DUPLICATE_FUND_NAME');
      }
    }

    Object.assign(fund, req.body);
    await fund.save();

    // إذا صار isDefault = true، نُلغي default من غيره
    if (fund.isDefault) {
      await CashFund.updateMany(
        { _id: { $ne: fund._id } },
        { $set: { isDefault: false } }
      );
    }

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'CashFund',
      resourceId: fund._id,
      description: `تعديل صندوق: ${fund.name}`,
      success: true,
      meta: { before, after: fund.toObject() },
    });

    res.status(200).json({
      success: true,
      message: 'تم تحديث الصندوق',
      data: fund,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * DELETE /api/cash-funds/:id
 * Soft delete — لا نحذف صندوقاً له حركات
 * ───────────────────────────────────────────────────────────── */
export const deleteCashFund = async (req, res, next) => {
  try {
    const fund = await CashFund.findById(req.params.id);
    if (!fund) {
      throw new AppError('الصندوق غير موجود', 404, 'CASH_FUND_NOT_FOUND');
    }

    // منع حذف الصندوق الافتراضي
    if (fund.isDefault) {
      throw new AppError(
        'لا يمكن حذف الصندوق الافتراضي. عيّن صندوقاً آخر افتراضياً أولاً.',
        400,
        'CANNOT_DELETE_DEFAULT'
      );
    }

    // منع حذف صندوق له حركات
    const txCount = await CashTransaction.countDocuments({ cashFundId: fund._id });
    if (txCount > 0) {
      // Soft delete بدلاً من الحذف
      fund.isActive = false;
      await fund.save();
      return res.status(200).json({
        success: true,
        message: 'تم تعطيل الصندوق (له حركات مالية — لا يمكن حذفه نهائياً)',
        data: fund,
      });
    }

    await fund.deleteOne();

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.DELETE,
      resource: 'CashFund',
      resourceId: fund._id,
      description: `حذف صندوق: ${fund.name}`,
      success: true,
      meta: { before: fund.toObject() },
    });

    res.status(200).json({
      success: true,
      message: 'تم حذف الصندوق نهائياً',
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/cash-funds/:id/set-default
 * تعيين الصندوق كافتراضي
 * ───────────────────────────────────────────────────────────── */
export const setAsDefault = async (req, res, next) => {
  try {
    const fund = await CashFund.findById(req.params.id);
    if (!fund) {
      throw new AppError('الصندوق غير موجود', 404, 'CASH_FUND_NOT_FOUND');
    }
    if (!fund.isActive) {
      throw new AppError('لا يمكن تعيين صندوق معطّل كافتراضي', 400, 'FUND_INACTIVE');
    }

    await CashFund.updateMany(
      { _id: { $ne: fund._id } },
      { $set: { isDefault: false } }
    );
    fund.isDefault = true;
    await fund.save();

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'CashFund',
      resourceId: fund._id,
      description: `تعيين ${fund.name} كصندوق افتراضي`,
      success: true,
    });

    res.status(200).json({
      success: true,
      message: 'تم تعيين الصندوق كافتراضي',
      data: fund,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/cash-funds/:id/movement
 * إيداع / سحب نقدي يدوي
 * ───────────────────────────────────────────────────────────── */
export const cashFundMovement = async (req, res, next) => {
  try {
    const { type, amount, description, referenceType, referenceId, date } = req.body;

    const fund = await CashFund.findById(req.params.id);
    if (!fund) {
      throw new AppError('الصندوق غير موجود', 404, 'CASH_FUND_NOT_FOUND');
    }
    if (!fund.isActive) {
      throw new AppError('الصندوق معطّل', 400, 'FUND_INACTIVE');
    }

    // عند السحب، نتحقق من كفاية الرصيد
    if (type === 'withdrawal' && fund.balance < amount) {
      throw new AppError(
        `رصيد الصندوق غير كافٍ. المتاح: ${fund.balance} SDG`,
        400,
        'INSUFFICIENT_FUND_BALANCE'
      );
    }

    // 1) إنشاء CashTransaction
    const tx = await CashTransaction.create({
      cashFundId: fund._id,
      direction: type === 'deposit' ? 'in' : 'out',
      amount,
      method: 'cash',
      transactionDate: date || new Date(),
      description: description || (type === 'deposit' ? 'إيداع نقدي' : 'سحب نقدي'),
      referenceType: referenceType || 'manual',
      referenceId: referenceId || null,
      createdBy: req.user?._id,
    });

    // 2) تحديث رصيد الصندوق
    fund.balance = type === 'deposit' ? fund.balance + amount : fund.balance - amount;
    await fund.save();

    // 3) قيد محاسبي
    if (type === 'withdrawal') {
      await accountingService.createExpenseEntry({
        amount,
        paymentMethod: 'cash',
        date: date || new Date(),
        sourceType: 'CashTransaction',
        sourceId: tx._id,
        cashFundId: fund._id,
        user: req.user,
        description: description || 'سحب نقدي',
        expenseAccountCode: accountingService.ACCOUNT_CODES.GENERAL_EXPENSE,
        expenseAccountName: 'مصروفات عمومية',
      });
    }
    // الإيداع لا يُنشئ قيداً (هو مجرد تحويل من مصدر خارجي — يُعالَج لاحقاً)

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.CREATE,
      resource: 'CashTransaction',
      resourceId: tx._id,
      description: `${type === 'deposit' ? 'إيداع' : 'سحب'} ${amount} SDG — ${fund.name}`,
      success: true,
    });

    res.status(201).json({
      success: true,
      message: type === 'deposit' ? 'تم الإيداع' : 'تم السحب',
      data: { transaction: tx, fund },
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/cash-funds/:id/transactions
 * حركات صندوق محدد (Pagination)
 * ───────────────────────────────────────────────────────────── */
export const getFundTransactions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, from, to } = req.query;

    const filter = { cashFundId: req.params.id };
    if (from || to) {
      filter.transactionDate = {};
      if (from) filter.transactionDate.$gte = new Date(from);
      if (to) filter.transactionDate.$lte = new Date(to);
    }

    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      CashTransaction.find(filter)
        .sort({ transactionDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CashTransaction.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: transactions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};