/**
 * @file LoginPage.jsx
 * @description
 * صفحة تسجيل الدخول — Phase 2.5.
 *
 * لماذا هذا الملف؟
 * - نقطة الدخول الرئيسية للتطبيق.
 * - تستخدم `AuthContext.login` (الذي يُفوّض إلى authAPI).
 * - تحترم `location.state.from` للعودة إلى المسار المطلوب بعد الدخول.
 * - `PublicRoute` يمنع المستخدم المسجل من رؤيتها مجدداً.
 * - تعرض رسائل خطأ واضحة (من الخادم أو محلياً).
 */

import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogIn, Mail, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';

import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';

import Button from '../components/UI/Button.jsx';
import Input from '../components/UI/Input.jsx';

function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // المسار المطلوب بعد الدخول (من ProtectedRoute) — افتراضي: الرئيسية
  const redirectTo = location.state?.from || '/';

  // إن كان المستخدم مسجلاً بالفعل (حالة نادرة — PublicRoute يعالجها)
  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, navigate, redirectTo]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('البريد الإلكتروني وكلمة المرور مطلوبان.');
      return;
    }

    setLoading(true);
    const result = await login(email.trim().toLowerCase(), password);
    setLoading(false);

    if (result.success) {
      toast.success(`مرحباً ${result.user?.name || 'بك'}!`);
      navigate(redirectTo, { replace: true });
    } else {
      setError(result.error || 'فشل تسجيل الدخول.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50 p-4" dir="rtl">
      <div className="w-full max-w-md">
        {/* ─── الشعار ─── */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-800 text-white mb-4 shadow-lg">
            <LogIn size={28} />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">TOP PHARMA</h1>
          <p className="text-sm text-neutral-600 mt-1">
            نظام إدارة شركة الأدوية
          </p>
        </div>

        {/* ─── البطاقة ─── */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-lg p-6 sm:p-8">
          <h2 className="text-xl font-bold text-neutral-900 mb-1">
            تسجيل الدخول
          </h2>
          <p className="text-sm text-neutral-500 mb-6">
            أدخل بيانات حسابك للمتابعة
          </p>

          {error && (
            <div className="mb-4 flex items-start gap-2 bg-danger-50 border border-danger-200 rounded-md p-3 text-sm text-danger-800">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block mb-1.5 text-sm font-medium text-neutral-700">
                البريد الإلكتروني
              </label>
              <div className="relative">
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder="admin@pharma-system.local"
                  className="w-full pr-10 pl-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 disabled:bg-neutral-100"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="block mb-1.5 text-sm font-medium text-neutral-700">
                كلمة المرور
              </label>
              <div className="relative">
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full pr-10 pl-10 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 disabled:bg-neutral-100"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  tabIndex={-1}
                  aria-label={showPassword ? 'إخفاء' : 'إظهار'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <Link
                to="/forgot-password"
                className="text-primary-700 hover:text-primary-900 font-medium"
              >
                نسيت كلمة المرور؟
              </Link>
            </div>

            <Button
              type="submit"
              variant="primary"
              loading={loading}
              icon={LogIn}
              fullWidth
            >
              تسجيل الدخول
            </Button>
          </form>
        </div>

        {/* ─── Footer ─── */}
        <p className="text-center text-xs text-neutral-500 mt-6">
          © 2026 TOP PHARMA MEDICAL COMPANY — كل الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}

export default LoginPage;