/**
 * useCashFunds.js
 *
 * Hook مختصر للوصول إلى CashFundsContext.
 * يُستخدم بدلاً من استيراد useCashFundsContext مباشرة.
 */

import { useCashFundsContext } from '../context/CashFundsContext.jsx';

/**
 * @returns {Object} سياق الصناديق النقدية
 */
export const useCashFunds = () => {
  return useCashFundsContext();
};

export default useCashFunds;