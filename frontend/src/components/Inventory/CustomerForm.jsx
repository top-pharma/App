/**
 * @file CustomerForm.jsx
 * @description نموذج إنشاء/تعديل صيدلية.
 *
 * لماذا ملف منفصل؟
 * - النموذج يحتوي على dropdown assignedSalesRep يحتاج جلب بيانات.
 * - يفصل المنطق عن CustomersPage لتبسيط كل ملف.
 */

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building, Mail, Phone, ShoppingBag, User } from 'lucide-react';

import Button from '../UI/Button.jsx';
import Input from '../UI/Input.jsx';
import Modal from '../UI/Modal.jsx';
import { listSalesReps } from '../../api/usersAPI.js';

// ═══════════════════════════════════════════════
// 1. مخطط التحقق
// ═══════════════════════════════════════════════
const customerFormSchema = z.object({
  name: z.string().trim().min(2, 'الاسم قصير جداً.').max(150, 'الاسم طويل جداً.'),
  ownerName: z.string().trim().max(150).optional().or(z.literal('')),
  phone: z
    .string()
    .trim()
    .min(7, 'رقم الهاتف قصير جداً.')
    .max(30, 'رقم الهاتف طويل جداً.')
    .regex(/^[+\d][\d\s-]{5,29}$/, 'صيغة رقم الهاتف غير صحيحة.'),
  phone2: z
    .string()
    .trim()
    .max(30, 'رقم الهاتف طويل جداً.')
    .regex(/^[+\d][\d\s-]{5,29}$/, 'صيغة رقم الهاتف غير صحيحة.')
    .optional()
    .or(z.literal('')),
  email: z
    .string()
    .trim()
    .max(150, 'البريد طويل جداً.')
    .email('صيغة البريد غير صحيحة.')
    .optional()
    .or(z.literal('')),
  address: z.string().trim().max(250).optional().or(z.literal('')),
  city: z.string().trim().max(50).optional().or(z.literal('')),
  taxNumber: z.string().trim().max(50).optional().or(z.literal('')),
  commercialRegister: z.string().trim().max(50).optional().or(z.literal('')),
  creditLimit: z.coerce.number().min(0, 'لا يمكن أن يكون سالباً.').default(0),
  paymentTerms: z.coerce.number().int().min(0).max(365, 'الحد الأقصى 365 يوماً.').default(30),
  returnGracePeriod: z.coerce.number().int().min(0).max(90, 'الحد الأقصى 90 يوماً.').default(7),
  assignedSalesRep: z.string().trim().min(1, 'يجب اختيار مندوب.'),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

const EMPTY_FORM = {
  name: '',
  ownerName: '',
  phone: '',
  phone2: '',
  email: '',
  address: '',
  city: '',
  taxNumber: '',
  commercialRegister: '',
  creditLimit: 0,
  paymentTerms: 30,
  returnGracePeriod: 7,
  assignedSalesRep: '',
  notes: '',
};

// ═══════════════════════════════════════════════
// 2. المكون
// ═══════════════════════════════════════════════
/**
 * نموذج صيدلية.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onClose
 * @param {Object|null} props.customer
 * @param {Function} props.onSubmit - callback({values, isEdit}) → {success}
 * @returns {JSX.Element}
 */
function CustomerForm({ isOpen, onClose, customer, onSubmit }) {
  const [salesReps, setSalesReps] = useState([]);
  const [loadingReps, setLoadingReps] = useState(false);

  const isEdit = Boolean(customer);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: zodResolver(customerFormSchema),
    defaultValues: EMPTY_FORM,
  });

  // ✅ تحميل المندوبين عند فتح النموذج.
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoadingReps(true);

    listSalesReps()
      .then((reps) => {
        if (isMounted) setSalesReps(reps);
      })
      .catch((err) => {
        console.error('فشل تحميل المندوبين:', err);
        if (isMounted) setSalesReps([]);
      })
      .finally(() => {
        if (isMounted) setLoadingReps(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // ✅ تحديث النموذج عند تغيير customer.
  useEffect(() => {
    if (!isOpen) return;

    if (customer) {
      reset({
        name: customer.name || '',
        ownerName: customer.ownerName || '',
        phone: customer.phone || '',
        phone2: customer.phone2 || '',
        email: customer.email || '',
        address: customer.address || '',
        city: customer.city || '',
        taxNumber: customer.taxNumber || '',
        commercialRegister: customer.commercialRegister || '',
        creditLimit: customer.creditLimit || 0,
        paymentTerms: customer.paymentTerms ?? 30,
        returnGracePeriod: customer.returnGracePeriod ?? 7,
        assignedSalesRep:
          typeof customer.assignedSalesRep === 'object'
            ? customer.assignedSalesRep?._id || ''
            : customer.assignedSalesRep || '',
        notes: customer.notes || '',
      });
    } else {
      reset(EMPTY_FORM);
    }
  }, [isOpen, customer, reset]);

  const handleFormSubmit = async (values) => {
    const payload = {
      ...values,
      ownerName: values.ownerName || '',
      phone2: values.phone2 || '',
      email: values.email || '',
      address: values.address || '',
      city: values.city || '',
      taxNumber: values.taxNumber || '',
      commercialRegister: values.commercialRegister || '',
      notes: values.notes || '',
    };

    const result = await onSubmit({ values: payload, isEdit });
    if (result.success) {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'تعديل صيدلية' : 'صيدلية جديدة'}
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
            {isEdit ? 'حفظ التعديلات' : 'إنشاء'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <Input
          label="اسم الصيدلية"
          placeholder="مثال: صيدلية النور"
          required
          icon={ShoppingBag}
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="اسم المالك / المسؤول"
          placeholder="مثال: د. أحمد محمد"
          icon={User}
          error={errors.ownerName?.message}
          {...register('ownerName')}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="رقم الهاتف"
            placeholder="مثال: 0912345678"
            required
            icon={Phone}
            error={errors.phone?.message}
            {...register('phone')}
          />
          <Input
            label="هاتف بديل"
            placeholder="اختياري"
            error={errors.phone2?.message}
            {...register('phone2')}
          />
        </div>

        <Input
          label="البريد الإلكتروني"
          type="email"
          placeholder="مثال: info@pharmacy.com"
          icon={Mail}
          error={errors.email?.message}
          {...register('email')}
        />

        <div>
          <label className="block mb-1.5 text-sm font-medium text-neutral-700">
            المندوب المسؤول <span className="text-danger-600">*</span>
          </label>
          <select
            className={`w-full px-3 py-2 rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 text-sm ${
              errors.assignedSalesRep
                ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-200'
                : 'border-neutral-300 focus:border-primary-500 focus:ring-primary-200'
            }`}
            disabled={loadingReps}
            {...register('assignedSalesRep')}
          >
            <option value="">
              {loadingReps ? 'جاري التحميل...' : '— اختر مندوباً —'}
            </option>
            {salesReps.map((rep) => (
              <option key={rep.id} value={rep.id}>
                {rep.name} {rep.phone ? `(${rep.phone})` : ''}
              </option>
            ))}
          </select>
          {errors.assignedSalesRep && (
            <p className="mt-1.5 text-sm text-danger-600">
              {errors.assignedSalesRep.message}
            </p>
          )}
          {!loadingReps && salesReps.length === 0 && (
            <p className="mt-1.5 text-xs text-warning-600">
              لا يوجد مندوبون نشطون. أضف مندوباً أولاً من إدارة المستخدمين.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="المدينة"
            placeholder="مثال: الخرطوم"
            error={errors.city?.message}
            {...register('city')}
          />
          <Input
            label="العنوان"
            placeholder="العنوان التفصيلي..."
            icon={Building}
            error={errors.address?.message}
            {...register('address')}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="الرقم الضريبي (اختياري)"
            placeholder="اختياري"
            error={errors.taxNumber?.message}
            {...register('taxNumber')}
          />
          <Input
            label="رقم التسجيل التجاري"
            placeholder="اختياري"
            error={errors.commercialRegister?.message}
            {...register('commercialRegister')}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="حد الائتمان (SDG)"
            type="number"
            min="0"
            step="0.01"
            error={errors.creditLimit?.message}
            {...register('creditLimit')}
          />
          <Input
            label="شروط الدفع (يوم)"
            type="number"
            min="0"
            max="365"
            error={errors.paymentTerms?.message}
            {...register('paymentTerms')}
          />
          <Input
            label="فترة سماح المرتجع (يوم)"
            type="number"
            min="0"
            max="90"
            error={errors.returnGracePeriod?.message}
            {...register('returnGracePeriod')}
          />
        </div>

        <div>
          <label className="block mb-1.5 text-sm font-medium text-neutral-700">
            ملاحظات (اختياري)
          </label>
          <textarea
            rows={2}
            placeholder="ملاحظات إدارية..."
            className={`w-full px-3 py-2 rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 text-sm ${
              errors.notes
                ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-200'
                : 'border-neutral-300 focus:border-primary-500 focus:ring-primary-200'
            }`}
            {...register('notes')}
          />
          {errors.notes && (
            <p className="mt-1.5 text-sm text-danger-600">{errors.notes.message}</p>
          )}
        </div>
      </form>
    </Modal>
  );
}

export default CustomerForm;