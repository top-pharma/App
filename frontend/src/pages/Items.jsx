/**
 * @file ItemsPage.jsx
 * @description صفحة إدارة الأصناف — قائمة + بحث + إنشاء + تعديل + تعطيل.
 */

import { useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Pencil, Plus, Power, Search, Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import ItemForm from '../components/Inventory/ItemForm.jsx';
import Button from '../components/UI/Button.jsx';
import Card from '../components/UI/Card.jsx';
import ConfirmDialog from '../components/UI/ConfirmDialog.jsx';
import Pagination from '../components/UI/Pagination.jsx';
import Table from '../components/UI/Table.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useCategories } from '../hooks/useCategories.js';
import { useItems } from '../hooks/useItems.js';
import { useToast } from '../hooks/useToast.js';
import { PAGINATION } from '../utils/constants.js';
import { formatCurrency } from '../utils/formatters.js';

function ItemsPage() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const { categories } = useCategories();
  const {
    items, pagination, loading, error,
    fetchItems, createItem, updateItem, deleteItem, reactivateItem, resetError,
  } = useItems();

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterActive, setFilterActive] = useState('all');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [page, setPage] = useState(PAGINATION.DEFAULT_PAGE);
  const [limit, setLimit] = useState(PAGINATION.DEFAULT_LIMIT);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const params = { page, limit };
    if (search) params.search = search;
    if (filterCategory) params.category = filterCategory;
    if (filterActive !== 'all') params.isActive = filterActive === 'active';
    if (filterLowStock) params.lowStock = true;
    fetchItems(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, search, filterCategory, filterActive, filterLowStock]);

  const openCreateForm = () => {
    setEditingItem(null);
    setIsFormOpen(true);
  };

  const openEditForm = (item) => {
    setEditingItem(item);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingItem(null);
  };

  const handleFormSubmit = async ({ values, isEdit }) => {
    const result = isEdit
      ? await updateItem(editingItem.id, values)
      : await createItem(values);

    if (result.success) {
      toast.success(isEdit ? 'تم تعديل الصنف بنجاح.' : 'تم إنشاء الصنف بنجاح.');
      return { success: true };
    }
    toast.error(result.error);
    return { success: false, error: result.error };
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const result = await deleteItem(confirmDelete.id);
    setDeleting(false);
    if (result.success) {
      toast.success('تم تعطيل الصنف.');
      setConfirmDelete(null);
    } else {
      toast.error(result.error);
    }
  };

    // ═══════════════════════════════════════════════
  // إعادة تفعيل صنف معطّل
  // ═══════════════════════════════════════════════
  const handleReactivate = async (item) => {
    const result = await reactivateItem(item.id);
    if (result.success) {
      toast.success(`تم إعادة تفعيل "${item.tradeName}".`);
    } else {
      toast.error(result.error);
    }
  };
  const categoryLabels = Object.fromEntries(
    categories.map((c) => [c.name, c.label])
  );

  const columns = [
    {
      key: 'tradeName',
      label: 'الاسم التجاري',
      render: (row) => (
        <div>
          <p className="font-medium text-neutral-900">{row.tradeName}</p>
          <p className="text-xs text-neutral-500">{row.scientificName}</p>
        </div>
      ),
    },
    {
      key: 'category',
      label: 'التصنيف',
      render: (row) => (
        <span className="text-xs px-2 py-0.5 rounded bg-primary-50 text-primary-800">
          {categoryLabels[row.category] || row.category}
        </span>
      ),
    },
    {
      key: 'units',
      label: 'الوحدة الأساسية',
      render: (row) => (
        <div>
          <p className="text-sm">{row.units?.base?.name || '—'}</p>
          <p className="text-xs text-neutral-500">
            {formatCurrency(row.units?.base?.price || 0)}
          </p>
        </div>
      ),
    },
    {
      key: 'barcode',
      label: 'الباركود',
      render: (row) =>
        row.barcode ? (
          <code className="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-700">
            {row.barcode}
          </code>
        ) : (
          <span className="text-neutral-400">—</span>
        ),
    },
    {
      key: 'reorderLevel',
      label: 'حد الطلب',
      align: 'center',
      render: (row) => <span className="numeric text-sm">{row.reorderLevel || 0}</span>,
    },
    {
      key: 'isActive',
      label: 'الحالة',
      align: 'center',
      render: (row) => (
        <span className={`inline-block text-xs font-medium px-2 py-1 rounded-full ${row.isActive ? 'bg-success-50 text-success-700' : 'bg-neutral-100 text-neutral-500'}`}>
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
          <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEditForm(row)} title="تعديل">{''}</Button>
          {isAdmin && row.isActive && (
            <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmDelete(row)} title="تعطيل" className="text-danger-600 hover:bg-danger-50">{''}</Button>
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
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link to="/inventory" className="p-2 rounded-md text-neutral-500 hover:bg-neutral-100 transition-colors" title="رجوع">
            <ArrowRight size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">الأصناف</h1>
            <p className="text-sm text-neutral-500 mt-0.5">إدارة الأصناف الدوائية والوحدات والباركود</p>
          </div>
        </div>
        <Button icon={Plus} onClick={openCreateForm}>صنف جديد</Button>
      </div>

      <Card noPadding>
        <div className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <div className="relative">
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
                  <Search size={18} />
                </div>
                <input
                  type="text"
                  placeholder="بحث بالاسم/الباركود/المصنّع..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pr-10 pl-3 py-2 rounded-md border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-200 text-sm"
                />
              </div>
            </div>
            <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }} className="px-3 py-2 rounded-md border border-neutral-300 text-sm">
              <option value="">كل التصنيفات</option>
              {categories.filter((c) => c.isActive).map((c) => (
                <option key={c.id} value={c.name}>{c.label}</option>
              ))}
            </select>
            <select value={filterActive} onChange={(e) => { setFilterActive(e.target.value); setPage(1); }} className="px-3 py-2 rounded-md border border-neutral-300 text-sm">
              <option value="all">كل الحالات</option>
              <option value="active">نشط</option>
              <option value="inactive">معطّل</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={filterLowStock}
              onChange={(e) => { setFilterLowStock(e.target.checked); setPage(1); }}
              className="w-4 h-4 rounded border-neutral-300 text-warning-600"
            />
            <span className="text-sm text-neutral-700 flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-warning-600" />
              الأصناف تحت حد الطلب فقط
            </span>
          </label>
        </div>
      </Card>

      <Card noPadding>
        <div className="p-4">
          <Table
            columns={columns}
            data={items}
            loading={loading && items.length === 0}
            emptyMessage="لا توجد أصناف مطابقة."
            rowKey="id"
          />
          {items.length > 0 && (
            <div className="mt-4 pt-4 border-t border-neutral-100">
              <Pagination
                page={pagination.page}
                limit={pagination.limit}
                total={pagination.total}
                onPageChange={setPage}
                onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
              />
            </div>
          )}
        </div>
      </Card>

      <ItemForm isOpen={isFormOpen} onClose={closeForm} item={editingItem} onSubmit={handleFormSubmit} />

      <ConfirmDialog
        isOpen={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        type="danger"
        title="تعطيل الصنف"
        message={confirmDelete ? `هل أنت متأكد من تعطيل "${confirmDelete.tradeName}"؟ لن يظهر في القوائم النشطة.` : ''}
        confirmText="تعطيل"
        loading={deleting}
      />
    </div>
  );
}

export default ItemsPage;