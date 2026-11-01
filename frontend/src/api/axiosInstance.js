/**
 * @file axiosInstance.js
 * @description نسخة Axios مركزية مع Interceptors
 *
 * لماذا هذا الملف:
 * - مكان واحد لإعدادات Axios.
 * - إضافة Access Token تلقائياً.
 * - معالجة 401 (انتهاء الجلسة) → refresh تلقائي.
 * - معالجة الأخطاء بشكل موحد.
 */

import axios from 'axios';

import { STORAGE_KEYS } from '../utils/constants.js';

// ═══════════════════════════════════════════════
// 1. الإعدادات الأساسية
// ═══════════════════════════════════════════════
const BASE_URL = import.meta.env.VITE_API_URL || '/api';
const TIMEOUT = 15000; // 15 ثانية

// ═══════════════════════════════════════════════
// 2. إنشاء Instance
// ═══════════════════════════════════════════════
const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  withCredentials: false, // نستخدم JWT في Header (لا Cookies)
});

// ═══════════════════════════════════════════════
// 3. Request Interceptor
// ═══════════════════════════════════════════════
/**
 * يضيف Access Token تلقائياً لكل طلب
 * (إلا إذا كان الطلب لا يحتاج مصادقة)
 */
axiosInstance.interceptors.request.use(
  (config) => {
    // ✅ إضافة Access Token
    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);

    if (token && !config.skipAuth) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // ✅ إضافة ترويسة اللغة
    config.headers['Accept-Language'] = 'ar';

    return config;
  },
  (error) => {
    // ⚠️ خطأ في الطلب → نرفضه
    return Promise.reject(error);
  }
);

// ═══════════════════════════════════════════════
// 4. Response Interceptor
// ═══════════════════════════════════════════════
/**
 * معالجة الاستجابات:
 * - 401 → محاولة refresh تلقائي (مرة واحدة)
 * - أخطاء أخرى → تمرير عادي
 */
let isRefreshing = false;
let failedQueue = [];

/**
 * معالجة الطلبات المنتظرة بعد refresh
 * @param {Error|null} error
 * @param {string|null} token
 */
const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

axiosInstance.interceptors.response.use(
  // ✅ استجابة ناجحة → نمررها كما هي
  (response) => response,

  // ❌ استجابة خطأ → نعالجها
  async (error) => {
    const originalRequest = error.config;

    // ✅ إذا لم يكن هناك استجابة (شبكة/مهلة)
    if (!error.response) {
      return Promise.reject({
        code: 'NETWORK_ERROR',
        message: 'تعذّر الاتصال بالخادم. تحقق من الإنترنت.',
        originalError: error,
      });
    }

    const { status } = error.response;

    // ═══════════════════════════════════════════
    // 401 Unauthorized → refresh تلقائي
    // ═══════════════════════════════════════════
    if (status === 401 && !originalRequest._retry && !originalRequest.skipAuth) {
      // ⚠️ إذا كان الطلب نفسه refresh → لا نعيد المحاولة
      if (originalRequest.url?.includes('/auth/refresh')) {
        // ✅ فشل refresh → نخرج المستخدم
        localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER);

        // ✅ نعيد التوجيه لصفحة الدخول (إذا لم نكن فيها)
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }

        return Promise.reject(error.response.data);
      }

      // ✅ إذا كان refresh جارياً → ننتظر
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return axiosInstance(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);

        if (!refreshToken) {
          throw new Error('لا يوجد refresh token');
        }

        // ✅ نطلب refresh
        const { data } = await axios.post(
          `${BASE_URL}/auth/refresh`,
          { refreshToken },
          { headers: { 'Content-Type': 'application/json' } }
        );

        // ✅ نحفظ التوكنات الجديدة
        const newAccessToken = data.data.accessToken;
        const newRefreshToken = data.data.refreshToken;

        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, newAccessToken);
        localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, newRefreshToken);

        // ✅ نحدّث الترويسة
        axiosInstance.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

        // ✅ نعالج الطلبات المنتظرة
        processQueue(null, newAccessToken);

        // ✅ نعيد الطلب الأصلي
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        // ❌ فشل refresh → نخرج المستخدم
        processQueue(refreshError, null);

        localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER);

        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // ═══════════════════════════════════════════
    // أخطاء أخرى → نمررها
    // ═══════════════════════════════════════════
    return Promise.reject(error.response.data || error);
  }
);

export default axiosInstance;