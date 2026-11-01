/**
 * @file useAuth.js
 * @description Hook مختصر للوصول إلى AuthContext
 *
 * لماذا هذا الملف:
 * - يوفّر واجهة نظيفة للمكونات.
 * - يرمي خطأ واضحاً إذا استُخدم خارج AuthProvider.
 */

import { useContext } from 'react';

import { AuthContext } from '../context/AuthContext.jsx';

/**
 * Hook للوصول إلى حالة المصادقة
 * @returns {Object} حالة المصادقة + الدوال
 * @throws {Error} إذا استُخدم خارج AuthProvider
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth must be used within AuthProvider. ' +
        'تأكد من تغليف المكون بـ <AuthProvider>.'
    );
  }

  return context;
}

export default useAuth;