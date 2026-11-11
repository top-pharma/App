/**
 * @file PurchaseReceiptForm.jsx
 * @description
 * نموذج إنشاء إيصال استلام مشتريات (مسودة draft).
 *
 * ⚠️ إصلاح 2026-11-10:
 *  - F1: البحث يعمل عند الفوكس.
 *  - F2: onFocus يُظهر النتائج دائماً.
 *  - F3: إغلاق قائمة البحث عند النقر خارجها.
 *  - F4: توحيد payload مع Backend.
 *  - F5: حساب total فوراً عند إضافة الصنف.
 *  - F6: حفظ itemId مباشرة في handlePickItem (يمنع "المُعرّف مطلوب").
 *  - F7: تحسين مظهر جدول البنود (حقول أكبر + تنسيق احترافي).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Search,
  X,
  Package,
  AlertCircle,
  Loader2,
  Receipt,
  Trash2,
  Banknote,
} from 'lucide-react';

import * as suppliersAPI from '../../api/suppliersAPI.js';
import * as warehousesAPI from '../../api/warehousesAPI.js';
import * as itemsAPI from '../../api/itemsAPI.js';
import * as purchaseReceiptsAPI from '../../api/purchaseReceiptsAPI.js';

import { useToast } from '../../hooks/useToast.js';

import Button from '../UI/Button.jsx';
import Input from '../UI/Input.jsx';

import { formatCurrency } from '../../utils/formatters.js';

// ═══════════════════════════════════════════════
// 1. المكونات الفرعية
// ═══════════════════════════════════════════════

function Section({ title, icon: Icon, children, description }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-neutral-200">
        {Icon && <Icon size={18} className="text-primary-700" />}
        <h3 className="font-bold text-neutral-900">{title}</h3>
        {description && <span className="text-xs text-neutral-500">— {description}</span>}
      </div>
      {children}
    </div>
  );
}

function Select({ label, value, onChange, options, required, disabled, placeholder = '— اختر —' }) {
  return (
    <div>
      {label && (
        <label className="block mb-1.5 text-sm font-medium text-neutral-700">
          {label}
          {required && <span className="text-danger-600 mr-1">*</span>}
        </label>
      )}
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 ${
          disabled ? 'bg-neutral-100 cursor-not-allowed' : ''
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ═══════════════════════════════════════════════
// 2. المكون الرئيسي
// ═══════════════════════════════════════════════

function PurchaseReceiptForm({ onSuccess, onCancel }) {
  const toast = useToast();
  const searchContainerRef = useRef(null);

  // ─── الخيارات ───
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // ─── البيانات الأساسية ───
  const [supplier, setSupplier] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([]);

  // ─── المالية ───
  const [discount, setDiscount] = useState('0');
  const [taxRate, setTaxRate] = useState('0');

  // ─── الدفع ───
  const [paymentType, setPaymentType] = useState('cash');
  const [dueDate, setDueDate] = useState('');
  const [initialAmount, setInitialAmount] = useState('0');
  const [initialMethod, setInitialMethod] = useState('cash');
  const [checkId, setCheckId] = useState('');

  // ─── ملاحظات ───
  const [notes, setNotes] = useState('');

  // ─── البحث عن صنف ───
  const [itemSearch, setItemSearch] = useState('');
  const [debouncedItemSearch, setDebouncedItemSearch] = useState('');
  const [itemResults, setItemResults] = useState([]);
  const [searchingItems, setSearchingItems] = useState(false);
  const [showItemResults, setShowItemResults] = useState(false);

  // ─── الحالة ───
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ═══════════════════════════════════════════════
  // 3. تحميل الخيارات
  // ═══════════════════════════════════════════════
  useEffect(() => {
    const loadOptions = async () => {
      setLoadingOptions(true);
      try {
        const [supRes, whRes] = await Promise.all([
          suppliersAPI.listSuppliers({ limit: 100, isActive: true }),
          warehousesAPI.listWarehouses({ limit: 100, isActive: true }),
        ]);
        setSuppliers(supRes.items || []);
        const whs = whRes.items || [];
        setWarehouses(whs);
        const defaultWh = whs.find((w) => w.isDefault);
        if (defaultWh) setWarehouse(defaultWh.id);
      } catch (err) {
        toast.error('فشل تحميل البيانات الأساسية.');
      } finally {
        setLoadingOptions(false);
      }
    };
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ═══════════════════════════════════════════════
  // 4. البحث عن الأصناف
  // ═══════════════════════════════════════════════

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedItemSearch(itemSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [itemSearch]);

  useEffect(() => {
    if (!showItemResults) return;

    const searchItems = async () => {
      setSearchingItems(true);
      try {
        const result = await itemsAPI.listItems({
          search: debouncedItemSearch || undefined,
          isActive: true,
          limit: 10,
        });
        setItemResults(result.items || []);
      } catch {
        setItemResults([]);
      } finally {
        setSearchingItems(false);
      }
    };
    searchItems();
  }, [debouncedItemSearch, showItemResults]);

  useEffect(() => {
    if (!showItemResults) return undefined;
    const handleClick = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowItemResults(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showItemResults]);

  // ═══════════════════════════════════════════════
  // 5. إضافة صنف للجدول — ✅ F5+F6
  // ═══════════════════════════════════════════════
  const handlePickItem = (item) => {
    const baseCost = Number(item.units?.base?.cost) || 0;
    const basePrice = Number(item.units?.base?.price) || 0;
    const initialQty = 1;

    // ✅ استخراج itemId مباشرة — من id أو _id
// ✅ تحويل ObjectId إلى string — لأن Zod يرفض ObjectId
const rawId = item.id || item._id || '';
const itemId = typeof rawId === 'string' ? rawId : String(rawId);    if (!itemId) {
      toast.error('الصنف المحدد لا يحتوي على معرف صالح.');
      return;
    }

    const newRow = {
      itemId,                                      // ✅ حفظ itemId مباشرة
      item,
      itemName: item.tradeName || item.name || '—',
      batch: '',
      productionDate: '',
      expiry: '',
      quantity: initialQty,
      unit: item.units?.base?.name || item.supportedUnits?.[0] || '',
      unitCost: baseCost,
      unitPrice: basePrice,
      total: Math.round(initialQty * baseCost * 100) / 100,
    };
    setItems((prev) => [...prev, newRow]);
    setShowItemResults(false);
    setItemSearch('');
    setItemResults([]);
  };

  // ═══════════════════════════════════════════════
  // 6. تعديل / حذف البنود
  // ═══════════════════════════════════════════════
  const updateItemField = (index, field, value) => {
    setItems((prev) => {
      const newItems = [...prev];
      const item = { ...newItems[index] };

      if (['quantity', 'unitCost', 'unitPrice'].includes(field)) {
        item[field] = value === '' ? 0 : parseFloat(value) || 0;
      } else {
        item[field] = value;
      }

      if (['quantity', 'unitCost', 'unitPrice'].includes(field)) {
        const qty = field === 'quantity' ? item[field] : (item.quantity || 0);
        const cost = field === 'unitCost' ? item[field] : (item.unitCost || 0);
        item.total = Math.round(qty * cost * 100) / 100;
      }

      newItems[index] = item;
      return newItems;
    });
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // ═══════════════════════════════════════════════
  // 7. الحسابات
  // ═══════════════════════════════════════════════
  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0),
    [items]
  );

  const discountAmount = parseFloat(discount) || 0;
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = useMemo(
    () => Math.round((taxableAmount * (parseFloat(taxRate) || 0)) / 100 * 100) / 100,
    [taxableAmount, taxRate]
  );
  const total = useMemo(
    () => Math.round((taxableAmount + taxAmount) * 100) / 100,
    [taxableAmount, taxAmount]
  );

  const paidAmount = paymentType === 'cash' ? total : parseFloat(initialAmount) || 0;
  const remainingAmount = Math.max(0, total - paidAmount);

  // ═══════════════════════════════════════════════
  // 8. التحقق والحفظ
  // ═══════════════════════════════════════════════
  const validate = () => {
    const errors = [];

    if (!supplier) errors.push('المورّد مطلوب');
    if (!warehouse) errors.push('المخزن مطلوب');
    if (items.length === 0) errors.push('يجب إضافة بند واحد على الأقل');

    for (const it of items) {
      if (!it.itemId) {
        errors.push(`معرف الصنف مفقود للبند "${it.itemName}"`);
        break;
      }
      if (!it.batch || !it.batch.trim()) {
        errors.push(`رقم الدفعة مطلوب للبند "${it.itemName}"`);
        break;
      }
      if (!it.expiry) {
        errors.push(`تاريخ الصلاحية مطلوب للبند "${it.itemName}"`);
        break;
      }
      if (it.quantity <= 0) {
        errors.push(`الكمية يجب أن تكون أكبر من صفر للبند "${it.itemName}"`);
        break;
      }
      if (it.unitCost <= 0) {
        errors.push(`التكلفة يجب أن تكون أكبر من صفر للبند "${it.itemName}"`);
        break;
      }
    }

    if (paymentType !== 'cash' && !dueDate) {
      errors.push('تاريخ الاستحقاق مطلوب للدفع الآجل أو الجزئي');
    }

    if (paidAmount > total + 0.01) {
      errors.push('المبلغ المدفوع أكبر من الإجمالي');
    }

    if (paidAmount > 0 && initialMethod === 'check' && !checkId.trim()) {
      errors.push('رقم الشيك مطلوب عند الدفع بشيك');
    }

    if (paymentType === 'partial' && paidAmount === 0) {
      errors.push('الدفع الجزئي يتطلب دفعة أولى أكبر من صفر');
    }

    if (errors.length > 0) {
      toast.error(errors[0]);
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);

    const payload = {
      supplierId: supplier,
      warehouse,
      supplierInvoiceNumber: supplierInvoiceNumber.trim() || undefined,
      receiptDate: new Date(receiptDate).toISOString(),
      items: items.map((i) => ({
        itemId: i.itemId,                          // ✅ مباشرة — مضمون
        batch: i.batch.trim().toUpperCase(),
        productionDate: i.productionDate || undefined,
        expiry: new Date(i.expiry).toISOString(),
        quantity: i.quantity,
        unit: i.unit || '',
        unitCost: i.unitCost,
        unitPrice: i.unitPrice || 0,
        total: Math.round(i.quantity * i.unitCost * 100) / 100,
        location: '',
      })),
      subtotal,
      discount: discountAmount,
      taxRate: parseFloat(taxRate) || 0,
      taxAmount,
      total,
      paymentType,
      initialPayment: paidAmount,
      initialPaymentMethod: paymentType === 'cash' ? 'cash' : initialMethod,
      paidAmount,
      remainingAmount,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      notes: notes || undefined,
    };

       try {
      console.log('🔍 payload BEFORE send:', JSON.stringify(payload, null, 2));
      const created = await purchaseReceiptsAPI.createPurchaseReceipt(payload);
      toast.success('تم إنشاء إيصال الاستلام (مسودة). أكّده لإدخال البضاعة للمخزون.');
      onSuccess?.(created);
    } catch (err) {
      console.error('🔍 error full:', err);
      console.error('🔍 error.error:', err?.error);
      console.error('🔍 error.details:', err?.error?.details);

      toast.error(err?.error?.message || err?.message || 'فشل إنشاء الإيصال.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ═══════════════════════════════════════════════
  // 9. العرض
  // ═══════════════════════════════════════════════
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
      {/* ═══ 1. البيانات الأساسية ═══ */}
      <Section title="بيانات المورّد والإيصال" icon={Receipt}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Select
            label="المورّد"
            required
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            options={suppliers.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
          />
          <Select
            label="المخزن المستقبِل"
            required
            value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
            options={warehouses.map((w) => ({
              value: w.id,
              label: `${w.name}${w.isDefault ? ' (افتراضي)' : ''}`,
            }))}
          />
          <Input
            label="رقم فاتورة المورّد"
            value={supplierInvoiceNumber}
            onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
            placeholder="اختياري"
            maxLength={50}
          />
          <Input
            label="تاريخ الاستلام"
            type="date"
            value={receiptDate}
            onChange={(e) => setReceiptDate(e.target.value)}
            required
          />
        </div>
      </Section>

      {/* ═══ 2. البنود ═══ */}
      <Section title="البنود" icon={Package} description={`${items.length} بند`}>
        {/* البحث */}
        <div className="relative mb-3" ref={searchContainerRef}>
          <Input
            placeholder="ابحث بالاسم التجاري/العلمي/الباركود..."
            icon={Search}
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            onFocus={() => setShowItemResults(true)}
          />
          {searchingItems && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-md shadow-lg p-3 text-center text-sm text-neutral-500 z-20">
              <Loader2 size={16} className="inline animate-spin mr-2" />
              جاري البحث...
            </div>
          )}
          {showItemResults && itemResults.length > 0 && !searchingItems && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-md shadow-lg max-h-64 overflow-y-auto z-20">
              {itemResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handlePickItem(item)}
                  className="w-full text-right px-4 py-2 hover:bg-primary-50 border-b border-neutral-100 last:border-b-0 transition-colors"
                >
                  <p className="font-medium text-neutral-900">{item.tradeName || item.name}</p>
                  <p className="text-xs text-neutral-500">
                    {item.scientificName} {item.category ? `· ${item.category}` : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
          {showItemResults && !searchingItems && itemResults.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-md shadow-lg p-3 text-center text-sm text-neutral-500 z-20">
              <AlertCircle size={16} className="inline mr-1 text-warning-600" />
              {debouncedItemSearch ? 'لا توجد أصناف مطابقة' : 'لا توجد أصناف نشطة'}
            </div>
          )}
        </div>

        {/* الجدول — ✅ F7: تحسين المظهر */}
        {items.length === 0 ? (
          <div className="border-2 border-dashed border-neutral-300 rounded-lg p-12 text-center bg-neutral-50">
            <Package size={48} className="mx-auto text-neutral-400 mb-3" />
            <p className="text-neutral-600">
              لا توجد بنود بعد. ابحث عن صنف أعلاه لإضافته.
            </p>
          </div>
        ) : (
          <div className="border border-neutral-200 rounded-lg overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gradient-to-b from-neutral-50 to-neutral-100 border-b-2 border-neutral-300">
                  <tr>
                    <th className="px-3 py-2.5 text-right font-bold text-neutral-700 min-w-[180px]">الصنف</th>
                    <th className="px-3 py-2.5 text-center font-bold text-neutral-700 w-32">رقم الدفعة *</th>
                    <th className="px-3 py-2.5 text-center font-bold text-neutral-700 w-36">تاريخ الإنتاج</th>
                    <th className="px-3 py-2.5 text-center font-bold text-neutral-700 w-36">تاريخ الصلاحية *</th>
                    <th className="px-3 py-2.5 text-center font-bold text-neutral-700 w-24">الكمية *</th>
                    <th className="px-3 py-2.5 text-center font-bold text-neutral-700 w-24">الوحدة</th>
                    <th className="px-3 py-2.5 text-center font-bold text-neutral-700 w-28">التكلفة *</th>
                    <th className="px-3 py-2.5 text-center font-bold text-neutral-700 w-28">سعر البيع</th>
                    <th className="px-3 py-2.5 text-left font-bold text-neutral-700 w-32">الإجمالي</th>
                    <th className="px-3 py-2.5 w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-primary-50/30 transition-colors">
                      <td className="px-3 py-2">
                        <div>
                          <p className="font-medium text-neutral-900 text-sm">{it.itemName}</p>
                          {it.item?.scientificName && (
                            <p className="text-xs text-neutral-500 mt-0.5">{it.item.scientificName}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={it.batch}
                          onChange={(e) => updateItemField(idx, 'batch', e.target.value.toUpperCase())}
                          placeholder="B-001"
                          className="w-full px-2.5 py-1.5 text-center rounded-md border border-neutral-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-500"
                          maxLength={50}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={it.productionDate}
                          onChange={(e) => updateItemField(idx, 'productionDate', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={it.expiry}
                          onChange={(e) => updateItemField(idx, 'expiry', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={it.quantity}
                          onChange={(e) => updateItemField(idx, 'quantity', e.target.value)}
                          min="0.01"
                          step="any"
                          className="w-full px-2.5 py-1.5 text-center rounded-md border border-neutral-300 text-sm numeric focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-center text-sm text-neutral-700">
                        {it.unit || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={it.unitCost}
                          onChange={(e) => updateItemField(idx, 'unitCost', e.target.value)}
                          min="0"
                          step="any"
                          className="w-full px-2.5 py-1.5 text-left rounded-md border border-neutral-300 text-sm numeric focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={it.unitPrice}
                          onChange={(e) => updateItemField(idx, 'unitPrice', e.target.value)}
                          min="0"
                          step="any"
                          className="w-full px-2.5 py-1.5 text-left rounded-md border border-neutral-300 text-sm numeric focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-left numeric font-bold text-neutral-900 text-sm">
                        {formatCurrency(it.total || 0, false)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="p-1.5 rounded-md text-danger-600 hover:bg-danger-50 transition-colors"
                          aria-label="حذف البند"
                          title="حذف البند"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gradient-to-b from-neutral-50 to-neutral-100 border-t-2 border-neutral-300">
                  <tr>
                    <td colSpan={8} className="px-3 py-3 text-sm text-neutral-700 text-left font-medium">
                      إجمالي البنود: <strong className="numeric text-neutral-900">{items.length}</strong>
                    </td>
                    <td className="px-3 py-3 text-left">
                      <span className="text-xl font-bold numeric text-primary-800">
                        {formatCurrency(subtotal)}
                      </span>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-start gap-2 bg-info-50 border border-info-200 rounded-md p-2 text-xs text-info-800">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>هذه الحقول إلزامية: <strong>رقم الدفعة</strong>، <strong>تاريخ الصلاحية</strong>، <strong>الكمية</strong>، <strong>التكلفة</strong>.</span>
        </div>
      </Section>

      {/* ═══ 3. المالية والدفع ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* الملخص المالي */}
        <Section title="الملخص المالي" icon={Banknote}>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-600">المجموع الفرعي</span>
              <span className="numeric font-medium">{formatCurrency(subtotal, false)}</span>
            </div>

            <div>
              <label className="block mb-1.5 text-sm font-medium text-neutral-700">خصم المورد</label>
              <input
                type="number"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                min="0"
                step="any"
                className="w-full px-2 py-1.5 rounded-md border border-neutral-300 text-sm numeric focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
              {discountAmount > 0 && (
                <p className="text-xs text-danger-700 mt-1 text-left numeric">
                  - {formatCurrency(discountAmount)}
                </p>
              )}
            </div>

            <div>
              <label className="block mb-1.5 text-sm font-medium text-neutral-700">الضريبة %</label>
              <input
                type="number"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                min="0"
                max="100"
                step="any"
                className="w-full px-2 py-1.5 rounded-md border border-neutral-300 text-sm numeric focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
              {taxAmount > 0 && (
                <p className="text-xs text-neutral-600 mt-1 text-left numeric">
                  + {formatCurrency(taxAmount)}
                </p>
              )}
            </div>

            <div className="border-t border-neutral-200 pt-3 flex justify-between items-center">
              <span className="font-bold text-neutral-900">الإجمالي</span>
              <span className="text-xl font-bold numeric text-primary-800">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        </Section>

        {/* الدفع */}
        <Section title="الدفع" icon={Banknote}>
          <div className="space-y-3">
            <Select
              label="نوع الدفع"
              required
              value={paymentType}
              onChange={(e) => {
                setPaymentType(e.target.value);
                if (e.target.value === 'cash') {
                  setInitialAmount('0');
                  setDueDate('');
                }
              }}
              options={[
                { value: 'cash', label: 'نقدي (كامل)' },
                { value: 'credit', label: 'آجل (كامل)' },
                { value: 'partial', label: 'جزئي' },
              ]}
            />

            {paymentType !== 'cash' && (
              <Input
                label="تاريخ الاستحقاق"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            )}

            {paymentType === 'partial' && (
              <>
                <Input
                  label="الدفعة الأولى"
                  type="number"
                  value={initialAmount}
                  onChange={(e) => setInitialAmount(e.target.value)}
                  min="0"
                  max={total}
                  step="any"
                  required
                />

                {paidAmount > 0 && (
                  <Select
                    label="طريقة الدفع"
                    value={initialMethod}
                    onChange={(e) => setInitialMethod(e.target.value)}
                    options={[
                      { value: 'cash', label: 'نقدي' },
                      { value: 'bank', label: 'تحويل بنكي' },
                      { value: 'check', label: 'شيك' },
                    ]}
                  />
                )}

                {paidAmount > 0 && initialMethod === 'check' && (
                  <Input
                    label="رقم الشيك"
                    value={checkId}
                    onChange={(e) => setCheckId(e.target.value)}
                    required
                  />
                )}
              </>
            )}

            {remainingAmount > 0 && (
              <div className="bg-warning-50 border border-warning-200 rounded-md p-2 text-sm text-warning-800 flex items-center gap-2">
                <AlertCircle size={16} />
                <span>
                  سيُضاف <strong className="numeric">{formatCurrency(remainingAmount)}</strong> لرصيد المورّد.
                </span>
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* ═══ 4. ملاحظات ═══ */}
      <Section title="ملاحظات" icon={X}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-200 text-sm"
          rows={2}
          placeholder="ملاحظات إدارية (اختياري)..."
          maxLength={1000}
        />
      </Section>

      {/* ═══ 5. تنبيه المسودة ═══ */}
      <div className="bg-info-50 border border-info-200 rounded-lg p-3 text-sm text-info-800 flex items-start gap-2">
        <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
        <span>
          سيُحفظ الإيصال كـ<strong> مسودة (draft)</strong>. لن تُضاف البضاعة للمخزون حتى تضغط
          "تأكيد الاستلام" من صفحة المشتريات.
        </span>
      </div>

      {/* ═══ 6. الأزرار ═══ */}
      <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          إلغاء
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting} icon={Plus}>
          حفظ كمسودة ({formatCurrency(total)})
        </Button>
      </div>
    </form>
  );
}

export default PurchaseReceiptForm;