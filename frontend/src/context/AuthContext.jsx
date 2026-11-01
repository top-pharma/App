/**
 * @file AuthContext.jsx
 * @description Context API لحالة المصادقة
 *
 * ⚠️ B2 (Phase B): يُضيف permissions + hasPermission
 *    لدعم RBAC على مستوى الواجهة بدون hardcoded roles.
 */

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  login as loginAPI,
  logout as logoutAPI,
  getCurrentUser,
} from '../api/authAPI.js';
import { ROLE_LABELS_AR, STORAGE_KEYS } from '../utils/constants.js';

export const AuthContext = createContext(null);

function readUserFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.email) return parsed;
    return null;
  } catch (e) {
    console.warn('فشل قراءة المستخدم من localStorage:', e);
    return null;
  }
}

function readTokenFromStorage() {
  try {
    return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  } catch (e) {
    return null;
  }
}

const IDLE_TIMEOUT_MINUTES = Number(import.meta.env.VITE_SESSION_IDLE_TIMEOUT) || 30;
const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readUserFromStorage());
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const token = readTokenFromStorage();
    const storedUser = readUserFromStorage();
    return Boolean(token && storedUser);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const idleTimerRef = useRef(null);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const resetIdleTimer = useCallback(() => {
    clearIdleTimer();
    if (!isAuthenticated) return;

    idleTimerRef.current = setTimeout(() => {
      try {
        logoutAPI();
      } catch {
        // نتجاهل
      }
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
      setUser(null);
      setIsAuthenticated(false);
    }, IDLE_TIMEOUT_MS);
  }, [isAuthenticated, clearIdleTimer]);

  const persistSession = useCallback((userData, accessToken, refreshToken) => {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));
    setUser(userData);
    setIsAuthenticated(true);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    setUser(null);
    setIsAuthenticated(false);
    setError(null);
    clearIdleTimer();
  }, [clearIdleTimer]);

  const login = useCallback(
    async (email, password) => {
      setLoading(true);
      setError(null);
      try {
        const data = await loginAPI({ email, password });
        persistSession(data.user, data.accessToken, data.refreshToken);
        return { success: true, user: data.user };
      } catch (err) {
        const message = err?.message || 'فشل تسجيل الدخول';
        setError(message);
        return { success: false, error: message };
      } finally {
        setLoading(false);
      }
    },
    [persistSession]
  );

  const logout = useCallback(async () => {
    try {
      await logoutAPI();
    } catch {
      // نتجاهل
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const refreshUserData = useCallback(async () => {
    const token = readTokenFromStorage();

    if (!token) {
      clearSession();
      return;
    }

    try {
      const userData = await getCurrentUser();
      if (userData && userData.email) {
        setUser(userData);
        setIsAuthenticated(true);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));
      }
    } catch (err) {
      const errorCode = err?.error?.code || err?.code;
      const status = err?.status || err?.response?.status;

      if (
        status === 401 ||
        errorCode === 'TOKEN_INVALID' ||
        errorCode === 'TOKEN_EXPIRED' ||
        errorCode === 'UNAUTHORIZED'
      ) {
        clearSession();
      }
    }
  }, [clearSession]);

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshUserData();
    }, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    const handleActivity = () => {
      resetIdleTimer();
    };

    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    resetIdleTimer();

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      clearIdleTimer();
    };
  }, [isAuthenticated, resetIdleTimer, clearIdleTimer]);

  const value = useMemo(() => {
    const userName =
      typeof user?.name === 'string' ? user.name : user?.name?.ar || null;
    const userRole =
      typeof user?.role === 'string' ? user.role : user?.role?.name || null;
    const userRoleAr = ROLE_LABELS_AR[userRole] || userRole;

    // ⚠️ B2: استخراج الصلاحيات
    const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
    const isAdminRole = userRole === 'admin';

    /**
     * فحص الصلاحية (Fail-safe: أي خطأ → false إلا admin).
     * @param {string} perm
     * @returns {boolean}
     */
    const hasPermission = (perm) => {
      if (!perm) return false;
      if (isAdminRole) return true;
      if (permissions.includes('*')) return true;
      return permissions.includes(perm);
    };

    return {
      // ✅ الحالة
      user,
      loading,
      error,
      isAuthenticated,

      // ✅ الدوال
      login,
      logout,
      fetchCurrentUser: refreshUserData,

      // ✅ البيانات المُشتقّة
      userName,
      userRole,
      userRoleAr,

      // ⚠️ B2: الصلاحيات
      permissions,
      hasPermission,

      // ✅ مساعدات (backward-compatible)
      hasRole: (roleName) => userRole === roleName,
      isAdmin: isAdminRole,
      isStorekeeper: userRole === 'storekeeper',
      isAccountant: userRole === 'accountant',
      isSalesRep: userRole === 'sales_rep',
      isPharmacy: userRole === 'pharmacy',
    };
  }, [user, loading, error, isAuthenticated, login, logout, refreshUserData]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}