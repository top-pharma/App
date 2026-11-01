/**
 * @file useDeliveryNotes.js
 * @description Hook مختصر للوصول إلى DeliveryNotesContext.
 *
 * لماذا هذا الملف؟
 * - يوفّر واجهة نظيفة للمكونات (بدل استيراد useContext + DeliveryNotesContext).
 * - يرمي خطأً واضحاً إذا استُخدم خارج DeliveryNotesProvider (يسهّل التشخيص).
 * - يتبع نفس نمط useInvoices و useStock و useCustomers.
 */

import { useContext } from 'react';

import { DeliveryNotesContext } from '../context/DeliveryNotesContext.jsx';

/**
 * Hook للوصول إلى حالة إيصالات التسليم ودوالها.
 * @returns {Object}
 * @throws {Error} إذا استُخدم خارج DeliveryNotesProvider
 */
export function useDeliveryNotes() {
  const context = useContext(DeliveryNotesContext);

  if (!context) {
    throw new Error(
      'useDeliveryNotes must be used within DeliveryNotesProvider. ' +
        'تأكد من تغليف المكون بـ <DeliveryNotesProvider>.'
    );
  }

  return context;
}

export default useDeliveryNotes;