/**
 * @file Stock.js
 * @description
 * نموذج المخزون — كل سجل يمثّل دفعة (Batch) محدّدة في مخزن محدّد.
 *
 * لماذا هذا الملف؟
 * - نظام FEFO (الأقرب انتهاءً أولاً) يتطلّب تتبّع كل دفعة على حدة
 *   بـ expiry و productionDate.
 * - لا نُخزّن كمية إجمالية للصنف؛ الكمية الإجمالية = مجموع الدفعات.
 *   هذا يمنع أخطاء الجرد ويجعل FEFO ممكناً.
 * - فهرس مركّب فريد (item + batch + warehouse) لمنع تكرار نفس الدفعة
 *   في نفس المخزن.
 * - lastReceivedAt/lastIssuedAt تُحدَّث من الخدمات لاحقاً لتقارير حركة الأصناف.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Schema المخزون.
 */
const stockSchema = new Schema(
  {
    /**
     * الصنف.
     */
    item: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: [true, 'الصنف مطلوب.'],
      index: true,
    },

    /**
     * رقم الدفعة (Batch/Lot).
     */
    batch: {
      type: String,
      required: [true, 'رقم الدفعة مطلوب.'],
      trim: true,
      uppercase: true,
      maxlength: [50, 'رقم الدفعة طويل جداً.'],
      index: true,
    },

    /**
     * تاريخ الإنتاج (متطلب صريح).
     */
    productionDate: {
      type: Date,
      default: null,
    },

    /**
     * تاريخ انتهاء الصلاحية.
     */
    expiry: {
      type: Date,
      required: [true, 'تاريخ انتهاء الصلاحية مطلوب.'],
      index: true,
    },

    /**
     * المخزن الذي يحتوي هذه الدفعة.
     */
    warehouse: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: [true, 'المخزن مطلوب.'],
      index: true,
    },

    /**
     * الكمية الحالية في هذه الدفعة.
     */
    quantity: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'الكمية لا يمكن أن تكون سالبة.'],
    },

    /**
     * موقع التخزين داخل المخزن (رف/عمود) — اختياري.
     */
    location: {
      type: String,
      trim: true,
      default: '',
      maxlength: [50, 'الموقع طويل جداً.'],
    },

    /**
     * سعر التكلفة للوحدة الأساسية في هذه الدفعة.
     * نحتفظ به هنا لأن التكلفة قد تختلف بين الدفعات (مهم للأرباح).
     */
    unitCost: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * سعر البيع المقترح للوحدة الأساسية في هذه الدفعة.
     */
    unitPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * المورّد الذي جاءت منه هذه الدفعة (اختياري).
     */
    supplier: {
      type: Schema.Types.ObjectId,
      ref: 'Supplier',
      default: null,
    },

    /**
     * رقم إيصال الاستلام المرتبط بهذه الدفعة (اختياري).
     */
    purchaseReceipt: {
      type: Schema.Types.ObjectId,
      ref: 'PurchaseReceipt',
      default: null,
    },

    /**
     * آخر مرة استُقبلت فيها هذه الدفعة.
     */
    lastReceivedAt: {
      type: Date,
      default: null,
    },

    /**
     * آخر مرة صُرفت فيها هذه الدفعة.
     */
    lastIssuedAt: {
      type: Date,
      default: null,
    },

    /**
     * هل الدفعة محجوزة (لا تُصرف لأسباب جودة/رقابة)؟
     */
    isQuarantined: {
      type: Boolean,
      default: false,
    },

    /**
     * سبب الحجز (إن وُجد).
     */
    quarantineReason: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * ملاحظات.
     */
    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'الملاحظات طويلة جداً.'],
    },

    /**
     * من أنشأ سجل المخزون؟
     */
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * فهرس فريد مركّب: لا تُكرَّر نفس الدفعة لنفس الصنف في نفس المخزن.
 */
stockSchema.index(
  { item: 1, batch: 1, warehouse: 1 },
  { unique: true, name: 'unique_batch_per_item_warehouse' }
);

/**
 * فهارس FEFO والتقارير.
 * - FEFO: نرتّب بـ expiry تصاعدياً مع warehouse + item.
 * - المخزون الكلي: item + quantity.
 * - تنبيهات الانتهاء: expiry + quantity.
 */
stockSchema.index({ warehouse: 1, item: 1, expiry: 1 });
stockSchema.index({ item: 1, expiry: 1 });
stockSchema.index({ expiry: 1, quantity: 1 });
stockSchema.index({ warehouse: 1, expiry: 1, quantity: 1 });

/**
 * هل الدفعة منتهية الصلاحية؟
 * @returns {boolean}
 */
stockSchema.methods.isExpired = function isExpired() {
  return this.expiry instanceof Date && this.expiry.getTime() < Date.now();
};

/**
 * هل الدفعة على وشك الانتهاء خلال عدد أيام معيّن؟
 * @param {number} days
 * @returns {boolean}
 */
stockSchema.methods.isExpiringWithin = function isExpiringWithin(days) {
  if (!(this.expiry instanceof Date)) {
    return false;
  }
  const threshold = Date.now() + days * 24 * 60 * 60 * 1000;
  return this.expiry.getTime() <= threshold;
};

/**
 * هل الكمية صفر؟
 * @returns {boolean}
 */
stockSchema.methods.isEmpty = function isEmpty() {
  return !this.quantity || this.quantity <= 0;
};

export const Stock = model('Stock', stockSchema);

export default Stock;