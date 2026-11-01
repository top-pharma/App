/**
 * @file ForgotPasswordPage.jsx
 * @description
 * صفحة نسيت كلمة المرور — Phase 2.5.
 *
 * لماذا هذا الملف؟
 * - تُرسل رابط إعادة تعيين إلى بريد المستخدم.
 * - بعد الإرسال، تعرض رسالة نجاح (مقاومة enumeration — لا تكشف
 *   إن كان البريد مسجلاً أم لا).
 * - تدعم الرجوع إلى /login.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowRight, CheckCircle2, AlertCircle, KeyRound } from 'lucide-react';

import { forgotPassword as forgotPasswordAPI } from '../api/authAPI.js';

import Button from '../components/UI/Button.jsx';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('البريد الإلكتروني مطلوب.');
      return;
    }

    setLoading(true);
    try {
      await forgotPasswordAPI(email.trim().toLowerCase());
      setSubmitted(true);
    } catch (err) {
      // مقاومة enumeration — نُظهر رسالة عامة دائماً
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50 p-4" dir="rtl">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-xl border border-neutral-200 shadow-lg p-6 sm:p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-50 text-success-700 mb-4">
              <CheckCircle2 size={32} />
            </div>
            <h2 className="text-xl font-bold text-neutral-900 mb-2">
              تحقّق من بريدك
            </h2>
            <p className="text-sm text-neutral-600 mb-6">
              إذا كان البريد الإلكتروني مسجّلاً، ستصلك رسالة تحتوي على رابط
              لإعادة تعيين كلمة المرور. الرابط صالح لمدة 30 دقيقة.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-primary-700 hover:text-primary-900 font-medium text-sm"
            >
              <ArrowRight size={16} />
              العودة لتسجيل الدخول
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50 p-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-800 text-white mb-4 shadow-lg">
            <KeyRound size={28} />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">نسيت كلمة المرور</h1>
          <p className="text-sm text-neutral-600 mt-1">
            أدخل بريدك الإلكتروني لإرسال رابط إعادة التعيين
          </p>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 shadow-lg p-6 sm:p-8">
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
                  autoFocus
                  autoComplete="email"
                  placeholder="admin@pharma-system.local"
                  className="w-full pr-10 pl-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 disabled:bg-neutral-100"
                  dir="ltr"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              loading={loading}
              icon={Mail}
              fullWidth
            >
              إرسال رابط إعادة التعيين
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-primary-700"
            >
              <ArrowRight size={14} />
              العودة لتسجيل الدخول
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;