/**
 * @file BatchForm.jsx
 * @description نموذج استلام/تعديل دفعة مخزون.
 *
 * ✅ التحديث (وحدة الاستلام):
 * - dropdown لاختيار وحدة الاستلام (أساسية/تغليف/صغرى).
 * - حقل "الكمية المستلمة" يُدخل بوحدة الاستلام المختارة.
 * - معاينة تلقائية للتحويل: "10 كرتونة × 12 = 120 علبة".
 * - `quantity` في Stock يبقى **بالوحدة الأساسية دائماً** (متطلب FEFO).
 *
 * ⚠️ عند التعديل:
 * - لا يوجد dropdown (الكمية المخزّنة بالوحدة الأساسية دائماً).
 * - الحقل يُعدّل الكمية الموجودة مباشرة (بلا تحويل).
 *
 * 💡 Phase 2 (PurchaseReceipt): ستُضاف receivedUnit/receivedQuantity
 *    للـ DB بشكل دائم. الآن نمرر `quantity` محوّلاً فقط.
 */

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Boxes, Calendar, Package } from 'lucide-react';

import Button from '../UI/Button.jsx';
import Input from '../UI/Input.jsx';
import Modal from '../UI/Modal.jsx';
import { useItems } from '../../hooks/useItems.js';
import { useSuppliers } from '../../hooks/useSuppliers.js';
import { useWarehouses } from '../../hooks/useWarehouses.js';

// ═══════════════════════════════════════════════
// 1. مخطط التحقق
// ═══════════════════════════════════════════════
const batchFormSchema = z.object({
  item: z.string().trim().min(1, 'يجب اختيار صنف.'),
  warehouse: z.string().trim().min(1, 'يجب اختيار مخزن.'),
  batch: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, 'رقم الدفعة مطلوب.')
    .max(50, 'رقم الدفعة طويل جداً.'),
  productionDate: z.string().optional().or(z.literal('')),
  expiry: z.string().min(1, 'تاريخ الانتهاء مطلوب.'),

  // ✅ وحدة الاستلام + الكمية بوحدتها
  receivedUnit: z.enum(['base', 'packaging', 'smallest']).default('base'),
  receivedQuantity: z.coerce
    .number()
    .positive('الكمية يجب أن تكون أكبر من صفر.'),

  location: z.string().trim().max(50).optional().or(z.literal('')),
  unitCost: z.coerce.number().min(0, 'التكلفة لا يمكن أن تكون سالبة.').default(0),
  unitPrice: z.coerce.number().min(0, 'السعر لا يمكن أن يكون سالباً.').default(0),
  supplier: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

const EMPTY_FORM = {
  item: '',
  warehouse: '',
  batch: '',
  productionDate: '',
  expiry: '',
  receivedUnit: 'base',
  receivedQuantity: 0,
  location: '',
  unitCost: 0,
  unitPrice: 0,
  supplier: '',
  notes: '',
};

const toDateInput = (value) => {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  } catch {
    return '';
  }
};

