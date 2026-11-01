/**
 * @file useInvoices.js
 * @description Hook مختصر للوصول إلى InvoicesContext.
 *
 * لماذا هذا الملف؟
 * - يوفّر واجهة نظيفة للمكونات (بدل استيراد useContext + InvoicesContext).
 * - يرمي خطأً واضحاً إذا استُخدم خارج InvoicesProvider (يسهّل التشخيص).
 * - يتبع نفس نمط useStock و useCustomers.
 */

import { useContext } from 'react';

import { InvoicesContext } from '../context/InvoicesContext.jsx';

/**
 * Hook للوصول إلى حالة الفواتير ودوالها.
 * @returns {Object}
 * @throws {Error} إذا استُخدم خارج InvoicesProvider
 */
export function useInvoices() {
  const context = useContext(InvoicesContext);

  if (!context) {
    throw new Error(
      'useInvoices must be used within InvoicesProvider. ' +
        'تأكد من تغليف المكون بـ <InvoicesProvider>.'
    );
  }

  return context;
}

export default useInvoices;