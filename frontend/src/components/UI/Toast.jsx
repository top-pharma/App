/**
 * @file Toast.jsx
 * @description إشعار فردي (Toast)
 *
 * لماذا هذا الملف:
 * - عرض إشعار واحد.
 * - دعم 4 أنواع (success, error, warning, info).
 * - زر إغلاق.
 * - حركات (slide-in).
 */

import { useEffect, useState } from 'react';

import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

// ═══════════════════════════════════════════════
// 1. الأنواع
// ═══════════════════════════════════════════════
const TOAST_STYLES = {
  success: {
    bg: 'bg-success-50',
    border: 'border-success-500',
    text: 'text-success-800',
    icon: 'text-success-600',
    Icon: CheckCircle,
  },
  error: {
    bg: 'bg-danger-50',
    border: 'border-danger-500',
    text: 'text-danger-800',
    icon: 'text-danger-600',
    Icon: AlertCircle,
  },
  warning: {
    bg: 'bg-warning-50',
    border: 'border-warning-500',
    text: 'text-warning-800',
    icon: 'text-warning-600',
    Icon: AlertTriangle,
  },
  info: {
    bg: 'bg-info-50',
    border: 'border-info-500',
    text: 'text-info-800',
    icon: 'text-info-600',
    Icon: Info,
  },
};

// ═══════════════════════════════════════════════
// 2. المكون
// ═══════════════════════════════════════════════
/**
 * إشعار فردي
 * @param {Object} props
 * @param {string} props.id - المعرّف
 * @param {'success'|'error'|'warning'|'info'} props.type - النوع
 * @param {string} props.message - الرسالة
 * @param {string} [props.title] - العنوان (اختياري)
 * @param {Function} props.onClose - دالة الإغلاق
 * @returns {JSX.Element}
 */
function Toast({ id, type = 'info', message, title, onClose }) {
  const [isVisible, setIsVisible] = useState(false);

  const style = TOAST_STYLES[type] || TOAST_STYLES.info;
  const Icon = style.Icon;

  // ✅ نُظهر الإشعار بعد التركيب (للحركة)
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // ✅ إغلاق بحركة
  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onClose(id), 200);
  };

  return (
    <div
      className={`
        flex items-start gap-3 p-4 rounded-lg border-r-4 shadow-lg
        ${style.bg} ${style.border}
        transition-all duration-200 ease-out
        ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
      role="alert"
      aria-live="polite"
    >
      {/* ✅ الأيقونة */}
      <div className={`flex-shrink-0 ${style.icon}`}>
        <Icon size={20} />
      </div>

      {/* ✅ المحتوى */}
      <div className="flex-1 min-w-0">
        {title && (
          <p className={`text-sm font-bold mb-1 ${style.text}`}>{title}</p>
        )}
        <p className={`text-sm ${style.text}`}>{message}</p>
      </div>

      {/* ✅ زر الإغلاق */}
      <button
        type="button"
        onClick={handleClose}
        className={`flex-shrink-0 p-0.5 rounded ${style.text} hover:bg-black/5 transition-colors`}
        aria-label="إغلاق الإشعار"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default Toast;