/**
 * @file UserFormModal.jsx
 * @description نموذج إنشاء/تعديل مستخدم (Phase C).
 *
 * - إنشاء: الاسم، البريد، الهاتف، الدور، كلمة مرور (اختياري)، ملاحظات.
 * - تعديل: نفس الحقول + الحالة + الدور الكامل (بما فيه pharmacy).
 * - بعد إنشاء بدون كلمة مرور: تُعرض كلمة المرور المولّدة مرة واحدة.
 *
 * ⚠️ pharmacy في وضع الإنشاء غير متاح — يتطلب ربط عميل.
 */

import { useEffect, useState } from 'react';
import Modal from '../UI/Modal.jsx';
import Input from '../UI/Input.jsx';
import Select from '../UI/Select.jsx';
import Button from '../UI/Button.jsx';
import { useToast } from '../../hooks/useToast.js';
import * as usersAPI from '../../api/usersAPI.js';

const ROLES_CREATE = [
    { value: 'admin', label: 'مدير' },
    { value: 'hr_manager', label: 'مدير موارد بشرية' },
    { value: 'storekeeper', label: 'أمين مخزن' },
    { value: 'accountant', label: 'محاسب' },
    { value: 'sales_rep', label: 'مندوب' },
];

const ROLES_EDIT = [
    ...ROLES_CREATE,
    { value: 'pharmacy', label: 'صيدلية' },
];

const EMPTY_FORM = {
    name: '',
    email: '',
    phone: '',
    role: 'storekeeper',
    password: '',
    notes: '',
    isActive: true,
};

