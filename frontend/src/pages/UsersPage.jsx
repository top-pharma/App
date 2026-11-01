/**
 * @file UsersPage.jsx
 * @description صفحة إدارة المستخدمين والموظفين (Phase C).
 *
 * - تعرض قائمة المستخدمين مع فلاتر + Pagination.
 * - إضافة/تعديل/تعطيل/إعادة تعيين كلمة المرور.
 * - تعتمد على hasPermission لتفعيل الأزرار (Backend يتحقق أيضاً).
 *
 * ⚠️ حساب الصيدلية (pharmacy) يتطلب ربطه بعميل — يُنشأ من شاشة "الصيدليات".
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
    Plus,
    Search,
    RefreshCw,
    ShieldCheck,
    ShieldOff,
    Key,
    Pencil,
} from 'lucide-react';

import Button from '../components/UI/Button.jsx';
import Card from '../components/UI/Card.jsx';
import Input from '../components/UI/Input.jsx';
import Select from '../components/UI/Select.jsx';
import Table from '../components/UI/Table.jsx';
import Pagination from '../components/UI/Pagination.jsx';
import ConfirmDialog from '../components/UI/ConfirmDialog.jsx';

import UserFormModal from '../components/Users/UserFormModal.jsx';
import ResetPasswordModal from '../components/Users/ResetPasswordModal.jsx';
import UserStatusBadge from '../components/Users/UserStatusBadge.jsx';

import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import * as usersAPI from '../api/usersAPI.js';
import { ROLE_LABELS_AR, PAGINATION } from '../utils/constants.js';

const ROLE_FILTER_OPTIONS = [
    { value: '', label: 'كل الأدوار' },
    { value: 'admin', label: 'مدير' },
    { value: 'hr_manager', label: 'مدير موارد بشرية' },
    { value: 'storekeeper', label: 'أمين مخزن' },
    { value: 'accountant', label: 'محاسب' },
    { value: 'sales_rep', label: 'مندوب' },
    { value: 'pharmacy', label: 'صيدلية' },
];

const STATUS_FILTER_OPTIONS = [
    { value: '', label: 'الكل' },
    { value: 'true', label: 'نشط' },
    { value: 'false', label: 'معطّل' },
];

export default function UsersPage() {
    const { hasPermission, user: currentUser } = useAuth();
    const toast = useToast();

    // Data
    const [items, setItems] = useState([]);
    const [pagination, setPagination] = useState({
        page: PAGINATION.DEFAULT_PAGE,
        limit: PAGINATION.DEFAULT_LIMIT,
        total: 0,
    });
    const [loading, setLoading] = useState(false);

    // Filters
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Modals
    const [formModal, setFormModal] = useState({ open: false, user: null });
    const [resetModal, setResetModal] = useState({ open: false, user: null });
    const [confirmToggle, setConfirmToggle] = useState({
        open: false,
        user: null,
        loading: false,
    });

    // Permissions
    const canView = hasPermission('users.view');
    const canCreate = hasPermission('users.create');
    const canUpdate = hasPermission('users.update');
    const canReset = hasPermission('users.reset_password');
    const canDelete = hasPermission('users.delete');

    // Debounce search (400ms)
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
        return () => clearTimeout(timer);
    }, [search]);

    // Fetch function
    const fetchUsers = useCallback(
        async (page = 1, limit = pagination.limit) => {
            setLoading(true);
            try {
                const params = {
                    page,
                    limit,
                    sortBy: 'createdAt',
                    sortOrder: 'desc',
                };
                if (debouncedSearch) params.search = debouncedSearch;
                if (roleFilter) params.role = roleFilter;
                if (statusFilter !== '') params.isActive = statusFilter;

                const { items: rows, pagination: pg } = await usersAPI.listUsers(params);
                setItems(rows);
                setPagination(pg);
            } catch (err) {
                toast.error(
                    err?.error?.message || err?.message || 'فشل تحميل المستخدمين'
                );
            } finally {
                setLoading(false);
            }
        },
        [debouncedSearch, roleFilter, statusFilter, pagination.limit, toast]
    );

    // Fetch on filter change (skip initial double-fetch)
    useEffect(() => {
        if (canView) fetchUsers(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearch, roleFilter, statusFilter]);

    // Handlers
    const handlePageChange = (page) => fetchUsers(page, pagination.limit);
    const handleLimitChange = (limit) => fetchUsers(1, limit);

    const openCreateModal = () => setFormModal({ open: true, user: null });
    const openEditModal = (user) => setFormModal({ open: true, user });
    const closeFormModal = () => setFormModal({ open: false, user: null });

    const openResetModal = (user) => setResetModal({ open: true, user });
    const closeResetModal = () => setResetModal({ open: false, user: null });

    const openToggleConfirm = (user) =>
        setConfirmToggle({ open: true, user, loading: false });
    const closeToggleConfirm = () =>
        setConfirmToggle({ open: false, user: null, loading: false });

    const handleToggleActive = async () => {
        setConfirmToggle((s) => ({ ...s, loading: true }));
        try {
            await usersAPI.toggleUserActive(confirmToggle.user.id);
            toast.success(
                `تم ${confirmToggle.user.isActive ? 'تعطيل' : 'تفعيل'} المستخدم`
            );
            closeToggleConfirm();
            fetchUsers(pagination.page, pagination.limit);
        } catch (err) {
            toast.error(
                err?.error?.message || 'فشل تغيير حالة المستخدم'
            );
            setConfirmToggle((s) => ({ ...s, loading: false }));
        }
    };

    const isSelf = useCallback(
        (user) => {
            if (!currentUser) return false;
            const userId = String(user.id || user._id || '');
            const selfId = String(currentUser.id || currentUser._id || '');
            if (!userId || !selfId) return false;
            return userId === selfId;
        },
        [currentUser]
    );

    const columns = useMemo(
        () => [
            {
                key: 'name',
                label: 'الاسم',
                align: 'start',
                render: (row) => (
                    <div className="min-w-0">
                        <p className="font-medium text-neutral-900 truncate">{row.name}</p>
                        {isSelf(row) && (
                            <p className="text-xs text-primary-600">أنت</p>
                        )}
                    </div>
                ),
            },
            {
                key: 'email',
                label: 'البريد الإلكتروني',
                align: 'start',
                render: (row) => (
                    <span dir="ltr" className="block truncate">
                        {row.email}
                    </span>
                ),
            },
            {
                key: 'phone',
                label: 'الهاتف',
                align: 'start',
                render: (row) => (
                    <span dir="ltr">{row.phone || '—'}</span>
                ),
            },
            {
                key: 'role',
                label: 'الدور',
                align: 'center',
                render: (row) => (
                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-neutral-100 text-neutral-800 text-xs font-medium">
                        {ROLE_LABELS_AR[row.role] || row.role}
                    </span>
                ),
            },
            {
                key: 'isActive',
                label: 'الحالة',
                align: 'center',
                render: (row) => <UserStatusBadge isActive={row.isActive} />,
            },
            {
                key: 'lastLoginAt',
                label: 'آخر دخول',
                align: 'center',
                render: (row) =>
                    row.lastLoginAt
                        ? new Date(row.lastLoginAt).toLocaleDateString('en-GB')
                        : '—',
            },
            {
                key: 'actions',
                label: 'الإجراءات',
                align: 'center',
                render: (row) => {
                    const self = isSelf(row);
                    return (
                        <div className="flex items-center justify-center gap-1">
                            {canUpdate && (
                                <button
                                    type="button"
                                    onClick={() => openEditModal(row)}
                                    className="p-1.5 rounded text-neutral-500 hover:text-primary-700 hover:bg-primary-50 transition-colors"
                                    title="تعديل"
                                    aria-label="تعديل"
                                >
                                    <Pencil size={16} />
                                </button>
                            )}
                            {canReset && (
                                <button
                                    type="button"
                                    onClick={() => openResetModal(row)}
                                    className="p-1.5 rounded text-neutral-500 hover:text-warning-700 hover:bg-warning-50 transition-colors"
                                    title="إعادة تعيين كلمة المرور"
                                    aria-label="إعادة تعيين كلمة المرور"
                                >
                                    <Key size={16} />
                                </button>
                            )}
                            {canUpdate && !self && (
                                <button
                                    type="button"
                                    onClick={() => openToggleConfirm(row)}
                                    className={`p-1.5 rounded transition-colors ${row.isActive
                                        ? 'text-neutral-500 hover:text-danger-700 hover:bg-danger-50'
                                        : 'text-neutral-500 hover:text-success-700 hover:bg-success-50'
                                        }`}
                                    title={row.isActive ? 'تعطيل' : 'تفعيل'}
                                    aria-label={row.isActive ? 'تعطيل' : 'تفعيل'}
                                >
                                    {row.isActive ? (
                                        <ShieldOff size={16} />
                                    ) : (
                                        <ShieldCheck size={16} />
                                    )}
                                </button>
                            )}
                        </div>
                    );
                },
            },
        ],
        [canUpdate, canReset, isSelf]
    );

    // Guard: no permission
    if (!canView) {
        return (
            <Card>
                <div className="text-center py-8">
                    <p className="text-neutral-600">لا تملك صلاحية عرض هذه الصفحة.</p>
                </div>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <Card
                title="إدارة المستخدمين والموظفين"
                subtitle="إضافة، تعديل، تعطيل، وإعادة تعيين كلمات المرور"
                icon={ShieldCheck}
                actions={
                    <>
                        <Button
                            variant="secondary"
                            icon={RefreshCw}
                            onClick={() => fetchUsers(pagination.page, pagination.limit)}
                            disabled={loading}
                        >
                            تحديث
                        </Button>
                        {canCreate && (
                            <Button icon={Plus} onClick={openCreateModal}>
                                مستخدم جديد
                            </Button>
                        )}
                    </>
                }
            >
                {/* Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                    <Input
                        label="بحث"
                        placeholder="الاسم، البريد، أو الهاتف"
                        icon={Search}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <Select
                        label="الدور"
                        options={ROLE_FILTER_OPTIONS}
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                    />
                    <Select
                        label="الحالة"
                        options={STATUS_FILTER_OPTIONS}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    />
                </div>

                {/* Table */}
                <Table
                    columns={columns}
                    data={items}
                    loading={loading}
                    rowKey="id"
                    emptyMessage="لا يوجد مستخدمون مطابقون"
                />

                {/* Pagination */}
                <Pagination
                    page={pagination.page}
                    limit={pagination.limit}
                    total={pagination.total}
                    onPageChange={handlePageChange}
                    onLimitChange={handleLimitChange}
                />
            </Card>

            {/* Modals */}
            <UserFormModal
                isOpen={formModal.open}
                user={formModal.user}
                onClose={closeFormModal}
                onSaved={() => {
                    closeFormModal();
                    fetchUsers(pagination.page, pagination.limit);
                }}
            />

            <ResetPasswordModal
                isOpen={resetModal.open}
                user={resetModal.user}
                onClose={closeResetModal}
                onSaved={() => fetchUsers(pagination.page, pagination.limit)}
            />

            <ConfirmDialog
                isOpen={confirmToggle.open}
                type={confirmToggle.user?.isActive ? 'danger' : 'info'}
                title={
                    confirmToggle.user?.isActive ? 'تعطيل المستخدم' : 'تفعيل المستخدم'
                }
                message={
                    confirmToggle.user?.isActive
                        ? `سيتم تعطيل "${confirmToggle.user?.name}" وإخراجه من كل الجلسات النشطة. يمكنك إعادة تفعيله لاحقاً.`
                        : `سيتم تفعيل "${confirmToggle.user?.name}" والسماح له بالدخول.`
                }
                confirmText={confirmToggle.user?.isActive ? 'تعطيل' : 'تفعيل'}
                loading={confirmToggle.loading}
                onConfirm={handleToggleActive}
                onClose={closeToggleConfirm}
            />
        </div>
    );
}