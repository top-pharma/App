/**
 * @file CustomersPage.jsx
 * @description
 * صفحة إدارة الصيدليات — قائمة + بحث + إنشاء + تعديل + تعطيل + حظر.
 */

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Ban,
  CircleCheckBig,
  Pencil,
  Plus,
  Power,
  Search,
  ShoppingBag,
  Trash2,
  User,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import CustomerForm from '../components/Inventory/CustomerForm.jsx';
import Button from '../components/UI/Button.jsx';
import Card from '../components/UI/Card.jsx';
import ConfirmDialog from '../components/UI/ConfirmDialog.jsx';
import Input from '../components/UI/Input.jsx';
import Modal from '../components/UI/Modal.jsx';
import Pagination from '../components/UI/Pagination.jsx';
import Table from '../components/UI/Table.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useCustomers } from '../hooks/useCustomers.js';
import { useToast } from '../hooks/useToast.js';
import { PAGINATION } from '../utils/constants.js';
import { formatCurrency, formatDate } from '../utils/formatters.js';

// ═══════════════════════════════════════════════
// 1. المكون
// ═══════════════════════════════════════════════
function CustomersPage() {
  const toast = useToast();
  const { isAdmin, isSalesRep  } = useAuth();
  const {
    customers,
    pagination,
    loading,
    fetchCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    reactivateCustomer,
  } = useCustomers();

  // ✅ فلاتر
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('all');
  const [filterBlocked, setFilterBlocked] = useState('all');
  const [page, setPage] = useState(PAGINATION.DEFAULT_PAGE);
  const [limit, setLimit] = useState(PAGINATION.DEFAULT_LIMIT);

  // ✅ النموذج
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);

  // ✅ الحذف
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ✅ الحظر
  const [blockDialog, setBlockDialog] = useState(null);
  const [blockReason, setBlockReason] = useState('');
  const [blocking, setBlocking] = useState(false);

  // ═══════════════════════════════════════════════
  // 2. تحميل البيانات
  // ═══════════════════════════════════════════════
  useEffect(() => {
    const params = { page, limit };
    if (search) params.search = search;
    if (filterActive !== 'all') params.isActive = filterActive === 'active';
    if (filterBlocked !== 'all') params.isBlocked = filterBlocked === 'blocked';

    fetchCustomers(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, search, filterActive, filterBlocked]);

  // ═══════════════════════════════════════════════
  // 3. النموذج
  // ═══════════════════════════════════════════════
  const openCreateForm = () => {
    setEditingCustomer(null);
    setIsFormOpen(true);
  };

  const openEditForm = (customer) => {
    setEditingCustomer(customer);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingCustomer(null);
  };

  const handleFormSubmit = async ({ values, isEdit }) => {
    const result = isEdit
      ? await updateCustomer(editingCustomer.id, values)
      : await createCustomer(values);

    if (result.success) {
      toast.success(isEdit ? 'تم تعديل الصيدلية بنجاح.' : 'تم إنشاء الصيدلية بنجاح.');
      return { success: true };
    }
    toast.error(result.error);
    return { success: false, error: result.error };
  };

  // ═══════════════════════════════════════════════
  // 4. الحذف
  // ═══════════════════════════════════════════════
  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const result = await deleteCustomer(confirmDelete.id);
    setDeleting(false);

    if (result.success) {
      toast.success('تم تعطيل الصيدلية.');
      setConfirmDelete(null);
    } else {
      toast.error(result.error);
    }
  };

  // ═══════════════════════════════════════════════
  // 5. الحظر / إلغاء الحظر
  // ═══════════════════════════════════════════════
  const openBlockDialog = (customer) => {
    setBlockDialog(customer);
    setBlockReason(customer.blockReason || '');
  };

  const handleBlock = async () => {
    if (!blockDialog) return;

    if (!blockReason.trim()) {
      toast.error('يجب إدخال سبب الحظر.');
      return;
    }

    setBlocking(true);
    const result = await updateCustomer(blockDialog.id, {
      isBlocked: true,
      blockReason: blockReason.trim(),
    });
    setBlocking(false);

    if (result.success) {
      toast.success('تم حظر الصيدلية.');
      setBlockDialog(null);
      setBlockReason('');
    } else {
      toast.error(result.error);
    }
  };

  const handleUnblock = async (customer) => {
    const result = await updateCustomer(customer.id, { isBlocked: false });
    if (result.success) {
      toast.success('تم إلغاء حظر الصيدلية.');
    } else {
      toast.error(result.error);
    }
  };

    // ═══════════════════════════════════════════════
  // إعادة تفعيل صيدلية معطّلة
  // ═══════════════════════════════════════════════
  const handleReactivate = async (customer) => {
    const result = await reactivateCustomer(customer.id);
    if (result.success) {
      toast.success(`تم إعادة تفعيل "${customer.name}".`);
    } else {
      toast.error(result.error);
    }
  };

  // ═══════════════════════════════════════════════
  // 6. الأعمدة
  // ═══════════════════════════════════════════════
  const columns = [
    {
      key: 'name',
      label: 'الصيدلية',
      render: (row) => (
        <div className="flex items-center gap-2">
          <div>
            <p className="font-medium text-neutral-900">{row.name}</p>
            <p className="text-xs text-neutral-500 numeric">{row.code || '—'}</p>
          </div>
          {row.isBlocked && (
            <span
              title={row.blockReason || 'محظورة'}
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-danger-50 text-danger-700"
            >
              <Ban size={10} />
              محظورة
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'phone',
      label: 'الهاتف',
      render: (row) => (
        <span className="text-sm numeric" dir="ltr">
          {row.phone}
        </span>
      ),
    },
    {
      key: 'city',
      label: 'المدينة',
      render: (row) => <span className="text-sm">{row.city || '—'}</span>,
    },
    {
      key: 'assignedSalesRep',
      label: 'المندوب',
      render: (row) => {
        const rep = row.assignedSalesRep;
        const name = typeof rep === 'object' ? rep?.name : null;
        return (
          <div className="flex items-center gap-1.5 text-sm text-neutral-700">
            <User size={14} className="text-neutral-400" />
            <span>{name || '—'}</span>
          </div>
        );
      },
    },
    {
      key: 'currentBalance',
      label: 'الرصيد',
      align: 'end',
      render: (row) => (
        <div className="text-left" dir="ltr">
          <p
            className={`text-sm numeric font-medium ${
              row.currentBalance > 0 ? 'text-danger-600' : 'text-neutral-700'
            }`}
          >
            {formatCurrency(row.currentBalance)}
          </p>
          {row.creditLimit > 0 && (
            <p className="text-[10px] text-neutral-500 numeric">
              الحد: {formatCurrency(row.creditLimit, false)}
            </p>
          )}
        </div>
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
          {row.isActive ? 'نشطة' : 'معطّلة'}
        </span>
      ),
    },
        {
      key: 'actions',
      label: 'إجراءات',
      align: 'center',
      width: '170px',
      render: (row) => {
        // ⚠️ sales_rep لديه customers.read فقط — عرض بلا أزرار
        if (isSalesRep) {
          return <span className="text-xs text-neutral-400">عرض فقط</span>;
        }

        return (
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

            {isAdmin && row.isActive && !row.isBlocked && (
              <Button
                variant="ghost"
                size="sm"
                icon={Ban}
                onClick={() => openBlockDialog(row)}
                title="حظر"
                className="text-warning-600 hover:bg-warning-50"
              >
                {''}
              </Button>
            )}

            {isAdmin && row.isBlocked && (
              <Button
                variant="ghost"
                size="sm"
                icon={CircleCheckBig}
                onClick={() => handleUnblock(row)}
                title="إلغاء الحظر"
                className="text-success-600 hover:bg-success-50"
              >
                {''}
              </Button>
            )}

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
          </div>
        );
      },
    },
  ];

  // ═══════════════════════════════════════════════
  // 7. Render
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
            <h1 className="text-2xl font-bold text-neutral-900">الصيدليات</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              جميع العملاء صيدليات دائمة
            </p>
          </div>
        </div>

                {!isSalesRep && (
          <Button icon={Plus} onClick={openCreateForm}>
            صيدلية جديدة
          </Button>
        )}
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
                placeholder="بحث بالاسم/الكود/الهاتف/المالك..."
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
            <option value="active">نشطة</option>
            <option value="inactive">معطّلة</option>
          </select>

          <select
            value={filterBlocked}
            onChange={(e) => {
              setFilterBlocked(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="all">الكل</option>
            <option value="blocked">محظورة</option>
            <option value="unblocked">غير محظورة</option>
          </select>
        </div>
      </Card>

      {/* الجدول */}
      <Card noPadding>
        <div className="p-4">
          <Table
            columns={columns}
            data={customers}
            loading={loading && customers.length === 0}
            emptyMessage="لا توجد صيدليات مطابقة."
            rowKey="id"
          />

          {customers.length > 0 && (
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

      {/* نموذج الصيدلية */}
      <CustomerForm
        isOpen={isFormOpen}
        onClose={closeForm}
        customer={editingCustomer}
        onSubmit={handleFormSubmit}
      />

      {/* تأكيد الحذف */}
      <ConfirmDialog
        isOpen={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        type="danger"
        title="تعطيل الصيدلية"
        message={
          confirmDelete
            ? `هل أنت متأكد من تعطيل "${confirmDelete.name}"؟ لن تظهر في القوائم النشطة.`
            : ''
        }
        confirmText="تعطيل"
        loading={deleting}
      />

      {/* حوار الحظر */}
      <Modal
        isOpen={Boolean(blockDialog)}
        onClose={() => {
          setBlockDialog(null);
          setBlockReason('');
        }}
        title="حظر الصيدلية"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setBlockDialog(null);
                setBlockReason('');
              }}
              disabled={blocking}
            >
              إلغاء
            </Button>
            <Button variant="warning" onClick={handleBlock} loading={blocking}>
              حظر
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-md bg-warning-50 border border-warning-200">
            <Ban size={20} className="text-warning-700 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-warning-900">
              <p className="font-medium">
                سيتم حظر "{blockDialog?.name}" من الشراء.
              </p>
              <p className="text-xs mt-1">
                لن يُسمح بإنشاء فواتير جديدة لهذه الصيدلية حتى إلغاء الحظر.
              </p>
            </div>
          </div>

          <div>
            <label className="block mb-1.5 text-sm font-medium text-neutral-700">
              سبب الحظر <span className="text-danger-600">*</span>
            </label>
            <textarea
              rows={3}
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="مثال: تجاوز حد الائتمان بدون سداد..."
              className="w-full px-3 py-2 rounded-md border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-warning-200 focus:border-warning-500 text-sm"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default CustomersPage;