/**
 * @file NotificationsContext.jsx
 * @description Context الإشعارات — Phase 5.
 *
 * نمط متّبع: نفس ChecksContext (Phase 3).
 * - Provider يُحمّل unreadCount عند الدخول.
 * - الصفحة/Bell يطلبان القائمة عند الحاجة (لا تحميل مسبق مزدوج).
 */

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useContext,
} from 'react';

import notificationsAPI from '../api/notificationsAPI.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';

export const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /* ── جلب القائمة ── */
  const fetchNotifications = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const result = await notificationsAPI.getNotifications({
        page: params.page ?? 1,
        limit: params.limit ?? 20,
        ...params,
      });

      if (result?.success) {
        setNotifications(result.data || []);
        setPagination({
          page: result.pagination?.page ?? 1,
          limit: result.pagination?.limit ?? 20,
          total: result.pagination?.total ?? 0,
        });
        if (result.meta?.unreadCount !== undefined) {
          setUnreadCount(result.meta.unreadCount);
        }
      }
    } catch (err) {
      // ⚠️ axiosInstance يُعيد { success, error } مباشرة
      setError(err?.error?.message || err?.message || 'فشل جلب الإشعارات.');
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── جلب عدد غير المقروء (polling friendly — صامت) ── */
  const fetchUnreadCount = useCallback(async () => {
    try {
      const result = await notificationsAPI.getUnreadCount();
      if (result?.count !== undefined) setUnreadCount(result.count);
    } catch {
      // صامت — لا نُزعج المستخدم بفشل polling
    }
  }, []);

  /* ── تعليم إشعار واحد ── */
  const markRead = useCallback(async (id) => {
    const target = notifications.find((n) => n._id === id);
    await notificationsAPI.markAsRead(id);
    setNotifications((prev) =>
      prev.map((n) =>
        n._id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
      )
    );
    if (target && !target.isRead) {
      setUnreadCount((c) => Math.max(0, c - 1));
    }
  }, [notifications]);

  /* ── تعليم الكل ── */
  const markAllRead = useCallback(async () => {
    const result = await notificationsAPI.markAllAsRead();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
    );
    setUnreadCount(0);
    if (toast?.success) toast.success(result?.message || 'تم تعليم كل الإشعارات كمقروءة.');
    return result;
  }, [toast]);

  /* ── حذف واحد ── */
  const removeOne = useCallback(async (id) => {
    const target = notifications.find((n) => n._id === id);
    await notificationsAPI.deleteNotification(id);
    setNotifications((prev) => prev.filter((n) => n._id !== id));
    if (target && !target.isRead) {
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    if (toast?.success) toast.success('تم حذف الإشعار.');
  }, [notifications, toast]);

  /* ── حذف كل المقروءة ── */
  const removeAllRead = useCallback(async () => {
    const result = await notificationsAPI.deleteAllRead();
    setNotifications((prev) => prev.filter((n) => !n.isRead));
    // drop total
    setPagination((p) => ({
      ...p,
      total: Math.max(0, (p.total || 0) - (result?.data?.deletedCount || 0)),
    }));
    if (toast?.success) toast.success(result?.message || 'تم حذف الإشعارات المقروءة.');
    return result;
  }, [toast]);

  /* ── تحميل أوليّ: unreadCount فقط ── */
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setPagination({ page: 1, limit: 20, total: 0 });
      return;
    }
    fetchUnreadCount();
  }, [user, fetchUnreadCount]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      pagination,
      loading,
      error,
      fetchNotifications,
      fetchUnreadCount,
      markRead,
      markAllRead,
      removeOne,
      removeAllRead,
    }),
    [
      notifications,
      unreadCount,
      pagination,
      loading,
      error,
      fetchNotifications,
      fetchUnreadCount,
      markRead,
      markAllRead,
      removeOne,
      removeAllRead,
    ]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsContext() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotificationsContext must be used within NotificationsProvider');
  }
  return ctx;
}

export default NotificationsContext;