export default function UserFormModal({ isOpen, user, onClose, onSaved }) {
    const toast = useToast();
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState({});
    const [generatedPassword, setGeneratedPassword] = useState(null);
    const [copied, setCopied] = useState(false);

    const isEdit = Boolean(user?.id);

    useEffect(() => {
        if (isOpen) {
            if (user) {
                setForm({
                    name: user.name || '',
                    email: user.email || '',
                    phone: user.phone || '',
                    role: user.role || 'storekeeper',
                    password: '',
                    notes: user.notes || '',
                    isActive: user.isActive ?? true,
                });
            } else {
                setForm(EMPTY_FORM);
            }
            setErrors({});
            setGeneratedPassword(null);
            setCopied(false);
        }
    }, [isOpen, user]);

    const setField = (key, value) => {
        setForm((s) => ({ ...s, [key]: value }));
        if (errors[key]) {
            setErrors((s) => ({ ...s, [key]: undefined }));
        }
    };

    const handleSubmit = async (e) => {
        e?.preventDefault?.();
        setErrors({});
        setSaving(true);

        try {
            const base = {
                name: form.name.trim(),
                email: form.email.trim().toLowerCase(),
                phone: form.phone.trim() || '',
                role: form.role,
                notes: form.notes.trim() || '',
            };

            if (isEdit) {
                await usersAPI.updateUser(user.id, {
                    ...base,
                    isActive: form.isActive,
                });
                toast.success('تم تحديث المستخدم');
                onSaved?.();
            } else {
                const payload = { ...base };
                if (form.password) payload.password = form.password;

                const result = await usersAPI.createUser(payload);

                if (result?.generatedPassword) {
                    setGeneratedPassword(result.generatedPassword);
                } else {
                    toast.success('تم إنشاء المستخدم');
                    onSaved?.();
                }
            }
        } catch (err) {
            const details = err?.error?.details;
            if (Array.isArray(details)) {
                const map = {};
                details.forEach((d) => {
                    if (d.field) map[d.field] = d.message;
                });
                setErrors(map);
            }
            toast.error(err?.error?.message || 'فشل حفظ المستخدم');
        } finally {
            setSaving(false);
        }
    };

    const handleCopyPassword = async () => {
        try {
            await navigator.clipboard.writeText(generatedPassword);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('فشل النسخ');
        }
    };

    // ─── شاشة كلمة المرور المولّدة ───
    if (generatedPassword) {
        return (
            <Modal
                isOpen={isOpen}
                onClose={onSaved}
                title="تم إنشاء المستخدم بنجاح"
                size="md"
                showCloseButton={false}
                footer={<Button onClick={onSaved}>تم</Button>}
            >
                <div className="space-y-4">
                    <p className="text-sm text-neutral-700">
                        تم إنشاء الحساب. كلمة المرور المؤقتة التالية تُعرض{' '}
                        <strong>مرة واحدة فقط</strong>:
                    </p>
                    <div
                        className="bg-neutral-100 border border-neutral-200 p-4 rounded-md font-mono text-center text-lg select-all"
                        dir="ltr"
                    >
                        {generatedPassword}
                    </div>
                    <Button variant="secondary" onClick={handleCopyPassword} fullWidth>
                        {copied ? '✓ تم النسخ' : 'نسخ كلمة المرور'}
                    </Button>
                    <p className="text-xs text-warning-700 bg-warning-50 p-3 rounded-md">
                        ⚠️ احفظ كلمة المرور الآن — لن تظهر مرة أخرى. سيُطلب من المستخدم
                        تغييرها عند أول دخول.
                    </p>
                </div>
            </Modal>
        );
    }

    const roleOptions = isEdit ? ROLES_EDIT : ROLES_CREATE;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={
                isEdit ? `تعديل المستخدم: ${user?.name || ''}` : 'إضافة مستخدم جديد'
            }
            size="lg"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} disabled={saving}>
                        إلغاء
                    </Button>
                    <Button onClick={handleSubmit} loading={saving}>
                        {isEdit ? 'حفظ التعديلات' : 'إنشاء المستخدم'}
                    </Button>
                </>
            }
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                        label="الاسم الكامل"
                        required
                        value={form.name}
                        onChange={(e) => setField('name', e.target.value)}
                        error={errors.name}
                        placeholder="مثال: أحمد محمد"
                    />
                    <Input
                        label="البريد الإلكتروني"
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setField('email', e.target.value)}
                        error={errors.email}
                        placeholder="user@pharma.local"
                    />
                    <Input
                        label="رقم الهاتف"
                        value={form.phone}
                        onChange={(e) => setField('phone', e.target.value)}
                        error={errors.phone}
                        placeholder="+249xxxxxxxxx"
                    />
                    <Select
                        label="الدور"
                        required
                        options={roleOptions}
                        value={form.role}
                        onChange={(e) => setField('role', e.target.value)}
                        error={errors.role}
                    />
                </div>

                {!isEdit && (
                    <Input
                        label="كلمة المرور"
                        type="password"
                        value={form.password}
                        onChange={(e) => setField('password', e.target.value)}
                        error={errors.password}
                        help="اتركها فارغة لتوليد كلمة مرور قوية تلقائياً"
                        placeholder="اتركها فارغة للتوليد التلقائي"
                    />
                )}

                {isEdit && (
                    <Select
                        label="الحالة"
                        options={[
                            { value: 'true', label: 'نشط' },
                            { value: 'false', label: 'معطّل' },
                        ]}
                        value={String(form.isActive)}
                        onChange={(e) => setField('isActive', e.target.value === 'true')}
                    />
                )}

                <Input
                    label="ملاحظات"
                    value={form.notes}
                    onChange={(e) => setField('notes', e.target.value)}
                    error={errors.notes}
                    placeholder="ملاحظات إدارية (اختياري)"
                />

                {!isEdit && (
                    <div className="p-3 bg-info-50 border border-info-200 rounded-md text-sm text-info-800">
                        💡 لإنشاء حساب <strong>صيدلية</strong>، استخدم شاشة "الصيدليات" من
                        قسم المخزون (يتطلب ربطه بعميل).
                    </div>
                )}
            </form>
        </Modal>
    );
}