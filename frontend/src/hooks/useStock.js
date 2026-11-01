/**
 * @file useStock.js
 * @description Hook مختصر للوصول إلى StockContext.
 */

import { useContext } from 'react';

import { StockContext } from '../context/StockContext.jsx';

/**
 * Hook للوصول إلى حالة المخزون ودوالها.
 * @returns {Object}
 * @throws {Error} إذا استُخدم خارج StockProvider
 */
export function useStock() {
  const context = useContext(StockContext);

  if (!context) {
    throw new Error(
      'useStock must be used within StockProvider. ' +
        'تأكد من تغليف المكون بـ <StockProvider>.'
    );
  }

  return context;
}

export default useStock;