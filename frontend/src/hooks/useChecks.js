/**
 * useChecks.js
 *
 * Hook مختصر للوصول إلى ChecksContext.
 */

import { useChecksContext } from '../context/ChecksContext.jsx';

/**
 * @returns {Object} سياق الشيكات
 */
export const useChecks = () => {
  return useChecksContext();
};

export default useChecks;