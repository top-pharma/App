/**
 * @file useItems.js
 * @description Hook مختصر للوصول إلى ItemsContext.
 */

import { useContext } from 'react';

import { ItemsContext } from '../context/ItemsContext.jsx';

export function useItems() {
  const context = useContext(ItemsContext);
  if (!context) {
    throw new Error(
      'useItems must be used within ItemsProvider. تأكد من تغليف المكون بـ <ItemsProvider>.'
    );
  }
  return context;
}

export default useItems;