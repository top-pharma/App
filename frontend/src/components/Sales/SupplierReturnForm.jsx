/**
 * @file SupplierReturnForm.jsx
 * @description
 * نموذج إنشاء مرتجع مورد (مسودة draft).
 *
 * لماذا هذا الملف؟
 * - مرتجع المورد يعيد بضاعة سبق استلامها (يجب ربطه بـ PurchaseReceipt).
 * - عند "قبول المرتجع"، يحتاج الـ Backend معرفة المخزن — يُستخرج من الإيصال.
 * - البنود (الدفعة، الصلاحية، التكلفة) تُقرأ من الإيصال لتفادي الأخطاء.
 * - المستخدم يختار بنوداً للارتجاع + سبب لكل بند.
 * - يدعم 3 طرق تسوية: إشعار دائن / استبدال / استرداد نقدي.
 * - يُحفظ كمسودة — التأثير على المخزون يحدث عند "قبول المرتجع".
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  AlertCircle,
  Loader2,
  Package,
  FileText,
  DollarSign,
  X,
  CheckCircle2,
} from 'lucide-react';

import * as suppliersAPI from '../../api/suppliersAPI.js';
import * as purchaseReceiptsAPI from '../../api/purchaseReceiptsAPI.js';
import * as supplierReturnsAPI from '../../api/supplierReturnsAPI.js';

import { useToast } from '../../hooks/useToast.js';

import Button from '../UI/Button.jsx';
import Input from '../UI/Input.jsx';

import { formatCurrency, formatDate } from '../../utils/formatters.js';

// ═══════════════════════════════════════════════
// 1. ثوابت
// ═══════════════════════════════════════════════

/**
 * أسباب إرجاع المورد (مطابقة لـ SUPPLIER_RETURN_REASONS في الـ Model).
 */
const SUPPLIER_RETURN_REASONS = {
  damaged: 'تالف',
  near_expiry: 'قريب الانتهاء',
  wrong_order: 'خطأ في الطلب',
  quality_issue: 'مشكلة جودة',
  other: 'أخرى',
};

const SETTLEMENT_TYPE_LABELS = {
  credit_note: 'إشعار دائن (خصم من رصيد المورد)',
  replacement: 'استبدال ببضاعة',
  cash_refund: 'استرداد نقدي',
};

// ═══════════════════════════════════════════════
// 2. مكونات فرعية
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
// 3. المكون الرئيسي
// ═══════════════════════════════════════════════

