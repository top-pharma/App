/**
 * @file StockPage.jsx
 * @description
 * صفحة إدارة المخزون (الدفعات) — قائمة + بحث + استلام + تعديل + حجر + حذف.
 *
 * المميزات:
 * - عرض FEFO تلقائياً (مرتب افتراضياً بـ expiry تصاعدي).
 * - شارات ملوّنة للحالة (منتهية/قاربة/محجورة).
 * - فلتر "القاربة على الانتهاء" يستخدم expiringIn.
 * - بطاقات سريعة أعلى الصفحة (إحصائيات).
 */

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Boxes,
  Calendar,
  CircleCheckBig,
  Layers,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import BatchForm from '../components/Inventory/BatchForm.jsx';
import Button from '../components/UI/Button.jsx';
import Card from '../components/UI/Card.jsx';
import ConfirmDialog from '../components/UI/ConfirmDialog.jsx';
import Input from '../components/UI/Input.jsx';
import Modal from '../components/UI/Modal.jsx';
import Pagination from '../components/UI/Pagination.jsx';
import Table from '../components/UI/Table.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useStock } from '../hooks/useStock.js';
import { useToast } from '../hooks/useToast.js';
import { useWarehouses } from '../hooks/useWarehouses.js';
import { useItems } from '../hooks/useItems.js';
import { PAGINATION } from '../utils/constants.js';
import { formatCurrency, formatDate, formatNumber } from '../utils/formatters.js';

