/**
 * @file useCustomerReturns.js
 * @description Hook مختصر للوصول إلى CustomerReturnsContext.
 *
 * لماذا هذا الملف؟
 * - يوفّر واجهة نظيفة للمكونات (بدل استيراد useContext + CustomerReturnsContext).
 * - يرمي خطأً واضحاً إذا استُخدم خارج CustomerReturnsProvider (يسهّل التشخيص).
 * - يتبع نفس نمط useInvoices و useDeliveryNotes و useStock.
 */

import { useContext } from 'react';

import { CustomerReturnsContext } from '../context/CustomerReturnsContext.jsx';

/**
 * Hook للوصول إلى حالة مرتجعات العملاء ودوالها.
 * @returns {Object}
 * @throws {Error} إذا استُخدم خارج CustomerReturnsProvider
 */
export function useCustomerReturns() {
  const context = useContext(CustomerReturnsContext);

  if (!context) {
    throw new Error(
      'useCustomerReturns must be used within CustomerReturnsProvider. ' +
        'تأكد من تغليف المكون بـ <CustomerReturnsProvider>.'
    );
  }

  return context;
}

export default useCustomerReturns;