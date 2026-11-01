/**
 * @file WarehousesPage.jsx
 * @description
 * صفحة إدارة المخازن — قائمة + بحث + إنشاء + تعديل + تعطيل + تعيين.
 *
 * لماذا هذا الملف؟
 * - متطلب: المخازن تُدار من داخل التطبيق.
 * - نستخدم Table + Pagination + Modal + ConfirmDialog الموحّدة.
 * - النموذج مبني على React Hook Form + Zod.
 * - أزرار "تعيين رئيسي" و "افتراضي" تظهر حسب الحالة.
 * - زر الحذف يظهر للأدمن فقط (مطابقة لصلاحيات Role.js).
 */

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    ArrowRight,
    Building2,
    Crown,
    Pencil,
    Plus,
    Power,
    Search,
    Star,
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
import { useToast } from '../hooks/useToast.js';
import { useWarehouses } from '../hooks/useWarehouses.js';
import { PAGINATION } from '../utils/constants.js';
import { formatDate } from '../utils/formatters.js';

// ═══════════════════════════════════════════════
// 1. مخطط التحقق (Zod)
// ═══════════════════════════════════════════════
const warehouseFormSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, 'اسم المخزن قصير جداً.')
        .max(100, 'اسم المخزن طويل جداً.'),
    code: z
        .string()
        .trim()
        .toUpperCase()
        .min(2, 'الكود قصير جداً.')
        .max(20, 'الكود طويل جداً.')
        .regex(/^[A-Z][A-Z0-9_-]{1,19}$/, 'يبدأ بحرف + أحرف كبيرة/أرقام/_- فقط.'),
    address: z.string().trim().max(250, 'العنوان طويل جداً.').optional().or(z.literal('')),
    city: z.string().trim().max(50, 'المدينة طويلة جداً.').optional().or(z.literal('')),
    phone: z
        .string()
        .trim()
        .max(30, 'رقم الهاتف طويل جداً.')
        .regex(/^[+\d][\d\s-]{5,29}$/, 'صيغة رقم الهاتف غير صحيحة.')
        .optional()
        .or(z.literal('')),
    notes: z.string().trim().max(500, 'الملاحظات طويلة جداً.').optional().or(z.literal('')),
});

