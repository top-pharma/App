/**
 * @file ResetPasswordModal.jsx
 * @description إعادة تعيين كلمة مرور مستخدم (Phase C).
 *
 * - إدخال كلمة مرور أو ترك الحقل فارغاً للتوليد التلقائي.
 * - عرض كلمة المرور مرة واحدة فقط بعد النجاح.
 * - يُبطل كل جلسات المستخدم الحالية.
 *
 * ⚠️ C-fix: user.id (وليس user._id) — يطابق buildUserPayload في Backend.
 */

import { useEffect, useState } from 'react';
import Modal from '../UI/Modal.jsx';
import Input from '../UI/Input.jsx';
import Button from '../UI/Button.jsx';
import { useToast } from '../../hooks/useToast.js';
import * as usersAPI from '../../api/usersAPI.js';

export default function ResetPasswordModal({ isOpen, user, onClose, onSaved }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setGenerated(null);
      setCopied(false);
    }
  }, [isOpen]);

  const handleReset = async () => {
    if (!user?.id) {
      toast.error('لا يمكن إعادة التعيين: مُعرّف المستخدم مفقود');
      return;
    }

    setLoading(true);
    try {
      const result = await usersAPI.adminResetPassword(
        user.id,                                 // ← C-fix: user.id (كان user._id)
        password ? { newPassword: password } : {}
      );
      if (result?.generatedPassword) {
        setGenerated(result.generatedPassword);
      } else {
        toast.success('تم تغيير كلمة المرور');
        onSaved?.();
        onClose?.();
      }
    } catch (err) {
      toast.error(
        err?.error?.message || 'فشل تغيير كلمة المرور'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    setGenerated(null);
    onClose?.();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generated);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('فشل النسخ');
    }
  };

  // ─── شاشة كلمة المرور المولّدة ───
  if (generated) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="كلمة المرور الجديدة"
        size="md"
        showCloseButton={false}
        footer={<Button onClick={handleClose}>تم</Button>}
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-700">
            كلمة المرور المؤقتة الجديدة لـ "{user?.name}" (
            <strong>تُعرض مرة واحدة فقط</strong>):
          </p>
          <div
            className="bg-neutral-100 border border-neutral-200 p-4 rounded-md font-mono text-center text-lg select-all"
            dir="ltr"
          >
            {generated}
          </div>
          <Button variant="secondary" onClick={handleCopy} fullWidth>
            {copied ? '✓ تم النسخ' : 'نسخ كلمة المرور'}
          </Button>
          <p className="text-xs text-warning-700 bg-warning-50 p-3 rounded-md">
            ⚠️ احفظها الآن — سيُطلب من المستخدم تغييرها عند أول دخول.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`إعادة تعيين كلمة مرور: ${user?.name || ''}`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={loading}>
            إلغاء
          </Button>
          <Button onClick={handleReset} loading={loading}>
            إعادة التعيين
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-neutral-600">
          سيتم إنهاء جميع الجلسات النشطة لهذا المستخدم. سيتعين عليه تسجيل
          الدخول مجدداً.
        </p>
        <Input
          label="كلمة المرور الجديدة"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          help="اتركها فارغة لتوليد كلمة مرور قوية تلقائياً"
          placeholder="اتركها فارغة للتوليد التلقائي"
        />
      </div>
    </Modal>
  );
}