// ═══════════════════════════════════════════════
// 2. المكون
// ═══════════════════════════════════════════════
function BatchForm({ isOpen, onClose, stock, onSubmit }) {
  const { items, fetchItems } = useItems();
  const { warehouses, fetchWarehouses } = useWarehouses();
  const { suppliers, fetchSuppliers } = useSuppliers();

  const isEdit = Boolean(stock);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
    setValue,
  } = useForm({
    resolver: zodResolver(batchFormSchema),
    defaultValues: EMPTY_FORM,
  });

  // ═══════════════════════════════════════════════
  // 3. تحميل القوائم عند فتح النموذج — دائماً
  // ═══════════════════════════════════════════════
  useEffect(() => {
    if (!isOpen) return;
    fetchItems({ limit: 100 });
    fetchWarehouses({ limit: 100 });
    fetchSuppliers({ limit: 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ═══════════════════════════════════════════════
  // 4. القوائم النشطة
  // ═══════════════════════════════════════════════
  const activeItems = useMemo(() => items.filter((i) => i.isActive), [items]);
  const activeWarehouses = useMemo(
    () => warehouses.filter((w) => w.isActive),
    [warehouses]
  );
  const activeSuppliers = useMemo(
    () => suppliers.filter((s) => s.isActive),
    [suppliers]
  );

  // ═══════════════════════════════════════════════
  // 5. تحديث النموذج عند فتح/تغيير stock
  // ═══════════════════════════════════════════════
  useEffect(() => {
    if (!isOpen) return;

    if (stock) {
      const itemId =
        typeof stock.item === 'object' ? stock.item?.id : stock.item;
      const warehouseId =
        typeof stock.warehouse === 'object'
          ? stock.warehouse?.id
          : stock.warehouse;

      reset({
        item: itemId || '',
        warehouse: warehouseId || '',
        batch: stock.batch || '',
        productionDate: toDateInput(stock.productionDate),
        expiry: toDateInput(stock.expiry),
        receivedUnit: 'base', // ← مقفل في التعديل
        receivedQuantity: stock.quantity || 0,
        location: stock.location || '',
        unitCost: stock.unitCost || 0,
        unitPrice: stock.unitPrice || 0,
        supplier: stock.supplier || '',
        notes: stock.notes || '',
      });
    } else {
      reset(EMPTY_FORM);
    }
  }, [isOpen, stock, reset]);

  // ═══════════════════════════════════════════════
  // 6. الصنف المختار + وحدات الاستلام المتاحة
  // ═══════════════════════════════════════════════
  const selectedItemId = watch('item');
  const selectedItem = useMemo(
    () => items.find((it) => it.id === selectedItemId),
    [items, selectedItemId]
  );

  const baseUnitName = selectedItem?.units?.base?.name || '';

  /**
   * خيارات وحدة الاستلام (تُبنى من units الصنف).
   * factor: كم وحدة أساسية في وحدة واحدة من هذه الوحدة.
   */
  const unitOptions = useMemo(() => {
    const opts = [];
    if (!selectedItem?.units?.base?.name) {
      return [{ value: 'base', label: '—', factor: 1, shortLabel: '' }];
    }

    // الوحدة الأساسية (دائماً متاحة).
    opts.push({
      value: 'base',
      label: `${selectedItem.units.base.name} (أساسية)`,
      shortLabel: selectedItem.units.base.name,
      factor: 1,
    });

    // وحدة التغليف (إن وُجدت تحتوي أكثر من 1).
    if (
      selectedItem.units.packaging?.name &&
      selectedItem.units.packaging?.contains > 1
    ) {
      opts.push({
        value: 'packaging',
        label: `${selectedItem.units.packaging.name} = ${selectedItem.units.packaging.contains} ${selectedItem.units.base.name}`,
        shortLabel: selectedItem.units.packaging.name,
        factor: selectedItem.units.packaging.contains,
      });
    }

    // الوحدة الصغرى (إن وُجدت).
    if (
      selectedItem.units.smallest?.name &&
      selectedItem.units.smallest?.contains > 1
    ) {
      opts.push({
        value: 'smallest',
        label: `${selectedItem.units.smallest.name} (1 ${selectedItem.units.base.name} = ${selectedItem.units.smallest.contains})`,
        shortLabel: selectedItem.units.smallest.name,
        factor: 1 / selectedItem.units.smallest.contains,
      });
    }

    return opts;
  }, [selectedItem]);

  // ═══════════════════════════════════════════════
  // 7. تصحيح receivedUnit عند تغيير الصنف
  // ═══════════════════════════════════════════════
  const receivedUnit = watch('receivedUnit') || 'base';
  const receivedQuantity = watch('receivedQuantity') || 0;

  useEffect(() => {
    const valid = unitOptions.some((o) => o.value === receivedUnit);
    if (!valid && isOpen) {
      setValue('receivedUnit', 'base', { shouldDirty: false });
    }
  }, [unitOptions, receivedUnit, setValue, isOpen]);

  // ═══════════════════════════════════════════════
  // 8. حسابات التحويل
  // ═══════════════════════════════════════════════
  const selectedUnitOption = unitOptions.find((o) => o.value === receivedUnit);
  const conversionFactor = selectedUnitOption?.factor ?? 1;
  const selectedUnitShortLabel = selectedUnitOption?.shortLabel || baseUnitName;

  /**
   * الكمية النهائية بالوحدة الأساسية.
   * - في التعديل: receivedQuantity (base مباشرة).
   * - في الإنشاء: receivedQuantity × factor.
   */
  const finalQuantity = useMemo(() => {
    const qty = Number(receivedQuantity) || 0;
    if (isEdit) return qty;
    return qty * conversionFactor;
  }, [receivedQuantity, conversionFactor, isEdit]);

  // ═══════════════════════════════════════════════
  // 9. الإرسال
  // ═══════════════════════════════════════════════
  const handleFormSubmit = async (values) => {
    const qty = Number(values.receivedQuantity) || 0;
    const finalQty = isEdit ? qty : qty * conversionFactor;

    const payload = {
      item: values.item,
      warehouse: values.warehouse,
      batch: values.batch,
      productionDate: values.productionDate || null,
      expiry: values.expiry,
      quantity: finalQty, // ← بالوحدة الأساسية دائماً
      location: values.location || '',
      unitCost: values.unitCost || 0,
      unitPrice: values.unitPrice || 0,
      supplier: values.supplier || undefined,
      notes: values.notes || '',
    };

    const result = await onSubmit({ values: payload, isEdit });
    if (result.success) {
      onClose();
    }
  };

  // ═══════════════════════════════════════════════
  // 10. Render
  // ═══════════════════════════════════════════════
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'تعديل دفعة' : 'استلام دفعة جديدة'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit(handleFormSubmit)}
            loading={isSubmitting}
          >
            {isEdit ? 'حفظ التعديلات' : 'استلام'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        {/* الصنف + المخزن */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block mb-1.5 text-sm font-medium text-neutral-700">
              الصنف <span className="text-danger-600">*</span>
            </label>
            <select
              disabled={isEdit}
              className={`w-full px-3 py-2 rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 text-sm disabled:bg-neutral-100 disabled:cursor-not-allowed ${
                errors.item
                  ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-200'
                  : 'border-neutral-300 focus:border-primary-500 focus:ring-primary-200'
              }`}
              {...register('item')}
            >
              <option value="">— اختر صنفاً —</option>
              {activeItems.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.tradeName} — {it.scientificName}
                </option>
              ))}
            </select>
            {errors.item && (
              <p className="mt-1.5 text-sm text-danger-600">
                {errors.item.message}
              </p>
            )}
          </div>

          <div>
            <label className="block mb-1.5 text-sm font-medium text-neutral-700">
              المخزن <span className="text-danger-600">*</span>
            </label>
            <select
              disabled={isEdit}
              className={`w-full px-3 py-2 rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 text-sm disabled:bg-neutral-100 disabled:cursor-not-allowed ${
                errors.warehouse
                  ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-200'
                  : 'border-neutral-300 focus:border-primary-500 focus:ring-primary-200'
              }`}
              {...register('warehouse')}
            >
              <option value="">— اختر مخزناً —</option>
              {activeWarehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
            {errors.warehouse && (
              <p className="mt-1.5 text-sm text-danger-600">
                {errors.warehouse.message}
              </p>
            )}
          </div>
        </div>

        {/* رقم الدفعة */}
        <Input
          label="رقم الدفعة (Batch)"
          placeholder="مثال: BATCH-2026-001"
          required
          icon={Boxes}
          error={errors.batch?.message}
          disabled={isEdit}
          {...register('batch')}
        />

        {/* التواريخ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="تاريخ الإنتاج (اختياري)"
            type="date"
            icon={Calendar}
            error={errors.productionDate?.message}
            {...register('productionDate')}
          />
          <Input
            label="تاريخ الانتهاء"
            type="date"
            required
            icon={Calendar}
            error={errors.expiry?.message}
            {...register('expiry')}
          />
        </div>

        {/* ═══════════════════════════════════════════ */}
        {/* الكمية + وحدة الاستلام */}
        {/* ═══════════════════════════════════════════ */}
        <div>
          {isEdit ? (
            // ✅ وضع التعديل: كمية مباشرة بالوحدة الأساسية
            <>
              <Input
                label={`الكمية الحالية${baseUnitName ? ` (${baseUnitName})` : ''}`}
                type="number"
                min="0"
                step="0.01"
                required
                icon={Package}
                error={errors.receivedQuantity?.message}
                {...register('receivedQuantity')}
              />
              <p className="mt-1.5 text-xs text-neutral-500">
                💡 الكمية تُعدّل مباشرة بالوحدة الأساسية (بلا تحويل).
              </p>
            </>
          ) : (
            // ✅ وضع الإنشاء: كمية + وحدة اختيارية + معاينة
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <Input
                    label={`الكمية المستلمة${
                      selectedUnitShortLabel
                        ? ` (${selectedUnitShortLabel})`
                        : ''
                    }`}
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    icon={Package}
                    error={errors.receivedQuantity?.message}
                    disabled={!selectedItem}
                    {...register('receivedQuantity')}
                  />
                </div>

                <div>
                  <label className="block mb-1.5 text-sm font-medium text-neutral-700">
                    وحدة الاستلام
                  </label>
                  <select
                    disabled={!selectedItem || unitOptions.length <= 1}
                    className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:bg-neutral-100 disabled:cursor-not-allowed"
                    {...register('receivedUnit')}
                  >
                    {unitOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* معاينة التحويل */}
              {finalQuantity > 0 && conversionFactor !== 1 && (
                <div className="mt-2 p-2.5 rounded-md bg-info-50 border border-info-200 text-xs text-info-900">
                  💡{' '}
                  <strong className="numeric">
                    {receivedQuantity} {selectedUnitShortLabel}
                  </strong>{' '}
                  × <strong className="numeric">{conversionFactor}</strong> ={' '}
                  <strong className="numeric">
                    {finalQuantity} {baseUnitName}
                  </strong>{' '}
                  — سيُخزَّن في المخزون بهذه الكمية.
                </div>
              )}

              {/* تنبيه: الصنف بدون وحدات إضافية */}
              {selectedItem && unitOptions.length === 1 && (
                <p className="mt-1.5 text-xs text-neutral-500">
                  💡 هذا الصنف لا يدعم وحدات تغليف/صغرى. الاستلام بالوحدة الأساسية فقط.
                </p>
              )}
            </>
          )}
        </div>

        {/* الأسعار — دائماً للوحدة الأساسية */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1" />
          <Input
            label={`سعر التكلفة للـ${baseUnitName || 'وحدة الأساسية'}`}
            type="number"
            min="0"
            step="0.01"
            error={errors.unitCost?.message}
            {...register('unitCost')}
          />
          <Input
            label={`سعر البيع للـ${baseUnitName || 'وحدة الأساسية'}`}
            type="number"
            min="0"
            step="0.01"
            error={errors.unitPrice?.message}
            {...register('unitPrice')}
          />
        </div>

        {/* الموقع + المورّد */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="الموقع في المخزن (رف/عمود)"
            placeholder="مثال: A-3-2"
            error={errors.location?.message}
            {...register('location')}
          />

          <div>
            <label className="block mb-1.5 text-sm font-medium text-neutral-700">
              المورّد (اختياري)
            </label>
            <select
              className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
              {...register('supplier')}
            >
              <option value="">— بدون مورّد —</option>
              {activeSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ملاحظات */}
        <div>
          <label className="block mb-1.5 text-sm font-medium text-neutral-700">
            ملاحظات (اختياري)
          </label>
          <textarea
            rows={2}
            placeholder="ملاحظات..."
            className="w-full px-3 py-2 rounded-md border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-200 text-sm"
            {...register('notes')}
          />
        </div>

        {/* ملاحظة الدمج */}
        {!isEdit && (
          <div className="p-3 rounded-md bg-neutral-50 border border-neutral-200 text-xs text-neutral-700">
            💡 إذا كانت الدفعة موجودة بنفس (الصنف + رقم الدفعة + المخزن) —
            سيتم دمج الكمية تلقائياً.
          </div>
        )}
      </form>
    </Modal>
  );
}

export default BatchForm;