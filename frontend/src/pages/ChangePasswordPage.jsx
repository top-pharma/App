/**
 * @file ChangePasswordPage.jsx
 * @description صفحة تغيير كلمة المرور الإلزامية (Phase C — Security Fix).
 *
 * - تُعرض إجبارياً عندما user.mustChangePassword === true.
 * - بلا Sidebar/Header (بلا Layout) لمنع التنقل قبل الإكمال.
 * - تستخدم PATCH /auth/change-password (موجود في backend).
 * - بعد النجاح: logout تلقائي + redirect إلى /login.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, AlertCircle } from 'lucide-react';

import Button from '../components/UI/Button.jsx';
import Input from '../components/UI/Input.jsx';
import Card from '../components/UI/Card.jsx';

import axiosInstance from '../api/axiosInstance.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';

const MIN_PASSWORD_LENGTH = 8;

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, userName, logout } = useAuth();

  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const setField = (key, value) => {
    setForm((s) => ({ ...s, [key]: value }));
    if (errors[key]) setErrors((s) => ({ ...s, [key]: undefined }));
  };

  const validate = () => {
    const errs = {};

    if (!form.currentPassword) {
      errs.currentPassword = 'كلمة المرور الحالية مطلوبة.';
    }

    if (!form.newPassword) {
      errs.newPassword = 'كلمة المرور الجديدة مطلوبة.';
    } else if (form.newPassword.length < MIN_PASSWORD_LENGTH) {
      errs.newPassword = `يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل.`;
    } else if (!/[A-Z]/.test(form.newPassword)) {
      errs.newPassword = 'يجب أن تحتوي على حرف كبير واحد على الأقل.';
    } else if (!/[a-z]/.test(form.newPassword)) {
      errs.newPassword = 'يجب أن تحتوي على حرف صغير واحد على الأقل.';
    } else if (!/[0-9]/.test(form.newPassword)) {
      errs.newPassword = 'يجب أن تحتوي على رقم واحد على الأقل.';
    } else if (form.newPassword === form.currentPassword) {
      errs.newPassword = 'كلمة المرور الجديدة يجب أن تختلف عن الحالية.';
    }

    if (form.confirmPassword !== form.newPassword) {
      errs.confirmPassword = 'كلمتا المرور غير متطابقتين.';
    }

    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setLoading(true);
    try {
      await axiosInstance.patch('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
        confirmPassword: form.confirmPassword,
      });

      toast.success('تم تغيير كلمة المرور. جارٍ تسجيل الخروج...');

      // ⚠️ Backend invalidateSessions → التوكن الحالي أصبح غير صالح
      setTimeout(async () => {
        await logout();
        navigate('/login', { replace: true });
      }, 1200);
    } catch (err) {
      const code = err?.error?.code;
      const details = err?.error?.details;

      if (code === 'WRONG_CURRENT_PASSWORD') {
        setErrors({ currentPassword: 'كلمة المرور الحالية غير صحيحة.' });
      } else if (Array.isArray(details) && details.length > 0) {
        const map = {};
        details.forEach((d) => {
          if (d.field) map[d.field] = d.message;
        });
        setErrors(map);
      }

      toast.error(err?.error?.message || 'فشل تغيير كلمة المرور');
    } finally {
      setLoading(false);
    }
  };

  const subtitle = user?.mustChangePassword
    ? `مرحباً ${userName || user?.email || ''}، يجب تغيير كلمة المرور المؤقتة قبل المتابعة.`
    : `مرحباً ${userName || user?.email || ''}، يمكنك تغيير كلمة المرور من هنا.`;

  return (
    <div
      className="min-h-screen bg-neutral-50 flex items-center justify-center p-4"
      dir="rtl"
    >
      <Card
        title="تغيير كلمة المرور"
        subtitle={subtitle}
        icon={Lock}
        className="w-full max-w-lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {user?.mustChangePassword && (
            <div className="p-3 bg-warning-50 border border-warning-200 rounded-md text-sm text-warning-800 flex items-start gap-2">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                هذه أول مرة تسجّل فيها الدخول، أو تم إعادة تعيين كلمة المرور.
                يجب تعيين كلمة مرور جديدة قبل الوصول إلى أي صفحة أخرى.
              </div>
            </div>
          )}

          <Input
            label="كلمة المرور الحالية (المؤقتة)"
            type="password"
            required
            value={form.currentPassword}
            onChange={(e) => setField('currentPassword', e.target.value)}
            error={errors.currentPassword}
            autoComplete="current-password"
            placeholder="أدخل كلمة المرور الحالية"
          />

          <Input
            label="كلمة المرور الجديدة"
            type="password"
            required
            value={form.newPassword}
            onChange={(e) => setField('newPassword', e.target.value)}
            error={errors.newPassword}
            help="8 أحرف على الأقل، مع حرف كبير وصغير ورقم"
            autoComplete="new-password"
            placeholder="كلمة مرور قوية"
          />

          <Input
            label="تأكيد كلمة المرور الجديدة"
            type="password"
            required
            value={form.confirmPassword}
            onChange={(e) => setField('confirmPassword', e.target.value)}
            error={errors.confirmPassword}
            autoComplete="new-password"
            placeholder="أعد كتابة كلمة المرور"
          />

          <Button type="submit" fullWidth loading={loading} icon={Lock}>
            تغيير كلمة المرور
          </Button>

          <p className="text-xs text-neutral-500 text-center">
            سيتم تسجيل خروجك بعد التغيير — يرجى الدخول مجدداً بالكلمة الجديدة.
          </p>
        </form>
      </Card>
    </div>
  );
}