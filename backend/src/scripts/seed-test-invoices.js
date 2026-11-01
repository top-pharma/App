/**
 * @file seed-test-invoices.js
 * @description بيانات تجريبية للفواتير والمرتجعات — Phase 5.5 (نهائي).
 *
 * ✅ يستخدم cashService.createCashTransaction (الخدمة الفعلية)
 * ✅ يُسقط فهرس transactionNumber_1 القديم (بقايا نسخة قديمة)
 * ✅ الحقول مطابقة 100% للموديلات الفعلية
 */

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';

import { User, USER_ROLES } from '../models/User.js';
import { Customer } from '../models/Customer.js';
import { Warehouse } from '../models/Warehouse.js';
import { CashFund } from '../models/CashFund.js';
import { Stock } from '../models/Stock.js';
import { Item } from '../models/Item.js';
import { Invoice, INVOICE_STATUSES } from '../models/Invoice.js';
import {
  CustomerReturn,
  RETURN_STATUSES,
  SETTLEMENT_TYPES,
  RETURN_REASONS,
} from '../models/CustomerReturn.js';
import { AuditLog } from '../models/AuditLog.js';
import CashTransaction from '../models/CashTransaction.js';
import cashService from '../services/cashService.js';

// ============================================================
// Helpers
// ============================================================

async function cleanupPreviousData() {
  logger.info('🧹 جاري مسح البيانات التجريبية السابقة...');

  // ✅ إسقاط فهرس transactionNumber_1 القديم (بقايا نسخة قديمة من الموديل)
  try {
    await CashTransaction.collection.dropIndex('transactionNumber_1');
    logger.info('   🗑️ حذف فهرس transactionNumber_1 القديم');
  } catch (err) {
    if (err.code !== 27 && err.codeName !== 'IndexNotFound') {
      logger.warn(`   ⚠️ فشل إسقاط فهرس قديم: ${err.message}`);
    }
  }

  const testInvoices = await Invoice.find({ invoiceNumber: /^TEST-/ })
    .select('_id pharmacy status paymentType remainingAmount')
    .lean();

  const testInvoiceIds = testInvoices.map((i) => i._id);

  if (testInvoiceIds.length === 0) {
    logger.info('   لا توجد بيانات تجريبية سابقة.');
    return 0;
  }

  const deletedReturns = await CustomerReturn.deleteMany({
    originalInvoice: { $in: testInvoiceIds },
  });

  const deletedCash = await CashTransaction.deleteMany({
    referenceType: 'invoice',
    referenceId: { $in: testInvoiceIds },
  });

  // عكس رصيد العملاء للفواتير الآجلة/الأقساط (وليس النقدية)
  for (const inv of testInvoices) {
    if (!inv.pharmacy) continue;
    if (inv.status === 'draft' || inv.status === 'cancelled') continue;
    if (inv.paymentType === 'cash') continue;
    const remaining = inv.remainingAmount || 0;
    if (remaining <= 0) continue;
    await Customer.updateOne(
      { _id: inv.pharmacy },
      { $inc: { currentBalance: -remaining } }
    );
  }

  const deletedInvoices = await Invoice.deleteMany({
    _id: { $in: testInvoiceIds },
  });

  const deletedAudit = await AuditLog.deleteMany({
    resource: 'Invoice',
    resourceId: { $in: testInvoiceIds },
  });

  logger.info(
    `✅ تم مسح: ${deletedInvoices.deletedCount} فاتورة، ${deletedReturns.deletedCount} مرتجع، ${deletedCash.deletedCount} حركة نقدية، ${deletedAudit.deletedCount} تدقيق.`
  );

  return deletedInvoices.deletedCount;
}

function generateTestInvoiceNumber(seq) {
  return `TEST-INV-${String(seq).padStart(4, '0')}`;
}

function generateTestReturnNumber(seq) {
  return `TEST-RET-${String(seq).padStart(4, '0')}`;
}

/**
 * بناء بند فاتورة متوافق مع invoiceItemSchema.
 */
function buildInvoiceItem(stock, quantity, unitPrice) {
  return {
    item: stock.item._id || stock.item,
    batch: stock.batch,
    expiry: stock.expiry,
    quantity,
    unit: 'وحدة',
    unitPrice,
    total: Math.round(quantity * unitPrice * 100) / 100,
    unitCost: stock.unitCost || 0,
  };
}

/**
 * إنشاء حركة نقدية عبر cashService (الخدمة الفعلية).
 */
