/**
 * @file useIdleTimeout.js
 * @description
 * Hook لتسجيل الخروج التلقائي بعد فترة خمول.
 *
 * ✅ v10.11 (2026-11-16):
 * - يقرأ idleTimeoutMinutes من Settings (عبر API).
 * - fallback: VITE_SESSION_IDLE_TIMEOUT (30 دقيقة).
 * - يُسجّل أحداث: mousemove, keydown, click, scroll, touchstart.
 * - يُصفّر المؤقّت عند أي نشاط.
 * - عند انتهاء المهلة: logout() + redirect /login.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from './useAuth.js';
import axiosInstance from '../api/axiosInstance.js';

const DEFAULT_IDLE_MINUTES = 30;
const EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

export function useIdleTimeout() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const timerRef = useRef(null);
  const timeoutRef = useRef(DEFAULT_IDLE_MINUTES * 60 * 1000);

  // ─── جلب idleTimeoutMinutes من Settings ───
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axiosInstance.get('/settings');
        const minutes = data?.data?.security?.idleTimeoutMinutes;
        if (typeof minutes === 'number' && minutes > 0) {
          timeoutRef.current = minutes * 60 * 1000;
          resetTimer();
        }
      } catch {
        // fallback: default
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── إعادة تعيين المؤقّت ───
  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await logout?.();
      } catch {
        // ignore
      }
      navigate('/login', { replace: true });
    }, timeoutRef.current);
  };

  // ─── إعداد المستمعين ───
  useEffect(() => {
    // ابدأ المؤقّت
    resetTimer();

    // استمع للأحداث
    const handler = () => resetTimer();
    EVENTS.forEach((ev) => window.addEventListener(ev, handler, { passive: true }));

    return () => {
      EVENTS.forEach((ev) => window.removeEventListener(ev, handler));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default useIdleTimeout;