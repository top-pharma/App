/**
 * @file InvoiceForm.jsx
 * @description
 * نموذج إنشاء / تعديل مسودة فاتورة — Phase 2.5 + Phase 3.
 *
 * الميزات:
 *  - وضعان: 'new' (إنشاء فاتورة مباشرة) و 'editDraft' (تعديل مسودة).
 *  - بحث عن الأصناف + إضافة بنود (InvoiceItemsTable).
 *  - FefoSelectorModal لاختيار الدفعة (FEFO) + price limits.
 *  - تحذير عند تجاوز الحد الموصى به + overrideReason إلزامي.
 *  - قسم دفع كامل: نقدي / آجل / أقساط.
 *  - ✅ Phase 3: CashSelector (اختيار الصندوق/البنك).
 *  - التحقق قبل الإرسال (cashFundId/bankAccountId إلزامي عند الدفع).
 *
 * ملاحظة:
 *  - يستخدم useState مباشرة (بلا react-hook-form) ليتوافق مع النمط الحالي.
 *  - pharmacy لا يمكن تغييره في وضع editDraft.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  ShoppingCart,
  Package,
  CreditCard,
  Search,
  Loader2,
  AlertCircle,
  Shield,
  Lock,
  FileEdit,
} from 'lucide-react';

// ─── المكونات ───
import Section from '../UI/Section.jsx';
import Input from '../UI/Input.jsx';
import Select from '../UI/Select.jsx';
import Button from '../UI/Button.jsx';
import InvoiceItemsTable from './InvoiceItemsTable.jsx';
import FefoSelectorModal from './FefoSelectorModal.jsx';
import CashSelector from '../Finance/CashSelector.jsx';

// ─── Contexts ───
import { useCustomers } from '../../context/CustomersContext.jsx';
import { useWarehouses } from '../../context/WarehousesContext.jsx';
import { useItems } from '../../context/ItemsContext.jsx';import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../../hooks/useToast.js';

/* ═══════════════════════════════════════════════════════════════
 * InvoiceForm
 * ═══════════════════════════════════════════════════════════════
 * @param {Object} props
 * @param {'new'|'editDraft'} [props.mode='new']
 * @param {Object} [props.initialData=null] - بيانات المسودة عند editDraft
 * @param {Function} props.onSubmit - (payload) => Promise
 * @param {Function} props.onSubmitDraft - (payload) => Promise (اختياري — حفظ كمسودة)
 * @param {Function} props.onClose
 */
