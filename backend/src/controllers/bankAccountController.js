/**
 * bankAccountController.js
 *
 * إدارة الحساب البنكي — مبسّط (بدون isActive / isDefault).
 *
 * ⚠️ إصلاح 2026-11-12:
 * - حذف isActive نهائياً.
 * - createBankAccount: لا updateMany — لا isActive.
 * - updateBankAccount: لا isActive.
 * - deleteBankAccount: حذف فعلي (بدل soft delete).
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
    const { page = 1, limit = 20, search } = req.query;

    const filter = {};
    if (search) {
      filter.$or = [
        { bankName: { $regex: search, $options: 'i' } },
        { accountNumber: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [accounts, total] = await Promise.all([
      BankAccount.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      BankAccount.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: accounts,
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
 * يُرجع أول حساب بنكي (لأنه واحد فقط).
 * ───────────────────────────────────────────────────────────── */
export const getActiveBankAccount = async (req, res, next) => {
  try {
    const account = await BankAccount.findOne().sort({ createdAt: 1 }).lean();
    res.status(200).json({ success: true, data: account || null });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/bank-accounts
 * إنشاء حساب بنكي (حساب واحد فقط — إذا موجود، نرفض).
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

    // 2) إنشاء الحساب (بدون isActive / isDefault)
    const { isActive, isDefault, ...payload } = req.body;
    const account = await BankAccount.create(payload);

    // 3) قيد افتتاحي إذا كان الرصيد > 0
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
      message: 'تم إنشاء الحساب البنكي',
      data: account,
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────
 * PATCH /api/bank-accounts/:id
 * تحديث الحساب (بدون isActive / isDefault).
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
    // ✅ حذف isActive / isDefault (لا يوجدان في Model)
    delete req.body.isActive;
    delete req.body.isDefault;

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
 * حذف فعلي (بدون soft delete).
 * ───────────────────────────────────────────────────────────── */
export const deleteBankAccount = async (req, res, next) => {
  try {
    const account = await BankAccount.findById(req.params.id);
    if (!account) {
      throw new AppError('الحساب البنكي غير موجود', 404, 'BANK_ACCOUNT_NOT_FOUND');
    }

    // منع الحذف إذا كان له رصيد
    if (account.currentBalance > 0) {
      throw new AppError(
        `لا يمكن حذف حساب له رصيد (${account.currentBalance} SDG). اسحب الرصيد أولاً.`,
        400,
        'CANNOT_DELETE_WITH_BALANCE'
      );
    }

    await account.deleteOne();

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.DELETE,
      resource: 'BankAccount',
      resourceId: account._id,
      description: `حذف حساب بنكي: ${account.bankName}`,
      success: true,
    });

    res.status(200).json({
      success: true,
      message: 'تم حذف الحساب البنكي',
    });
  } catch (error) {
    next(error);
  }
};