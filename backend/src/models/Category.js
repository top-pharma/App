/**
 * @file Category.js
 * @description
 * تصنيفات الأصناف (أدوية، مستحضرات تجميل، مكمّلات، مستلزمات طبية، أخرى).
 *
 * لماذا هذا الملف؟
 * - التصنيفات تُستخدم في الفلترة والتقارير (مثل: مبيعات فئة المستحضرات).
 * - نُوفّر تصنيفات نظامية افتراضية (SYSTEM_CATEGORIES) لضمان بداية سليمة.
 * - نمنع حذف تصنيف مستخدم في أصناف (نتحقق في controller).
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * التصنيفات النظامية الافتراضية (تُنشأ في Seed).
 * @readonly
 */
export const SYSTEM_CATEGORIES = Object.freeze([
  { name: 'medicine', label: 'أدوية', description: 'الأدوية البشرية' },
  { name: 'cosmetics', label: 'مستحضرات تجميل', description: 'مستحضرات العناية والتجميل' },
  { name: 'supplements', label: 'مكمّلات غذائية', description: 'الفيتامينات والمكمّلات' },
  { name: 'medical_supplies', label: 'مستلزمات طبية', description: 'أدوات ومستلزمات طبية' },
  { name: 'other', label: 'أخرى', description: 'تصنيفات متنوعة' },
]);

/**
 * Schema التصنيف.
 */
const categorySchema = new Schema(
  {
    /**
     * الاسم بالإنجليزية (فريد، يُستخدم في الكود).
     */
    name: {
      type: String,
      required: [true, 'اسم التصنيف مطلوب.'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [2, 'الاسم قصير جداً.'],
      maxlength: [50, 'الاسم طويل جداً.'],
      index: true,
    },

    /**
     * الاسم العربي المعروض.
     */
    label: {
      type: String,
      required: [true, 'الاسم العربي مطلوب.'],
      trim: true,
      maxlength: [100, 'الاسم طويل جداً.'],
    },

    /**
     * وصف مختصر.
     */
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [300, 'الوصف طويل جداً.'],
    },

    /**
     * أيقونة اختيارية (اسم أيقونة Lucide).
     */
    icon: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * ترتيب العرض.
     */
    order: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * هل هو تصنيف نظامي؟ يمنع الحذف.
     */
    isSystem: {
      type: Boolean,
      default: false,
      index: true,
    },

    /**
     * حالة التصنيف.
     */
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * فهرس القوائم النشطة مرتّبة.
 */
categorySchema.index({ isActive: 1, order: 1, label: 1 });

export const Category = model('Category', categorySchema);

export default Category;