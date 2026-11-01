/**
 * @file DeliveryNoteForm.jsx
 * @description
 * نموذج إنشاء إيصال تسليم بضاعة (يخصم المخزون فوراً).
 *
 * Phase 2.5:
 * - ✅ يعرض كل الأصناف عند الفتح (بدون اشتراط الكتابة).
 * - ✅ يُفلتر عند الكتابة (2+ حرف).
 * - ✅ يعيد عرض الكل عند مسح البحث.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, X, Package, AlertCircle, Loader2, Truck, Banknote, ShoppingCart,
} from 'lucide-react';

import * as customersAPI from '../../api/customersAPI.js';
import * as usersAPI from '../../api/usersAPI.js';
import * as warehousesAPI from '../../api/warehousesAPI.js';
import * as itemsAPI from '../../api/itemsAPI.js';
import * as stocksAPI from '../../api/stocksAPI.js';
import * as deliveryNotesAPI from '../../api/deliveryNotesAPI.js';

import { useToast } from '../../hooks/useToast.js';

import Button from '../UI/Button.jsx';
import Input from '../UI/Input.jsx';
import InvoiceItemsTable from './InvoiceItemsTable.jsx';
import FefoSelectorModal from './FefoSelectorModal.jsx';

import { formatCurrency } from '../../utils/formatters.js';
import { PAYMENT_TYPE_LABELS_AR } from '../../utils/constants.js';

// ═══════════════════════════════════════════════
// مكونات فرعية
// ═══════════════════════════════════════════════

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
        className={`w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 ${disabled ? 'bg-neutral-100 cursor-not-allowed' : ''}`}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// ═══════════════════════════════════════════════
// المكون الرئيسي
// ═══════════════════════════════════════════════

function DeliveryNoteForm({ onSuccess, onCancel }) {
  const toast = useToast();

  const [customers, setCustomers] = useState([]);
  const [salesReps, setSalesReps] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [pharmacy, setPharmacy] = useState('');
  const [salesRep, setSalesRep] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([]);

  const [paymentPlan, setPaymentPlan] = useState('cash');
  const [initialAmount, setInitialAmount] = useState('0');
  const [initialPaymentMethod, setInitialPaymentMethod] = useState('cash');
  const [checkId, setCheckId] = useState('');
  const [notes, setNotes] = useState('');

  const [itemSearch, setItemSearch] = useState('');
  const [debouncedItemSearch, setDebouncedItemSearch] = useState('');
  const [itemResults, setItemResults] = useState([]);
  const [searchingItems, setSearchingItems] = useState(false);
  const [showItemResults, setShowItemResults] = useState(false);

  const [selectedItemForFefo, setSelectedItemForFefo] = useState(null);
  const [isFefoOpen, setIsFefoOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ─── تحميل الخيارات ───
  useEffect(() => {
    const loadOptions = async () => {
      setLoadingOptions(true);
      try {
        const [custRes, repRes, whRes] = await Promise.all([
          customersAPI.listCustomers({ limit: 100, isActive: true }),
          usersAPI.listSalesReps(),
          warehousesAPI.listWarehouses({ limit: 100, isActive: true }),
        ]);
        setCustomers(custRes.items || []);
        setSalesReps(repRes || []);
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

  // ─── Debounce البحث ───
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedItemSearch(itemSearch.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [itemSearch]);

  // ─── تحميل/فلترة الأصناف ───
  useEffect(() => {
    const searchItems = async () => {
      setSearchingItems(true);
      try {
        const params = { isActive: true, limit: 30 };
        if (debouncedItemSearch.length >= 2) {
          params.search = debouncedItemSearch;
        }
        const result = await itemsAPI.listItems(params);
        setItemResults(result.items || []);
        setShowItemResults(true);
      } catch (err) {
        console.error('فشل تحميل الأصناف:', err);
        setItemResults([]);
      } finally {
        setSearchingItems(false);
      }
    };
    searchItems();
  }, [debouncedItemSearch]);

  // ─── الحسابات ───
  const totalAmount = useMemo(
    () => items.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0),
    [items]
  );
  const initialPaymentAmount = parseFloat(initialAmount) || 0;
  const remainingAmount = Math.max(0, totalAmount - initialPaymentAmount);

  // ─── اختيار صنف ───
  const handlePickItem = (item) => {
    if (!warehouse) {
      toast.error('يجب اختيار المخزن أولاً.');
      return;
    }
    setSelectedItemForFefo(item);
    setIsFefoOpen(true);
    setShowItemResults(false);
    setItemSearch('');
    setItemResults([]);
  };

  const addItemRow = ({ item, batch, expiry, quantity, unitPrice }) => {
    const newRow = {
      item,
      itemName: item.tradeName,
      batch,
      expiry,
      quantity,
      unit: item.units?.base?.name || item.supportedUnits?.[0] || '',
      unitPrice,
      unitCost: 0,
      total: Math.round(quantity * unitPrice * 100) / 100,
    };
    setItems((prev) => [...prev, newRow]);
  };

  const handleFefoSelect = async ({ batch, expiry, quantity, unitPrice }) => {
    const item = selectedItemForFefo;
    if (batch) {
      addItemRow({ item, batch, expiry, quantity, unitPrice });
    } else {
      try {
        const result = await stocksAPI.selectFEFO({
          item: item.id,
          warehouse,
          quantity,
        });
        const selections = result.selections || [];
        if (selections.length === 0) {
          toast.error('لا توجد دفعات متاحة لهذا الصنف.');
          return;
        }
        selections.forEach((sel) => {
          addItemRow({
            item, batch: sel.batch, expiry: sel.expiry,
            quantity: sel.quantity, unitPrice,
          });
        });
        if (selections.length > 1) {
          toast.success(`تم تقسيم البند على ${selections.length} دفعات (FEFO).`);
        }
      } catch (err) {
        toast.error(err?.error?.message || err?.message || 'فشل اختيار الدفعات.');
        return;
      }
    }
    setIsFefoOpen(false);
    setSelectedItemForFefo(null);
  };

  // ─── التحقق والحفظ ───
  const validate = () => {
    const errors = [];
    if (!pharmacy) errors.push('الصيدلية مطلوبة');
    if (!salesRep) errors.push('المندوب مطلوب');
    if (!warehouse) errors.push('المخزن مطلوب');
    if (items.length === 0) errors.push('يجب إضافة بند واحد على الأقل');
    if (initialPaymentAmount > totalAmount + 0.01) {
      errors.push('الدفعة الأولى لا يمكن أن تتجاوز الإجمالي');
    }
    if (initialPaymentAmount > 0 && initialPaymentMethod === 'check' && !checkId.trim()) {
      errors.push('رقم الشيك مطلوب');
    }
    if (items.some((i) => !i.batch)) {
      errors.push('يجب اختيار دفعة لكل بند');
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
      pharmacy, salesRep, warehouse,
      deliveryDate: new Date(deliveryDate).toISOString(),
      items: items.map((i) => ({
        item: i.item.id,
        batch: i.batch,
        expiry: i.expiry || undefined,
        quantity: i.quantity,
        unit: i.unit || '',
        unitPrice: i.unitPrice,
        total: i.total,
      })),
      totalAmount,
      initialPayment:
        initialPaymentAmount > 0
          ? {
              amount: initialPaymentAmount,
              paymentMethod: initialPaymentMethod,
              checkId: initialPaymentMethod === 'check' ? checkId.trim() : undefined,
            }
          : undefined,
      remainingAmount,
      paymentPlan,
      notes: notes || undefined,
    };

    try {
      const created = await deliveryNotesAPI.createDeliveryNote(payload);
      toast.success('تم إنشاء إيصال التسليم وخصم المخزون.');
      onSuccess?.(created);
    } catch (err) {
      toast.error(err?.error?.message || err?.message || 'فشل إنشاء إيصال التسليم.');
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
      {/* ═══ 1. البيانات الأساسية ═══ */}
      <Section title="البيانات الأساسية" icon={Truck}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select label="الصيدلية" required value={pharmacy}
            onChange={(e) => setPharmacy(e.target.value)}
            options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.phone})` }))} />
          <Select label="المندوب" required value={salesRep}
            onChange={(e) => setSalesRep(e.target.value)}
            options={salesReps.map((r) => ({ value: r.id, label: r.name }))} />
          <Select label="المخزن" required value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
            options={warehouses.map((w) => ({
              value: w.id, label: `${w.name}${w.isDefault ? ' (افتراضي)' : ''}`,
            }))} />
          <Input label="تاريخ التسليم" type="date" value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)} />
        </div>
        <div className="mt-3 flex items-start gap-2 bg-info-50 border border-info-200 rounded-md p-2 text-xs text-info-800">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>عند الحفظ، سيتم <strong>خصم المخزون فعلياً</strong> من الدفعات المختارة.</span>
        </div>
      </Section>

      {/* ═══ 2. البنود ═══ */}
      <Section title="البنود" icon={Package} description={`${items.length} بند`}>
        <div className="relative mb-3">
          <Input
            placeholder="ابحث عن صنف... (كل الأصناف معروضة أدناه)"
            icon={Search}
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            onFocus={() => setShowItemResults(true)}
          />

          {searchingItems && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-md shadow-lg p-3 text-center text-sm text-neutral-500 z-20">
              <Loader2 size={16} className="inline animate-spin mr-2" />
              جاري التحميل...
            </div>
          )}

          {showItemResults && !searchingItems && itemResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-md shadow-lg max-h-64 overflow-y-auto z-20">
              {itemResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handlePickItem(item)}
                  className="w-full text-right px-4 py-2 hover:bg-primary-50 border-b border-neutral-100 last:border-b-0"
                >
                  <p className="font-medium text-neutral-900">{item.tradeName}</p>
                  <p className="text-xs text-neutral-500">
                    {item.scientificName} · {item.category}
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

        <InvoiceItemsTable
          items={items}
          onChange={setItems}
          emptyMessage="اختر صنفاً من القائمة أعلاه لإضافته."
        />
      </Section>

      {/* ═══ 3. الدفع ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="خطة الدفع" icon={ShoppingCart}>
          <Select label="نوع خطة الدفع" required value={paymentPlan}
            onChange={(e) => setPaymentPlan(e.target.value)}
            options={Object.entries(PAYMENT_TYPE_LABELS_AR).map(([k, l]) => ({ value: k, label: l }))} />
        </Section>

        <Section title="الدفعة الأولى (اختياري)" icon={Banknote}>
          <div className="space-y-3">
            <Input label="المبلغ المقبوض الآن" type="number"
              value={initialAmount} onChange={(e) => setInitialAmount(e.target.value)}
              min="0" max={totalAmount} step="0.01" />

            {initialPaymentAmount > 0 && (
              <>
                <Select label="طريقة الدفع" value={initialPaymentMethod}
                  onChange={(e) => setInitialPaymentMethod(e.target.value)}
                  options={[
                    { value: 'cash', label: 'نقدي' },
                    { value: 'bank', label: 'تحويل بنكي' },
                    { value: 'check', label: 'شيك' },
                  ]} />
                {initialPaymentMethod === 'check' && (
                  <Input label="رقم الشيك" value={checkId}
                    onChange={(e) => setCheckId(e.target.value)} required />
                )}
              </>
            )}

            {remainingAmount > 0 && (
              <div className="bg-warning-50 border border-warning-200 rounded-md p-2 text-sm text-warning-800 flex items-center gap-2">
                <AlertCircle size={16} />
                <span>سيُسجَّل <strong className="numeric">{formatCurrency(remainingAmount)}</strong> على الرصيد.</span>
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* ═══ 4. الملاحظات والإجمالي ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="الإجمالي" icon={Banknote}>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-600">إجمالي البنود</span>
              <span className="numeric font-medium">{formatCurrency(totalAmount, false)}</span>
            </div>
            {initialPaymentAmount > 0 && (
              <div className="flex justify-between text-sm text-success-700">
                <span>الدفعة الأولى</span>
                <span className="numeric">{formatCurrency(initialPaymentAmount, false)}</span>
              </div>
            )}
            <div className="border-t border-neutral-200 pt-2 flex justify-between items-center">
              <span className="font-bold text-neutral-900">المتبقي</span>
              <span className={`text-lg font-bold numeric ${remainingAmount > 0 ? 'text-danger-700' : 'text-success-700'}`}>
                {formatCurrency(remainingAmount)}
              </span>
            </div>
          </div>
        </Section>

        <Section title="ملاحظات" icon={X}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-200 text-sm"
            rows={4} placeholder="ملاحظات إدارية (اختياري)..." maxLength={1000} />
        </Section>
      </div>

      {/* ═══ 5. الأزرار ═══ */}
      <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>إلغاء</Button>
        <Button type="submit" variant="primary" loading={isSubmitting} icon={Truck}>
          حفظ إيصال التسليم ({formatCurrency(totalAmount)})
        </Button>
      </div>

      {/* ═══ FefoSelector Modal ═══ */}
      {selectedItemForFefo && (
        <FefoSelectorModal
          isOpen={isFefoOpen}
          onClose={() => { setIsFefoOpen(false); setSelectedItemForFefo(null); }}
          onSelect={handleFefoSelect}
          item={selectedItemForFefo}
          warehouseId={warehouse}
          initialQuantity={1}
        />
      )}
    </form>
  );
}

export default DeliveryNoteForm;