/**
 * CheckForm.jsx
 *
 * نموذج إنشاء شيك (وارد أو صادر).
 * - وارد: يتطلب عميلاً + فاتورة (اختياري)
 * - صادر: يتطلب مورداً
 */

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Modal from '../UI/Modal.jsx';
import Button from '../UI/Button.jsx';
import Input from '../UI/Input.jsx';
import { useCustomersContext } from '../../context/CustomersContext.jsx';
import { useSuppliersContext } from '../../context/SuppliersContext.jsx';

const schema = z
  .object({
    type: z.enum(['incoming', 'outgoing']),
    checkNumber: z.string().trim().min(1, 'رقم الشيك مطلوب').max(50),
    bankName: z.string().trim().min(2, 'اسم البنك مطلوب').max(100),
    amount: z.coerce.number().positive('المبلغ يجب أن يكون أكبر من صفر'),
    dueDate: z.string().min(1, 'تاريخ الاستحقاق مطلوب'),
    issueDate: z.string().optional(),
    customerId: z.string().optional().nullable(),
    supplierId: z.string().optional().nullable(),
    invoiceId: z.string().optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .refine((d) => d.type !== 'incoming' || !!d.customerId, {
    message: 'الشيك الوارد يحتاج عميلاً',
    path: ['customerId'],
  })
  .refine((d) => d.type !== 'outgoing' || !!d.supplierId, {
    message: 'الشيك الصادر يحتاج مورداً',
    path: ['supplierId'],
  });

const CheckForm = ({ isOpen, onClose, onSubmit }) => {
  const { customers } = useCustomersContext();
  const { suppliers } = useSuppliersContext();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'incoming',
      checkNumber: '',
      bankName: '',
      amount: 0,
      dueDate: '',
      issueDate: new Date().toISOString().slice(0, 10),
      customerId: '',
      supplierId: '',
      invoiceId: '',
      notes: '',
    },
  });

  const type = watch('type');

  useEffect(() => {
    if (isOpen) {
      reset({
        type: 'incoming',
        checkNumber: '',
        bankName: '',
        amount: 0,
        dueDate: '',
        issueDate: new Date().toISOString().slice(0, 10),
        customerId: '',
        supplierId: '',
        invoiceId: '',
        notes: '',
      });
    }
  }, [isOpen, reset]);

  const handleFormSubmit = async (data) => {
    try {
      const payload = { ...data };
      // إزالة الحقول غير المرتبطة
      if (payload.type === 'incoming') delete payload.supplierId;
      if (payload.type === 'outgoing') {
        delete payload.customerId;
        delete payload.invoiceId;
      }
      // تحويل التواريخ
      if (!payload.issueDate) payload.issueDate = new Date().toISOString();
      payload.dueDate = new Date(payload.dueDate).toISOString();
      if (payload.issueDate) payload.issueDate = new Date(payload.issueDate).toISOString();
      // إزالة الحقول الفارغة
      Object.keys(payload).forEach((k) => {
        if (payload[k] === '' || payload[k] === null) delete payload[k];
      });
      await onSubmit(payload);
      onClose();
    } catch (err) {
      // Toast
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="شيك جديد" size="md">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        {/* النوع */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            نوع الشيك <span className="text-red-500">*</span>
          </label>
          <select
            {...register('type')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="incoming">وارد (من عميل)</option>
            <option value="outgoing">صادر (إلى مورد)</option>
          </select>
        </div>

        {/* رقم الشيك + البنك */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              رقم الشيك <span className="text-red-500">*</span>
            </label>
            <Input {...register('checkNumber')} placeholder="CHK-001" error={errors.checkNumber?.message} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              اسم البنك <span className="text-red-500">*</span>
            </label>
            <Input {...register('bankName')} placeholder="بنك الخرطوم" error={errors.bankName?.message} />
          </div>
        </div>

        {/* العميل أو المورد */}
        {type === 'incoming' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              العميل (الصيدلية) <span className="text-red-500">*</span>
            </label>
            <select
              {...register('customerId')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- اختر عميلاً --</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
            {errors.customerId && <p className="text-red-500 text-xs mt-1">{errors.customerId.message}</p>}
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              المورد <span className="text-red-500">*</span>
            </label>
            <select
              {...register('supplierId')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- اختر مورداً --</option>
              {suppliers.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
            {errors.supplierId && <p className="text-red-500 text-xs mt-1">{errors.supplierId.message}</p>}
          </div>
        )}

        {/* المبلغ */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            المبلغ (SDG) <span className="text-red-500">*</span>
          </label>
          <Input type="number" step="0.01" {...register('amount')} placeholder="0.00" error={errors.amount?.message} />
        </div>

        {/* التواريخ */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ الإصدار</label>
            <Input type="date" {...register('issueDate')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              تاريخ الاستحقاق <span className="text-red-500">*</span>
            </label>
            <Input type="date" {...register('dueDate')} error={errors.dueDate?.message} />
          </div>
        </div>

        {/* ملاحظات */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
          <textarea
            {...register('notes')}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>إلغاء</Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'جارٍ الحفظ...' : 'إنشاء الشيك'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default CheckForm;