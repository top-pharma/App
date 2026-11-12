/**
 * BankAccountForm.jsx
 *
 * نموذج إنشاء/تعديل حساب بنكي — مبسّط (بدون isActive).
 *
 * ⚠️ إصلاح 2026-11-12:
 * - حذف isActive من schema.
 * - حذف isActive من defaultValues.
 * - حذف isActive من reset.
 * - حذف checkbox "نشط".
 * - handleFormSubmit: بدون isActive.
 */

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Modal from '../UI/Modal.jsx';
import Button from '../UI/Button.jsx';
import Input from '../UI/Input.jsx';

// ✅ schema — بدون isActive
const schema = z.object({
  bankName: z.string().trim().min(2, 'اسم البنك مطلوب').max(100),
  accountNumber: z.string().trim().min(5, 'رقم الحساب يجب أن يكون 5 أرقام على الأقل').max(50),
  accountName: z.string().trim().min(2, 'اسم صاحب الحساب مطلوب').max(100),
  branch: z.string().trim().max(100).optional().nullable(),
  iban: z.string().trim().max(34).optional().nullable(),
  swift: z.string().trim().max(11).optional().nullable(),
  openingBalance: z.coerce.number().min(0).default(0),
  notes: z.string().trim().max(1000).optional().nullable(),
});

const BankAccountForm = ({ isOpen, onClose, onSubmit, initialData = null, isEdit = false }) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      bankName: '',
      accountNumber: '',
      accountName: '',
      branch: '',
      iban: '',
      swift: '',
      openingBalance: 0,
      notes: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        reset({
          bankName: initialData.bankName || '',
          accountNumber: initialData.accountNumber || '',
          accountName: initialData.accountName || initialData.name || '',
          branch: initialData.branchName || initialData.branch || '',
          iban: initialData.iban || '',
          swift: initialData.swift || '',
          openingBalance: initialData.openingBalance || 0,
          notes: initialData.notes || '',
        });
      } else {
        reset({
          bankName: '',
          accountNumber: '',
          accountName: '',
          branch: '',
          iban: '',
          swift: '',
          openingBalance: 0,
          notes: '',
        });
      }
    }
  }, [isOpen, initialData, reset]);

  const handleFormSubmit = async (data) => {
    try {
      const payload = { ...data, currency: 'SDG' };
      if (isEdit) delete payload.openingBalance;
      await onSubmit(payload);
      onClose();
    } catch (err) {
      // Toast
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'تعديل حساب بنكي' : 'حساب بنكي جديد'} size="md">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            اسم البنك <span className="text-red-500">*</span>
          </label>
          <Input {...register('bankName')} placeholder="مثال: بنك الخرطوم" error={errors.bankName?.message} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            رقم الحساب <span className="text-red-500">*</span>
          </label>
          <Input {...register('accountNumber')} placeholder="1234567890" error={errors.accountNumber?.message} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            اسم صاحب الحساب <span className="text-red-500">*</span>
          </label>
          <Input {...register('accountName')} placeholder="TOP PHARMA MEDICAL CO." error={errors.accountName?.message} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الفرع</label>
            <Input {...register('branch')} placeholder="الفرع الرئيسي" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SWIFT</label>
            <Input {...register('swift')} placeholder="BSAHSDKH" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">IBAN (اختياري)</label>
          <Input {...register('iban')} placeholder="SD..." />
        </div>

        {!isEdit && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الرصيد الافتتاحي (SDG)</label>
            <Input type="number" step="0.01" {...register('openingBalance')} placeholder="0.00" />
            <p className="text-xs text-gray-500 mt-1">سيُنشئ قيداً افتتاحياً تلقائياً.</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
          <textarea
            {...register('notes')}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* ✅ حذف checkbox isActive */}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>إلغاء</Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'جارٍ الحفظ...' : isEdit ? 'حفظ' : 'إنشاء'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default BankAccountForm;