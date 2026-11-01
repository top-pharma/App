/**
 * @file ResetPasswordPage.jsx
 * @description
 * صفحة إعادة تعيين كلمة المرور — Phase 2.5.
 *
 * لماذا هذا الملف؟
 * - تستهلك التوكن من الرابط (/reset-password/:token).
 * - تطلب كلمة مرور جديدة + تأكيدها.
 * - تتحقق من قوة كلمة المرور (محلياً — نفس قواعد Backend).
 * - بعد النجاح → رسالة + رابط للدخول.
 *
 * ⚠️ ملاحظة: لا يمكن استيراد validatePasswordStrength من backend/ مباشرة
 *    (لأنهما مشروعان منفصلان). لذلك نُعيد تعريفها محلياً بنفس القواعد.
 */

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowRight, KeyRound,
} from 'lucide-react';

import { resetPassword as resetPasswordAPI } from '../api/authAPI.js';

import Button from '../components/UI/Button.jsx';

// ═══════════════════════════════════════════════
// 1. قواعد التحقق (محلياً — مطابقة لـ backend/src/utils/password.js)
// ═══════════════════════════════════════════════

/**
 * التحقق من قوة كلمة المرور.
 * تطابق قواعد Backend: 8..128 حرفاً + حرف كبير + حرف صغير + رقم.
 *
 * @param {string} password
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePasswordStrength(password) {
  if (typeof password !== 'string') {
    return { valid: false, message: 'كلمة المرور يجب أن تكون نصاً.' };
  }
  if (password.length < 8) {
    return { valid: false, message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.' };
  }
  if (password.length > 128) {
    return { valid: false, message: 'كلمة المرور يجب ألا تتجاوز 128 حرفاً.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'يجب أن تحتوي على حرف كبير واحد على الأقل.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'يجب أن تحتوي على حرف صغير واحد على الأقل.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'يجب أن تحتوي على رقم واحد على الأقل.' };
  }
  return { valid: true };
}

// ═══════════════════════════════════════════════
// 2. المكون الرئيسي
// ═══════════════════════════════════════════════

function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  // فحص محلي لكلمة المرور (قبل الإرسال)
  const passwordStrength = newPassword ? validatePasswordStrength(newPassword) : { valid: true };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!newPassword || !confirmPassword) {
      setError('كلمة المرور وتأكيدها مطلوبان.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    if (!passwordStrength.valid) {
      setError(passwordStrength.message);
      return;
    }

    setLoading(true);
    try {
      await resetPasswordAPI({ token, newPassword });
      setSubmitted(true);
      setTimeout(() => navigate('/login', { replace: true }), 3000);
    } catch (err) {
      setError(err?.error?.message || err?.message || 'فشل إعادة تعيين كلمة المرور.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50 p-4" dir="rtl">
        <div className="w-full max-w-md bg-white rounded-xl border border-neutral-200 shadow-lg p-8 text-center">
          <AlertCircle size={48} className="text-danger-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">رابط غير صالح</h2>
          <p className="text-sm text-neutral-600 mb-6">
            رابط إعادة التعيين مفقود أو تالف.
          </p>
          <Link to="/forgot-password" className="text-primary-700 font-medium">
            طلب رابط جديد
          </Link>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50 p-4" dir="rtl">
        <div className="w-full max-w-md bg-white rounded-xl border border-neutral-200 shadow-lg p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-50 text-success-700 mb-4">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-xl font-bold mb-2">تم إعادة التعيين</h2>
          <p className="text-sm text-neutral-600 mb-6">
            تم إعادة تعيين كلمة المرور. جارٍ تحويلك لتسجيل الدخول...
          </p>
          <Link to="/login" className="inline-flex items-center gap-2 text-primary-700 font-medium text-sm">
            <ArrowRight size={16} />
            تسجيل الدخول الآن
          </Link>
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
          <h1 className="text-2xl font-bold text-neutral-900">إعادة تعيين كلمة المرور</h1>
          <p className="text-sm text-neutral-600 mt-1">
            أدخل كلمة مرور جديدة قوية
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
                كلمة المرور الجديدة
              </label>
              <div className="relative">
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  required
                  autoFocus
                  autoComplete="new-password"
                  placeholder="8 أحرف على الأقل"
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
              {newPassword && !passwordStrength.valid && (
                <p className="mt-1 text-xs text-danger-600">{passwordStrength.message}</p>
              )}
            </div>

            <div>
              <label className="block mb-1.5 text-sm font-medium text-neutral-700">
                تأكيد كلمة المرور
              </label>
              <div className="relative">
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  required
                  autoComplete="new-password"
                  placeholder="أعد إدخال كلمة المرور"
                  className="w-full pr-10 pl-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 disabled:bg-neutral-100"
                  dir="ltr"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              loading={loading}
              icon={Lock}
              fullWidth
              disabled={!passwordStrength.valid}
            >
              إعادة تعيين كلمة المرور
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

export default ResetPasswordPage;