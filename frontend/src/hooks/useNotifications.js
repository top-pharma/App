/**
 * useNotifications.js
 * Hook مختصر للوصول إلى NotificationsContext.
 */

import { useNotificationsContext } from '../context/NotificationsContext.jsx';

export const useNotifications = () => {
  return useNotificationsContext();
};

export default useNotifications;