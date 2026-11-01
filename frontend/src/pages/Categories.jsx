/**
 * @file CategoriesPage.jsx
 * @description
 * صفحة إدارة التصنيفات — قائمة + بحث + إنشاء + تعديل + تعطيل.
 */

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowRight,
  Pencil,
  Plus,
  Search,
  Shield,
  Tag,
  Trash2,
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
import { useCategories } from '../hooks/useCategories.js';
import { useToast } from '../hooks/useToast.js';
import { PAGINATION } from '../utils/constants.js';
import { formatDate, formatNumber } from '../utils/formatters.js';

// ═══════════════════════════════════════════════
// 1. مخطط التحقق
// ═══════════════════════════════════════════════
const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'المعرّف قصير جداً.')
    .max(50, 'المعرّف طويل جداً.')
    .regex(
      /^[a-z][a-z0-9_]*$/,
      'المعرّف يبدأ بحرف ويحتوي أحرفاً صغيرة وأرقاماً و _ فقط.'
    ),
  label: z
    .string()
    .trim()
    .min(2, 'الاسم العربي قصير جداً.')
    .max(100, 'الاسم العربي طويل جداً.'),
  description: z.string().trim().max(300, 'الوصف طويل جداً.').optional().or(z.literal('')),
  icon: z.string().trim().max(50, 'اسم الأيقونة طويل جداً.').optional().or(z.literal('')),
  order: z.coerce.number().int().min(0, 'الترتيب لا يمكن أن يكون سالباً.').default(0),
});

// ═══════════════════════════════════════════════
// 2. المكون
// ═══════════════════════════════════════════════
function CategoriesPage() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const {
    categories,
    pagination,
    loading,
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
  } = useCategories();

  // ✅ فلاتر
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('all');
  const [page, setPage] = useState(PAGINATION.DEFAULT_PAGE);
  const [limit, setLimit] = useState(PAGINATION.DEFAULT_LIMIT);

  // ✅ النموذج
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

  // ✅ الحذف
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ✅ النموذج
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: '', label: '', description: '', icon: '', order: 0 },
  });

  // ═══════════════════════════════════════════════
  // 3. تحميل البيانات
  // ═══════════════════════════════════════════════
  useEffect(() => {
    const params = { page, limit };
    if (search) params.search = search;
    if (filterActive !== 'all') params.isActive = filterActive === 'active';

    fetchCategories(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, search, filterActive]);

  // ═══════════════════════════════════════════════
  // 4. فتح النموذج
  // ═══════════════════════════════════════════════
  const openCreateForm = () => {
    setEditingCategory(null);
    reset({ name: '', label: '', description: '', icon: '', order: 0 });
    setIsFormOpen(true);
  };

  const openEditForm = (category) => {
    setEditingCategory(category);
    reset({
      name: category.name,
      label: category.label,
      description: category.description || '',
      icon: category.icon || '',
      order: category.order || 0,
    });
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingCategory(null);
    reset();
  };

  // ═══════════════════════════════════════════════
  // 5. الإرسال
  // ═══════════════════════════════════════════════
  const onSubmit = async (values) => {
    const result = editingCategory
      ? await updateCategory(editingCategory.id, values)
      : await createCategory(values);

    if (result.success) {
      toast.success(
        editingCategory ? 'تم تعديل التصنيف بنجاح.' : 'تم إنشاء التصنيف بنجاح.'
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
    const result = await deleteCategory(confirmDelete.id);
    setDeleting(false);

    if (result.success) {
      toast.success('تم تعطيل التصنيف.');
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
      key: 'label',
      label: 'الاسم العربي',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-neutral-900">{row.label}</span>
          {row.isSystem && (
            <span
              title="تصنيف نظامي"
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary-50 text-primary-800"
            >
              <Shield size={10} />
              نظامي
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'name',
      label: 'المعرّف',
      render: (row) => (
        <code className="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-700">
          {row.name}
        </code>
      ),
    },
    {
      key: 'description',
      label: 'الوصف',
      render: (row) => (
        <span className="text-sm text-neutral-500 truncate max-w-xs inline-block">
          {row.description || '—'}
        </span>
      ),
    },
    {
      key: 'order',
      label: 'الترتيب',
      align: 'center',
      render: (row) => <span className="numeric">{formatNumber(row.order)}</span>,
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
      key: 'createdAt',
      label: 'تاريخ الإنشاء',
      align: 'center',
      render: (row) => (
        <span className="text-sm text-neutral-500">{formatDate(row.createdAt)}</span>
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
          {isAdmin && !row.isSystem && row.isActive && (
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
            <h1 className="text-2xl font-bold text-neutral-900">التصنيفات</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              إدارة تصنيفات الأصناف (أدوية، مستحضرات، مكمّلات، ...)
            </p>
          </div>
        </div>

        <Button icon={Plus} onClick={openCreateForm}>
          تصنيف جديد
        </Button>
      </div>

      {/* الفلاتر */}
      <Card noPadding>
        <div className="p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
                <Search size={18} />
              </div>
              <input
                type="text"
                placeholder="بحث بالاسم أو الوصف..."
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
            data={categories}
            loading={loading && categories.length === 0}
            emptyMessage="لا توجد تصنيفات مطابقة."
            rowKey="id"
          />

          {categories.length > 0 && (
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
        title={editingCategory ? 'تعديل تصنيف' : 'تصنيف جديد'}
        size="md"
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
              {editingCategory ? 'حفظ التعديلات' : 'إنشاء'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="المعرّف (بالإنجليزية)"
            placeholder="مثال: medicine, cosmetics"
            required
            icon={Tag}
            error={errors.name?.message}
            {...register('name')}
          />

          <Input
            label="الاسم العربي"
            placeholder="مثال: أدوية، مستحضرات تجميل"
            required
            error={errors.label?.message}
            {...register('label')}
          />

          <div>
            <label className="block mb-1.5 text-sm font-medium text-neutral-700">
              الوصف (اختياري)
            </label>
            <textarea
              rows={2}
              placeholder="وصف مختصر للتصنيف..."
              className={`w-full px-3 py-2 rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 text-sm ${
                errors.description
                  ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-200'
                  : 'border-neutral-300 focus:border-primary-500 focus:ring-primary-200'
              }`}
              {...register('description')}
            />
            {errors.description && (
              <p className="mt-1.5 text-sm text-danger-600">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="اسم الأيقونة (اختياري)"
              placeholder="مثال: Pill, Sparkles"
              error={errors.icon?.message}
              {...register('icon')}
            />

            <Input
              label="ترتيب العرض"
              type="number"
              min="0"
              error={errors.order?.message}
              {...register('order')}
            />
          </div>
        </form>
      </Modal>

      {/* تأكيد الحذف */}
      <ConfirmDialog
        isOpen={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        type="danger"
        title="تعطيل التصنيف"
        message={
          confirmDelete
            ? `هل أنت متأكد من تعطيل "${confirmDelete.label}"؟ لن يظهر في القوائم النشطة، ويمكن تفعيله لاحقاً.`
            : ''
        }
        confirmText="تعطيل"
        loading={deleting}
      />
    </div>
  );
}

export default CategoriesPage;