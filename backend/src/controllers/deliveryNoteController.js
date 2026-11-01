/**
 * @file deliveryNoteController.js
 * @description
 * واجهات التحكم لإيصالات التسليم.
 * يخصم المخزون عند الإنشاء (لأن البضاعة تخرج مع المندوب).
 *
 * لماذا هذا الملف؟
 * - إيصال التسليم يسبق الفاتورة، وهو المسؤول عن توثيق خروج البضاعة من المخزن.
 * - لا يحتوي على Service منفصل حالياً (منطق بسيط — يمكن استخراجه لاحقاً).
 * - يدعم Scope للمندوب (يرى إيصالاته فقط) والصيدلية (ترى إيصالاتها فقط).
 * - يحتوي على Rollback يدوي لضمان سلامة المخزون عند فشل الإنشاء.
 */

import { AUDIT_ACTIONS } from '../models/AuditLog.js';
import { DeliveryNote, DELIVERY_STATUSES } from '../models/DeliveryNote.js';
import { Customer } from '../models/Customer.js';
import { Warehouse } from '../models/Warehouse.js';
import { CashTransaction } from '../models/CashTransaction.js';
import { Stock } from '../models/Stock.js';
import { Settings } from '../models/Settings.js';
import { AppError, asyncHandler } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { issueStock, returnStock } from '../services/stockService.js';
import { logger } from '../utils/logger.js';

// ============================================================
// Helpers
// ============================================================

/**
 * توليد رقم إيصال تسليم فريد.
 * النمط: DN-YYYYMMDD-XXXX
 *
 * @async
 * @returns {Promise<string>}
 */
async function generateDeliveryNumber() {
  const settings = await Settings.getSettings();
  const prefix = settings.sales?.prefixes?.deliveryNote || 'DN';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const lastNote = await DeliveryNote.findOne({
    deliveryNumber: new RegExp(`^${prefix}-${dateStr}-`),
  })
    .sort({ deliveryNumber: -1 })
    .select('deliveryNumber')
    .lean();

  let sequence = 1;
  if (lastNote) {
    const parts = lastNote.deliveryNumber.split('-');
    sequence = parseInt(parts[parts.length - 1], 10) + 1;
  }

  return `${prefix}-${dateStr}-${String(sequence).padStart(4, '0')}`;
}

/**
 * توليد رقم حركة مالية.
 */
function generateTransactionNumber(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

/**
 * بناء استجابة موحّدة.
 */
const buildDeliveryNotePayload = (note) => ({
  id: note._id,
  deliveryNumber: note.deliveryNumber,
  pharmacy: note.pharmacy,
  salesRep: note.salesRep,
  warehouse: note.warehouse,
  deliveryDate: note.deliveryDate,
  items: note.items,
  totalAmount: note.totalAmount,
  initialPayment: note.initialPayment,
  remainingAmount: note.remainingAmount,
  invoices: note.invoices,
  paymentPlan: note.paymentPlan,
  status: note.status,
  deliveredAt: note.deliveredAt,
  receivedBy: note.receivedBy,
  signature: note.signature,
  notes: note.notes,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
});

// ============================================================
// 1) القراءة
// ============================================================

/**
 * GET /api/delivery-notes
 */
export const listDeliveryNotes = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    search,
    pharmacy,
    salesRep,
    warehouse,
    status,
    paymentPlan,
    notDelivered,
    dateFrom,
    dateTo,
    sortBy,
    sortOrder,
  } = req.validatedQuery || req.query;

  const filter = {};

  // Scope للمندوب
  if (req.scope?.salesRepId) {
    filter.salesRep = req.scope.salesRepId;
  } else if (salesRep) {
    filter.salesRep = salesRep;
  }

  // Scope للصيدلية
  if (req.scope?.customerId) {
    filter.pharmacy = req.scope.customerId;
  } else if (pharmacy) {
    filter.pharmacy = pharmacy;
  }

  if (warehouse) filter.warehouse = warehouse;
  if (status) filter.status = status;
  if (paymentPlan) filter.paymentPlan = paymentPlan;

  if (notDelivered) {
    filter.status = { $in: [DELIVERY_STATUSES.PENDING, DELIVERY_STATUSES.IN_TRANSIT] };
  }

  if (dateFrom || dateTo) {
    filter.deliveryDate = {};
    if (dateFrom) filter.deliveryDate.$gte = dateFrom;
    if (dateTo) filter.deliveryDate.$lte = dateTo;
  }

  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ deliveryNumber: rx }, { receivedBy: rx }];
  }

  const skip = (page - 1) * limit;
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [notes, total] = await Promise.all([
    DeliveryNote.find(filter)
      .populate('pharmacy', 'name code phone')
      .populate('salesRep', 'name')
      .populate('warehouse', 'name code')
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(limit),
    DeliveryNote.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      items: notes.map(buildDeliveryNotePayload),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + notes.length < total,
        hasPrev: page > 1,
      },
    },
  });
});