function SupplierReturnForm({ onSuccess, onCancel }) {
  const toast = useToast();

  // ─── الخيارات ───
  const [suppliers, setSuppliers] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);

  // ─── اختيار المورد والإيصال ───
  const [supplierId, setSupplierId] = useState('');
  const [supplierReceipts, setSupplierReceipts] = useState([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [receiptId, setReceiptId] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [loadingReceiptDetails, setLoadingReceiptDetails] = useState(false);

  // ─── بيانات المرتجع ───
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([]); // بنود من الإيصال مع { selected, returnQuantity, reason, note }
  const [settlementType, setSettlementType] = useState('credit_note');
  const [notes, setNotes] = useState('');

  // ─── الحالة ───
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ═══════════════════════════════════════════════
  // 4. تحميل الموردين
  // ═══════════════════════════════════════════════
  useEffect(() => {
    const loadSuppliers = async () => {
      setLoadingSuppliers(true);
      try {
        const result = await suppliersAPI.listSuppliers({ limit: 100, isActive: true });
        setSuppliers(result.items || []);
      } catch {
        toast.error('فشل تحميل الموردين.');
      } finally {
        setLoadingSuppliers(false);
      }
    };
    loadSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ═══════════════════════════════════════════════
  // 5. تحميل إيصالات المورد (المستلمة فقط)
  // ═══════════════════════════════════════════════
  useEffect(() => {
    if (!supplierId) {
      setSupplierReceipts([]);
      setReceiptId('');
      setReceipt(null);
      setItems([]);
      return;
    }

    const loadReceipts = async () => {
      setLoadingReceipts(true);
      try {
        const result = await purchaseReceiptsAPI.listPurchaseReceipts({
          supplier: supplierId,
          status: 'received',
          limit: 100,
          sortBy: 'receiptDate',
          sortOrder: 'desc',
        });
        setSupplierReceipts(result.items || []);
      } catch {
        toast.error('فشل تحميل إيصالات المورد.');
        setSupplierReceipts([]);
      } finally {
        setLoadingReceipts(false);
      }
    };
    loadReceipts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  // ═══════════════════════════════════════════════
  // 6. تحميل تفاصيل الإيصال (بنوده)
  // ═══════════════════════════════════════════════
  useEffect(() => {
    if (!receiptId) {
      setReceipt(null);
      setItems([]);
      return;
    }

    const loadDetails = async () => {
      setLoadingReceiptDetails(true);
      try {
        const data = await purchaseReceiptsAPI.getPurchaseReceipt(receiptId);
        setReceipt(data);

        // نُهيّئ البنود (كل بند غير محدد مبدئياً)
        const preparedItems = (data.items || []).map((it) => ({
          item: it.item,
          itemId: it.item?._id || it.item?.id || it.item,
          itemName: it.item?.tradeName || '—',
          scientificName: it.item?.scientificName || '',
          batch: it.batch,
          expiry: it.expiry,
          originalQuantity: it.quantity,
          unit: it.unit || '',
          unitCost: it.unitCost,
          returnQuantity: 0,
          total: 0,
          reason: 'damaged',
          note: '',
          selected: false,
        }));
        setItems(preparedItems);
      } catch {
        toast.error('فشل تحميل تفاصيل الإيصال.');
        setReceipt(null);
        setItems([]);
      } finally {
        setLoadingReceiptDetails(false);
      }
    };
    loadDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptId]);

  // ═══════════════════════════════════════════════
  // 7. إدارة البنود
  // ═══════════════════════════════════════════════

  const handleToggleItem = (idx) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const newSelected = !it.selected;
        const newQty = newSelected ? it.originalQuantity : 0;
        return {
          ...it,
          selected: newSelected,
          returnQuantity: newQty,
          total: Math.round(newQty * it.unitCost * 100) / 100,
        };
      })
    );
  };

  const handleQuantityChange = (idx, value) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const qty = Math.max(0, Math.min(parseFloat(value) || 0, it.originalQuantity));
        return {
          ...it,
          returnQuantity: qty,
          total: Math.round(qty * it.unitCost * 100) / 100,
        };
      })
    );
  };

  const handleReasonChange = (idx, value) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, reason: value } : it))
    );
  };

  // ═══════════════════════════════════════════════
  // 8. الحسابات
  // ═══════════════════════════════════════════════

  const selectedItems = useMemo(
    () => items.filter((it) => it.selected && it.returnQuantity > 0),
    [items]
  );

  const total = useMemo(
    () => selectedItems.reduce((sum, it) => sum + it.total, 0),
    [selectedItems]
  );

  // ═══════════════════════════════════════════════
  // 9. التحقق والحفظ
  // ═══════════════════════════════════════════════

  const validate = () => {
    const errors = [];

    if (!supplierId) errors.push('المورّد مطلوب');
    if (!receiptId) errors.push('إيصال الاستلام مطلوب (يُستخدم لتحديد المخزن لاحقاً)');
    if (selectedItems.length === 0) errors.push('يجب اختيار بند واحد على الأقل بكمية > 0');
    if (!settlementType) errors.push('طريقة التسوية مطلوبة');

    for (const it of selectedItems) {
      if (it.returnQuantity > it.originalQuantity) {
        errors.push(`الكمية المُرجعة للبند "${it.itemName}" تتجاوز الكمية المستلمة`);
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
      supplier: supplierId,
      purchaseReceipt: receiptId,
      items: selectedItems.map((it) => ({
        item: it.itemId,
        batch: it.batch,
        expiry: it.expiry || undefined,
        quantity: it.returnQuantity,
        unit: it.unit || '',
        unitCost: it.unitCost,
        total: it.total,
        reason: it.reason,
        note: it.note || '',
      })),
      total,
      returnDate: new Date(returnDate).toISOString(),
      settlementType,
      notes: notes || undefined,
    };

    try {
      await supplierReturnsAPI.createSupplierReturn(payload);
      toast.success('تم إنشاء مسودة مرتجع المورد.');
      onSuccess?.();
    } catch (err) {
      toast.error(err?.error?.message || err?.message || 'فشل إنشاء المرتجع.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ═══════════════════════════════════════════════
  // 10. العرض
  // ═══════════════════════════════════════════════

  if (loadingSuppliers) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary-700" />
        <span className="mr-3 text-neutral-600">جاري تحميل الموردين...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* ═══ 1. البيانات الأساسية ═══ */}
      <Section title="البيانات الأساسية" icon={ArrowLeftRight}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select
            label="المورّد"
            required
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            options={suppliers.map((s) => ({
              value: s.id,
              label: `${s.name} (${s.code})`,
            }))}
          />

          <Select
            label="إيصال الاستلام"
            required
            value={receiptId}
            onChange={(e) => setReceiptId(e.target.value)}
            disabled={!supplierId || loadingReceipts}
            options={supplierReceipts.map((r) => ({
              value: r.id,
              label: `${r.receiptNumber} — ${formatDate(r.receiptDate)} — ${formatCurrency(r.total)}`,
            }))}
            placeholder={
              loadingReceipts
                ? 'جاري التحميل...'
                : !supplierId
                ? 'اختر المورّد أولاً'
                : supplierReceipts.length === 0
                ? 'لا توجد إيصالات مستلمة لهذا المورّد'
                : '— اختر الإيصال —'
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

        <div className="mt-3 flex items-start gap-2 bg-info-50 border border-info-200 rounded-md p-2 text-xs text-info-800">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            ربط المرتجع بإيصال الاستلام <strong>إلزامي</strong> — يُستخدم لتحديد المخزن الذي ستُخصم منه
            البضاعة عند القبول.
          </span>
        </div>
      </Section>

      {/* ═══ 2. حالة تحميل الإيصال ═══ */}
      {loadingReceiptDetails && (
        <div className="flex items-center justify-center py-8 bg-white border border-neutral-200 rounded-lg">
          <Loader2 size={24} className="animate-spin text-primary-700" />
          <span className="mr-3 text-neutral-600 text-sm">جاري تحميل بنود الإيصال...</span>
        </div>
      )}

      {/* ═══ 3. البنود ═══ */}
      {receipt && items.length > 0 && !loadingReceiptDetails && (
        <Section
          title="البنود المُرجعة"
          icon={Package}
          description={`${selectedItems.length} بند محدد من ${items.length}`}
        >
          <div className="border border-neutral-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="px-2 py-2 w-10" />
                    <th className="px-2 py-2 text-right font-bold min-w-[160px]">الصنف</th>
                    <th className="px-2 py-2 text-center font-bold w-24">الدفعة</th>
                    <th className="px-2 py-2 text-center font-bold w-24">الصلاحية</th>
                    <th className="px-2 py-2 text-center font-bold w-20">المستلمة</th>
                    <th className="px-2 py-2 text-center font-bold w-24">المُرجعة *</th>
                    <th className="px-2 py-2 text-left font-bold w-24">التكلفة</th>
                    <th className="px-2 py-2 text-left font-bold w-24">الإجمالي</th>
                    <th className="px-2 py-2 text-center font-bold w-32">السبب *</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {items.map((it, idx) => (
                    <tr
                      key={`${idx}-${it.batch}`}
                      className={it.selected ? 'bg-primary-50/30' : ''}
                    >
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={it.selected}
                          onChange={() => handleToggleItem(idx)}
                          className="w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <p className="font-medium text-neutral-900 text-sm">{it.itemName}</p>
                        {it.scientificName && (
                          <p className="text-xs text-neutral-500">{it.scientificName}</p>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center font-mono text-xs">{it.batch}</td>
                      <td className="px-2 py-2 text-center text-xs">
                        {it.expiry ? formatDate(it.expiry) : '—'}
                      </td>
                      <td className="px-2 py-2 text-center numeric text-sm">
                        {it.originalQuantity}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          value={it.returnQuantity || ''}
                          onChange={(e) => handleQuantityChange(idx, e.target.value)}
                          disabled={!it.selected}
                          min="0"
                          max={it.originalQuantity}
                          step="0.01"
                          className="w-full px-1.5 py-1 text-center rounded border border-neutral-300 text-xs numeric focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:bg-neutral-100"
                        />
                      </td>
                      <td className="px-2 py-2 text-left numeric text-xs">
                        {formatCurrency(it.unitCost, false)}
                      </td>
                      <td className="px-2 py-2 text-left numeric text-xs font-bold">
                        {formatCurrency(it.total || 0, false)}
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={it.reason}
                          onChange={(e) => handleReasonChange(idx, e.target.value)}
                          disabled={!it.selected}
                          className="w-full px-1.5 py-1 rounded border border-neutral-300 text-xs focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:bg-neutral-100"
                        >
                          {Object.entries(SUPPLIER_RETURN_REASONS).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-3 bg-neutral-50 border border-neutral-200 rounded-md p-3 flex items-center justify-between">
            <div className="text-sm text-neutral-600">
              إجمالي البنود المحددة: <strong className="text-neutral-900">{selectedItems.length}</strong>
            </div>
            <div className="text-lg font-bold numeric text-primary-800">
              {formatCurrency(total)}
            </div>
          </div>
        </Section>
      )}

      {/* ═══ 4. طريقة التسوية + ملاحظات ═══ */}
      {receipt && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Section title="طريقة التسوية" icon={DollarSign}>
            <div className="space-y-2">
              {Object.entries(SETTLEMENT_TYPE_LABELS).map(([key, label]) => (
                <label
                  key={key}
                  className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    settlementType === key
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="settlement"
                    value={key}
                    checked={settlementType === key}
                    onChange={(e) => setSettlementType(e.target.value)}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-bold text-neutral-900 text-sm">{label}</p>
                    <p className="text-xs text-neutral-600 mt-1">
                      {key === 'credit_note' && 'سيُخصم المبلغ من رصيد المورّد.'}
                      {key === 'replacement' && 'سيُطلب رقم مرجعي للبضاعة البديلة عند القبول.'}
                      {key === 'cash_refund' && 'سيُسترد المبلغ نقداً (Phase 3).'}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </Section>

          <Section title="ملاحظات" icon={FileText}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-200 text-sm"
              rows={8}
              placeholder="ملاحظات إدارية (اختياري)..."
              maxLength={1000}
            />
          </Section>
        </div>
      )}

      {/* ═══ 5. حالة فارغة ═══ */}
      {!receipt && !loadingReceiptDetails && (
        <div className="bg-neutral-50 border-2 border-dashed border-neutral-300 rounded-lg p-12 text-center">
          <ArrowLeftRight size={48} className="mx-auto text-neutral-400 mb-3" />
          <p className="text-neutral-700 font-bold">اختر المورّد وإيصال الاستلام</p>
          <p className="text-sm text-neutral-500 mt-1">
            لعرض البنود القابلة للإرجاع والبدء في إنشاء المرتجع.
          </p>
        </div>
      )}

      {/* ═══ 6. تنبيه المسودة ═══ */}
      {receipt && (
        <div className="bg-info-50 border border-info-200 rounded-lg p-3 text-sm text-info-800 flex items-start gap-2">
          <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
          <span>
            سيُحفظ المرتجع كـ<strong> مسودة (draft)</strong>. لا تأثير على المخزون أو الرصيد
            حتى إرساله للمورّد ثم "قبوله".
          </span>
        </div>
      )}

      {/* ═══ 7. الأزرار ═══ */}
      {receipt && (
        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            <X size={16} className="ml-1" />
            إلغاء
          </Button>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            حفظ كمسودة ({formatCurrency(total)})
          </Button>
        </div>
      )}
    </form>
  );
}

export default SupplierReturnForm;