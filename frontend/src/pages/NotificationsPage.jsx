/**
 * @file NotificationsPage.jsx
 * @description صفحة الإشعارات الكاملة — Phase 5.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Trash2, ExternalLink } from 'lucide-react';

import { useNotifications } from '../hooks/useNotifications.js';
import Card from '../components/UI/Card.jsx';
import Table from '../components/UI/Table.jsx';
import Button from '../components/UI/Button.jsx';
import Pagination from '../components/UI/Pagination.jsx';
import Modal from '../components/UI/Modal.jsx';
import {
  NOTIFICATION_TYPE_LABELS_AR,
  NOTIFICATION_LEVEL_BADGE,
} from '../utils/constants.js';

const fmtDT = (v) => {
  if (!v) return '—';
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return (
      d.toLocaleDateString('en-GB') +
      ' ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return '—';
  }
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    pagination,
    loading,
    error,
    fetchNotifications,
    markRead,
    markAllRead,
    removeOne,
    removeAllRead,
  } = useNotifications();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [isReadFilter, setIsReadFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  useEffect(() => {
    const params = { page, limit };
    if (isReadFilter !== 'all') params.isRead = isReadFilter;
    if (typeFilter) params.type = typeFilter;
    fetchNotifications(params);
  }, [page, limit, isReadFilter, typeFilter, fetchNotifications]);

  const handleRowClick = async (row) => {
    try {
      if (!row.isRead) await markRead(row._id);
    } catch {
      /* ignore */
    }
    if (row.link) navigate(row.link);
  };

  const handleDelete = async (e, row) => {
    e.stopPropagation();
    try {
      await removeOne(row._id);
    } catch {
      /* ignore */
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllRead();
    } catch {
      /* ignore */
    }
  };

  const handleConfirmDeleteAll = async () => {
    try {
      await removeAllRead();
    } finally {
      setConfirmDeleteAll(false);
    }
  };

  const columns = [
    {
      key: 'isRead',
      label: '',
      width: '40px',
      align: 'center',
      render: (row) =>
        !row.isRead ? (
          <span
            className="w-2.5 h-2.5 rounded-full bg-primary-600 inline-block"
            title="غير مقروء"
          />
        ) : (
          <Check size={16} className="text-neutral-300 mx-auto" />
        ),
    },
    {
      key: 'title',
      label: 'العنوان',
      render: (row) => (
        <div>
          <p
            className={`text-sm ${
              !row.isRead ? 'font-bold text-neutral-900' : 'text-neutral-700'
            }`}
          >
            {row.title}
          </p>
          <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">
            {row.message}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      label: 'النوع',
      align: 'center',
      render: (row) => (
        <span
          className={`text-[11px] px-2 py-0.5 rounded inline-block ${
            NOTIFICATION_LEVEL_BADGE[row.level] || 'bg-neutral-100 text-neutral-700'
          }`}
        >
          {NOTIFICATION_TYPE_LABELS_AR[row.type] || row.type}
        </span>
      ),
    },
    {
      key: 'createdAt',
      label: 'التاريخ',
      align: 'end',
      render: (row) => (
        <span className="text-xs numeric">{fmtDT(row.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      label: 'إجراءات',
      align: 'center',
      width: '120px',
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          {!row.isRead && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                markRead(row._id).catch(() => {});
              }}
              title="تعليم كمقروء"
              className="p-1.5 rounded text-primary-700 hover:bg-primary-50 transition-colors"
            >
              <Check size={16} />
            </button>
          )}
          {row.link && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(row.link);
              }}
              title="فتح"
              className="p-1.5 rounded text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              <ExternalLink size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => handleDelete(e, row)}
            title="حذف"
            className="p-1.5 rounded text-danger-700 hover:bg-danger-50 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card
        title="الإشعارات"
        subtitle={
          unreadCount > 0
            ? `لديك ${unreadCount} إشعاراً غير مقروء`
            : 'لا إشعارات غير مقروءة'
        }
        icon={Bell}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={CheckCheck}
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
            >
              تعليم الكل كمقروء
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              onClick={() => setConfirmDeleteAll(true)}
            >
              حذف المقروءة
            </Button>
          </div>
        }
        noPadding
      >
        {/* Filters */}
        <div className="p-4 border-b border-neutral-200 flex flex-col md:flex-row gap-3">
          <div className="w-full md:w-48">
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              الحالة
            </label>
            <select
              value={isReadFilter}
              onChange={(e) => {
                setPage(1);
                setIsReadFilter(e.target.value);
              }}
              className="w-full px-2 py-2 rounded border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              <option value="all">الكل</option>
              <option value="false">غير مقروء</option>
              <option value="true">مقروء</option>
            </select>
          </div>

          <div className="w-full md:w-64">
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              النوع
            </label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setPage(1);
                setTypeFilter(e.target.value);
              }}
              className="w-full px-2 py-2 rounded border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              <option value="">كل الأنواع</option>
              {Object.entries(NOTIFICATION_TYPE_LABELS_AR).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="p-4">
          <Table
            columns={columns}
            data={notifications}
            loading={loading}
            onRowClick={handleRowClick}
            emptyMessage={error ? `خطأ: ${error}` : 'لا توجد إشعارات.'}
          />
        </div>

        {/* Pagination — التوقيع الفعلي: page/limit/total */}
        {pagination.total > 0 && (
          <div className="px-4 pb-4">
            <Pagination
              page={page}
              limit={limit}
              total={pagination.total}
              onPageChange={setPage}
              onLimitChange={(l) => {
                setPage(1);
                setLimit(l);
              }}
            />
          </div>
        )}
      </Card>

      <Modal
        isOpen={confirmDeleteAll}
        onClose={() => setConfirmDeleteAll(false)}
        title="حذف الإشعارات المقروءة"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDeleteAll(false)}>
              إلغاء
            </Button>
            <Button variant="danger" onClick={handleConfirmDeleteAll}>
              حذف
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-700">
          سيتم حذف كل الإشعارات المقروءة نهائياً. لا يمكن التراجع. هل أنت متأكد؟
        </p>
      </Modal>
    </div>
  );
}