// ═══════════════════════════════════════════════
// 2. المكون
// ═══════════════════════════════════════════════
function WarehousesPage() {
    const toast = useToast();
    const { isAdmin } = useAuth();
    const {
        warehouses,
        pagination,
        loading,
        fetchWarehouses,
        createWarehouse,
        updateWarehouse,
        deleteWarehouse,
        setAsMain,
        setAsDefault,
        reactivateWarehouse,
    } = useWarehouses();

    // ✅ فلاتر
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [filterActive, setFilterActive] = useState('all');
    const [page, setPage] = useState(PAGINATION.DEFAULT_PAGE);
    const [limit, setLimit] = useState(PAGINATION.DEFAULT_LIMIT);

    // ✅ نافذة النموذج
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingWarehouse, setEditingWarehouse] = useState(null);

    // ✅ نافذة التأكيد
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    // ✅ نموذج
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
        reset,
    } = useForm({
        resolver: zodResolver(warehouseFormSchema),
        defaultValues: { name: '', code: '', address: '', city: '', phone: '', notes: '' },
    });

    // ═══════════════════════════════════════════════
    // 3. تحميل البيانات
    // ═══════════════════════════════════════════════
    useEffect(() => {
        const params = { page, limit };
        if (search) params.search = search;
        if (filterType !== 'all') params.type = filterType;
        if (filterActive !== 'all') params.isActive = filterActive === 'active';

        fetchWarehouses(params);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, limit, search, filterType, filterActive]);

    // ═══════════════════════════════════════════════
    // 4. فتح النموذج
    // ═══════════════════════════════════════════════
    const openCreateForm = () => {
        setEditingWarehouse(null);
        reset({ name: '', code: '', address: '', city: '', phone: '', notes: '' });
        setIsFormOpen(true);
    };

    const openEditForm = (warehouse) => {
        setEditingWarehouse(warehouse);
        reset({
            name: warehouse.name,
            code: warehouse.code,
            address: warehouse.address || '',
            city: warehouse.city || '',
            phone: warehouse.phone || '',
            notes: warehouse.notes || '',
        });
        setIsFormOpen(true);
    };

    const closeForm = () => {
        setIsFormOpen(false);
        setEditingWarehouse(null);
        reset();
    };

    // ═══════════════════════════════════════════════
    // 5. الإرسال
    // ═══════════════════════════════════════════════
    const onSubmit = async (values) => {
        const result = editingWarehouse
            ? await updateWarehouse(editingWarehouse.id, values)
            : await createWarehouse(values);

        if (result.success) {
            toast.success(
                editingWarehouse ? 'تم تعديل المخزن بنجاح.' : 'تم إنشاء المخزن بنجاح.'
            );
            closeForm();
            // إعادة جلب (لأن isDefault/type قد تتأثر).
            if (result.needsRefresh) {
                const params = { page, limit };
                if (search) params.search = search;
                if (filterType !== 'all') params.type = filterType;
                if (filterActive !== 'all') params.isActive = filterActive === 'active';
                fetchWarehouses(params);
            }
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
        const result = await deleteWarehouse(confirmDelete.id);
        setDeleting(false);

        if (result.success) {
            toast.success('تم تعطيل المخزن.');
            setConfirmDelete(null);
        } else {
            toast.error(result.error);
        }
    };

    // ═══════════════════════════════════════════════
    // 7. تعيين رئيسي / افتراضي
    // ═══════════════════════════════════════════════
    const handleSetMain = async (warehouse) => {
        const result = await setAsMain(warehouse.id);
        if (result.success) {
            toast.success(`تم تعيين "${warehouse.name}" مخزناً رئيسياً.`);
            // إعادة الجلب لتحديث القديم.
            const params = { page, limit };
            if (search) params.search = search;
            if (filterType !== 'all') params.type = filterType;
            if (filterActive !== 'all') params.isActive = filterActive === 'active';
            fetchWarehouses(params);
        } else {
            toast.error(result.error);
        }
    };

    const handleSetDefault = async (warehouse) => {
        const result = await setAsDefault(warehouse.id);
        if (result.success) {
            toast.success(`تم تعيين "${warehouse.name}" مخزناً افتراضياً.`);
            const params = { page, limit };
            if (search) params.search = search;
            if (filterType !== 'all') params.type = filterType;
            if (filterActive !== 'all') params.isActive = filterActive === 'active';
            fetchWarehouses(params);
        } else {
            toast.error(result.error);
        }
    };

    // ═══════════════════════════════════════════════
    // 7.b إعادة تفعيل مخزن معطّل
    // ═══════════════════════════════════════════════
    const handleReactivate = async (warehouse) => {
        const result = await reactivateWarehouse(warehouse.id);
        if (result.success) {
            toast.success(`تم إعادة تفعيل "${warehouse.name}".`);
            const params = { page, limit };
            if (search) params.search = search;
            if (filterType !== 'all') params.type = filterType;
            if (filterActive !== 'all') params.isActive = filterActive === 'active';
            fetchWarehouses(params);
        } else {
            toast.error(result.error);
        }
    };
    // ═══════════════════════════════════════════════
    // 8. أعمدة الجدول
    // ═══════════════════════════════════════════════
    const columns = [
        {
            key: 'name',
            label: 'الاسم',
            render: (row) => (
                <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-900">{row.name}</span>
                    {row.type === 'main' && (
                        <span
                            title="المخزن الرئيسي"
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-warning-50 text-warning-700"
                        >
                            <Crown size={10} />
                            رئيسي
                        </span>
                    )}
                    {row.isDefault && (
                        <span
                            title="المخزن الافتراضي"
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-info-50 text-info-700"
                        >
                            <Star size={10} />
                            افتراضي
                        </span>
                    )}
                </div>
            ),
        },
        {
            key: 'code',
            label: 'الكود',
            render: (row) => (
                <code className="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-700">
                    {row.code}
                </code>
            ),
        },
        {
            key: 'city',
            label: 'المدينة',
            render: (row) => <span className="text-sm">{row.city || '—'}</span>,
        },
        {
            key: 'phone',
            label: 'الهاتف',
            render: (row) => (
                <span className="text-sm numeric" dir="ltr">
                    {row.phone || '—'}
                </span>
            ),
        },
        {
            key: 'isActive',
            label: 'الحالة',
            align: 'center',
            render: (row) => (
                <span
                    className={`inline-block text-xs font-medium px-2 py-1 rounded-full ${row.isActive
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
            width: '200px',
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

                    {row.isActive && row.type !== 'main' && (
                        <Button
                            variant="ghost"
                            size="sm"
                            icon={Crown}
                            onClick={() => handleSetMain(row)}
                            title="تعيين رئيسي"
                            className="text-warning-600 hover:bg-warning-50"
                        >
                            {''}
                        </Button>
                    )}

          {/* ✅ إعادة تفعيل — للمدير فقط على المخازن المعطّلة */}
          {isAdmin && !row.isActive && (
            <Button
              variant="ghost"
              size="sm"
              icon={Power}
              onClick={() => handleReactivate(row)}
              title="إعادة تفعيل"
              className="text-success-600 hover:bg-success-50"
            >
              {''}
            </Button>
          )}

                    {row.isActive && !row.isDefault && (
                        <Button
                            variant="ghost"
                            size="sm"
                            icon={Star}
                            onClick={() => handleSetDefault(row)}
                            title="تعيين افتراضي"
                            className="text-info-600 hover:bg-info-50"
                        >
                            {''}
                        </Button>
                    )}

                    {isAdmin && row.isActive && row.type !== 'main' && !row.isDefault && (
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
    // 9. Render
    // ═══════════════════════════════════════════════
    return (
        <div className="space-y-6">
            {/* ✅ العنوان */}
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
                        <h1 className="text-2xl font-bold text-neutral-900">المخازن</h1>
                        <p className="text-sm text-neutral-500 mt-0.5">
                            إدارة المخازن (رئيسي + فروع)
                        </p>
                    </div>
                </div>

                <Button icon={Plus} onClick={openCreateForm}>
                    مخزن جديد
                </Button>
            </div>

            {/* ✅ الفلاتر */}
            <Card noPadding>
                <div className="p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="flex-1">
                        <div className="relative">
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
                                <Search size={18} />
                            </div>
                            <input
                                type="text"
                                placeholder="بحث بالاسم أو الكود أو المدينة..."
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
                        value={filterType}
                        onChange={(e) => {
                            setFilterType(e.target.value);
                            setPage(1);
                        }}
                        className="px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
                    >
                        <option value="all">كل الأنواع</option>
                        <option value="main">رئيسي</option>
                        <option value="branch">فرع</option>
                    </select>

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

            {/* ✅ الجدول */}
            <Card noPadding>
                <div className="p-4">
                    <Table
                        columns={columns}
                        data={warehouses}
                        loading={loading && warehouses.length === 0}
                        emptyMessage="لا توجد مخازن مطابقة."
                        rowKey="id"
                    />

                    {warehouses.length > 0 && (
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

            {/* ✅ نافذة الإنشاء/التعديل */}
            <Modal
                isOpen={isFormOpen}
                onClose={closeForm}
                title={editingWarehouse ? 'تعديل مخزن' : 'مخزن جديد'}
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
                            {editingWarehouse ? 'حفظ التعديلات' : 'إنشاء'}
                        </Button>
                    </>
                }
            >
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <Input
                        label="اسم المخزن"
                        placeholder="مثال: المخزن الرئيسي — الخرطوم"
                        required
                        icon={Building2}
                        error={errors.name?.message}
                        {...register('name')}
                    />

                    <Input
                        label="الكود"
                        placeholder="مثال: WH-MAIN"
                        required
                        error={errors.code?.message}
                        {...register('code')}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="المدينة"
                            placeholder="مثال: الخرطوم"
                            error={errors.city?.message}
                            {...register('city')}
                        />
                        <Input
                            label="الهاتف"
                            placeholder="مثال: 0912345678"
                            error={errors.phone?.message}
                            {...register('phone')}
                        />
                    </div>

                    <Input
                        label="العنوان"
                        placeholder="العنوان التفصيلي..."
                        error={errors.address?.message}
                        {...register('address')}
                    />

                    <div>
                        <label className="block mb-1.5 text-sm font-medium text-neutral-700">
                            ملاحظات (اختياري)
                        </label>
                        <textarea
                            rows={2}
                            placeholder="ملاحظات إدارية..."
                            className={`w-full px-3 py-2 rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 text-sm ${errors.notes
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

            {/* ✅ تأكيد الحذف */}
            <ConfirmDialog
                isOpen={Boolean(confirmDelete)}
                onClose={() => setConfirmDelete(null)}
                onConfirm={handleDelete}
                type="danger"
                title="تعطيل المخزن"
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

export default WarehousesPage;