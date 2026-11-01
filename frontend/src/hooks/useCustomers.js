/**
 * @file useCustomers.js
 * @description Hook مختصر للوصول إلى CustomersContext.
 */

import { useContext } from 'react';

import { CustomersContext } from '../context/CustomersContext.jsx';

/**
 * Hook للوصول إلى حالة الصيدليات ودوالها.
 * @returns {Object}
 * @throws {Error} إذا استُخدم خارج CustomersProvider
 */
export function useCustomers() {
  const context = useContext(CustomersContext);

  if (!context) {
    throw new Error(
      'useCustomers must be used within CustomersProvider. ' +
        'تأكد من تغليف المكون بـ <CustomersProvider>.'
    );
  }

  return context;
}

export default useCustomers;