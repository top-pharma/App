/**
 * @file Warehouse.js
 * @description
 * نموذج المخزن — قابل للتوسّع (المخزن الرئيسي + مخازن فرعية).
 *
 * لماذا هذا الملف؟
 * - الشركة تفكّر بالتوسعة قريباً (مخزن ثانٍ)، لذا المخازن ليست ثابتة في الكود
 *   بل بيانات يُنشئها الأدمن من داخل التطبيق.
 * - كل مخزن له كود فريد يُستخدم في ترقيم الفواتير والتحويلات لاحقاً.
 * - نُوفّر أمين مخزن مسؤول (اختياري) لربطه بالمستخدمين.
 * - لا نحذف مخزناً فيه حركة مخزون؛ نُعطّله فقط (isActive=false) للحفاظ على التاريخ.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * أنواع المخازن.
 * @readonly
 * @enum {string}
 */
export const WAREHOUSE_TYPES = Object.freeze({
  MAIN: 'main',
  BRANCH: 'branch',
});

/**
 * Schema المخزن.
 */
const warehouseSchema = new Schema(
  {
    /**
     * اسم المخزن بالعربية (مثال: المخزن الرئيسي — الخرطوم).
     */
    name: {
      type: String,
      required: [true, 'اسم المخزن مطلوب.'],
      trim: true,
      minlength: [2, 'الاسم قصير جداً.'],
      maxlength: [100, 'الاسم طويل جداً.'],
    },

    /**
     * كود فريد (يُستخدم في التقارير والترقيم).
     */
    code: {
      type: String,
      required: [true, 'كود المخزن مطلوب.'],
      unique: true,
      trim: true,
      uppercase: true,
      minlength: [2, 'الكود قصير جداً.'],
      maxlength: [20, 'الكود طويل جداً.'],
      index: true,
    },

    /**
     * نوع المخزن: رئيسي أو فرعي.
     * نضمن وجود مخزن رئيسي واحد فقط عبر فحص في seed + index جزئي.
     */
    type: {
      type: String,
      enum: Object.values(WAREHOUSE_TYPES),
      default: WAREHOUSE_TYPES.BRANCH,
      index: true,
    },

    /**
     * العنوان التفصيلي.
     */
    address: {
      type: String,
      trim: true,
      default: '',
      maxlength: [250, 'العنوان طويل جداً.'],
    },

    /**
     * المدينة (مفيدة في التقارير).
     */
    city: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * رقم الهاتف.
     */
    phone: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * أمين المخزن المسؤول (اختياري).
     */
    manager: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    /**
     * حالة المخزن — عند التعطيل يُخفى من القوائم النشطة.
     */
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    /**
     * هل هذا المخزن هو الافتراضي للاستلام والصرف؟
     */
    isDefault: {
      type: Boolean,
      default: false,
    },

    /**
     * ملاحظات إدارية.
     */
    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'الملاحظات طويلة جداً.'],
    },

    /**
     * من أنشأ المخزن؟
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
 * فهرس مركّب للقوائم.
 */
warehouseSchema.index({ isActive: 1, type: 1, name: 1 });

/**
 * نضمن وجود مخزن رئيسي واحد فقط نشط.
 * (جزئي: يُطبَّق فقط على الوثائق التي type='main' و isActive=true)
 */
warehouseSchema.index(
  { type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: WAREHOUSE_TYPES.MAIN, isActive: true },
    name: 'unique_active_main_warehouse',
  }
);

/**
 * نضمن وجود مخزن افتراضي واحد فقط.
 */
warehouseSchema.index(
  { isDefault: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefault: true },
    name: 'unique_default_warehouse',
  }
);

export const Warehouse = model('Warehouse', warehouseSchema);

export default Warehouse;