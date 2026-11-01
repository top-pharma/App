/**
 * @file ConfirmDialog.jsx
 * @description نافذة تأكيد العمليات الحساسة
 *
 * لماذا هذا الملف:
 * - تأكيد العمليات قبل تنفيذها (حذف، إلغاء، إلخ).
 * - يمنع الحذف بالخطأ.
 * - يستخدم Modal.
 */

import { AlertTriangle } from 'lucide-react';

import Button from './Button.jsx';
import Modal from './Modal.jsx';

// ═══════════════════════════════════════════════
// 1. الأنواع
// ═══════════════════════════════════════════════
const DIALOG_STYLES = {
  danger: {
    iconBg: 'bg-danger-50',
    iconColor: 'text-danger-600',
  },
  warning: {
    iconBg: 'bg-warning-50',
    iconColor: 'text-warning-600',
  },
  info: {
    iconBg: 'bg-info-50',
    iconColor: 'text-info-600',
  },
};

// ═══════════════════════════════════════════════
// 2. المكون
// ═══════════════════════════════════════════════
/**
 * نافذة تأكيد
 * @param {Object} props
 * @param {boolean} props.isOpen - مفتوحة؟
 * @param {Function} props.onClose - دالة الإغلاق/الإلغاء
 * @param {Function} props.onConfirm - دالة التأكيد
 * @param {string} [props.title='تأكيد العملية'] - العنوان
 * @param {string} props.message - الرسالة
 * @param {'danger'|'warning'|'info'} [props.type='warning'] - النوع
 * @param {string} [props.confirmText='تأكيد'] - نص زر التأكيد
 * @param {string} [props.cancelText='إلغاء'] - نص زر الإلغاء
 * @param {boolean} [props.loading=false] - جارٍ التنفيذ؟
 * @returns {JSX.Element}
 */
function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'تأكيد العملية',
  message,
  type = 'warning',
  confirmText = 'تأكيد',
  cancelText = 'إلغاء',
  loading = false,
}) {
  const style = DIALOG_STYLES[type] || DIALOG_STYLES.warning;

  const confirmVariant = type === 'danger' ? 'danger' : 'primary';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      showCloseButton={!loading}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        {/* ✅ الأيقونة */}
        <div
          className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${style.iconBg} ${style.iconColor}`}
        >
          <AlertTriangle size={24} />
        </div>

        {/* ✅ المحتوى */}
        <div className="flex-1 min-w-0 pt-1">
          <h3 className="text-base font-bold text-neutral-900 mb-2">{title}</h3>
          <p className="text-sm text-neutral-600 leading-relaxed">{message}</p>
        </div>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;