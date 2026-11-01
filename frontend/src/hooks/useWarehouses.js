/**
 * @file useWarehouses.js
 * @description Hook مختصر للوصول إلى WarehousesContext.
 */

import { useContext } from 'react';

import { WarehousesContext } from '../context/WarehousesContext.jsx';

/**
 * Hook للوصول إلى حالة المخازن ودوالها.
 * @returns {Object}
 * @throws {Error} إذا استُخدم خارج WarehousesProvider
 */
export function useWarehouses() {
  const context = useContext(WarehousesContext);

  if (!context) {
    throw new Error(
      'useWarehouses must be used within WarehousesProvider. ' +
        'تأكد من تغليف المكون بـ <WarehousesProvider>.'
    );
  }

  return context;
}

export default useWarehouses;