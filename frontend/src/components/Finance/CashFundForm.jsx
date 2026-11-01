/**
 * CashFundForm.jsx
 *
 * نموذج إنشاء/تعديل صندوق نقدي.
 * يستخدم React Hook Form + Zod.
 */

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Modal from '../UI/Modal.jsx';
import Button from '../UI/Button.jsx';
import Input from '../UI/Input.jsx';

/**
 * مخطط التحقق (Zod) — مطابق للـ Backend validator.
 */
const schema = z.object({
  name: z.string().trim().min(2, 'الاسم يجب أن يكون حرفين على الأقل').max(100),
  code: z.string().trim().max(20).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  openingBalance: z.coerce.number().min(0, 'الرصيد لا يمكن أن يكون سالباً').default(0),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional().nullable(),
});

const CashFundForm = ({ isOpen, onClose, onSubmit, initialData = null, isEdit = false }) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      code: '',
      description: '',
      openingBalance: 0,
      isDefault: false,
      isActive: true,
      notes: '',
    },
  });

  // تعبئة النموذج عند التعديل
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        reset({
          name: initialData.name || '',
          code: initialData.code || '',
          description: initialData.description || '',
          openingBalance: initialData.openingBalance || 0,
          isDefault: initialData.isDefault || false,
          isActive: initialData.isActive !== false,
          notes: initialData.notes || '',
        });
      } else {
        reset({
          name: '',
          code: '',
          description: '',
          openingBalance: 0,
          isDefault: false,
          isActive: true,
          notes: '',
        });
      }
    }
  }, [isOpen, initialData, reset]);

  const handleFormSubmit = async (data) => {
    try {
      const payload = { ...data };
      // عند التعديل، لا نرسل openingBalance (immutable)
      if (isEdit) {
        delete payload.openingBalance;
      }
      await onSubmit(payload);
      onClose();
    } catch (err) {
      // الخطأ يُعرض عبر Toast في الـ Context
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'تعديل صندوق' : 'صندوق جديد'} size="md">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        {/* الاسم */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            اسم الصندوق <span className="text-red-500">*</span>
          </label>
          <Input {...register('name')} placeholder="مثال: الخزنة الرئيسية" error={errors.name?.message} />
        </div>

        {/* الكود */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            الكود (اختياري — يُولَّد تلقائياً)
          </label>
          <Input {...register('code')} placeholder="CF-0001" error={errors.code?.message} />
        </div>

        {/* الوصف */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">الوصف</label>
          <textarea
            {...register('description')}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="وصف مختصر للصندوق"
          />
          {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
        </div>

        {/* الرصيد الافتتاحي — فقط عند الإنشاء */}
        {!isEdit && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الرصيد الافتتاحي (SDG)</label>
            <Input
              type="number"
              step="0.01"
              {...register('openingBalance')}
              placeholder="0.00"
              error={errors.openingBalance?.message}
            />
            <p className="text-xs text-gray-500 mt-1">
              سيُنشئ قيداً افتتاحياً تلقائياً في القيود المحاسبية.
            </p>
          </div>
        )}

        {/* الملاحظات */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
          <textarea
            {...register('notes')}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="ملاحظات إضافية"
          />
        </div>

        {/* isDefault */}
        <div className="flex items-center gap-2">
          <input type="checkbox" {...register('isDefault')} id="isDefault" className="w-4 h-4" />
          <label htmlFor="isDefault" className="text-sm text-gray-700">
            تعيين كصندوق افتراضي (سيُلغي الافتراضي السابق)
          </label>
        </div>

        {/* isActive */}
        <div className="flex items-center gap-2">
          <input type="checkbox" {...register('isActive')} id="isActive" className="w-4 h-4" />
          <label htmlFor="isActive" className="text-sm text-gray-700">نشط</label>
        </div>

        {/* الأزرار */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            إلغاء
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إنشاء الصندوق'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default CashFundForm;