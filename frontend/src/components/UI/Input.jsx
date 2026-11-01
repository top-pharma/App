/**
 * @file Input.jsx
 * @description حقل إدخال موحد مع دعم الأخطاء والـ RTL
 *
 * لماذا هذا الملف:
 * - توحيد شكل الحقول في كل التطبيق.
 * - دعم أنواع متعددة (text, email, password, number, ...).
 * - دعم الأخطاء والمساعدة.
 * - دعم الأيقونات.
 */

import { forwardRef, useState } from 'react';

import { Eye, EyeOff } from 'lucide-react';

// ═══════════════════════════════════════════════
// 1. المكون
// ═══════════════════════════════════════════════
/**
 * حقل إدخال موحد
 * @param {Object} props
 * @param {string} [props.label] - التسمية
 * @param {string} [props.error] - رسالة الخطأ
 * @param {string} [props.help] - نص المساعدة
 * @param {string} [props.type='text'] - النوع
 * @param {React.ComponentType} [props.icon] - أيقونة
 * @param {boolean} [props.required=false] - مطلوب
 * @param {boolean} [props.disabled=false] - معطّل
 * @param {string} [props.placeholder] - النص التوضيحي
 * @param {string} [props.className] - أنماط إضافية
 * @param {string} [props.id] - المعرّف
 * @returns {JSX.Element}
 */
const Input = forwardRef(function Input(
  {
    label,
    error,
    help,
    type = 'text',
    icon: Icon,
    required = false,
    disabled = false,
    placeholder,
    className = '',
    id,
    ...rest
  },
  ref
) {
  const [showPassword, setShowPassword] = useState(false);

  const inputId = id || `input-${Math.random().toString(36).slice(2, 9)}`;
  const isPassword = type === 'password';
  const actualType = isPassword && showPassword ? 'text' : type;

  const hasError = Boolean(error);

  // ✅ أنماط الحقل
  const inputClasses = `
    w-full px-3 py-2 rounded-md border transition-colors
    focus:outline-none focus:ring-2 focus:ring-offset-0
    disabled:bg-neutral-100 disabled:cursor-not-allowed
    ${Icon ? 'pr-10' : ''}
    ${isPassword ? 'pl-10' : ''}
    ${
      hasError
        ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-200'
        : 'border-neutral-300 focus:border-primary-500 focus:ring-primary-200'
    }
    ${className}
  `;

  return (
    <div className="w-full">
      {/* ✅ التسمية */}
      {label && (
        <label
          htmlFor={inputId}
          className={`block mb-1.5 text-sm font-medium text-neutral-700 ${
            required ? 'required' : ''
          }`}
        >
          {label}
        </label>
      )}

      {/* ✅ الحقل */}
      <div className="relative">
        {/* ✅ أيقونة اليمين */}
        {Icon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
            <Icon size={18} />
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          type={actualType}
          disabled={disabled}
          placeholder={placeholder}
          className={inputClasses}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${inputId}-error` : undefined}
          {...rest}
        />

        {/* ✅ زر إظهار/إخفاء كلمة المرور */}
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
            aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>

      {/* ✅ رسالة الخطأ */}
      {hasError && (
        <p id={`${inputId}-error`} className="mt-1.5 text-sm text-danger-600" role="alert">
          {error}
        </p>
      )}

      {/* ✅ نص المساعدة */}
      {!hasError && help && <p className="mt-1.5 text-sm text-neutral-500">{help}</p>}
    </div>
  );
});

export default Input;