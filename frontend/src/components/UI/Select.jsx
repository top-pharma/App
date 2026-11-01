/**
 * @file Select.jsx
 * @description
 * مكوّن قائمة منسدلة موحّد — يستخدم في كل النماذج.
 *
 * Props:
 *  - label: عنوان الحقل
 *  - required: علامة النجمة الحمراء
 *  - error: رسالة خطأ (تظهر تحت الحقل)
 *  - helper: نص مساعد (يظهر تحت الحقل بلون رمادي)
 *  - options: [{ value, label }] أو [{ value, label, disabled }]
 *  - placeholder: خيار افتراضي فارغ (مثال: "-- اختر --")
 *  - disabled: تعطيل الحقل
 *  - value, onChange: standard
 *  - className: classes إضافية للحقل نفسه
 *  - containerClassName: classes إضافية للحاوية
 *  - ...rest: تُمرر إلى <select>
 */

import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

const Select = forwardRef(function Select(
  {
    label,
    required = false,
    error,
    helper,
    options = [],
    placeholder,
    disabled = false,
    className = '',
    containerClassName = '',
    id,
    name,
    value,
    onChange,
    children,
    ...rest
  },
  ref
) {
  // نُولّد id تلقائياً إن لم يُمرَّر
  const selectId = id || name || `select-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div className={`w-full ${containerClassName}`}>
      {/* ─── Label ─── */}
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-neutral-700 mb-1"
        >
          {label}
          {required && <span className="text-danger-500 mr-1">*</span>}
        </label>
      )}

      {/* ─── Select wrapper (لأيقونة Chevron) ─── */}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          name={name}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={`
            w-full appearance-none
            px-3 py-2 pl-9
            border rounded-md text-sm
            bg-white
            transition-colors
            focus:outline-none focus:ring-2
            ${
              error
                ? 'border-danger-400 focus:ring-danger-200 focus:border-danger-500'
                : 'border-neutral-300 focus:ring-primary-200 focus:border-primary-500'
            }
            ${
              disabled
                ? 'bg-neutral-100 text-neutral-500 cursor-not-allowed'
                : 'text-neutral-900 cursor-pointer'
            }
            ${className}
          `}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              disabled={opt.disabled}
            >
              {opt.label}
            </option>
          ))}
          {children}
        </select>

        {/* ─── أيقونة Chevron ─── */}
        <ChevronDown
          size={16}
          className={`
            absolute left-3 top-1/2 -translate-y-1/2
            pointer-events-none
            ${disabled ? 'text-neutral-400' : 'text-neutral-500'}
          `}
        />
      </div>

      {/* ─── Error / Helper ─── */}
      {error && (
        <p className="text-xs text-danger-600 mt-1 flex items-center gap-1">
          {error}
        </p>
      )}
      {!error && helper && (
        <p className="text-xs text-neutral-500 mt-1">{helper}</p>
      )}
    </div>
  );
});

export default Select;