async function createTestCashTransaction({
  amount,
  description,
  invoiceId,
  cashFund,
  admin,
}) {
  return cashService.createCashTransaction({
    direction: 'in',
    amount,
    method: 'cash',
    cashFundId: cashFund._id,
    transactionDate: new Date(),
    description,
    referenceType: 'invoice',
    referenceId: invoiceId,
    user: admin,
    skipEntry: true,
  });
}

// ============================================================
// Main
// ============================================================

async function main() {
  logger.info('🌱 بدء سكربت البيانات التجريبية للفواتير...');

  await connectDatabase();

  try {
    await cleanupPreviousData();

    logger.info('🔍 التحقق من المتطلبات...');

    const admin = await User.findOne({ role: USER_ROLES.ADMIN, isActive: true });
    const salesRep = await User.findOne({
      role: USER_ROLES.SALES_REP,
      isActive: true,
    });
    const pharmacyUser = await User.findOne({
      role: USER_ROLES.PHARMACY,
      isActive: true,
    });

    if (!admin) throw new Error('❌ لا يوجد admin. شغّل npm run seed');
    if (!salesRep)
      throw new Error('❌ لا يوجد sales_rep. شغّل npm run seed:test');
    if (!pharmacyUser)
      throw new Error('❌ لا يوجد pharmacy. شغّل npm run seed:test');

    const warehouse = await Warehouse.findOne({
      isDefault: true,
      isActive: true,
    });
    if (!warehouse)
      throw new Error('❌ لا يوجد مخزن افتراضي. شغّل npm run seed');

    const cashFund = await CashFund.findOne({
      isDefault: true,
      isActive: true,
    });
    if (!cashFund) {
      throw new Error(
        '❌ لا يوجد CashFund افتراضي. شغّل: npm run seed:finance'
      );
    }

    const customer = await Customer.findOne({ isActive: true }).populate(
      'assignedSalesRep',
      'name'
    );
    if (!customer) {
      throw new Error('❌ لا يوجد عملاء. شغّل: npm run seed:master');
    }

    const stocks = await Stock.find({
      quantity: { $gt: 0 },
      isQuarantined: false,
      expiry: { $gt: new Date() },
    })
      .populate('item', 'tradeName scientificName')
      .sort({ expiry: 1 })
      .limit(10)
      .lean();

    if (stocks.length < 3) {
      throw new Error(
        `❌ عدد الدفعات ${stocks.length} (نحتاج 3). شغّل npm run seed:master`
      );
    }

    logger.info(
      `✅ admin=${admin.email}, rep=${salesRep.email}, customer=${customer.name}, fund=${cashFund.name}, stocks=${stocks.length}`
    );

    const now = new Date();
    const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
    const daysFromNow = (n) =>
      new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

    // ═══════════════════════════════════════════════════════
    // 1) فاتورة نقدية (paid)
    // ═══════════════════════════════════════════════════════
    logger.info('💰 [1/5] فاتورة نقدية (paid)...');

    const stock1 = stocks[0];
    const qty1 = Math.min(5, stock1.quantity);
    const unitPrice1 = stock1.unitPrice || 100;
    const item1 = buildInvoiceItem(stock1, qty1, unitPrice1);
    const total1 = item1.total;

    const invoice1 = await Invoice.create({
      invoiceNumber: generateTestInvoiceNumber(1),
      pharmacy: customer._id,
      salesRep: salesRep._id,
      warehouse: warehouse._id,
      invoiceDate: daysAgo(5),
      items: [item1],
      subtotal: total1,
      discount: {
        type: null,
        value: 0,
        reason: '',
        approvedBy: null,
        approvedAt: null,
        computedAmount: 0,
        freeItems: [],
      },
      taxRate: 0,
      taxAmount: 0,
      total: total1,
      paymentType: 'cash',
      dueDate: null,
      totalInstallments: 0,
      paidAmount: total1,
      remainingAmount: 0,
      paidAt: daysAgo(5),
      paymentMethod: 'cash',
      status: INVOICE_STATUSES.PAID,
      commission: { rate: 0, amount: 0, isPaid: false },
      notes: 'فاتورة اختبار نقدية',
      createdBy: admin._id,
      finalizedBy: admin._id,
      finalizedAt: daysAgo(5),
    });

    await createTestCashTransaction({
      amount: total1,
      description: `دفعة نقدية للفاتورة ${invoice1.invoiceNumber}`,
      invoiceId: invoice1._id,
      cashFund,
      admin,
    });

    logger.info(`   ✅ ${invoice1.invoiceNumber} — ${total1} SDG`);

    // ═══════════════════════════════════════════════════════
    // 2) فاتورة آجلة (pending)
    // ═══════════════════════════════════════════════════════
    logger.info('📅 [2/5] فاتورة آجلة (pending)...');

    const stock2 = stocks[1];
    const qty2 = Math.min(3, stock2.quantity);
    const unitPrice2 = stock2.unitPrice || 80;
    const item2 = buildInvoiceItem(stock2, qty2, unitPrice2);
    const subtotal2 = item2.total;
    const discountAmount2 = Math.round(subtotal2 * 0.05 * 100) / 100;
    const total2 = Math.round((subtotal2 - discountAmount2) * 100) / 100;

    const invoice2 = await Invoice.create({
      invoiceNumber: generateTestInvoiceNumber(2),
      pharmacy: customer._id,
      salesRep: salesRep._id,
      warehouse: warehouse._id,
      invoiceDate: daysAgo(2),
      items: [item2],
      subtotal: subtotal2,
      discount: {
        type: 'percentage',
        value: 5,
        reason: 'عميل دائم',
        approvedBy: admin._id,
        approvedAt: daysAgo(2),
        computedAmount: discountAmount2,
        freeItems: [],
      },
      taxRate: 0,
      taxAmount: 0,
      total: total2,
      paymentType: 'credit',
      dueDate: daysFromNow(30),
      totalInstallments: 0,
      paidAmount: 0,
      remainingAmount: total2,
      paymentMethod: '',
      status: INVOICE_STATUSES.PENDING,
      commission: { rate: 0, amount: 0, isPaid: false },
      notes: 'فاتورة اختبار آجلة',
      createdBy: admin._id,
      finalizedBy: admin._id,
      finalizedAt: daysAgo(2),
    });

    await Customer.updateOne(
      { _id: customer._id },
      { $inc: { currentBalance: total2 } }
    );

    logger.info(`   ✅ ${invoice2.invoiceNumber} — ${total2} SDG (آجل)`);

    // ═══════════════════════════════════════════════════════
    // 3) فاتورة أقساط (partial)
    // ═══════════════════════════════════════════════════════
    logger.info('💳 [3/5] فاتورة أقساط (partial)...');

    const stock3 = stocks[2];
    const qty3 = Math.min(4, stock3.quantity);
    const unitPrice3 = stock3.unitPrice || 120;
    const item3 = buildInvoiceItem(stock3, qty3, unitPrice3);
    const total3 = item3.total;
    const firstInstallment = Math.round(total3 * 0.25 * 100) / 100;
    const remaining3 = Math.round((total3 - firstInstallment) * 100) / 100;

    const invoice3 = await Invoice.create({
      invoiceNumber: generateTestInvoiceNumber(3),
      pharmacy: customer._id,
      salesRep: salesRep._id,
      warehouse: warehouse._id,
      invoiceDate: daysAgo(10),
      items: [item3],
      subtotal: total3,
      discount: {
        type: null,
        value: 0,
        reason: '',
        approvedBy: null,
        approvedAt: null,
        computedAmount: 0,
        freeItems: [],
      },
      taxRate: 0,
      taxAmount: 0,
      total: total3,
      paymentType: 'installments',
      dueDate: daysFromNow(20),
      totalInstallments: 4,
      paidAmount: firstInstallment,
      remainingAmount: remaining3,
      paidAt: daysAgo(10),
      paymentMethod: 'cash',
      status: INVOICE_STATUSES.PARTIAL,
      commission: { rate: 0, amount: 0, isPaid: false },
      notes: 'فاتورة اختبار بالأقساط',
      createdBy: admin._id,
      finalizedBy: admin._id,
      finalizedAt: daysAgo(10),
    });

    await createTestCashTransaction({
      amount: firstInstallment,
      description: `القسط الأول للفاتورة ${invoice3.invoiceNumber}`,
      invoiceId: invoice3._id,
      cashFund,
      admin,
    });

    await Customer.updateOne(
      { _id: customer._id },
      { $inc: { currentBalance: remaining3 } }
    );

    logger.info(
      `   ✅ ${invoice3.invoiceNumber} — ${total3} SDG (قسط 1/4 مدفوع)`
    );

    // ═══════════════════════════════════════════════════════
    // 4) مسودة (draft)
    // ═══════════════════════════════════════════════════════
    logger.info('📝 [4/5] مسودة فاتورة (draft)...');

    const stock4 = stocks[0];
    const qty4 = Math.min(2, stock4.quantity);
    const unitPrice4 = stock4.unitPrice || 100;
    const item4 = buildInvoiceItem(stock4, qty4, unitPrice4);
    const total4 = item4.total;

    const invoice4 = await Invoice.create({
      invoiceNumber: generateTestInvoiceNumber(4),
      pharmacy: customer._id,
      salesRep: salesRep._id,
      warehouse: warehouse._id,
      invoiceDate: daysAgo(0),
      items: [item4],
      subtotal: total4,
      discount: {
        type: null,
        value: 0,
        reason: '',
        approvedBy: null,
        approvedAt: null,
        computedAmount: 0,
        freeItems: [],
      },
      taxRate: 0,
      taxAmount: 0,
      total: total4,
      paymentType: null,
      dueDate: null,
      totalInstallments: 0,
      paidAmount: 0,
      remainingAmount: total4,
      paymentMethod: '',
      status: INVOICE_STATUSES.DRAFT,
      commission: { rate: 0, amount: 0, isPaid: false },
      notes: 'مسودة اختبارية — بانتظار الاعتماد',
      createdBy: admin._id,
    });

    logger.info(`   ✅ ${invoice4.invoiceNumber} — ${total4} SDG (مسودة)`);

    // ═══════════════════════════════════════════════════════
    // 5) مرتجع (pending)
    // ═══════════════════════════════════════════════════════
    logger.info('🔄 [5/5] مرتجع عميل (pending)...');

    const returnedQty = 1;
    const returnedItem = invoice1.items[0];

    const testReturn = await CustomerReturn.create({
      returnNumber: generateTestReturnNumber(1),
      originalInvoice: invoice1._id,
      pharmacy: customer._id,
      items: [
        {
          item: returnedItem.item,
          batch: returnedItem.batch,
          quantity: returnedQty,
          unit: 'وحدة',
          unitPrice: returnedItem.unitPrice,
          total:
            Math.round(returnedQty * returnedItem.unitPrice * 100) / 100,
          reason: RETURN_REASONS.DAMAGED,
          note: 'تلف أثناء النقل',
        },
      ],
      total: Math.round(returnedQty * returnedItem.unitPrice * 100) / 100,
      returnDate: daysAgo(1),
      invoiceDate: invoice1.invoiceDate,
      gracePeriodDays: 7,
      isWithinGracePeriod: true,
      status: RETURN_STATUSES.PENDING,
      settlementType: SETTLEMENT_TYPES.BALANCE_DEDUCTION,
      settledAmount: 0,
      notes: 'مرتجع اختباري',
      createdBy: admin._id,
    });

    logger.info(
      `   ✅ ${testReturn.returnNumber} — ${testReturn.total} SDG (pending)`
    );

    // ═══════════════════════════════════════════════════════
    // الملخص
    // ═══════════════════════════════════════════════════════
    logger.info('');
    logger.info('═══════════════════════════════════════════════');
    logger.info('🎉 اكتمل السكربت بنجاح!');
    logger.info('═══════════════════════════════════════════════');
    logger.info('');
    logger.info('📊 البيانات التجريبية المُنشأة:');
    logger.info(
      `  1. ${invoice1.invoiceNumber}  →  نقدي (مدفوعة)         →  ${invoice1.total} SDG`
    );
    logger.info(
      `  2. ${invoice2.invoiceNumber}  →  آجل (معلقة)            →  ${invoice2.total} SDG`
    );
    logger.info(
      `  3. ${invoice3.invoiceNumber}  →  أقساط (مدفوعة جزئياً)   →  ${invoice3.total} SDG`
    );
    logger.info(
      `  4. ${invoice4.invoiceNumber}  →  مسودة (draft)           →  ${invoice4.total} SDG`
    );
    logger.info(
      `  5. ${testReturn.returnNumber}  →  مرتجع (معلق)           →  ${testReturn.total} SDG`
    );
    logger.info('');
    logger.info(`💰 CashFund: ${cashFund.name} (${cashFund.code})`);
    logger.info('');
  } catch (error) {
    logger.error(`❌ فشل السكربت: ${error.message}`);
    logger.error(error.stack || '');
    throw error;
  } finally {
    await disconnectDatabase();
  }
}

main()
  .then(() => {
    logger.info('👋 تم إغلاق الاتصال بقاعدة البيانات.');
    process.exit(0);
  })
  .catch(() => process.exit(1));