/**
 * @file ToastContext.jsx
 * @description Context API لإدارة الإشعارات (Toasts)
 *
 * لماذا هذا الملف:
 * - إدارة موحّدة للإشعارات في كل التطبيق.
 * - إضافة/إزالة الإشعارات من أي مكان.
 * - دعم 4 أنواع (success, error, warning, info).
 */

import { createContext, useCallback, useMemo, useState } from 'react';

// ═══════════════════════════════════════════════
// 1. إنشاء Context
// ═══════════════════════════════════════════════
export const ToastContext = createContext(null);

// ═══════════════════════════════════════════════
// 2. مُولّد معرّف فريد
// ═══════════════════════════════════════════════
let toastCounter = 0;

function generateToastId() {
  toastCounter += 1;
  return `toast-${Date.now()}-${toastCounter}`;
}

// ═══════════════════════════════════════════════
// 3. Provider
// ═══════════════════════════════════════════════
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  // ✅ إزالة إشعار
  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // ✅ إضافة إشعار (عام)
  const addToast = useCallback(
    ({ type = 'info', message, title, duration = 4000 }) => {
      const id = generateToastId();
      const newToast = { id, type, message, title, duration };

      setToasts((prev) => [...prev, newToast]);

      // ✅ إزالة تلقائية بعد المدة
      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }

      return id;
    },
    [removeToast]
  );

  // ✅ دوال مختصرة لكل نوع
  const success = useCallback(
    (message, options = {}) => addToast({ type: 'success', message, ...options }),
    [addToast]
  );

  const error = useCallback(
    (message, options = {}) => addToast({ type: 'error', message, duration: 6000, ...options }),
    [addToast]
  );

  const warning = useCallback(
    (message, options = {}) => addToast({ type: 'warning', message, duration: 5000, ...options }),
    [addToast]
  );

  const info = useCallback(
    (message, options = {}) => addToast({ type: 'info', message, ...options }),
    [addToast]
  );

  // ✅ إزالة كل الإشعارات
  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  const value = useMemo(
    () => ({
      toasts,
      addToast,
      removeToast,
      success,
      error,
      warning,
      info,
      clearAll,
    }),
    [toasts, addToast, removeToast, success, error, warning, info, clearAll]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}