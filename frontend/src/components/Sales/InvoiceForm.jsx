/**
 * @file InvoiceForm.jsx
 * @description
 * نموذج إنشاء / تعديل مسودة فاتورة.
 *
 * ✅ v10.8 (2026-11-15):
 * - دعم initialDraft (بدل initialData) — من InvoiceDetail.
 * - دعم onSuccess (بدل onSubmit) — من InvoiceDetail.
 * - buildPayload: unit + discount حقيقي.
 * - قسم خصم جديد (نسبة/مبلغ).
 * - handleFefoSelect: unit.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ShoppingCart, Package, CreditCard, Search, Loader2, AlertCircle,
  Shield, Lock, FileEdit, Percent, Tag,
} from 'lucide-react';

import Section from '../UI/Section.jsx';
import Input from '../UI/Input.jsx';
import Select from '../UI/Select.jsx';
import Button from '../UI/Button.jsx';
import InvoiceItemsTable from './InvoiceItemsTable.jsx';
import FefoSelectorModal from './FefoSelectorModal.jsx';
import CashSelector from '../Finance/CashSelector.jsx';

import { useCustomers } from '../../context/CustomersContext.jsx';
import { useWarehouses } from '../../context/WarehousesContext.jsx';
import { useItems } from '../../context/ItemsContext.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../../hooks/useToast.js';
import * as usersAPI from '../../api/usersAPI.js';
import * as invoicesAPI from '../../api/invoicesAPI.js';

const FEFO_AUTO_BATCH = 'FEFO-AUTO';

const InvoiceForm = ({
  mode = 'new',
  initialDraft = null,   // ✅ v10.8
  onSuccess = null,      // ✅ v10.8
  onSubmit,
  onSubmitDraft,
  onClose,
}) => {
  const { customers, loading: customersLoading, fetchCustomers } = useCustomers();
  const { warehouses, loading: warehousesLoading, fetchWarehouses } = useWarehouses();
  const { fetchItems } = useItems();
  const { user, isAdmin, isAccountant } = useAuth();
  const toast = useToast();
  const showToast = toast.showToast || (() => {});

  const searchInputRef = useRef(null);

  // ─── الحقول الأساسية ───
  const [pharmacy, setPharmacy] = useState(initialDraft?.pharmacy?._id || initialDraft?.pharmacy || '');
  const [salesRep, setSalesRep] = useState(() => {
    if (initialDraft?.salesRep?._id) return initialDraft.salesRep._id;
    if (initialDraft?.salesRep) return initialDraft.salesRep;
    if (user?.role === 'sales_rep') return user.id || user._id || '';
    return '';
  });
  const [warehouse, setWarehouse] = useState(initialDraft?.warehouse?._id || initialDraft?.warehouse || '');
  const [invoiceDate, setInvoiceDate] = useState(
    initialDraft?.invoiceDate
      ? new Date(initialDraft.invoiceDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );

  // ─── البنود ───
  const [items, setItems] = useState(() => {
    if (!initialDraft?.items) return [];
    return initialDraft.items.map((it) => ({
      itemId: it.item?._id || it.item,
      itemName: it.item?.tradeName || '',
      batch: it.batch || '',
      expiry: it.expiry || null,
      quantity: it.quantity || 1,
      unit: it.unit || it.item?.units?.base?.name || 'وحدة',
      unitPrice: it.unitPrice || 0,
      unitCost: it.unitCost || 0,
      total: it.total || 0,
      isBelowRecommended: false,
      overrideReason: null,
    }));
  });

  // ─── الدفع ───
  const [paymentType, setPaymentType] = useState(initialDraft?.paymentType || 'cash');
  const [dueDate, setDueDate] = useState(
    initialDraft?.dueDate ? new Date(initialDraft.dueDate).toISOString().slice(0, 10) : ''
  );
  const [totalInstallments, setTotalInstallments] = useState(initialDraft?.totalInstallments || 2);
  const [paidAmount, setPaidAmount] = useState(initialDraft?.paidAmount || 0);
  const [paymentMethod, setPaymentMethod] = useState(initialDraft?.paymentMethod || 'cash');
  const [cashFundId, setCashFundId] = useState('');

  // ✅ v10.8: خصم
  const [discountType, setDiscountType] = useState(initialDraft?.discount?.type || '');
  const [discountValue, setDiscountValue] = useState(initialDraft?.discount?.value || 0);
  const [discountReason, setDiscountReason] = useState(initialDraft?.discount?.reason || '');

  // ─── ملاحظات + override ───
  const [notes, setNotes] = useState(initialDraft?.notes || '');
  const [overrideReason, setOverrideReason] = useState('');

  // ─── حالة ───
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [debouncedItemSearch, setDebouncedItemSearch] = useState('');
  const [showItemResults, setShowItemResults] = useState(false);
  const [searchingItems, setSearchingItems] = useState(false);
  const [itemResults, setItemResults] = useState([]);
  const [selectedItemForFefo, setSelectedItemForFefo] = useState(null);
  const [isFefoOpen, setIsFefoOpen] = useState(false);
  const [salesReps, setSalesReps] = useState([]);
  const [loadingSalesReps, setLoadingSalesReps] = useState(false);

  // ─── القيم المحسوبة ───
  const hasOverriddenItems = useMemo(
    () => items.some((it) => it.isBelowRecommended === true),
    [items]
  );
  const canOverridePrice = isAdmin || isAccountant;

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + Number(it.unitPrice || 0) * Number(it.quantity || 0), 0),
    [items]
  );

  // ✅ v10.8: حساب الخصم
  const discountAmount = useMemo(() => {
    if (!discountType || !discountValue) return 0;
    if (discountType === 'percentage') {
      return Math.round((subtotal * discountValue / 100) * 100) / 100;
    }
    if (discountType === 'fixed') {
      return Math.min(discountValue, subtotal);
    }
    return 0;
  }, [discountType, discountValue, subtotal]);

  const total = useMemo(() => {
    const t = subtotal - discountAmount;
    return Math.round((t + Number.EPSILON) * 100) / 100;
  }, [subtotal, discountAmount]);

  const effectivePaidAmount = useMemo(() => {
    if (paymentType === 'cash') return total;
    return Number(paidAmount) || 0;
  }, [paymentType, total, paidAmount]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedItemSearch(itemSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [itemSearch]);

  useEffect(() => {
    if (!customers || customers.length === 0) fetchCustomers({ isActive: 'true', limit: 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!warehouses || warehouses.length === 0) fetchWarehouses({ isActive: 'true', limit: 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loadReps = async () => {
      setLoadingSalesReps(true);
      try {
        const reps = await usersAPI.listSalesReps();
        setSalesReps(Array.isArray(reps) ? reps : []);
      } catch {
        setSalesReps([]);
      } finally {
        setLoadingSalesReps(false);
      }
    };
    if (user?.role === 'sales_rep') {
      setSalesReps([{ id: user.id || user._id, name: user.name || user.email }]);
    } else {
      loadReps();
    }
  }, [user]);

  useEffect(() => {
    const loadItems = async () => {
      setSearchingItems(true);
      try {
        const result = await fetchItems({ search: debouncedItemSearch, isActive: 'true', limit: 50 });
        const list = result?.data?.items || result?.items || [];
        setItemResults(Array.isArray(list) ? list : []);
      } catch {
        setItemResults([]);
      } finally {
        setSearchingItems(false);
      }
    };
    if (showItemResults) loadItems();
  }, [debouncedItemSearch, showItemResults, fetchItems]);

  useEffect(() => {
    if (!showItemResults) return undefined;
    const handleClick = (e) => {
      if (searchInputRef.current?.contains(e.target)) return;
      setShowItemResults(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showItemResults]);

  const handlePickItem = (item) => {
    if (!warehouse) {
      showToast('اختر المخزن أولاً', 'warning');
      return;
    }
    setShowItemResults(false);
    setItemSearch('');
    setSelectedItemForFefo(item);
    setIsFefoOpen(true);
  };

  // ✅ v10.8: unit في handleFefoSelect
  const handleFefoSelect = (batchData) => {
    if (!batchData) return;
    const qty = parseInt(batchData.quantity, 10) || 1;
    const price = Number(batchData.unitPrice) || 0;
    const computedTotal = Math.round(qty * price * 100) / 100;
    const unit = batchData.unit || selectedItemForFefo?.units?.base?.name || 'وحدة';

    const newItem = {
      itemId: batchData.itemId || selectedItemForFefo?.id || selectedItemForFefo?._id,
      itemName: batchData.itemName || selectedItemForFefo?.tradeName || selectedItemForFefo?.name,
      batch: batchData.batch || FEFO_AUTO_BATCH,
      expiry: batchData.expiry || null,
      quantity: qty,
      unit,  // ✅ v10.8
      unitPrice: price,
      unitCost: Number(batchData.unitCost) || 0,
      total: computedTotal,
      isBelowRecommended: batchData.isBelowRecommended === true,
      overrideReason: batchData.overrideReason || null,
    };

    setItems((prev) => [...prev, newItem]);
    setIsFefoOpen(false);
    setSelectedItemForFefo(null);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const handlePaymentTypeChange = (val) => {
    setPaymentType(val);
    if (val === 'cash') {
      setDueDate('');
      setTotalInstallments(2);
    } else {
      setPaidAmount(0);
    }
  };

  const validate = () => {
    if (!pharmacy) { showToast('اختر الصيدلية', 'error'); return false; }
    if (!salesRep) { showToast('اختر المندوب', 'error'); return false; }
    if (!warehouse) { showToast('اختر المخزن', 'error'); return false; }
    if (items.length === 0) { showToast('أضف بنداً واحداً على الأقل', 'error'); return false; }
    if (hasOverriddenItems && !overrideReason.trim()) {
      showToast('أدخل سبب تجاوز السعر', 'error'); return false;
    }
    if (effectivePaidAmount > 0 && paymentType === 'cash' && paymentMethod === 'cash' && !cashFundId) {
      showToast('اختر الصندوق', 'error'); return false;
    }
    if ((paymentType === 'credit' || paymentType === 'installments') && !dueDate) {
      showToast('حدد تاريخ الاستحقاق', 'error'); return false;
    }
    if (paymentType === 'installments' && totalInstallments < 2) {
      showToast('عدد الأقساط يجب أن يكون 2 على الأقل', 'error'); return false;
    }
    if (discountType && discountAmount <= 0) {
      showToast('قيمة الخصم غير صالحة', 'error'); return false;
    }
    if (discountAmount > subtotal) {
      showToast('الخصم أكبر من المجموع', 'error'); return false;
    }
    return true;
  };

  // ✅ v10.8: buildPayload مع unit + discount
  const buildPayload = () => {
    const mappedItems = items.map((it) => ({
      item: it.itemId || it.item?._id || it.item,
      batch: it.batch || FEFO_AUTO_BATCH,
      expiry: it.expiry || undefined,
      quantity: parseInt(it.quantity, 10) || 1,
      unit: it.unit || it.item?.units?.base?.name || 'وحدة',
      unitPrice: Number(it.unitPrice),
      total: Number(it.total) || Math.round(Number(it.quantity) * Number(it.unitPrice) * 100) / 100,
      unitCost: Number(it.unitCost || 0),
    }));

    const discount = {
      type: discountType || null,
      value: Number(discountValue) || 0,
      reason: discountReason || '',
      computedAmount: discountAmount,
      freeItems: [],
    };

    return {
      pharmacy,
      salesRep: salesRep || '',
      warehouse,
      invoiceDate,
      items: mappedItems,
      subtotal: Math.round(subtotal * 100) / 100,
      discount,
      taxRate: 0,
      taxAmount: 0,
      total: Math.round(total * 100) / 100,
      paymentType,
      dueDate: paymentType === 'credit' || paymentType === 'installments' ? dueDate : null,
      totalInstallments: paymentType === 'installments' ? Number(totalInstallments) : 0,
      paidAmount: Number(effectivePaidAmount) || 0,
      paymentMethod: effectivePaidAmount > 0 ? paymentMethod : '',
      cashFundId: effectivePaidAmount > 0 && paymentMethod === 'cash' ? cashFundId || null : null,
      overrideReason: hasOverriddenItems ? overrideReason.trim() : '',
      notes: notes.trim() || '',
    };
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      if (mode === 'editDraft') {
await invoicesAPI.updateDraftInvoice(initialDraft._id || initialDraft.id, buildPayload());        onSuccess?.();
      } else {
        await onSubmit?.(buildPayload());
      }
    } catch (err) {
      showToast(err?.error?.message || err?.message || 'فشل الحفظ', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!onSubmitDraft) return;
    if (!pharmacy || !warehouse || items.length === 0) {
      showToast('أكمل البيانات الأساسية أولاً', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = buildPayload();
      delete payload.paymentType;
      delete payload.dueDate;
      delete payload.totalInstallments;
      delete payload.paidAmount;
      delete payload.paymentMethod;
      delete payload.cashFundId;
      await onSubmitDraft(payload);
    } catch (err) {
      showToast(err?.error?.message || err?.message || 'فشل حفظ المسودة', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()} className="space-y-4">
      {/* 1. البيانات الأساسية */}
      <Section title="البيانات الأساسية" icon={ShoppingCart}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select
            label="الصيدلية" required value={pharmacy}
            onChange={(e) => setPharmacy(e.target.value)}
            options={customers.map((c) => ({ value: c.id || c._id, label: `${c.name}${c.phone ? ` (${c.phone})` : ''}` }))}
            disabled={mode === 'editDraft' || customersLoading}
            placeholder={customersLoading ? 'جاري التحميل...' : '— اختر —'}
          />
          <Select
            label="المندوب" required value={salesRep}
            onChange={(e) => setSalesRep(e.target.value)}
            options={salesReps.map((r) => ({ value: r.id || r._id, label: r.name || r.email }))}
            disabled={user?.role === 'sales_rep' || loadingSalesReps}
            placeholder={loadingSalesReps ? 'جاري التحميل...' : '— اختر —'}
          />
          <Select
            label="المخزن" required value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
            options={warehouses.map((w) => ({ value: w.id || w._id, label: `${w.name}${w.isDefault ? ' (افتراضي)' : ''}` }))}
            disabled={warehousesLoading}
            placeholder={warehousesLoading ? 'جاري التحميل...' : '— اختر —'}
          />
          <Input
            label="تاريخ الفاتورة" type="date" value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
        </div>
        {mode === 'editDraft' && (
          <div className="mt-3 bg-info-50 border border-info-200 rounded-md p-2 text-xs text-info-800 flex items-start gap-2">
            <FileEdit size={14} className="flex-shrink-0 mt-0.5" />
            <span>أنت في وضع <strong>تعديل المسودة</strong> — يمكنك تغيير البنود والمبالغ بحرية.</span>
          </div>
        )}
      </Section>

      {/* 2. البنود */}
      <Section title="البنود" icon={Package} description={`${items.length} بند`}>
        <div className="relative mb-3" ref={searchInputRef}>
          <Input
            placeholder="ابحث عن صنف... (اكتب 2 حرف على الأقل)"
            icon={Search} value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            onFocus={() => setShowItemResults(true)}
            disabled={!warehouse}
          />
          {!warehouse && (
            <p className="mt-1 text-xs text-warning-700 flex items-center gap-1">
              <AlertCircle size={12} /> اختر المخزن أولاً للبحث في الأصناف
            </p>
          )}
          {searchingItems && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-md shadow-lg p-3 text-center text-sm text-neutral-500 z-20">
              <Loader2 size={16} className="inline animate-spin mr-2" /> جاري التحميل...
            </div>
          )}
          {showItemResults && !searchingItems && itemResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-md shadow-lg max-h-64 overflow-y-auto z-20">
              {itemResults.map((item) => (
                <button key={item.id || item._id} type="button" onClick={() => handlePickItem(item)} className="w-full text-right px-4 py-2 hover:bg-primary-50 border-b border-neutral-100 last:border-b-0">
                  <p className="font-medium text-neutral-900">{item.tradeName || item.name}</p>
                  <p className="text-xs text-neutral-500">{item.scientificName || ''}{item.category ? ` · ${item.category}` : ''}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <InvoiceItemsTable items={items} onChange={setItems} emptyMessage="اختر صنفاً من القائمة أعلاه لإضافته." />

        {hasOverriddenItems && (
          <div className="mt-3 bg-warning-50 border-2 border-warning-300 rounded-md p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Shield size={18} className="text-warning-700 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-warning-900">
                <p className="font-bold">⚠️ بعض البنود بأسعار أقل من الحد الموصى به</p>
                {!canOverridePrice && <p className="text-xs mt-1">لا تملك صلاحية التجاوز.</p>}
              </div>
            </div>
            {canOverridePrice ? (
              <div>
                <label className="block text-xs font-medium text-warning-900 mb-1">سبب التجاوز العام *</label>
                <textarea
                  value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-warning-300 text-sm focus:outline-none focus:ring-2 focus:ring-warning-200 bg-white"
                  rows={2} placeholder="مثال: عميل دائم — خصم خاص، عرض ترويجي، ..." maxLength={500}
                />
              </div>
            ) : (
              <div className="bg-danger-50 border border-danger-200 rounded p-2 text-xs text-danger-800 flex items-start gap-2">
                <Lock size={14} className="flex-shrink-0 mt-0.5" />
                <span>لا تملك صلاحية حفظ فاتورة بأسعار أقل من الحد.</span>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* 3. الخصم — ✅ v10.8 */}
      <Section title="الخصم / البونص" icon={Tag} description="اختياري">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select
            label="نوع الخصم"
            value={discountType}
            onChange={(e) => {
              setDiscountType(e.target.value);
              if (!e.target.value) { setDiscountValue(0); setDiscountReason(''); }
            }}
            options={[
              { value: '', label: 'بدون خصم' },
              { value: 'percentage', label: 'نسبة مئوية (%)' },
              { value: 'fixed', label: 'مبلغ ثابت (SDG)' },
            ]}
          />
          {discountType && (
            <>
              <Input
                label={discountType === 'percentage' ? 'النسبة (%)' : 'المبلغ (SDG)'}
                type="number" min="0" max={discountType === 'percentage' ? 100 : subtotal}
                step="0.01" value={discountValue}
                onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
              />
              <Input
                label="سبب الخصم"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                placeholder="مثال: عميل دائم، عرض ترويجي..."
              />
            </>
          )}
        </div>
        {discountAmount > 0 && (
          <div className="mt-3 bg-danger-50 border border-danger-200 rounded-md p-2 text-sm flex justify-between">
            <span className="text-danger-800">قيمة الخصم:</span>
            <span className="font-bold numeric text-danger-800">-{discountAmount.toFixed(2)} SDG</span>
          </div>
        )}
      </Section>

      {/* 4. الدفع */}
      <Section title="الدفع" icon={CreditCard}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select
            label="نوع الدفع" required value={paymentType}
            onChange={(e) => handlePaymentTypeChange(e.target.value)}
            options={[
              { value: 'cash', label: 'نقدي' },
              { value: 'credit', label: 'آجل' },
              { value: 'installments', label: 'أقساط' },
            ]}
          />
          {(paymentType === 'credit' || paymentType === 'installments') && (
            <Input
              label="تاريخ الاستحقاق" type="date" required value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          )}
          {paymentType === 'installments' && (
            <Input
              label="عدد الأقساط" type="number" min="2" required value={totalInstallments}
              onChange={(e) => setTotalInstallments(Number(e.target.value))}
            />
          )}
          <Input
            label={paymentType === 'cash' ? 'المبلغ المدفوع (كامل)' : 'دفعة مقدمة'}
            type="number" step="any" min="0"
            value={effectivePaidAmount}
            onChange={(e) => setPaidAmount(Number(e.target.value))}
            placeholder="0.00" disabled={paymentType === 'cash'}
          />
        </div>

        <div className="mt-3 bg-neutral-50 border border-neutral-200 rounded-md p-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-neutral-600">المجموع الفرعي:</span>
            <span className="numeric">{subtotal.toFixed(2)} SDG</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm text-danger-700">
              <span>الخصم:</span>
              <span className="numeric">-{discountAmount.toFixed(2)} SDG</span>
            </div>
          )}
          <div className="flex justify-between items-center border-t pt-2">
            <span className="text-sm font-medium text-neutral-700">إجمالي الفاتورة:</span>
            <span className="text-lg font-bold text-primary-800">{total.toFixed(2)} SDG</span>
          </div>
        </div>

        {effectivePaidAmount > 0 && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <Select
              label="طريقة الدفع" required value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              options={[
                { value: 'cash', label: 'نقدي (صندوق)' },
                { value: 'bank', label: 'تحويل بنكي' },
              ]}
            />
          </div>
        )}

        {effectivePaidAmount > 0 && paymentMethod === 'cash' && (
          <div className="mt-3">
            <CashSelector
              method="cash" value={cashFundId} onChange={setCashFundId}
              required showBalance label="الصندوق المستلم (إلزامي)"
            />
          </div>
        )}

        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="ملاحظات إضافية (اختياري)" maxLength={500}
          />
        </div>
      </Section>

      {/* 5. الأزرار */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>إلغاء</Button>
        {mode === 'new' && onSubmitDraft && (
          <Button type="button" variant="ghost" onClick={handleSaveDraft} disabled={isSubmitting || items.length === 0}>
            حفظ كمسودة
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'جارٍ الحفظ...' : mode === 'editDraft' ? 'حفظ التعديلات' : 'إنشاء الفاتورة'}
        </Button>
      </div>

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
};

export default InvoiceForm;