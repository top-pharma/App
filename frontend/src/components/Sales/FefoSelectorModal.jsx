/**
 * @file FefoSelectorModal.jsx
 * @description
 * نافذة اختيار دفعة بـ FEFO — Phase 2.5 (مع تقييد السعر).
 *
 * ⚠️ إضافة Phase 2.5:
 * - ✅ يعرض `priceLimits` لكل دفعة (min/max).
 * - ✅ يُنبّه إذا السعر < الحد الموصى به.
 * - ✅ يطلب `overrideReason` إلزامياً عند التجاوز.
 * - ✅ يمنع المستخدم بلا صلاحية من التجاوز.
 * - ✅ Cache + حساب FEFO محلي (كما كان).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Package, AlertCircle, CheckCircle2, Sparkles, Loader2,
  Shield, Lock,
} from 'lucide-react';

import * as stocksAPI from '../../api/stocksAPI.js';
import { useToast } from '../../hooks/useToast.js';
import { useAuth } from '../../hooks/useAuth.js';

import Button from '../UI/Button.jsx';
import Input from '../UI/Input.jsx';
import Modal from '../UI/Modal.jsx';
import { formatCurrency, formatDate } from '../../utils/formatters.js';

// ═══════════════════════════════════════════════
// 1. Cache على مستوى الموديول
// ═══════════════════════════════════════════════
const batchesCache = new Map();

// ═══════════════════════════════════════════════
// 2. مكونات مساعدة
// ═══════════════════════════════════════════════

function DaysUntil({ date }) {
  if (!date) return <span className="text-neutral-400">—</span>;
  const days = Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24));
  if (days < 0) return <span className="text-danger-700 font-bold">منتهية</span>;
  if (days <= 30) return <span className="text-danger-700 font-bold">{days} يوم</span>;
  if (days <= 90) return <span className="text-warning-700 font-bold">{days} يوم</span>;
  return <span className="text-neutral-600">{days} يوم</span>;
}

/**
 * بطاقة الحد الأدنى للسعر.
 */
