/**
 * @file NotificationBell.jsx
 * @description جرس الإشعارات في الترويسة — Phase 5.
 *
 * - polling كل 30 ثانية (unreadCount فقط).
 * - dropdown بآخر 8 إشعارات عند الفتح.
 * - إغلاق عند النقر خارجاً.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ExternalLink } from 'lucide-react';

import { useNotifications } from '../../hooks/useNotifications.js';
import {
  NOTIFICATION_TYPE_LABELS_AR,
  NOTIFICATION_LEVEL_BADGE,
} from '../../utils/constants.js';

const POLL_INTERVAL_MS = 30000;
const BELL_LIST_LIMIT = 8;

/* formatter inline — لا نعتمد على توقيع formatters.js غير المؤكد */
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

export default function NotificationBell() {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    fetchNotifications,
    fetchUnreadCount,
    markRead,
    markAllRead,
  } = useNotifications();

  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  /* ── polling ── */
  useEffect(() => {
    const id = setInterval(() => {
      fetchUnreadCount();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchUnreadCount]);

  /* ── إغلاق عند النقر خارجاً ── */
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  /* ── تبديل الفتح + جلب عند الفتح ── */
  const toggleOpen = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      try {
        await fetchNotifications({ page: 1, limit: BELL_LIST_LIMIT });
      } catch {
        // صامت
      }
    }
  };

  const handleClickNotification = async (n) => {
    try {
      if (!n.isRead) await markRead(n._id);
    } catch {
      // صامت
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const handleMarkAll = async (e) => {
    e.stopPropagation();
    try {
      await markAllRead();
    } catch {
      // صامت
    }
  };

  const handleViewAll = () => {
    setOpen(false);
    navigate('/notifications');
  };

  const recent = notifications.slice(0, BELL_LIST_LIMIT);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={toggleOpen}
        className="p-2 rounded-md text-neutral-600 hover:bg-neutral-100 transition-colors relative"
        aria-label="الإشعارات"
        title="الإشعارات"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-danger-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-neutral-200 z-30 max-h-[70vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-100 flex-shrink-0">
            <p className="text-sm font-bold text-neutral-900">الإشعارات</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="text-xs text-primary-700 hover:underline flex items-center gap-1"
              >
                <CheckCheck size={14} />
                تعليم الكل
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1 scrollbar-thin">
            {recent.length === 0 ? (
              <div className="p-6 text-center text-sm text-neutral-500">
                لا توجد إشعارات.
              </div>
            ) : (
              recent.map((n) => (
                <button
                  type="button"
                  key={n._id}
                  onClick={() => handleClickNotification(n)}
                  className={`w-full text-right px-4 py-3 border-b border-neutral-100 hover:bg-neutral-50 transition-colors ${
                    !n.isRead ? 'bg-primary-50/40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-neutral-900 truncate">
                      {n.title}
                    </p>
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-primary-600 flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                  <p className="text-xs text-neutral-600 mt-1 line-clamp-2">
                    {n.message}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        NOTIFICATION_LEVEL_BADGE[n.level] ||
                        'bg-neutral-100 text-neutral-700'
                      }`}
                    >
                      {NOTIFICATION_TYPE_LABELS_AR[n.type] || n.type}
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      {fmtDT(n.createdAt)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-2 border-t border-neutral-100 flex-shrink-0">
            <button
              type="button"
              onClick={handleViewAll}
              className="w-full py-2 text-center text-sm font-medium text-primary-700 hover:bg-primary-50 rounded-md flex items-center justify-center gap-1"
            >
              <ExternalLink size={14} />
              عرض كل الإشعارات
            </button>
          </div>
        </div>
      )}
    </div>
  );
}