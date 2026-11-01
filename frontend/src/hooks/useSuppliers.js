/**
 * @file useSuppliers.js
 * @description Hook مختصر للوصول إلى SuppliersContext.
 */

import { useContext } from 'react';

import { SuppliersContext } from '../context/SuppliersContext.jsx';

/**
 * Hook للوصول إلى حالة الموردين ودوالها.
 * @returns {Object}
 * @throws {Error} إذا استُخدم خارج SuppliersProvider
 */
export function useSuppliers() {
  const context = useContext(SuppliersContext);

  if (!context) {
    throw new Error(
      'useSuppliers must be used within SuppliersProvider. ' +
        'تأكد من تغليف المكون بـ <SuppliersProvider>.'
    );
  }

  return context;
}

export default useSuppliers;