function PriceLimitsBadge({ limits }) {
  if (!limits) return null;

  const hasCost = limits.cost > 0;
  const isNearExpiry = limits.isNearExpiry;

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="bg-primary-50 border border-primary-200 rounded-md p-2 text-xs">
        <p className="text-primary-700 font-medium mb-0.5">
          <Shield size={11} className="inline mr-1" />
          الحد الأدنى المسموح
        </p>
        <p className="text-primary-900 font-bold numeric text-base">
          {formatCurrency(limits.recommendedMin)}
        </p>
        <p className="text-primary-600 text-xs mt-0.5">
          قائمة {formatCurrency(limits.listPrice, false)} × (1 - {limits.maxDiscountPercent}%)
        </p>
      </div>
      {hasCost && (
        <div className="bg-neutral-50 border border-neutral-200 rounded-md p-2 text-xs">
          <p className="text-neutral-600 font-medium mb-0.5">
            <Lock size={11} className="inline mr-1" />
            لا بيع تحت التكلفة
          </p>
          <p className="text-neutral-900 font-bold numeric text-base">
            {formatCurrency(limits.absoluteMin)}
          </p>
          <p className="text-neutral-500 text-xs mt-0.5">
            تكلفة {formatCurrency(limits.cost, false)} + {limits.minMarginPercent}%
          </p>
        </div>
      )}
      {isNearExpiry && (
        <div className="col-span-2 bg-warning-50 border border-warning-200 rounded-md p-2 text-xs">
          <p className="text-warning-800 font-medium">
            <AlertCircle size={12} className="inline mr-1" />
            دفعة قاربة الانتهاء ({limits.daysUntilExpiry} يوم) — يُسمح بخصم حتى {limits.maxDiscountPercent}%
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// 3. المكون الرئيسي
// ═══════════════════════════════════════════════

function FefoSelectorModal({ isOpen, onClose, onSelect, item, warehouseId, initialQuantity = 1 }) {
  const toast = useToast();
  const { isAdmin, isAccountant } = useAuth();

  // ✅ فحص صلاحية تجاوز السعر
  const canOverridePrice = isAdmin || isAccountant;

  // ─── الحالة ───
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [batches, setBatches] = useState([]);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [itemData, setItemData] = useState(null);

  // ─── اختيار المستخدم ───
  const [mode, setMode] = useState('fefo');
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [quantity, setQuantity] = useState(String(initialQuantity || 1));
  const [unitPrice, setUnitPrice] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  const itemId = item?._id || item?.id;

  // ═══════════════════════════════════════════════
  // 4. جلب البيانات
  // ═══════════════════════════════════════════════
  useEffect(() => {
    if (!isOpen || !itemId || !warehouseId) return undefined;

    const cacheKey = `${itemId}:${warehouseId}`;

    // من Cache
    if (batchesCache.has(cacheKey)) {
      const cached = batchesCache.get(cacheKey);
      setBatches(cached.batches);
      setTotalAvailable(cached.totalAvailable);
      setItemData(cached.item);
      setLoading(false);
      setError(null);
      setMode('fefo');
      setSelectedBatch(null);
      setQuantity(String(initialQuantity || 1));
      setOverrideReason('');
      if (cached.batches[0]) {
        setUnitPrice(String(cached.batches[0].effectiveUnitPrice ?? cached.batches[0].unitPrice ?? 0));
      }
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const result = await stocksAPI.getBatchesWithFefo({
          itemId, warehouseId, quantity: 0,
        });

        if (cancelled) return;

        setBatches(result.batches || []);
        setTotalAvailable(result.totalAvailable || 0);
        setItemData(result.item);
        setMode('fefo');
        setSelectedBatch(null);
        setQuantity(String(initialQuantity || 1));
        setOverrideReason('');
        if (result.batches?.[0]) {
          setUnitPrice(String(result.batches[0].effectiveUnitPrice ?? result.batches[0].unitPrice ?? 0));
        }

        batchesCache.set(cacheKey, {
          batches: result.batches || [],
          totalAvailable: result.totalAvailable || 0,
          item: result.item,
        });
      } catch (err) {
        if (cancelled) return;
        setError(err?.error?.message || err?.message || 'فشل تحميل الدفعات.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, itemId, warehouseId]);

  // ═══════════════════════════════════════════════
  // 5. حساب FEFO محلياً
  // ═══════════════════════════════════════════════
  const fefoPreview = useMemo(() => {
    const qty = parseFloat(quantity) || 0;
    if (qty <= 0 || batches.length === 0) return [];

    const sorted = [...batches].sort(
      (a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime()
    );

    const result = [];
    let remaining = qty;
    for (const b of sorted) {
      if (remaining <= 0) break;
      const take = Math.min(b.quantity, remaining);
      result.push({ ...b, take });
      remaining -= take;
    }
    return result;
  }, [batches, quantity]);

  // ═══════════════════════════════════════════════
  // 6. الحسابات + فحص السعر
  // ═══════════════════════════════════════════════
  const quantityNum = parseFloat(quantity) || 0;
  const unitPriceNum = parseFloat(unitPrice) || 0;
  const lineTotal = Math.round(quantityNum * unitPriceNum * 100) / 100;
  const isInsufficient = quantityNum > totalAvailable;

  // ✅ فحص السعر مقابل الحدود
  const priceCheck = useMemo(() => {
    if (batches.length === 0 || unitPriceNum <= 0) {
      return { status: 'OK', limits: null };
    }

    // نستخدم priceLimits من أول دفعة FEFO (أو الدفعة المختارة يدوياً)
    const refBatch = mode === 'manual' && selectedBatch
      ? batches.find((b) => b.batch === selectedBatch || b.id === selectedBatch)
      : fefoPreview[0] || batches[0];

    if (!refBatch?.priceLimits) {
      return { status: 'OK', limits: null };
    }

    const limits = refBatch.priceLimits;
    const price = unitPriceNum;

    if (price < limits.absoluteMin - 0.01) {
      return { status: 'BLOCKED', limits, reason: 'under_cost' };
    }
    if (price < limits.recommendedMin - 0.01) {
      return {
        status: canOverridePrice ? 'WARN_OVERRIDE' : 'BLOCKED',
        limits,
        reason: canOverridePrice ? 'needs_override' : 'no_permission',
      };
    }
    return { status: 'OK', limits };
  }, [batches, mode, selectedBatch, fefoPreview, unitPriceNum, canOverridePrice]);

  // ═══════════════════════════════════════════════
  // 7. التأكيد
  // ═══════════════════════════════════════════════
  const handleConfirm = () => {
    if (quantityNum <= 0) {
      toast.error('الكمية يجب أن تكون أكبر من صفر.');
      return;
    }
    if (isInsufficient) {
      toast.error(`الكمية المتاحة (${totalAvailable}) أقل من المطلوبة.`);
      return;
    }
    if (mode === 'manual' && !selectedBatch) {
      toast.error('يجب اختيار دفعة محددة.');
      return;
    }
    if (priceCheck.status === 'BLOCKED') {
      if (priceCheck.reason === 'under_cost') {
        toast.error(`السعر (${unitPriceNum}) أقل من التكلفة. لا يمكن الحفظ.`);
      } else if (priceCheck.reason === 'no_permission') {
        toast.error(`السعر (${unitPriceNum}) أقل من الحد المسموح. لا تملك صلاحية التجاوز.`);
      }
      return;
    }
    if (priceCheck.status === 'WARN_OVERRIDE' && overrideReason.trim().length < 5) {
      toast.error('يجب إدخال سبب التجاوز (5 أحرف على الأقل).');
      return;
    }

    if (mode === 'manual') {
      const batchData = batches.find(
        (b) => b.batch === selectedBatch || b.id === selectedBatch
      );
      if (batchData && quantityNum > batchData.quantity) {
        toast.error(`الدفعة المختارة تحتوي على ${batchData.quantity} فقط.`);
        return;
      }
      onSelect({
        batch: batchData.batch,
        expiry: batchData.expiry,
        unitPrice: unitPriceNum,
        quantity: quantityNum,
        overrideReason: priceCheck.status === 'WARN_OVERRIDE' ? overrideReason.trim() : undefined,
      });
    } else {
      onSelect({
        batch: null,
        expiry: null,
        unitPrice: unitPriceNum,
        quantity: quantityNum,
        overrideReason: priceCheck.status === 'WARN_OVERRIDE' ? overrideReason.trim() : undefined,
      });
    }
  };

  // ═══════════════════════════════════════════════
  // 8. العرض
  // ═══════════════════════════════════════════════
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`اختيار دفعة — ${item?.tradeName || item?.name || 'صنف'}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>إلغاء</Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={loading || isInsufficient || batches.length === 0 || priceCheck.status === 'BLOCKED'}
          >
            إضافة البند ({formatCurrency(lineTotal)})
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12 text-neutral-600">
            <Loader2 size={24} className="animate-spin ml-2" />
            <span>جاري تحميل الدفعات...</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex items-start gap-2 bg-danger-50 border border-danger-200 rounded-md p-3 text-sm text-danger-800">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && batches.length === 0 && (
          <div className="text-center py-8">
            <Package size={48} className="mx-auto text-neutral-400 mb-3" />
            <p className="text-neutral-700 font-bold">لا توجد دفعات متاحة</p>
            <p className="text-sm text-neutral-500 mt-1">لا يوجد رصيد متاح في المخزن المحدد.</p>
          </div>
        )}

        {/* Content */}
        {!loading && !error && batches.length > 0 && (
          <>
            {/* ملخص */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-neutral-50 rounded p-3 text-center">
                <p className="text-xs text-neutral-500 mb-1">الرصيد المتاح</p>
                <p className="text-lg font-bold numeric text-neutral-900">{totalAvailable.toFixed(2)}</p>
              </div>
              <div className="bg-neutral-50 rounded p-3 text-center">
                <p className="text-xs text-neutral-500 mb-1">عدد الدفعات</p>
                <p className="text-lg font-bold numeric text-neutral-900">{batches.length}</p>
              </div>
              <div className="bg-neutral-50 rounded p-3 text-center">
                <p className="text-xs text-neutral-500 mb-1">أقرب انتهاء</p>
                <p className="text-sm font-bold text-neutral-900">{formatDate(batches[0].expiry)}</p>
              </div>
            </div>

            {/* اختيار الطريقة */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('fefo')}
                className={`p-3 rounded-lg border-2 text-right transition-colors ${mode === 'fefo' ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={16} className="text-primary-700" />
                  <span className="font-bold text-sm">FEFO تلقائي</span>
                </div>
                <p className="text-xs text-neutral-600">الأقرب انتهاءً أولاً</p>
              </button>
              <button
                type="button"
                onClick={() => setMode('manual')}
                className={`p-3 rounded-lg border-2 text-right transition-colors ${mode === 'manual' ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Package size={16} className="text-primary-700" />
                  <span className="font-bold text-sm">اختيار يدوي</span>
                </div>
                <p className="text-xs text-neutral-600">تحديد دفعة معينة</p>
              </button>
            </div>

            {/* الكمية والسعر */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="الكمية المطلوبة"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="0.01"
                step="0.01"
                required
              />
              <Input
                label="سعر البيع للوحدة"
                type="number"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                min="0"
                step="0.01"
                required
                error={
                  priceCheck.status === 'BLOCKED'
                    ? priceCheck.reason === 'under_cost'
                      ? `أقل من التكلفة (${formatCurrency(priceCheck.limits?.absoluteMin || 0)})`
                      : `أقل من الحد (${formatCurrency(priceCheck.limits?.recommendedMin || 0)})`
                    : undefined
                }
              />
            </div>

            {/* priceLimits */}
            {priceCheck.limits && <PriceLimitsBadge limits={priceCheck.limits} />}

            {/* تحذير التجاوز */}
            {priceCheck.status === 'WARN_OVERRIDE' && (
              <div className="bg-warning-50 border-2 border-warning-300 rounded-md p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle size={18} className="text-warning-700 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-warning-900">
                    <p className="font-bold">⚠️ السعر أقل من الحد الموصى به</p>
                    <p className="text-xs mt-1">
                      هذا يتطلب صلاحية تجاوز. سيُنبَّه الأدمن بعد الحفظ.
                    </p>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-warning-900 mb-1">
                    سبب التجاوز * <span className="text-neutral-600">(5 أحرف على الأقل)</span>
                  </label>
                  <textarea
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-warning-300 text-sm focus:outline-none focus:ring-2 focus:ring-warning-200 bg-white"
                    rows={2}
                    placeholder="مثال: عميل دائم — خصم خاص، عرض ترويجي، ..."
                    maxLength={500}
                    required
                  />
                </div>
              </div>
            )}

            {/* محظور */}
            {priceCheck.status === 'BLOCKED' && (
              <div className="bg-danger-50 border-2 border-danger-300 rounded-md p-3 flex items-start gap-2">
                <Lock size={18} className="text-danger-700 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-danger-900">
                  <p className="font-bold">❌ لا يمكن الحفظ</p>
                  <p className="text-xs mt-1">
                    {priceCheck.reason === 'under_cost'
                      ? 'السعر أقل من التكلفة + الهامش الأدنى. لا يمكن البيع بخسارة.'
                      : 'السعر أقل من الحد المسموح. لا تملك صلاحية التجاوز.'}
                  </p>
                </div>
              </div>
            )}

            {/* عدم الكفاية */}
            {isInsufficient && (
              <div className="flex items-start gap-2 bg-danger-50 border border-danger-200 rounded p-3 text-sm text-danger-800">
                <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                <span>الكمية المطلوبة ({quantityNum.toFixed(2)}) أكبر من الرصيد المتاح ({totalAvailable.toFixed(2)}).</span>
              </div>
            )}

            {/* جدول الدفعات */}
            <div className="border border-neutral-200 rounded-lg overflow-hidden">
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                    <tr>
                      {mode === 'manual' && <th className="px-3 py-2 w-10" />}
                      <th className="px-3 py-2 text-right font-bold">الدفعة</th>
                      <th className="px-3 py-2 text-center font-bold">الصلاحية</th>
                      <th className="px-3 py-2 text-center font-bold">الأيام</th>
                      <th className="px-3 py-2 text-left font-bold">المتاح</th>
                      <th className="px-3 py-2 text-left font-bold">السعر</th>
                      <th className="px-3 py-2 text-left font-bold">الحد الأدنى</th>
                      <th className="px-3 py-2 text-center font-bold">FEFO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {batches.map((batch) => {
                      const isFefoPick = fefoPreview.some((f) => f.id === batch.id || f.batch === batch.batch);
                      const isSelected = selectedBatch === batch.batch || selectedBatch === batch.id;
                      return (
                        <tr
                          key={batch.id}
                          onClick={() => mode === 'manual' && setSelectedBatch(batch.batch)}
                          className={`${mode === 'manual' ? 'cursor-pointer' : ''} ${isSelected ? 'bg-primary-50' : 'hover:bg-neutral-50'}`}
                        >
                          {mode === 'manual' && (
                            <td className="px-3 py-2 text-center">
                              <input
                                type="radio"
                                name="batch-selection"
                                checked={isSelected}
                                onChange={() => setSelectedBatch(batch.batch)}
                                className="cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="px-3 py-2 font-mono text-xs font-bold">{batch.batch}</td>
                          <td className="px-3 py-2 text-center text-xs">{formatDate(batch.expiry)}</td>
                          <td className="px-3 py-2 text-center text-xs"><DaysUntil date={batch.expiry} /></td>
                          <td className="px-3 py-2 text-left numeric font-bold">{batch.quantity.toFixed(2)}</td>
                          <td className="px-3 py-2 text-left numeric">
                            {formatCurrency(batch.effectiveUnitPrice ?? batch.unitPrice ?? 0, false)}
                          </td>
                          <td className="px-3 py-2 text-left numeric text-xs text-primary-700 font-medium">
                            {batch.priceLimits ? formatCurrency(batch.priceLimits.recommendedMin, false) : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {isFefoPick && (
                              <span className="inline-flex items-center gap-1 text-xs text-primary-700 font-bold">
                                <CheckCircle2 size={14} />مقترح
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* شرح FEFO */}
            {mode === 'fefo' && (
              <div className="flex items-start gap-2 bg-primary-50 border border-primary-200 rounded p-3 text-sm text-primary-800">
                <Sparkles size={18} className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold mb-1">سيتم اختيار الدفعات تلقائياً</p>
                  {fefoPreview.length > 0 ? (
                    <p className="text-xs">
                      النظام سيصرف من <strong>{fefoPreview.length}</strong> دفعة (الأقرب انتهاءً أولاً)
                      {fefoPreview.length > 1 && ' — سيتم تقسيم الكمية تلقائياً'}.
                    </p>
                  ) : (
                    <p className="text-xs">أدخل الكمية أولاً لعرض توصية FEFO الدقيقة.</p>
                  )}
                </div>
              </div>
            )}

            {/* تحذير الاختيار اليدوي */}
            {mode === 'manual' && selectedBatch && (
              <div className="flex items-start gap-2 bg-warning-50 border border-warning-200 rounded p-3 text-sm text-warning-800">
                <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                <span>اخترت تجاوز FEFO يدوياً. تأكد أن هذا يتماشى مع سياسة الشركة.</span>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export default FefoSelectorModal;