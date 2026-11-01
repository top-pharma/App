/**
 * @file ItemForm.jsx
 * @description نموذج الصنف — Phase 2.5 (دعم overrides تسعير).
 *
 * ⚠️ إضافة Phase 2.5:
 * - حقول minMarginPercent و maxDiscountPercent (اختياري).
 * - قسم "تسعير متقدم" قابل للطي.
 */

import { useEffect, useState } from 'react';
import { Loader2, ChevronDown, ChevronUp, Shield, AlertCircle } from 'lucide-react';

import * as itemsAPI from '../../api/itemsAPI.js';
import * as categoriesAPI from '../../api/categoriesAPI.js';
import * as warehousesAPI from '../../api/warehousesAPI.js';
import { useToast } from '../../hooks/useToast.js';

import Button from '../UI/Button.jsx';
import Input from '../UI/Input.jsx';

function Section({ title, icon: Icon, children, description }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-neutral-200">
        {Icon && <Icon size={18} className="text-primary-700" />}
        <h3 className="font-bold text-neutral-900">{title}</h3>
        {description && <span className="text-xs text-neutral-500">— {description}</span>}
      </div>
      {children}
    </div>
  );
}

function ItemForm({ item = null, onSuccess, onCancel }) {
  const toast = useToast();
  const isEdit = Boolean(item?.id);

  const [categories, setCategories] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // الحقول الأساسية
  const [scientificName, setScientificName] = useState(item?.scientificName || '');
  const [tradeName, setTradeName] = useState(item?.tradeName || '');
  const [tradeNameEn, setTradeNameEn] = useState(item?.tradeNameEn || '');
  const [manufacturer, setManufacturer] = useState(item?.manufacturer || '');
  const [originCountry, setOriginCountry] = useState(item?.originCountry || '');
  const [category, setCategory] = useState(item?.category || 'medicine');
  const [barcode, setBarcode] = useState(item?.barcode || '');
  const [registrationNumber, setRegistrationNumber] = useState(item?.registrationNumber || '');
  const [dosageForm, setDosageForm] = useState(item?.dosageForm || '');
  const [strength, setStrength] = useState(item?.strength || '');

  // الوحدات
  const [baseUnitName, setBaseUnitName] = useState(item?.units?.base?.name || '');
  const [baseUnitCost, setBaseUnitCost] = useState(item?.units?.base?.cost ? String(item.units.base.cost) : '');
  const [baseUnitPrice, setBaseUnitPrice] = useState(item?.units?.base?.price ? String(item.units.base.price) : '');
  const [packagingName, setPackagingName] = useState(item?.units?.packaging?.name || '');
  const [packagingContains, setPackagingContains] = useState(item?.units?.packaging?.contains ? String(item.units.packaging.contains) : '1');
  const [packagingPrice, setPackagingPrice] = useState(item?.units?.packaging?.price ? String(item.units.packaging.price) : '');
  const [smallestName, setSmallestName] = useState(item?.units?.smallest?.name || '');
  const [smallestContains, setSmallestContains] = useState(item?.units?.smallest?.contains ? String(item.units.smallest.contains) : '1');
  const [smallestPrice, setSmallestPrice] = useState(item?.units?.smallest?.price ? String(item.units.smallest.price) : '');

  // المخزون
  const [reorderLevel, setReorderLevel] = useState(item?.reorderLevel ? String(item.reorderLevel) : '0');
  const [warehouse, setWarehouse] = useState(item?.warehouse?._id || item?.warehouse || '');
  const [prescriptionRequired, setPrescriptionRequired] = useState(Boolean(item?.prescriptionRequired));
  const [notes, setNotes] = useState(item?.notes || '');

  // ✅ Phase 2.5: تسعير متقدم
  const [showAdvancedPricing, setShowAdvancedPricing] = useState(false);
  const [minMarginPercent, setMinMarginPercent] = useState(
    item?.minMarginPercent != null ? String(item.minMarginPercent) : ''
  );
  const [maxDiscountPercent, setMaxDiscountPercent] = useState(
    item?.maxDiscountPercent != null ? String(item.maxDiscountPercent) : ''
  );

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadOptions = async () => {
      setLoadingOptions(true);
      try {
        const [c, w] = await Promise.all([
          categoriesAPI.listCategories({ limit: 100, isActive: true }),
          warehousesAPI.listWarehouses({ limit: 100, isActive: true }),
        ]);
        setCategories(c.items || []);
        setWarehouses(w.items || []);
      } catch {
        toast.error('فشل تحميل البيانات الأساسية.');
      } finally {
        setLoadingOptions(false);
      }
    };
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildPayload = () => ({
    scientificName: scientificName.trim(),
    tradeName: tradeName.trim(),
    tradeNameEn: tradeNameEn.trim() || '',
    manufacturer: manufacturer.trim() || '',
    originCountry: originCountry.trim() || '',
    category,
    barcode: barcode.trim() || undefined,
    registrationNumber: registrationNumber.trim() || '',
    dosageForm: dosageForm.trim() || '',
    strength: strength.trim() || '',
    units: {
      base: {
        name: baseUnitName.trim(),
        contains: 1,
        price: parseFloat(baseUnitPrice) || 0,
        cost: parseFloat(baseUnitCost) || 0,
      },
      packaging: packagingName.trim() ? {
        name: packagingName.trim(),
        contains: parseInt(packagingContains, 10) || 1,
        price: parseFloat(packagingPrice) || 0,
        cost: 0,
      } : undefined,
      smallest: smallestName.trim() ? {
        name: smallestName.trim(),
        contains: parseInt(smallestContains, 10) || 1,
        price: parseFloat(smallestPrice) || 0,
        cost: 0,
      } : undefined,
    },
    reorderLevel: parseInt(reorderLevel, 10) || 0,
    warehouse: warehouse || undefined,
    prescriptionRequired,
    notes: notes.trim() || '',
    // ✅ Phase 2.5: overrides
    minMarginPercent: minMarginPercent.trim() ? parseFloat(minMarginPercent) : null,
    maxDiscountPercent: maxDiscountPercent.trim() ? parseFloat(maxDiscountPercent) : null,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!scientificName.trim()) { toast.error('الاسم العلمي مطلوب.'); return; }
    if (!tradeName.trim()) { toast.error('الاسم التجاري مطلوب.'); return; }
    if (!baseUnitName.trim()) { toast.error('اسم الوحدة الأساسية مطلوب.'); return; }

    // ✅ فحص overrides
    if (minMarginPercent.trim()) {
      const v = parseFloat(minMarginPercent);
      if (isNaN(v) || v < 0 || v > 100) { toast.error('هامش الربح الأدنى يجب أن يكون بين 0 و 100.'); return; }
    }
    if (maxDiscountPercent.trim()) {
      const v = parseFloat(maxDiscountPercent);
      if (isNaN(v) || v < 0 || v > 100) { toast.error('أقصى خصم يجب أن يكون بين 0 و 100.'); return; }
    }

    setIsSubmitting(true);
    try {
      const payload = buildPayload();
      if (isEdit) {
        await itemsAPI.updateItem(item.id, payload);
        toast.success('تم تعديل الصنف.');
      } else {
        await itemsAPI.createItem(payload);
        toast.success('تم إنشاء الصنف.');
      }
      onSuccess?.();
    } catch (err) {
      toast.error(err?.error?.message || err?.message || 'فشل حفظ الصنف.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingOptions) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary-700" />
        <span className="mr-3 text-neutral-600">جاري تحميل البيانات...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* الأسماء */}
      <Section title="أسماء الصنف">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="الاسم العلمي" required value={scientificName}
            onChange={(e) => setScientificName(e.target.value)} />
          <Input label="الاسم التجاري" required value={tradeName}
            onChange={(e) => setTradeName(e.target.value)} />
          <Input label="الاسم التجاري (EN)" value={tradeNameEn}
            onChange={(e) => setTradeNameEn(e.target.value)} />
          <Input label="الشركة المصنّعة" value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)} />
        </div>
      </Section>

      {/* التصنيف والتفاصيل */}
      <Section title="التصنيف والتفاصيل">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block mb-1.5 text-sm font-medium text-neutral-700">التصنيف *</label>
            <select value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm">
              {categories.map((c) => (
                <option key={c.id} value={c.name}>{c.label}</option>
              ))}
            </select>
          </div>
          <Input label="الباركود" value={barcode}
            onChange={(e) => setBarcode(e.target.value)} />
          <Input label="رقم التسجيل" value={registrationNumber}
            onChange={(e) => setRegistrationNumber(e.target.value)} />
          <Input label="الشكل الدوائي" value={dosageForm}
            onChange={(e) => setDosageForm(e.target.value)} />
          <Input label="التركيز" value={strength}
            onChange={(e) => setStrength(e.target.value)} />
          <Input label="بلد المنشأ" value={originCountry}
            onChange={(e) => setOriginCountry(e.target.value)} />
        </div>
      </Section>

      {/* الوحدات */}
      <Section title="الوحدات" description="الوحدة الأساسية إلزامية، الباقي اختياري">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <Input label="الوحدة الأساسية *" required value={baseUnitName}
            onChange={(e) => setBaseUnitName(e.target.value)} placeholder="قرص" />
          <Input label="تكلفة الوحدة الأساسية" type="number" min="0" step="0.01"
            value={baseUnitCost} onChange={(e) => setBaseUnitCost(e.target.value)} />
          <Input label="سعر الوحدة الأساسية" type="number" min="0" step="0.01"
            value={baseUnitPrice} onChange={(e) => setBaseUnitPrice(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <Input label="الوحدة الوسطى" value={packagingName}
            onChange={(e) => setPackagingName(e.target.value)} placeholder="شريط" />
          <Input label="تحتوي على" type="number" min="1"
            value={packagingContains} onChange={(e) => setPackagingContains(e.target.value)} />
          <Input label="سعرها" type="number" min="0" step="0.01"
            value={packagingPrice} onChange={(e) => setPackagingPrice(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input label="الوحدة الصغرى" value={smallestName}
            onChange={(e) => setSmallestName(e.target.value)} />
          <Input label="تحتوي على" type="number" min="1"
            value={smallestContains} onChange={(e) => setSmallestContains(e.target.value)} />
          <Input label="سعرها" type="number" min="0" step="0.01"
            value={smallestPrice} onChange={(e) => setSmallestPrice(e.target.value)} />
        </div>
      </Section>

      {/* المخزون */}
      <Section title="المخزون">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input label="حد إعادة الطلب" type="number" min="0"
            value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} />
          <div>
            <label className="block mb-1.5 text-sm font-medium text-neutral-700">المخزن الافتراضي</label>
            <select value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm">
              <option value="">— بدون —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center pt-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={prescriptionRequired}
                onChange={(e) => setPrescriptionRequired(e.target.checked)} />
              <span className="text-sm text-neutral-700">يحتاج وصفة طبية</span>
            </label>
          </div>
        </div>
      </Section>

      {/* ✅ Phase 2.5: تسعير متقدم */}
      <Section
        title="تسعير متقدم (اختياري)"
        icon={Shield}
        description="يُتجاوز الحدود العامة لهذا الصنف فقط"
      >
        <button
          type="button"
          onClick={() => setShowAdvancedPricing(!showAdvancedPricing)}
          className="flex items-center gap-2 text-sm text-primary-700 hover:text-primary-900 font-medium"
        >
          {showAdvancedPricing ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {showAdvancedPricing ? 'إخفاء' : 'إظهار'} إعدادات التسعير المتقدم
        </button>

        {showAdvancedPricing && (
          <div className="mt-3 space-y-3">
            <div className="bg-info-50 border border-info-200 rounded p-2 text-xs text-info-800 flex items-start gap-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                اتركه فارغاً لاستخدام الإعدادات العامة (10% هامش، 15% خصم).
                استخدم هذا للأصناف الحساسة (السعر الحساس، الهامش المنخفض).
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="هامش الربح الأدنى (%) — تجاوز"
                type="number" min="0" max="100" step="0.1"
                value={minMarginPercent}
                onChange={(e) => setMinMarginPercent(e.target.value)}
                placeholder="اتركه فارغاً = الإعداد العام"
                help="أقل سعر مسموح = التكلفة × (1 + هذا الهامش)"
              />
              <Input
                label="أقصى خصم مسموح (%) — تجاوز"
                type="number" min="0" max="100" step="0.1"
                value={maxDiscountPercent}
                onChange={(e) => setMaxDiscountPercent(e.target.value)}
                placeholder="اتركه فارغاً = الإعداد العام"
                help="أقل سعر موصى به = سعر القائمة × (1 - هذا الخصم)"
              />
            </div>
          </div>
        )}
      </Section>

      {/* ملاحظات */}
      <Section title="ملاحظات">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm"
          rows={3} maxLength={1000} placeholder="ملاحظات إدارية..." />
      </Section>

      {/* الأزرار */}
      <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>إلغاء</Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          {isEdit ? 'حفظ التعديلات' : 'إنشاء الصنف'}
        </Button>
      </div>
    </form>
  );
}

export default ItemForm;