/**
 * GET /api/delivery-notes/:id
 */
export const getDeliveryNote = asyncHandler(async (req, res) => {
  const note = await DeliveryNote.findById(req.params.id)
    .populate('pharmacy', 'name code phone address')
    .populate('salesRep', 'name')
    .populate('warehouse', 'name code');

  if (!note) {
    throw new AppError('إيصال التسليم غير موجود.', 404, 'DELIVERY_NOTE_NOT_FOUND');
  }

  // Scope للمندوب
  if (req.scope?.salesRepId && String(note.salesRep?._id) !== String(req.scope.salesRepId)) {
    throw new AppError('لا تملك صلاحية الوصول لهذا الإيصال.', 403, 'FORBIDDEN');
  }

  // Scope للصيدلية
  if (req.scope?.customerId && String(note.pharmacy?._id) !== String(req.scope.customerId)) {
    throw new AppError('لا تملك صلاحية الوصول لهذا الإيصال.', 403, 'FORBIDDEN');
  }

  return res.status(200).json({
    success: true,
    data: buildDeliveryNotePayload(note),
  });
});

// ============================================================
// 2) الإنشاء (يخصم المخزون)
// ============================================================

/**
 * POST /api/delivery-notes
 *
 * ⚠️ هذا هو المستند الوحيد الذي يخصم المخزون فعلياً.
 * الفاتورة لا تخصم المخزون (لأنه خُصم مسبقاً هنا).
 */
export const createDeliveryNote = asyncHandler(async (req, res) => {
  const data = req.body;

  // 1. التحقق من الصيدلية
  const customer = await Customer.findById(data.pharmacy);
  if (!customer) {
    throw new AppError('الصيدلية غير موجودة.', 404, 'CUSTOMER_NOT_FOUND');
  }
  if (!customer.isActive) {
    throw new AppError('الصيدلية معطّلة.', 403, 'CUSTOMER_INACTIVE');
  }
  if (customer.isBlocked) {
    throw new AppError('الصيدلية محظورة من الشراء.', 403, 'CUSTOMER_BLOCKED');
  }

  // 2. التحقق من المخزن
  const warehouse = await Warehouse.findOne({ _id: data.warehouse, isActive: true });
  if (!warehouse) {
    throw new AppError('المخزن غير موجود أو معطّل.', 400, 'WAREHOUSE_NOT_FOUND');
  }

  // 3. خصم المخزون (مع Rollback)
  const issuedStockLog = [];
  const finalItems = [];

  try {
    for (const line of data.items) {
      if (line.batch) {
        const stock = await Stock.findOne({
          item: line.item,
          batch: line.batch,
          warehouse: data.warehouse,
          quantity: { $gte: line.quantity },
          isQuarantined: false,
        });
        if (!stock) {
          throw new AppError(
            `الدفعة ${line.batch} غير متوفرة أو الكمية غير كافية.`,
            400,
            'INSUFFICIENT_STOCK'
          );
        }
        stock.quantity -= line.quantity;
        stock.lastIssuedAt = new Date();
        await stock.save();

        issuedStockLog.push({
          itemId: line.item,
          warehouseId: data.warehouse,
          batch: line.batch,
          quantity: line.quantity,
        });

        finalItems.push({
          ...line,
          batch: line.batch,
          expiry: line.expiry || stock.expiry,
        });
      } else {
        const issuedBatches = await issueStock({
          itemId: line.item,
          warehouseId: data.warehouse,
          quantity: line.quantity,
        });

        for (const batch of issuedBatches) {
          issuedStockLog.push({
            itemId: line.item,
            warehouseId: data.warehouse,
            batch: batch.batch,
            quantity: batch.quantity,
          });
          finalItems.push({
            item: line.item,
            batch: batch.batch,
            expiry: batch.expiry,
            quantity: batch.quantity,
            unit: line.unit || '',
            unitPrice: line.unitPrice,
            total: Math.round(batch.quantity * line.unitPrice * 100) / 100,
          });
        }
      }
    }
  } catch (error) {
    logger.error(`فشل صرف المخزون في إيصال التسليم: ${error.message}. جارٍ Rollback...`);
    for (const log of issuedStockLog) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await returnStock({
          itemId: log.itemId,
          warehouseId: log.warehouseId,
          batch: log.batch,
          quantity: log.quantity,
        });
      } catch (rbErr) {
        logger.error(`فشل Rollback للدفعة ${log.batch}: ${rbErr.message}`);
      }
    }
    throw error;
  }

  // 4. توليد الرقم والإنشاء
  const deliveryNumber = await generateDeliveryNumber();
  const deliveryDate = data.deliveryDate || new Date();

  const note = await DeliveryNote.create({
    deliveryNumber,
    pharmacy: data.pharmacy,
    salesRep: data.salesRep,
    warehouse: data.warehouse,
    deliveryDate,
    items: finalItems,
    totalAmount: data.totalAmount,
    initialPayment: data.initialPayment || { amount: 0, paymentMethod: 'cash' },
    remainingAmount: data.remainingAmount,
    paymentPlan: data.paymentPlan,
    status: DELIVERY_STATUSES.PENDING,
    notes: data.notes,
    createdBy: req.user._id,
  });

  // 5. إنشاء حركة نقدية (إن وُجدت دفعة أولى)
  if (data.initialPayment && data.initialPayment.amount > 0) {
    await CashTransaction.create({
      transactionNumber: generateTransactionNumber('CT'),
      accountType: data.initialPayment.paymentMethod === 'bank' ? 'bank' : 'cash',
      direction: 'in',
      category: 'sale_cash',
      amount: data.initialPayment.amount,
      description: `دفعة أولى على إيصال التسليم ${deliveryNumber}`,
      referenceType: 'DeliveryNote',
      referenceId: note._id,
      party: data.pharmacy,
      partyType: 'Customer',
      createdBy: req.user._id,
    });
  }

  // 6. تدقيق
  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.CREATE,
    resource: 'DeliveryNote',
    resourceId: note._id,
    description: `إنشاء إيصال تسليم ${deliveryNumber} للصيدلية ${customer.name}`,
    success: true,
    meta: {
      after: { deliveryNumber, totalAmount: data.totalAmount, status: note.status },
    },
  });

  return res.status(201).json({
    success: true,
    data: buildDeliveryNotePayload(note),
  });
});

