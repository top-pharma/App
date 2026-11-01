/**
 * @file SuppliersPage.jsx
 * @description
 * صفحة إدارة الموردين — قائمة + بحث + إنشاء + تعديل + تعطيل.
 */

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowRight,
  Building,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Truck,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import Button from '../components/UI/Button.jsx';
import Card from '../components/UI/Card.jsx';
import ConfirmDialog from '../components/UI/ConfirmDialog.jsx';
import Input from '../components/UI/Input.jsx';
import Modal from '../components/UI/Modal.jsx';
import Pagination from '../components/UI/Pagination.jsx';
import Table from '../components/UI/Table.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useSuppliers } from '../hooks/useSuppliers.js';
import { useToast } from '../hooks/useToast.js';
import { PAGINATION } from '../utils/constants.js';
import { formatCurrency, formatDate } from '../utils/formatters.js';

// ═══════════════════════════════════════════════
// 1. مخطط التحقق
// ═══════════════════════════════════════════════
const supplierFormSchema = z.object({
  name: z.string().trim().min(2, 'الاسم قصير جداً.').max(200, 'الاسم طويل جداً.'),
  contactPerson: z.string().trim().max(150).optional().or(z.literal('')),
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
  address: z.string().trim().max(300).optional().or(z.literal('')),
  city: z.string().trim().max(50).optional().or(z.literal('')),
  country: z.string().trim().max(50).optional().or(z.literal('')),
  taxNumber: z.string().trim().max(50).optional().or(z.literal('')),
  commercialRegister: z.string().trim().max(50).optional().or(z.literal('')),
  bankAccount: z.string().trim().max(50).optional().or(z.literal('')),
  bankName: z.string().trim().max(150).optional().or(z.literal('')),
  paymentTerms: z.coerce.number().int().min(0).max(365, 'الحد الأقصى 365 يوماً.').default(30),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

const EMPTY_FORM = {
  name: '',
  contactPerson: '',
  phone: '',
  phone2: '',
  email: '',
  address: '',
  city: '',
  country: 'السودان',
  taxNumber: '',
  commercialRegister: '',
  bankAccount: '',
  bankName: '',
  paymentTerms: 30,
  notes: '',
};

// ═══════════════════════════════════════════════
// 2. المكون
// ═══════════════════════════════════════════════
function SuppliersPage() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const {
    suppliers,
    pagination,
    loading,
    fetchSuppliers,
    createSupplier,
    updateSupplier,
    deleteSupplier,
  } = useSuppliers();

  // ✅ فلاتر
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('all');
  const [page, setPage] = useState(PAGINATION.DEFAULT_PAGE);
  const [limit, setLimit] = useState(PAGINATION.DEFAULT_LIMIT);

  // ✅ نموذج
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);

  // ✅ حذف
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: EMPTY_FORM,
  });

  // ═══════════════════════════════════════════════
  // 3. تحميل البيانات
  // ═══════════════════════════════════════════════
  useEffect(() => {
    const params = { page, limit };
    if (search) params.search = search;
    if (filterActive !== 'all') params.isActive = filterActive === 'active';

    fetchSuppliers(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, search, filterActive]);

  // ═══════════════════════════════════════════════
  // 4. فتح النموذج
  // ═══════════════════════════════════════════════
  const openCreateForm = () => {
    setEditingSupplier(null);
    reset(EMPTY_FORM);
    setIsFormOpen(true);
  };

  const openEditForm = (supplier) => {
    setEditingSupplier(supplier);
    reset({
      name: supplier.name || '',
      contactPerson: supplier.contactPerson || '',
      phone: supplier.phone || '',
      phone2: supplier.phone2 || '',
      email: supplier.email || '',
      address: supplier.address || '',
      city: supplier.city || '',
      country: supplier.country || 'السودان',
      taxNumber: supplier.taxNumber || '',
      commercialRegister: supplier.commercialRegister || '',
      bankAccount: supplier.bankAccount || '',
      bankName: supplier.bankName || '',
      paymentTerms: supplier.paymentTerms ?? 30,
      notes: supplier.notes || '',
    });
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingSupplier(null);
    reset(EMPTY_FORM);
  };

  // ═══════════════════════════════════════════════
  // 5. الإرسال
  // ═══════════════════════════════════════════════
  const onSubmit = async (values) => {
    const result = editingSupplier
      ? await updateSupplier(editingSupplier.id, values)
      : await createSupplier(values);

    if (result.success) {
      toast.success(
        editingSupplier ? 'تم تعديل المورّد بنجاح.' : 'تم إنشاء المورّد بنجاح.'
      );
      closeForm();
    } else {
      toast.error(result.error);
    }
  };

  // ═══════════════════════════════════════════════
  // 6. الحذف
  // ═══════════════════════════════════════════════
  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const result = await deleteSupplier(confirmDelete.id);
    setDeleting(false);

    if (result.success) {
      toast.success('تم تعطيل المورّد.');
      setConfirmDelete(null);
    } else {
      toast.error(result.error);
    }
  };

  // ═══════════════════════════════════════════════
  // 7. الأعمدة
  // ═══════════════════════════════════════════════
  const columns = [
    {
      key: 'name',
      label: 'اسم المورّد',
      render: (row) => (
        <div>
          <p className="font-medium text-neutral-900">{row.name}</p>
          <p className="text-xs text-neutral-500 numeric">{row.code || '—'}</p>
        </div>
      ),
    },
    {
      key: 'contactPerson',
      label: 'جهة الاتصال',
      render: (row) => (
        <span className="text-sm text-neutral-700">{row.contactPerson || '—'}</span>
      ),
    },
    {
      key: 'phone',
      label: 'الهاتف',
      render: (row) => (
        <div className="flex items-center gap-1.5 text-sm text-neutral-700">
          <Phone size={14} className="text-neutral-400" />
          <span className="numeric" dir="ltr">
            {row.phone}
          </span>
        </div>
      ),
    },
    {
      key: 'city',
      label: 'المدينة',
      render: (row) => <span className="text-sm">{row.city || '—'}</span>,
    },
    {
      key: 'currentBalance',
      label: 'الرصيد',
      align: 'end',
      render: (row) => (
        <span
          className={`text-sm numeric font-medium ${
            row.currentBalance > 0 ? 'text-danger-600' : 'text-neutral-700'
          }`}
        >
          {formatCurrency(row.currentBalance)}
        </span>
      ),
    },
    {
      key: 'paymentTerms',
      label: 'شروط الدفع',
      align: 'center',
      render: (row) => (
        <span className="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-700">
          {row.paymentTerms} يوم
        </span>
      ),
    },
    {
      key: 'isActive',
      label: 'الحالة',
      align: 'center',
      render: (row) => (
        <span
          className={`inline-block text-xs font-medium px-2 py-1 rounded-full ${
            row.isActive
              ? 'bg-success-50 text-success-700'
              : 'bg-neutral-100 text-neutral-500'
          }`}
        >
          {row.isActive ? 'نشط' : 'معطّل'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'إجراءات',
      align: 'center',
      width: '120px',
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={Pencil}
            onClick={() => openEditForm(row)}
            title="تعديل"
          >
            {''}
          </Button>
          {isAdmin && row.isActive && (
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              onClick={() => setConfirmDelete(row)}
              title="تعطيل"
              className="text-danger-600 hover:bg-danger-50"
            >
              {''}
            </Button>
          )}
        </div>
      ),
    },
  ];

  // ═══════════════════════════════════════════════
  // 8. Render
  // ═══════════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* العنوان */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            to="/inventory"
            className="p-2 rounded-md text-neutral-500 hover:bg-neutral-100 transition-colors"
            title="رجوع إلى المخزون"
          >
            <ArrowRight size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">الموردون</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              إدارة بيانات الموردين وبيانات الاتصال
            </p>
          </div>
        </div>

        <Button icon={Plus} onClick={openCreateForm}>
          مورّد جديد
        </Button>
      </div>

      {/* الفلاتر */}
      <Card noPadding>
        <div className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
                <Search size={18} />
              </div>
              <input
                type="text"
                placeholder="بحث بالاسم أو الكود أو الهاتف..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pr-10 pl-3 py-2 rounded-md border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 text-sm"
              />
            </div>
          </div>

          <select
            value={filterActive}
            onChange={(e) => {
              setFilterActive(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="all">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="inactive">معطّل</option>
          </select>
        </div>
      </Card>

      {/* الجدول */}
      <Card noPadding>
        <div className="p-4">
          <Table
            columns={columns}
            data={suppliers}
            loading={loading && suppliers.length === 0}
            emptyMessage="لا يوجد موردون مطابقون."
            rowKey="id"
          />

          {suppliers.length > 0 && (
            <div className="mt-4 pt-4 border-t border-neutral-100">
              <Pagination
                page={pagination.page}
                limit={pagination.limit}
                total={pagination.total}
                onPageChange={setPage}
                onLimitChange={(newLimit) => {
                  setLimit(newLimit);
                  setPage(1);
                }}
              />
            </div>
          )}
        </div>
      </Card>

      {/* نموذج الإنشاء/التعديل */}
      <Modal
        isOpen={isFormOpen}
        onClose={closeForm}
        title={editingSupplier ? 'تعديل مورّد' : 'مورّد جديد'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={closeForm} disabled={isSubmitting}>
              إلغاء
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit(onSubmit)}
              loading={isSubmitting}
            >
              {editingSupplier ? 'حفظ التعديلات' : 'إنشاء'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="اسم المورّد"
            placeholder="مثال: شركة النيل للأدوية"
            required
            icon={Truck}
            error={errors.name?.message}
            {...register('name')}
          />

          <Input
            label="جهة الاتصال (اسم الشخص)"
            placeholder="مثال: أحمد محمد"
            error={errors.contactPerson?.message}
            {...register('contactPerson')}
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
              label="هاتف بديل (اختياري)"
              placeholder="اختياري"
              error={errors.phone2?.message}
              {...register('phone2')}
            />
          </div>

          <Input
            label="البريد الإلكتروني"
            type="email"
            placeholder="مثال: info@example.com"
            icon={Mail}
            error={errors.email?.message}
            {...register('email')}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="المدينة"
              placeholder="مثال: الخرطوم"
              error={errors.city?.message}
              {...register('city')}
            />
            <Input
              label="الدولة"
              placeholder="السودان"
              error={errors.country?.message}
              {...register('country')}
            />
          </div>

          <Input
            label="العنوان"
            placeholder="العنوان التفصيلي..."
            icon={Building}
            error={errors.address?.message}
            {...register('address')}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="الرقم الضريبي (اختياري)"
              placeholder="اختياري"
              error={errors.taxNumber?.message}
              {...register('taxNumber')}
            />
            <Input
              label="رقم التسجيل التجاري (اختياري)"
              placeholder="اختياري"
              error={errors.commercialRegister?.message}
              {...register('commercialRegister')}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="اسم البنك (اختياري)"
              placeholder="مثال: بنك الخرطوم"
              error={errors.bankName?.message}
              {...register('bankName')}
            />
            <Input
              label="رقم الحساب البنكي (اختياري)"
              placeholder="اختياري"
              error={errors.bankAccount?.message}
              {...register('bankAccount')}
            />
          </div>

          <Input
            label="شروط الدفع (بالأيام)"
            type="number"
            min="0"
            max="365"
            error={errors.paymentTerms?.message}
            {...register('paymentTerms')}
          />

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

      {/* تأكيد الحذف */}
      <ConfirmDialog
        isOpen={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        type="danger"
        title="تعطيل المورّد"
        message={
          confirmDelete
            ? `هل أنت متأكد من تعطيل "${confirmDelete.name}"؟ لن يظهر في القوائم النشطة.`
            : ''
        }
        confirmText="تعطيل"
        loading={deleting}
      />
    </div>
  );
}

export default SuppliersPage;