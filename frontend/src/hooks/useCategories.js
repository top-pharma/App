/**
 * @file useCategories.js
 * @description Hook مختصر للوصول إلى CategoriesContext.
 */

import { useContext } from 'react';

import { CategoriesContext } from '../context/CategoriesContext.jsx';

/**
 * Hook للوصول إلى حالة التصنيفات ودوالها.
 * @returns {Object}
 * @throws {Error} إذا استُخدم خارج CategoriesProvider
 */
export function useCategories() {
  const context = useContext(CategoriesContext);

  if (!context) {
    throw new Error(
      'useCategories must be used within CategoriesProvider. ' +
        'تأكد من تغليف المكون بـ <CategoriesProvider>.'
    );
  }

  return context;
}

export default useCategories;