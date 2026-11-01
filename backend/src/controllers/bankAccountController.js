/**
 * bankAccountController.js
 *
 * إدارة الحساب البنكي (BankAccount).
 * ملاحظة: النظام يدعم حساباً بنكياً واحداً فقط (متطلب).
 * لذلك أي إنشاء جديد يُعطّل الحساب السابق تلقائياً.
 */

import BankAccount from '../models/BankAccount.js';
import accountingService from '../services/accountingService.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { AUDIT_ACTIONS } from '../utils/constants.js';
import logger from '../utils/logger.js';

/* ─────────────────────────────────────────────────────────────
 * GET /api/bank-accounts
 * ───────────────────────────────────────────────────────────── */
export const listBankAccounts = async (req, res, next) => {
  try {
    const { page, limit, search, isActive } = req.query;

    const filter = {};
    if (search) {
      filter.$or = [
        { bankName: { $regex: search, $options: 'i' } },
        { accountNumber: { $regex: search, $options: 'i' } },
        { accountName: { $regex: search, $options: 'i' } },
      ];
    }
    if (isActive !== 'all') {
      filter.isActive = isActive === 'true';
    }

    const skip = (page - 1) * limit;
    const [accounts, total] = await Promise.all([
      BankAccount.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      BankAccount.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: accounts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/bank-accounts/:id
 * ───────────────────────────────────────────────────────────── */
export const getBankAccount = async (req, res, next) => {
  try {
    const account = await BankAccount.findById(req.params.id);
    if (!account) {
      throw new AppError('الحساب البنكي غير موجود', 404, 'BANK_ACCOUNT_NOT_FOUND');
    }
    res.status(200).json({ success: true, data: account });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/bank-accounts/active
 * يُرجع الحساب البنكي النشط (للاستخدام في CashSelector)
 * ───────────────────────────────────────────────────────────── */
export const getActiveBankAccount = async (req, res, next) => {
  try {
    const account = await BankAccount.findOne({ isActive: true }).lean();
    if (!account) {
      return res.status(200).json({ success: true, data: null });
    }
    res.status(200).json({ success: true, data: account });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/bank-accounts
 * إنشاء حساب بنكي (يُعطّل السابق تلقائياً)
 * ───────────────────────────────────────────────────────────── */
export const createBankAccount = async (req, res, next) => {
  try {
    // 1) منع تكرار رقم الحساب
    const exists = await BankAccount.findOne({
      accountNumber: req.body.accountNumber,
    });
    if (exists) {
      throw new AppError(
        'رقم الحساب البنكي مستخدم مسبقاً',
        400,
        'DUPLICATE_ACCOUNT_NUMBER'
      );
    }

    // 2) تعطيل الحسابات السابقة (حساب واحد فقط)
    await BankAccount.updateMany(
      { isActive: true },
      { $set: { isActive: false } }
    );

    // 3) إنشاء الحساب
    const account = await BankAccount.create({ ...req.body, isActive: true });

    // 4) قيد افتتاحي إذا كان الرصيد > 0
    if (account.openingBalance > 0) {
      try {
        await accountingService.createEntry({
          entryType: 'OPENING',
          description: `رصيد افتتاحي — حساب بنكي ${account.bankName}`,
          lines: [
            {
              accountCode: accountingService.ACCOUNT_CODES.BANK,
              accountName: 'البنك',
              debit: account.openingBalance,
              credit: 0,
              description: 'رصيد افتتاحي',
            },
            {
              accountCode: accountingService.ACCOUNT_CODES.OPENING_EQUITY,
              accountName: 'حقوق الملكية الافتتاحية',
              debit: 0,
              credit: account.openingBalance,
              description: 'رصيد افتتاحي',
            },
          ],
          sourceType: 'BankAccount',
          sourceId: account._id,
          bankAccountId: account._id,
          user: req.user,
        });
      } catch (err) {
        logger.warn(`فشل إنشاء قيد افتتاحي للحساب البنكي: ${err.message}`);
      }
    }

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.CREATE,
      resource: 'BankAccount',
      resourceId: account._id,
      description: `إنشاء حساب بنكي: ${account.bankName} — ${account.accountNumber}`,
      success: true,
      meta: { after: account.toObject() },
    });

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الحساب البنكي (تم تعطيل الحساب السابق إن وُجد)',
      data: account,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * PATCH /api/bank-accounts/:id
 * ───────────────────────────────────────────────────────────── */
export const updateBankAccount = async (req, res, next) => {
  try {
    const account = await BankAccount.findById(req.params.id);
    if (!account) {
      throw new AppError('الحساب البنكي غير موجود', 404, 'BANK_ACCOUNT_NOT_FOUND');
    }

    const before = account.toObject();

    // منع تعديل openingBalance
    delete req.body.openingBalance;
    delete req.body.balance;

    // منع تكرار رقم الحساب
    if (req.body.accountNumber && req.body.accountNumber !== account.accountNumber) {
      const exists = await BankAccount.findOne({
        accountNumber: req.body.accountNumber,
        _id: { $ne: account._id },
      });
      if (exists) {
        throw new AppError('رقم الحساب مستخدم مسبقاً', 400, 'DUPLICATE_ACCOUNT_NUMBER');
      }
    }

    // إذا طُلب isActive = true، نعطّل الباقي
    if (req.body.isActive === true) {
      await BankAccount.updateMany(
        { _id: { $ne: account._id } },
        { $set: { isActive: false } }
      );
    }

    Object.assign(account, req.body);
    await account.save();

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'BankAccount',
      resourceId: account._id,
      description: `تعديل حساب بنكي: ${account.bankName}`,
      success: true,
      meta: { before, after: account.toObject() },
    });

    res.status(200).json({
      success: true,
      message: 'تم تحديث الحساب البنكي',
      data: account,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * DELETE /api/bank-accounts/:id
 * Soft delete فقط (لا نحذف حساباً له حركات)
 * ───────────────────────────────────────────────────────────── */
export const deleteBankAccount = async (req, res, next) => {
  try {
    const account = await BankAccount.findById(req.params.id);
    if (!account) {
      throw new AppError('الحساب البنكي غير موجود', 404, 'BANK_ACCOUNT_NOT_FOUND');
    }

    // Soft delete دائماً (لأمان البيانات المالية)
    account.isActive = false;
    await account.save();

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'BankAccount',
      resourceId: account._id,
      description: `تعطيل حساب بنكي: ${account.bankName}`,
      success: true,
    });

    res.status(200).json({
      success: true,
      message: 'تم تعطيل الحساب البنكي (يمكن إعادة تفعيله لاحقاً)',
      data: account,
    });
  } catch (error) {
    next(error);
  }
};