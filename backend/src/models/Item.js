/**
 * @file Item.js
 * @description
 * نموذج الصنف الدوائي — Phase 2.5.
 *
 * ⚠️ إضافة Phase 2.5:
 * - minMarginPercent: تجاوز خاص بالصنف (يُتجاوز Settings.sales.minMarginPercent).
 * - maxDiscountPercent: تجاوز خاص بالصنف (يُتجاوز Settings.sales.maxDiscountPercent).
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const ITEM_CATEGORIES = Object.freeze({
  MEDICINE: 'medicine',
  COSMETICS: 'cosmetics',
  SUPPLEMENTS: 'supplements',
  MEDICAL_SUPPLIES: 'medical_supplies',
  OTHER: 'other',
});

const unitSubSchema = new Schema(
  {
    name: { type: String, trim: true, default: '' },
    contains: { type: Number, default: 1, min: 1 },
    barcode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    price: { type: Number, default: 0, min: 0 },
    cost: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const itemSchema = new Schema(
  {
    // ─── 1. الأسماء ───
    scientificName: {
      type: String,
      required: [true, 'الاسم العلمي مطلوب.'],
      trim: true,
      maxlength: [200, 'الاسم العلمي طويل جداً.'],
      index: true,
    },
    tradeName: {
      type: String,
      required: [true, 'الاسم التجاري مطلوب.'],
      trim: true,
      maxlength: [200, 'الاسم التجاري طويل جداً.'],
      index: true,
    },
    tradeNameEn: { type: String, trim: true, default: '' },
    manufacturer: { type: String, trim: true, default: '', index: true },
    originCountry: { type: String, trim: true, default: '' },

    category: {
      type: String,
      required: [true, 'التصنيف مطلوب.'],
      trim: true,
      lowercase: true,
      default: ITEM_CATEGORIES.MEDICINE,
      index: true,
    },

    // ─── 2. الباركود والتسجيل ───
    barcode: { type: String, unique: true, sparse: true, trim: true },
    registrationNumber: { type: String, trim: true, default: '', index: true },
    dosageForm: { type: String, trim: true, default: '' },
    strength: { type: String, trim: true, default: '' },

    // ─── 3. الوحدات ───
    units: {
      base: { type: unitSubSchema, default: () => ({}) },
      packaging: { type: unitSubSchema, default: () => ({}) },
      smallest: { type: unitSubSchema, default: () => ({}) },
    },

    supportedUnits: { type: [String], default: [] },
    defaultSaleUnit: { type: String, trim: true, default: '' },

    // ─── 4. المخزون ───
    reorderLevel: { type: Number, default: 0, min: 0 },
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    prescriptionRequired: { type: Boolean, default: false },
    storageConditions: { type: String, trim: true, default: '' },

    // ─── 5. ✅ Phase 2.5: سياسات تسعير خاصة ───
    /**
     * تجاوز هامش الربح الأدنى (Null = استخدم Settings.sales.minMarginPercent).
     * مفيد للأدوية ذات السعر الحساس (الأنسولين مثلاً — هامش أقل).
     */
    minMarginPercent: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },

    /**
     * تجاوز أقصى خصم مسموح (Null = استخدم Settings.sales.maxDiscountPercent).
     * مفيد للأدوية ذات الهامش المنخفض.
     */
    maxDiscountPercent: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },

    // ─── 6. الحالة ───
    isActive: { type: Boolean, default: true, index: true },
    notes: { type: String, trim: true, default: '', maxlength: [1000, 'الملاحظات طويلة جداً.'] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

itemSchema.index({ isActive: 1, category: 1, tradeName: 1 });
itemSchema.index({ scientificName: 'text', tradeName: 'text', tradeNameEn: 'text' });
itemSchema.index({ barcode: 1 }, { sparse: true });

itemSchema.methods.isBelowReorder = function isBelowReorder(currentQuantity) {
  if (!this.reorderLevel || this.reorderLevel <= 0) return false;
  return currentQuantity <= this.reorderLevel;
};

export const Item = model('Item', itemSchema);

export default Item;