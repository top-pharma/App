/**
 * useBankAccounts.js
 *
 * Hook مختصر للوصول إلى BankAccountsContext.
 */

import { useBankAccountsContext } from '../context/BankAccountsContext.jsx';

/**
 * @returns {Object} سياق الحسابات البنكية
 */
export const useBankAccounts = () => {
  return useBankAccountsContext();
};

export default useBankAccounts;