/**
 * @file CustomerReturnForm.jsx
 * @description
 * نموذج إنشاء مرتجع عميل (Pending — بانتظار الموافقة).
 *
 * لماذا هذا الملف؟
 * - المرتجع يعتمد على الفاتورة الأصلية (لا مرتجع بدون فاتورة).
 * - يُعرض للمستخدم فترة السماح (من Customer.returnGracePeriod — افتراضي 7 أيام).
 * - المستخدم يختار البنود (كاملة/جزئية) + سبب لكل بند.
 * - لا يمس المخزون أو المال — يبقى "pending" حتى موافقة المحاسب.
 * - `invoiceDate`, `gracePeriodDays`, `isWithinGracePeriod` تُحسب في Backend.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Undo2,
  AlertCircle,
  Loader2,
  CheckCircle2,
  FileText,
  DollarSign,
  Package,
} from 'lucide-react';

import * as customersAPI from '../../api/customersAPI.js';
import * as invoicesAPI from '../../api/invoicesAPI.js';
import * as customerReturnsAPI from '../../api/customerReturnsAPI.js';

import { useToast } from '../../hooks/useToast.js';

import Button from '../UI/Button.jsx';
import Input from '../UI/Input.jsx';

import { formatCurrency, formatDate } from '../../utils/formatters.js';
import { RETURN_REASON_LABELS_AR } from '../../utils/constants.js';

// ═══════════════════════════════════════════════
// 1. المكونات الفرعية
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

function Select({ label, value, onChange, options, required, error, disabled, placeholder = '— اختر —' }) {
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
        className={`w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 transition-colors ${
          error
            ? 'border-danger-500 focus:ring-danger-200'
            : 'border-neutral-300 focus:ring-primary-200 focus:border-primary-500'
        } ${disabled ? 'bg-neutral-100 cursor-not-allowed' : ''}`}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════
// 2. المكون الرئيسي
// ═══════════════════════════════════════════════

function CustomerReturnForm({ onSuccess, onCancel }) {
  const toast = useToast();

  // ─── الخيارات ───
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);

  // ─── اختيار الصيدلية والفاتورة ───
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerInvoices, setCustomerInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // ─── البنود ───
  // كل بند: { invoiceItemIndex, item, itemName, batch, originalQuantity, quantity, unitPrice, total, reason, note, selected }
  const [returnItems, setReturnItems] = useState([]);

  // ─── طريقة التسوية والملاحظات ───
  const [settlementType, setSettlementType] = useState('balance_deduction');
  const [notes, setNotes] = useState('');
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));

  // ─── الحالة ───
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ═══════════════════════════════════════════════
  // 3. تحميل الصيدليات
  // ═══════════════════════════════════════════════
  useEffect(() => {
    const loadCustomers = async () => {
      setLoadingCustomers(true);
      try {
        const result = await customersAPI.listCustomers({ limit: 100, isActive: true });
        setCustomers(result.items || []);
      } catch (err) {
        toast.error('فشل تحميل الصيدليات.');
      } finally {
        setLoadingCustomers(false);
      }
    };
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ═══════════════════════════════════════════════
  // 4. تحميل فواتير الصيدلية
  // ═══════════════════════════════════════════════
  useEffect(() => {
    if (!selectedCustomerId) {
      setCustomerInvoices([]);
      setSelectedInvoiceId('');
      setSelectedInvoice(null);
      setReturnItems([]);
      return;
    }

    const loadInvoices = async () => {
      setLoadingInvoices(true);
      try {
        // نطلب فواتير غير ملغاة للصيدلية المختارة
        const result = await invoicesAPI.listInvoices({
          pharmacy: selectedCustomerId,
          limit: 100,
          sortBy: 'invoiceDate',
          sortOrder: 'desc',
        });
        const active = (result.items || []).filter((inv) => inv.status !== 'cancelled');
        setCustomerInvoices(active);
      } catch (err) {
        toast.error('فشل تحميل فواتير الصيدلية.');
        setCustomerInvoices([]);
      } finally {
        setLoadingInvoices(false);
      }
    };
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomerId]);

  // ═══════════════════════════════════════════════
  // 5. عند اختيار الفاتورة → نُهيّئ البنود
  // ═══════════════════════════════════════════════
  useEffect(() => {
    if (!selectedInvoiceId) {
      setSelectedInvoice(null);
      setReturnItems([]);
      return;
    }

    const loadInvoiceDetails = async () => {
      try {
        const inv = await invoicesAPI.getInvoice(selectedInvoiceId);
        setSelectedInvoice(inv);

        // نُهيّئ البنود (كل بند غير محدد مبدئياً)
        const items = (inv.items || []).map((it, idx) => ({
          invoiceItemIndex: idx,
          item: it.item,
          itemName: it.item?.tradeName || '—',
          batch: it.batch,
          originalQuantity: it.quantity,
          quantity: 0,
          unit: it.unit || '',
          unitPrice: it.unitPrice,
          total: 0,
          reason: 'damaged',
          note: '',
          selected: false,
        }));
        setReturnItems(items);
      } catch (err) {
        toast.error('فشل تحميل تفاصيل الفاتورة.');
        setSelectedInvoice(null);
        setReturnItems([]);
      }
    };
    loadInvoiceDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvoiceId]);

  // ═══════════════════════════════════════════════
  // 6. حساب فترة السماح
  // ═══════════════════════════════════════════════
  const customer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  );

  const gracePeriodInfo = useMemo(() => {
    if (!selectedInvoice || !customer) return null;
    const invoiceDate = new Date(selectedInvoice.invoiceDate);
    const returnDateObj = new Date(returnDate);
    const graceDays = customer.returnGracePeriod ?? 7;
    const diffMs = returnDateObj.getTime() - invoiceDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const isWithin = diffDays <= graceDays;
    const remainingDays = graceDays - diffDays;
    return {
      invoiceDate,
      graceDays,
      diffDays,
      isWithin,
      remainingDays,
    };
  }, [selectedInvoice, customer, returnDate]);

  // ═══════════════════════════════════════════════
  // 7. إدارة البنود
  // ═══════════════════════════════════════════════

  const handleToggleItem = (idx) => {
    setReturnItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const newSelected = !it.selected;
        return {
          ...it,
          selected: newSelected,
          quantity: newSelected ? it.originalQuantity : 0,
          total: newSelected ? Math.round(it.originalQuantity * it.unitPrice * 100) / 100 : 0,
        };
      })
    );
  };

  const handleQuantityChange = (idx, value) => {
    setReturnItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const qty = Math.max(0, Math.min(parseFloat(value) || 0, it.originalQuantity));
        return {
          ...it,
          quantity: qty,
          total: Math.round(qty * it.unitPrice * 100) / 100,
        };
      })
    );
  };

  const handleReasonChange = (idx, value) => {
    setReturnItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, reason: value } : it))
    );
  };

  // ─── الإجماليات ───
  const selectedItems = returnItems.filter((it) => it.selected && it.quantity > 0);
  const totalReturn = selectedItems.reduce((sum, it) => sum + it.total, 0);

  // ═══════════════════════════════════════════════
  // 8. التحقق والحفظ
  // ═══════════════════════════════════════════════
  const validate = () => {
    const errors = [];

    if (!selectedCustomerId) errors.push('الصيدلية مطلوبة');
    if (!selectedInvoiceId) errors.push('الفاتورة الأصلية مطلوبة');
    if (selectedItems.length === 0) errors.push('يجب اختيار بند واحد على الأقل بكمية > 0');
    if (!settlementType) errors.push('طريقة التسوية مطلوبة');

    for (const it of selectedItems) {
      if (it.quantity > it.originalQuantity) {
        errors.push(`الكمية المُرجعة للبند "${it.itemName}" تتجاوز الكمية الأصلية`);
        break;
      }
      if (!it.reason) {
        errors.push(`سبب الإرجاع مطلوب للبند "${it.itemName}"`);
        break;
      }
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
      originalInvoice: selectedInvoiceId,
      pharmacy: selectedCustomerId,
      items: selectedItems.map((it) => ({
        item: it.item?._id || it.item?.id || it.item,
        batch: it.batch,
        quantity: it.quantity,
        unit: it.unit || '',
        unitPrice: it.unitPrice,
        total: it.total,
        reason: it.reason,
        note: it.note || '',
      })),
      total: totalReturn,
      returnDate: new Date(returnDate).toISOString(),
      settlementType,
      notes: notes || undefined,
    };

    try {
      await customerReturnsAPI.createCustomerReturn(payload);
      toast.success('تم إنشاء المرتجع بنجاح. بانتظار الموافقة.');
      onSuccess?.();
    } catch (err) {
      toast.error(err?.error?.message || err?.message || 'فشل إنشاء المرتجع.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ═══════════════════════════════════════════════
  // 9. العرض
  // ═══════════════════════════════════════════════
  if (loadingCustomers) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary-700" />
        <span className="mr-3 text-neutral-600">جاري تحميل الصيدليات...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* ═══ 1. البيانات الأساسية ═══ */}
      <Section title="البيانات الأساسية" icon={FileText}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select
            label="الصيدلية"
            required
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.phone})` }))}
          />

          <Select
            label="الفاتورة الأصلية"
            required
            value={selectedInvoiceId}
            onChange={(e) => setSelectedInvoiceId(e.target.value)}
            disabled={!selectedCustomerId || loadingInvoices}
            options={customerInvoices.map((inv) => ({
              value: inv.id,
              label: `${inv.invoiceNumber} — ${formatDate(inv.invoiceDate)} — ${formatCurrency(inv.total)}`,
            }))}
            placeholder={
              loadingInvoices
                ? 'جاري التحميل...'
                : !selectedCustomerId
                ? 'اختر الصيدلية أولاً'
                : customerInvoices.length === 0
                ? 'لا توجد فواتير نشطة'
                : '— اختر الفاتورة —'
            }
          />

          <Input
            label="تاريخ المرتجع"
            type="date"
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
            required
          />
        </div>
      </Section>

      {/* ═══ 2. معاينة فترة السماح ═══ */}
      {gracePeriodInfo && (
        <div
          className={`rounded-lg p-4 border ${
            gracePeriodInfo.isWithin
              ? 'bg-success-50 border-success-200'
              : 'bg-danger-50 border-danger-200'
          }`}
        >
          <div className="flex items-start gap-3">
            {gracePeriodInfo.isWithin ? (
              <CheckCircle2 size={22} className="text-success-700 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={22} className="text-danger-700 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p
                className={`font-bold mb-1 ${
                  gracePeriodInfo.isWithin ? 'text-success-900' : 'text-danger-900'
                }`}
              >
                {gracePeriodInfo.isWithin
                  ? 'داخل فترة السماح ✓'
                  : 'خارج فترة السماح ⚠️'}
              </p>
              <div
                className={`text-sm space-y-0.5 ${
                  gracePeriodInfo.isWithin ? 'text-success-800' : 'text-danger-800'
                }`}
              >
                <p>
                  تاريخ الفاتورة: <strong>{formatDate(gracePeriodInfo.invoiceDate)}</strong>
                </p>
                <p>
                  فترة السماح: <strong>{gracePeriodInfo.graceDays} أيام</strong> (عدد الأيام المنقضية:{' '}
                  <strong>{gracePeriodInfo.diffDays}</strong>)
                </p>
                {gracePeriodInfo.isWithin ? (
                  <p>يتبقى <strong>{gracePeriodInfo.remainingDays}</strong> يوم قبل انتهاء المهلة.</p>
                ) : (
                  <p>
                    انتهت المهلة بـ <strong>{Math.abs(gracePeriodInfo.remainingDays)}</strong> يوم
                    — قد يُرفض المرتجع من الإدارة.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 3. البنود ═══ */}
      {selectedInvoice && returnItems.length > 0 && (
        <Section
          title="البنود المُرجعة"
          icon={Package}
          description={`${selectedItems.length} بند محدد من ${returnItems.length}`}
        >
          <div className="border border-neutral-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="px-3 py-2 w-10" />
                    <th className="px-3 py-2 text-right font-bold">الصنف</th>
                    <th className="px-3 py-2 text-center font-bold w-24">الدفعة</th>
                    <th className="px-3 py-2 text-center font-bold w-24">الكمية الأصلية</th>
                    <th className="px-3 py-2 text-center font-bold w-28">الكمية المُرجعة</th>
                    <th className="px-3 py-2 text-center font-bold w-32">السبب</th>
                    <th className="px-3 py-2 text-left font-bold w-24">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {returnItems.map((it, idx) => (
                    <tr
                      key={`${it.invoiceItemIndex}-${it.batch}`}
                      className={it.selected ? 'bg-primary-50/30' : ''}
                    >
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={it.selected}
                          onChange={() => handleToggleItem(idx)}
                          className="w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-neutral-900">{it.itemName}</p>
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-xs">{it.batch}</td>
                      <td className="px-3 py-2 text-center numeric font-medium">
                        {it.originalQuantity}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={it.quantity || ''}
                          onChange={(e) => handleQuantityChange(idx, e.target.value)}
                          disabled={!it.selected}
                          min="0"
                          max={it.originalQuantity}
                          step="0.01"
                          className="w-full px-2 py-1 text-center rounded border border-neutral-300 text-sm numeric focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:bg-neutral-100"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={it.reason}
                          onChange={(e) => handleReasonChange(idx, e.target.value)}
                          disabled={!it.selected}
                          className="w-full px-1.5 py-1 rounded border border-neutral-300 text-xs focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:bg-neutral-100"
                        >
                          {Object.entries(RETURN_REASON_LABELS_AR).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-left numeric font-medium">
                        {formatCurrency(it.total, false)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}

      {/* ═══ 4. طريقة التسوية + الملاحظات ═══ */}
      {selectedInvoice && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Section title="طريقة التسوية" icon={DollarSign}>
            <div className="space-y-2">
              <label
                className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  settlementType === 'balance_deduction'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <input
                  type="radio"
                  name="settlement"
                  value="balance_deduction"
                  checked={settlementType === 'balance_deduction'}
                  onChange={(e) => setSettlementType(e.target.value)}
                  className="mt-1"
                />
                <div>
                  <p className="font-bold text-neutral-900">خصم من رصيد الصيدلية</p>
                  <p className="text-xs text-neutral-600 mt-1">
                    سيُخصم المبلغ من رصيد الصيدلية الحالي (موصى به).
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  settlementType === 'cash_refund'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <input
                  type="radio"
                  name="settlement"
                  value="cash_refund"
                  checked={settlementType === 'cash_refund'}
                  onChange={(e) => setSettlementType(e.target.value)}
                  className="mt-1"
                />
                <div>
                  <p className="font-bold text-neutral-900">استرداد نقدي</p>
                  <p className="text-xs text-neutral-600 mt-1">
                    سيُسترد المبلغ نقداً من الصندوق (عند الموافقة).
                  </p>
                </div>
              </label>
            </div>

            <div className="mt-3 bg-info-50 border border-info-200 rounded p-2 text-xs text-info-800">
              <AlertCircle size={14} className="inline mr-1" />
              المبلغ المُسوَّى النهائي يُحدَّد عند الموافقة (قد يكون أقل من الإجمالي).
            </div>
          </Section>

          <Section title="ملاحظات" icon={FileText}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-200 text-sm"
              rows={6}
              placeholder="ملاحظات إدارية (اختياري)..."
              maxLength={1000}
            />
          </Section>
        </div>
      )}

      {/* ═══ 5. الإجمالي والأزرار ═══ */}
      {selectedInvoice && (
        <div className="bg-white border border-neutral-200 rounded-lg p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm text-neutral-600">
            البنود المحددة: <strong className="text-neutral-900">{selectedItems.length}</strong>
            {' '}&middot;{' '}
            الإجمالي: <strong className="text-primary-800 text-lg numeric ml-1">
              {formatCurrency(totalReturn)}
            </strong>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
              إلغاء
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting} icon={Undo2}>
              حفظ المرتجع
            </Button>
          </div>
        </div>
      )}

      {/* ═══ حالة فارغة (لم تُختَر الفاتورة بعد) ═══ */}
      {!selectedInvoice && (
        <div className="bg-neutral-50 border-2 border-dashed border-neutral-300 rounded-lg p-12 text-center">
          <FileText size={48} className="mx-auto text-neutral-400 mb-3" />
          <p className="text-neutral-700 font-bold">اختر الصيدلية والفاتورة الأصلية</p>
          <p className="text-sm text-neutral-500 mt-1">
            لعرض البنود القابلة للإرجاع والبدء في إنشاء المرتجع.
          </p>
        </div>
      )}
    </form>
  );
}

export default CustomerReturnForm;