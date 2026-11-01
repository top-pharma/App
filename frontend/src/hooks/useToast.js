/**
 * @file useToast.js
 * @description Hook مختصر للوصول إلى ToastContext
 *
 * لماذا هذا الملف:
 * - واجهة نظيفة للمكونات.
 * - يرمي خطأ واضحاً إذا استُخدم خارج ToastProvider.
 */

import { useContext } from 'react';

import { ToastContext } from '../context/ToastContext.jsx';

/**
 * Hook للإشعارات
 * @returns {Object} دوال الإشعارات
 *
 * @example
 * const toast = useToast();
 * toast.success('تم الحفظ بنجاح');
 * toast.error('حدث خطأ');
 */
export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error(
      'useToast must be used within ToastProvider. ' +
        'تأكد من تغليف المكون بـ <ToastProvider>.'
    );
  }

  return context;
}

export default useToast;