// ═══════════════════════════════════════════════
// 1. المكون
// ═══════════════════════════════════════════════
function StockPage() {
  const toast = useToast();
  const { isAdmin } = useAuth();
    const { items, fetchItems } = useItems();
  const { warehouses, fetchWarehouses } = useWarehouses();
  const {
    stocks,
    pagination,
    loading,
    expiringSoon,
    belowReorder,
    fetchStocks,
    fetchExpiringSoon,
    fetchBelowReorder,
    createStock,
    updateStock,
    deleteStock,
  } = useStock();

  // ✅ فلاتر
  const [search, setSearch] = useState('');
  const [filterItem, setFilterItem] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterExpiring, setFilterExpiring] = useState(false);
  const [filterQuarantined, setFilterQuarantined] = useState(false);
  const [page, setPage] = useState(PAGINATION.DEFAULT_PAGE);
  const [limit, setLimit] = useState(PAGINATION.DEFAULT_LIMIT);

  // ✅ النموذج
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStock, setEditingStock] = useState(null);

  // ✅ الحذف
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ✅ الحجر
  const [quarantineDialog, setQuarantineDialog] = useState(null);
  const [quarantineReason, setQuarantineReason] = useState('');
  const [quarantining, setQuarantining] = useState(false);

  // ═══════════════════════════════════════════════
  // 2. تحميل البيانات
  // ═══════════════════════════════════════════════
  useEffect(() => {
    const params = { page, limit };
    if (search) params.search = search;
    if (filterItem) params.item = filterItem;
    if (filterWarehouse) params.warehouse = filterWarehouse;
    if (filterExpiring) params.expiringIn = 90;
    if (filterQuarantined) params.onlyQuarantined = true;

    fetchStocks(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, search, filterItem, filterWarehouse, filterExpiring, filterQuarantined]);

  // ✅ تحميل قوائم الفلترة (Items + Warehouses) إن كانت فارغة
  useEffect(() => {
    if (items.length === 0) {
      fetchItems({ isActive: true, limit: 100 });
    }
    if (warehouses.length === 0) {
      fetchWarehouses({ isActive: true, limit: 100 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ تحميل الإحصائيات مرة واحدة
  useEffect(() => {
    fetchExpiringSoon();
    fetchBelowReorder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ═══════════════════════════════════════════════
  // 3. النموذج
  // ═══════════════════════════════════════════════
  const openCreateForm = () => {
    setEditingStock(null);
    setIsFormOpen(true);
  };

  const openEditForm = (stock) => {
    setEditingStock(stock);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingStock(null);
  };

  const handleFormSubmit = async ({ values, isEdit }) => {
    const result = isEdit
      ? await updateStock(editingStock.id, values)
      : await createStock(values);

    if (result.success) {
      toast.success(isEdit ? 'تم تعديل الدفعة بنجاح.' : 'تم استلام الدفعة بنجاح.');
      // إعادة الجلب لتحديث الإحصائيات.
      const params = { page, limit };
      if (search) params.search = search;
      if (filterItem) params.item = filterItem;
      if (filterWarehouse) params.warehouse = filterWarehouse;
      if (filterExpiring) params.expiringIn = 90;
      if (filterQuarantined) params.onlyQuarantined = true;
      fetchStocks(params);
      fetchExpiringSoon();
      fetchBelowReorder();
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
    const result = await deleteStock(confirmDelete.id);
    setDeleting(false);

    if (result.success) {
      toast.success('تم حذف الدفعة.');
      setConfirmDelete(null);
      fetchExpiringSoon();
      fetchBelowReorder();
    } else {
      toast.error(result.error);
    }
  };

  // ═══════════════════════════════════════════════
  // 5. الحجر / إلغاء الحجر
  // ═══════════════════════════════════════════════
  const openQuarantineDialog = (stock) => {
    setQuarantineDialog(stock);
    setQuarantineReason(stock.quarantineReason || '');
  };

  const handleQuarantine = async () => {
    if (!quarantineDialog) return;
    if (!quarantineReason.trim()) {
      toast.error('يجب إدخال سبب الحجر.');
      return;
    }

    setQuarantining(true);
    const result = await updateStock(quarantineDialog.id, {
      isQuarantined: true,
      quarantineReason: quarantineReason.trim(),
    });
    setQuarantining(false);

    if (result.success) {
      toast.success('تم حجر الدفعة.');
      setQuarantineDialog(null);
      setQuarantineReason('');
      fetchExpiringSoon();
    } else {
      toast.error(result.error);
    }
  };

  const handleUnquarantine = async (stock) => {
    const result = await updateStock(stock.id, { isQuarantined: false });
    if (result.success) {
      toast.success('تم إلغاء حجر الدفعة.');
      fetchExpiringSoon();
    } else {
      toast.error(result.error);
    }
  };

  // ═══════════════════════════════════════════════
  // 6. الإحصائيات
  // ═══════════════════════════════════════════════
  const stats = useMemo(
    () => [
      {
        label: 'دفعات نشطة',
        value: pagination.total,
        icon: Boxes,
        color: 'bg-primary-50 text-primary-800',
      },
      {
        label: 'قاربة الانتهاء',
        value: expiringSoon.count,
        icon: AlertTriangle,
        color: 'bg-warning-50 text-warning-700',
      },
      {
        label: 'تحت حد الطلب',
        value: belowReorder.count,
        icon: Package,
        color: 'bg-danger-50 text-danger-700',
      },
    ],
    [pagination.total, expiringSoon.count, belowReorder.count]
  );

  // ═══════════════════════════════════════════════
  // 7. شارة الحالة
  // ═══════════════════════════════════════════════
  const renderStatusBadge = (row) => {
    if (row.isExpired) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-danger-100 text-danger-800">
          منتهية
        </span>
      );
    }
    if (row.isQuarantined) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-neutral-200 text-neutral-800">
          محجورة
        </span>
      );
    }
    if (row.daysUntilExpiry !== null && row.daysUntilExpiry <= 90) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-warning-100 text-warning-800">
          {row.daysUntilExpiry} يوم
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-success-100 text-success-800">
        سليمة
      </span>
    );
  };

  // ═══════════════════════════════════════════════
  // 8. الأعمدة
  // ═══════════════════════════════════════════════
  const columns = [
    {
      key: 'item',
      label: 'الصنف',
      render: (row) => {
        const it = row.item;
        const name = typeof it === 'object' ? it?.tradeName : '—';
        const scientific = typeof it === 'object' ? it?.scientificName : '';
        return (
          <div>
            <p className="font-medium text-neutral-900">{name}</p>
            <p className="text-xs text-neutral-500">{scientific}</p>
          </div>
        );
      },
    },
    {
      key: 'batch',
      label: 'الدفعة',
      render: (row) => (
        <code className="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-700">
          {row.batch}
        </code>
      ),
    },
    {
      key: 'warehouse',
      label: 'المخزن',
      render: (row) => {
        const w = row.warehouse;
        return (
          <span className="text-sm text-neutral-700">
            {typeof w === 'object' ? `${w.name} (${w.code})` : '—'}
          </span>
        );
      },
    },
    {
      key: 'expiry',
      label: 'الانتهاء',
      align: 'center',
      render: (row) => (
        <div className="text-center">
          <p className="text-sm text-neutral-800">{formatDate(row.expiry)}</p>
          <p className="text-[10px] text-neutral-500">
            {row.productionDate ? `إنتاج: ${formatDate(row.productionDate)}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'quantity',
      label: 'الكمية',
      align: 'center',
      render: (row) => (
        <span className="numeric text-sm font-bold text-neutral-900">
          {formatNumber(row.quantity, 2)}
        </span>
      ),
    },
    {
      key: 'unitCost',
      label: 'التكلفة',
      align: 'end',
      render: (row) => (
        <span className="numeric text-sm text-neutral-700">
          {formatCurrency(row.unitCost)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'الحالة',
      align: 'center',
      render: renderStatusBadge,
    },
    {
      key: 'actions',
      label: 'إجراءات',
      align: 'center',
      width: '170px',
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

          {isAdmin && !row.isQuarantined && !row.isExpired && (
            <Button
              variant="ghost"
              size="sm"
              icon={Ban}
              onClick={() => openQuarantineDialog(row)}
              title="حجر"
              className="text-warning-600 hover:bg-warning-50"
            >
              {''}
            </Button>
          )}

          {isAdmin && row.isQuarantined && (
            <Button
              variant="ghost"
              size="sm"
              icon={CircleCheckBig}
              onClick={() => handleUnquarantine(row)}
              title="إلغاء الحجر"
              className="text-success-600 hover:bg-success-50"
            >
              {''}
            </Button>
          )}

          {isAdmin && (row.quantity === 0 || row.isQuarantined) && (
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              onClick={() => setConfirmDelete(row)}
              title="حذف"
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
            <h1 className="text-2xl font-bold text-neutral-900">المخزون</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              الدفعات وتواريخ الانتهاء (FEFO)
            </p>
          </div>
        </div>

        <Button icon={Plus} onClick={openCreateForm}>
          استلام دفعة
        </Button>
      </div>

      {/* الإحصائيات */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-white rounded-lg border border-neutral-200 p-4"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${stat.color}`}
                >
                  <Icon size={20} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-neutral-900 numeric">
                    {formatNumber(stat.value)}
                  </p>
                  <p className="text-xs text-neutral-500">{stat.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* الفلاتر */}
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
                  placeholder="بحث برقم الدفعة أو الموقع..."
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
              value={filterItem}
              onChange={(e) => {
                setFilterItem(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 max-w-xs"
            >
              <option value="">كل الأصناف</option>
              {items.slice(0, 100).map((it) => (
                <option key={it.id} value={it.id}>
                  {it.tradeName}
                </option>
              ))}
            </select>

            <select
              value={filterWarehouse}
              onChange={(e) => {
                setFilterWarehouse(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              <option value="">كل المخازن</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterExpiring}
                onChange={(e) => {
                  setFilterExpiring(e.target.checked);
                  setPage(1);
                }}
                className="w-4 h-4 rounded border-neutral-300 text-warning-600 focus:ring-warning-500"
              />
              <span className="text-sm text-neutral-700 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-warning-600" />
                قاربة الانتهاء (90 يوم)
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterQuarantined}
                onChange={(e) => {
                  setFilterQuarantined(e.target.checked);
                  setPage(1);
                }}
                className="w-4 h-4 rounded border-neutral-300 text-neutral-600 focus:ring-neutral-500"
              />
              <span className="text-sm text-neutral-700 flex items-center gap-1.5">
                <Ban size={14} className="text-neutral-600" />
                المحجورة فقط
              </span>
            </label>
          </div>
        </div>
      </Card>

      {/* الجدول */}
      <Card noPadding>
        <div className="p-4">
          <Table
            columns={columns}
            data={stocks}
            loading={loading && stocks.length === 0}
            emptyMessage="لا توجد دفعات مطابقة."
            rowKey="id"
          />

          {stocks.length > 0 && (
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

      {/* نموذج الدفعة */}
      <BatchForm
        isOpen={isFormOpen}
        onClose={closeForm}
        stock={editingStock}
        onSubmit={handleFormSubmit}
      />

      {/* تأكيد الحذف */}
      <ConfirmDialog
        isOpen={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        type="danger"
        title="حذف الدفعة"
        message={
          confirmDelete
            ? `هل أنت متأكد من حذف الدفعة "${confirmDelete.batch}"؟ لا يمكن التراجع.`
            : ''
        }
        confirmText="حذف"
        loading={deleting}
      />

      {/* حوار الحجر */}
      <Modal
        isOpen={Boolean(quarantineDialog)}
        onClose={() => {
          setQuarantineDialog(null);
          setQuarantineReason('');
        }}
        title="حجر الدفعة"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setQuarantineDialog(null);
                setQuarantineReason('');
              }}
              disabled={quarantining}
            >
              إلغاء
            </Button>
            <Button variant="warning" onClick={handleQuarantine} loading={quarantining}>
              حجر
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-md bg-warning-50 border border-warning-200">
            <Ban size={20} className="text-warning-700 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-warning-900">
              <p className="font-medium">
                سيتم حجر دفعة "{quarantineDialog?.batch}"
              </p>
              <p className="text-xs mt-1">
                لن تُصرف هذه الدفعة في FEFO حتى إلغاء الحجر.
              </p>
            </div>
          </div>

          <div>
            <label className="block mb-1.5 text-sm font-medium text-neutral-700">
              سبب الحجر <span className="text-danger-600">*</span>
            </label>
            <textarea
              rows={3}
              value={quarantineReason}
              onChange={(e) => setQuarantineReason(e.target.value)}
              placeholder="مثال: شكوى من دفعة مشكوك فيها، قيد الفحص..."
              className="w-full px-3 py-2 rounded-md border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-warning-200 focus:border-warning-500 text-sm"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default StockPage;