/**
 * @file ToastContext.jsx
 * @description Context API لإدارة الإشعارات (Toasts)
 *
 * ⚠️ Phase A (2026-11-07):
 * - أُضيف `showToast(message, type)` كواجهة موحّدة للتوافق
 *   مع كل المكونات التي تستخدم `useToast().showToast`.
 * - `showToast` يُغلّف `success/error/warning/info` الداخلية.
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

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    ({ type = 'info', message, title, duration = 4000 }) => {
      const id = generateToastId();
      const newToast = { id, type, message, title, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }

      return id;
    },
    [removeToast]
  );

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

  /**
   * ⚠️ Phase A: واجهة موحّدة للتوافق مع المكونات التي تستخدم `showToast`.
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} [type='info']
   * @param {Object} [options]
   */
  const showToast = useCallback(
    (message, type = 'info', options = {}) => {
      if (!message) return null;
      switch (type) {
        case 'success':
          return success(message, options);
        case 'error':
          return error(message, options);
        case 'warning':
          return warning(message, options);
        case 'info':
        default:
          return info(message, options);
      }
    },
    [success, error, warning, info]
  );

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
      showToast,
      clearAll,
    }),
    [toasts, addToast, removeToast, success, error, warning, info, showToast, clearAll]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}