// ============================================================
// 3) التعديل (قبل التسليم فقط)
// ============================================================

/**
 * PATCH /api/delivery-notes/:id
 *
 * ⚠️ لا يمكن تعديل البنود (المخزون خُصم).
 * التعديل مسموح فقط لـ: notes, paymentPlan (بشرط status = pending).
 */
export const updateDeliveryNote = asyncHandler(async (req, res) => {
  const note = await DeliveryNote.findById(req.params.id);

  if (!note) {
    throw new AppError('إيصال التسليم غير موجود.', 404, 'DELIVERY_NOTE_NOT_FOUND');
  }

  if (note.status !== DELIVERY_STATUSES.PENDING) {
    throw new AppError(
      'لا يمكن تعديل الإيصال بعد بدء التسليم أو اكتماله.',
      409,
      'DELIVERY_NOTE_LOCKED'
    );
  }

  const updates = req.body;

  // منع تعديل البنود أو المبالغ (المخزون خُصم)
  if (updates.items || updates.totalAmount || updates.remainingAmount) {
    throw new AppError(
      'لا يمكن تعديل بنود الإيصال أو مبالغه. قم بإلغائه وإنشاء جديد.',
      400,
      'CANNOT_UPDATE_ITEMS'
    );
  }

  const before = {
    paymentPlan: note.paymentPlan,
    notes: note.notes,
  };

  const allowedFields = ['paymentPlan', 'notes'];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      note[field] = updates[field];
    }
  }

  await note.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'DeliveryNote',
    resourceId: note._id,
    description: `تعديل إيصال التسليم ${note.deliveryNumber}`,
    success: true,
    meta: {
      before,
      after: { paymentPlan: note.paymentPlan, notes: note.notes },
    },
  });

  return res.status(200).json({
    success: true,
    data: buildDeliveryNotePayload(note),
  });
});

// ============================================================
// 4) تعليم كمُسلَّم
// ============================================================

/**
 * PATCH /api/delivery-notes/:id/mark-delivered
 */
export const markDelivered = asyncHandler(async (req, res) => {
  const note = await DeliveryNote.findById(req.params.id);

  if (!note) {
    throw new AppError('إيصال التسليم غير موجود.', 404, 'DELIVERY_NOTE_NOT_FOUND');
  }

  if (note.status === DELIVERY_STATUSES.DELIVERED) {
    throw new AppError('الإيصال مُسلَّم بالفعل.', 409, 'ALREADY_DELIVERED');
  }

  if (note.status === DELIVERY_STATUSES.RETURNED) {
    throw new AppError('لا يمكن تسليم إيصال مُرتجع.', 409, 'NOTE_RETURNED');
  }

  const { receivedBy, signature, deliveredAt, notes } = req.body;

  note.markDelivered({ receivedBy, signature });
  if (deliveredAt) note.deliveredAt = deliveredAt;
  if (notes) note.notes = notes;

  await note.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'DeliveryNote',
    resourceId: note._id,
    description: `تسليم إيصال ${note.deliveryNumber} إلى ${receivedBy}`,
    success: true,
    meta: {
      after: { status: note.status, deliveredAt: note.deliveredAt, receivedBy: note.receivedBy },
    },
  });

  return res.status(200).json({
    success: true,
    data: buildDeliveryNotePayload(note),
    message: 'تم تعليم الإيصال كمُسلَّم.',
  });
});

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  listDeliveryNotes,
  getDeliveryNote,
  createDeliveryNote,
  updateDeliveryNote,
  markDelivered,
};