const InvoiceForm = ({
  mode = 'new',
  initialData = null,
  onSubmit,
  onSubmitDraft,
  onClose,
}) => {
const { customers } = useCustomers();
const { warehouses } = useWarehouses();
const { items: allItems, fetchItems } = useItems();
  const { user, isAdmin, isAccountant } = useAuth();
  const { showToast } = useToast();

  /* ─────────────────────────────────────────────────────────
   * 1) الحقول الأساسية
   * ───────────────────────────────────────────────────────── */
  const [pharmacy, setPharmacy] = useState(initialData?.pharmacy || '');
  const [salesRep, setSalesRep] = useState(
    initialData?.salesRep || user?.role === 'sales_rep' ? user?._id : ''
  );
  const [warehouse, setWarehouse] = useState(
    initialData?.warehouse || ''
  );
  const [invoiceDate, setInvoiceDate] = useState(
    initialData?.invoiceDate
      ? new Date(initialData.invoiceDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );

  /* ─────────────────────────────────────────────────────────
   * 2) البنود
   * ───────────────────────────────────────────────────────── */
  const [items, setItems] = useState(initialData?.items || []);

  /* ─────────────────────────────────────────────────────────
   * 3) قسم الدفع — Phase 2.5
   * ───────────────────────────────────────────────────────── */
  const [paymentType, setPaymentType] = useState(
    initialData?.paymentType || 'cash'
  );
  const [dueDate, setDueDate] = useState(
    initialData?.dueDate
      ? new Date(initialData.dueDate).toISOString().slice(0, 10)
      : ''
  );
  const [totalInstallments, setTotalInstallments] = useState(
    initialData?.totalInstallments || 2
  );
  const [paidAmount, setPaidAmount] = useState(
    initialData?.paidAmount || 0
  );
  const [paymentMethod, setPaymentMethod] = useState(
    initialData?.paymentMethod || 'cash'
  );

  /* ─────────────────────────────────────────────────────────
   * 4) ✅ Phase 3 — اختيار الصندوق/البنك
   * ───────────────────────────────────────────────────────── */
  const [cashFundId, setCashFundId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');

  /* ─────────────────────────────────────────────────────────
   * 5) ملاحظات + override
   * ───────────────────────────────────────────────────────── */
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [overrideReason, setOverrideReason] = useState(
    initialData?.overrideReason || ''
  );

  /* ─────────────────────────────────────────────────────────
   * 6) حالة الإرسال
   * ───────────────────────────────────────────────────────── */
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* ─────────────────────────────────────────────────────────
   * 7) بحث الأصناف
   * ───────────────────────────────────────────────────────── */
  const [itemSearch, setItemSearch] = useState('');
  const [debouncedItemSearch, setDebouncedItemSearch] = useState('');
  const [showItemResults, setShowItemResults] = useState(false);
  const [searchingItems, setSearchingItems] = useState(false);
  const [itemResults, setItemResults] = useState([]);

  /* ─────────────────────────────────────────────────────────
   * 8) FEFO Modal
   * ───────────────────────────────────────────────────────── */
  const [selectedItemForFefo, setSelectedItemForFefo] = useState(null);
  const [isFefoOpen, setIsFefoOpen] = useState(false);

  /* ─────────────────────────────────────────────────────────
   * 9) القيم المحسوبة
   * ───────────────────────────────────────────────────────── */
  const salesReps = useMemo(() => {
    // في الوضع الحقيقي: من SalesRepContext
    // هنا نستخدم المستخدم الحالي فقط (لو مندوب)
    if (user?.role === 'sales_rep') {
      return [{ id: user._id, name: user.fullName || user.email }];
    }
    return [];
  }, [user]);

  const hasOverriddenItems = useMemo(() => {
    return items.some((it) => it.isBelowRecommended === true);
  }, [items]);

  const canOverridePrice = isAdmin || isAccountant;

  const subtotal = useMemo(() => {
    return items.reduce(
      (sum, it) => sum + Number(it.unitPrice || 0) * Number(it.quantity || 0),
      0
    );
  }, [items]);

  const total = useMemo(() => {
    return Math.round((subtotal + Number.EPSILON) * 100) / 100;
  }, [subtotal]);

  /* ─────────────────────────────────────────────────────────
   * 10) Debounce البحث عن الأصناف
   * ───────────────────────────────────────────────────────── */
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedItemSearch(itemSearch.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [itemSearch]);

  /* ─────────────────────────────────────────────────────────
   * 11) تحميل الأصناف عند البحث
   * ───────────────────────────────────────────────────────── */
  useEffect(() => {
    const loadItems = async () => {
      setSearchingItems(true);
      try {
        const result = await fetchItems({
          search: debouncedItemSearch,
          isActive: 'true',
          limit: 50,
        });
        setItemResults(result || []);
      } catch {
        setItemResults([]);
      } finally {
        setSearchingItems(false);
      }
    };
    if (showItemResults) {
      loadItems();
    }
  }, [debouncedItemSearch, showItemResults, fetchItems]);

  /* ─────────────────────────────────────────────────────────
   * 12) إغلاق قائمة البحث عند النقر خارجها
   * ───────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!showItemResults) return undefined;
    const handleClick = () => setShowItemResults(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showItemResults]);

  /* ─────────────────────────────────────────────────────────
   * 13) اختيار صنف → فتح FEFO
   * ───────────────────────────────────────────────────────── */
  const handlePickItem = (item) => {
    setShowItemResults(false);
    setItemSearch('');
    setSelectedItemForFefo(item);
    setIsFefoOpen(true);
  };

  /* ─────────────────────────────────────────────────────────
   * 14) تأكيد FEFO → إضافة بند
   * ───────────────────────────────────────────────────────── */
  const handleFefoSelect = (batchData) => {
    if (!batchData) return;

    const newItem = {
      itemId: batchData.itemId,
      itemName: batchData.itemName,
      batch: batchData.batch,
      expiry: batchData.expiry,
      quantity: batchData.quantity || 1,
      unitPrice: batchData.unitPrice || batchData.effectiveUnitPrice || 0,
      unitCost: batchData.unitCost || 0,
      isBelowRecommended: batchData.isBelowRecommended || false,
      overrideReason: batchData.overrideReason || null,
    };

    setItems((prev) => [...prev, newItem]);
    setIsFefoOpen(false);
    setSelectedItemForFefo(null);
  };

  /* ─────────────────────────────────────────────────────────
   * 15) التحقق قبل الإرسال
   * ───────────────────────────────────────────────────────── */
  const validate = () => {
    if (!pharmacy) {
      showToast('اختر الصيدلية', 'error');
      return false;
    }
    if (!warehouse) {
      showToast('اختر المخزن', 'error');
      return false;
    }
    if (items.length === 0) {
      showToast('أضف بنداً واحداً على الأقل', 'error');
      return false;
    }
    if (hasOverriddenItems && !overrideReason.trim()) {
      showToast('أدخل سبب تجاوز السعر', 'error');
      return false;
    }
    if (paidAmount > 0 && paymentType === 'cash') {
      if (paymentMethod === 'cash' && !cashFundId) {
        showToast('اختر الصندوق', 'error');
        return false;
      }
      if (paymentMethod === 'bank' && !bankAccountId) {
        showToast('اختر الحساب البنكي', 'error');
        return false;
      }
    }
    if ((paymentType === 'credit' || paymentType === 'installments') && !dueDate) {
      showToast('حدد تاريخ الاستحقاق', 'error');
      return false;
    }
    if (paymentType === 'installments' && totalInstallments < 2) {
      showToast('عدد الأقساط يجب أن يكون 2 على الأقل', 'error');
      return false;
    }
    return true;
  };

  /* ─────────────────────────────────────────────────────────
   * 16) بناء الـ payload
   * ───────────────────────────────────────────────────────── */
  const buildPayload = () => {
    return {
      pharmacy,
      salesRep: salesRep || null,
      warehouse,
      invoiceDate,
      items: items.map((it) => ({
        itemId: it.itemId,
        batch: it.batch,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        unitCost: Number(it.unitCost || 0),
      })),
      paymentType,
      dueDate:
        paymentType === 'credit' || paymentType === 'installments'
          ? dueDate
          : null,
      totalInstallments:
        paymentType === 'installments' ? Number(totalInstallments) : null,
      paidAmount: Number(paidAmount) || 0,
      paymentMethod: paidAmount > 0 ? paymentMethod : null,
      // ✅ Phase 3
      cashFundId:
        paidAmount > 0 && paymentMethod === 'cash' ? cashFundId : null,
      bankAccountId:
        paidAmount > 0 && paymentMethod === 'bank' ? bankAccountId : null,
      overrideReason: hasOverriddenItems ? overrideReason.trim() : null,
      notes: notes.trim() || null,
    };
  };

  /* ─────────────────────────────────────────────────────────
   * 17) إرسال
   * ───────────────────────────────────────────────────────── */
  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await onSubmit?.(buildPayload());
    } catch (err) {
      showToast(err.response?.data?.message || 'فشل الحفظ', 'error');
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
      // في المسودة: لا نرسل بيانات الدفع
      delete payload.paymentType;
      delete payload.dueDate;
      delete payload.totalInstallments;
      delete payload.paidAmount;
      delete payload.paymentMethod;
      delete payload.cashFundId;
      delete payload.bankAccountId;

      await onSubmitDraft(payload);
    } catch (err) {
      showToast(err.response?.data?.message || 'فشل حفظ المسودة', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════════
   * Render
   * ═══════════════════════════════════════════════════════════════ */
  return (
    <form
      onSubmit={handleSubmit}
      onClick={(e) => e.stopPropagation()}
      className="space-y-4"
    >
      {/* ═══════════════════════════════════════════════════════
       * البيانات الأساسية
       * ═══════════════════════════════════════════════════════ */}
      <Section title="البيانات الأساسية" icon={ShoppingCart}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select
            label="الصيدلية"
            required
            value={pharmacy}
            onChange={(e) => setPharmacy(e.target.value)}
            options={customers.map((c) => ({
              value: c.id || c._id,
              label: `${c.name}${c.phone ? ` (${c.phone})` : ''}`,
            }))}
            disabled={mode === 'editDraft'}
          />
          <Select
            label="المندوب"
            required
            value={salesRep}
            onChange={(e) => setSalesRep(e.target.value)}
            options={salesReps.map((r) => ({ value: r.id, label: r.name }))}
            disabled={user?.role === 'sales_rep'}
          />
          <Select
            label="المخزن"
            required
            value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
            options={warehouses.map((w) => ({
              value: w.id || w._id,
              label: `${w.name}${w.isDefault ? ' (افتراضي)' : ''}`,
            }))}
          />
          <Input
            label="تاريخ الفاتورة"
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
        </div>

        {mode === 'editDraft' && (
          <div className="mt-3 bg-info-50 border border-info-200 rounded-md p-2 text-xs text-info-800 flex items-start gap-2">
            <FileEdit size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              أنت في وضع <strong>تعديل المسودة</strong> — يمكنك تغيير البنود
              والمبالغ بحرية.
            </span>
          </div>
        )}
      </Section>

      {/* ═══════════════════════════════════════════════════════
       * البنود
       * ═══════════════════════════════════════════════════════ */}
      <Section title="البنود" icon={Package} description={`${items.length} بند`}>
        {/* بحث الأصناف */}
        <div className="relative mb-3">
          <Input
            placeholder="ابحث عن صنف..."
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
                  key={item.id || item._id}
                  type="button"
                  onClick={() => handlePickItem(item)}
                  className="w-full text-right px-4 py-2 hover:bg-primary-50 border-b border-neutral-100 last:border-b-0"
                >
                  <p className="font-medium text-neutral-900">
                    {item.tradeName || item.name}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {item.scientificName || ''}
                    {item.category ? ` · ${item.category}` : ''}
                  </p>
                </button>
              ))}
            </div>
          )}

          {showItemResults &&
            !searchingItems &&
            itemResults.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-md shadow-lg p-3 text-center text-sm text-neutral-500 z-20">
                <AlertCircle
                  size={16}
                  className="inline mr-1 text-warning-600"
                />
                {debouncedItemSearch
                  ? 'لا توجد أصناف مطابقة'
                  : 'لا توجد أصناف نشطة'}
              </div>
            )}
        </div>

        {/* جدول البنود */}
        <InvoiceItemsTable
          items={items}
          onChange={setItems}
          emptyMessage="اختر صنفاً من القائمة أعلاه لإضافته."
        />

        {/* تحذير تجاوز السعر */}
        {hasOverriddenItems && (
          <div className="mt-3 bg-warning-50 border-2 border-warning-300 rounded-md p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Shield
                size={18}
                className="text-warning-700 flex-shrink-0 mt-0.5"
              />
              <div className="text-sm text-warning-900">
                <p className="font-bold">
                  ⚠️ بعض البنود بأسعار أقل من الحد الموصى به
                </p>
                <p className="text-xs mt-1">
                  سيُنبَّه الأدمن بعد حفظ الفاتورة.
                  {!canOverridePrice && ' لا تملك صلاحية التجاوز.'}
                </p>
              </div>
            </div>

            {canOverridePrice ? (
              <div>
                <label className="block text-xs font-medium text-warning-900 mb-1">
                  سبب التجاوز العام *
                </label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-warning-300 text-sm focus:outline-none focus:ring-2 focus:ring-warning-200 bg-white"
                  rows={2}
                  placeholder="مثال: عميل دائم — خصم خاص، عرض ترويجي، ..."
                  maxLength={500}
                />
              </div>
            ) : (
              <div className="bg-danger-50 border border-danger-200 rounded p-2 text-xs text-danger-800 flex items-start gap-2">
                <Lock size={14} className="flex-shrink-0 mt-0.5" />
                <span>
                  لا تملك صلاحية حفظ فاتورة بأسعار أقل من الحد. عدّل الأسعار أو
                  اطلب من المدير/المحاسب.
                </span>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ═══════════════════════════════════════════════════════
       * قسم الدفع — Phase 2.5 + Phase 3
       * ═══════════════════════════════════════════════════════ */}
      <Section title="الدفع" icon={CreditCard}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* نوع الدفع */}
          <Select
            label="نوع الدفع"
            required
            value={paymentType}
            onChange={(e) => setPaymentType(e.target.value)}
            options={[
              { value: 'cash', label: 'نقدي' },
              { value: 'credit', label: 'آجل' },
              { value: 'installments', label: 'أقساط' },
            ]}
          />

          {/* تاريخ الاستحقاق (آجل/أقساط) */}
          {(paymentType === 'credit' || paymentType === 'installments') && (
            <Input
              label="تاريخ الاستحقاق"
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          )}

          {/* عدد الأقساط */}
          {paymentType === 'installments' && (
            <Input
              label="عدد الأقساط"
              type="number"
              min="2"
              required
              value={totalInstallments}
              onChange={(e) => setTotalInstallments(Number(e.target.value))}
            />
          )}

          {/* المبلغ المدفوع */}
          <Input
            label="المبلغ المدفوع (SDG)"
            type="number"
            step="0.01"
            min="0"
            value={paidAmount}
            onChange={(e) => setPaidAmount(Number(e.target.value))}
            placeholder="0.00"
          />
        </div>

        {/* إجمالي الفاتورة */}
        <div className="mt-3 bg-neutral-50 border border-neutral-200 rounded-md p-3 flex justify-between items-center">
          <span className="text-sm font-medium text-neutral-700">
            إجمالي الفاتورة:
          </span>
          <span className="text-lg font-bold text-primary-800">
            {total.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            SDG
          </span>
        </div>

        {/* طريقة الدفع (تظهر فقط إن كان هناك دفع) */}
        {paidAmount > 0 && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <Select
              label="طريقة الدفع"
              required
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              options={[
                { value: 'cash', label: 'نقدي (صندوق)' },
                { value: 'bank', label: 'بنكي' },
                { value: 'check', label: 'شيك' },
              ]}
            />
          </div>
        )}

        {/* ✅ Phase 3 — CashSelector */}
        {paidAmount > 0 &&
          (paymentMethod === 'cash' || paymentMethod === 'bank') && (
            <div className="mt-3">
              <CashSelector
                method={paymentMethod}
                value={
                  paymentMethod === 'cash' ? cashFundId : bankAccountId
                }
                onChange={
                  paymentMethod === 'cash' ? setCashFundId : setBankAccountId
                }
                required
                showBalance
                label={
                  paymentMethod === 'cash'
                    ? 'الصندوق المستلم (إلزامي)'
                    : 'الحساب البنكي المستلم (إلزامي)'
                }
              />
            </div>
          )}

        {/* ملاحظات */}
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ملاحظات
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="ملاحظات إضافية (اختياري)"
            maxLength={500}
          />
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════
       * أزرار الحفظ
       * ═══════════════════════════════════════════════════════ */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={isSubmitting}
        >
          إلغاء
        </Button>

        {/* زر حفظ المسودة — فقط في وضع new إن وُجد onSubmitDraft */}
        {mode === 'new' && onSubmitDraft && (
          <Button
            type="button"
            variant="ghost"
            onClick={handleSaveDraft}
            disabled={isSubmitting || items.length === 0}
          >
            حفظ كمسودة
          </Button>
        )}

        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting
            ? 'جارٍ الحفظ...'
            : mode === 'editDraft'
              ? 'حفظ التعديلات'
              : 'إنشاء الفاتورة'}
        </Button>
      </div>

      {/* ═══════════════════════════════════════════════════════
       * Fefo Modal
       * ═══════════════════════════════════════════════════════ */}
      {selectedItemForFefo && (
        <FefoSelectorModal
          isOpen={isFefoOpen}
          onClose={() => {
            setIsFefoOpen(false);
            setSelectedItemForFefo(null);
          }}
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