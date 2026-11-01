/**
 * @file Button.jsx
 * @description زر موحد قابل لإعادة الاستخدام
 *
 * لماذا هذا الملف:
 * - توحيد شكل الأزرار في كل التطبيق.
 * - دعم أحجام وأنواع متعددة.
 * - دعم حالة التحميل (Loading).
 * - دعم الأيقونات.
 */

import { forwardRef } from 'react';

import Loading from './Loading.jsx';

// ═══════════════════════════════════════════════
// 1. الأنواع (Variants)
// ═══════════════════════════════════════════════
const VARIANTS = {
  primary: 'bg-primary-800 text-white hover:bg-primary-900 focus:ring-primary-500',
  secondary: 'bg-neutral-200 text-neutral-800 hover:bg-neutral-300 focus:ring-neutral-400',
  success: 'bg-success-600 text-white hover:bg-success-700 focus:ring-success-500',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 focus:ring-danger-500',
  warning: 'bg-warning-600 text-white hover:bg-warning-700 focus:ring-warning-500',
  info: 'bg-info-600 text-white hover:bg-info-700 focus:ring-info-500',
  outline:
    'bg-transparent border-2 border-primary-800 text-primary-800 hover:bg-primary-50 focus:ring-primary-500',
  ghost:
    'bg-transparent text-neutral-700 hover:bg-neutral-100 focus:ring-neutral-400',
};

// ═══════════════════════════════════════════════
// 2. الأحجام (Sizes)
// ═══════════════════════════════════════════════
const SIZES = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-base gap-2',
  lg: 'px-6 py-3 text-lg gap-2.5',
};

// ═══════════════════════════════════════════════
// 3. المكون
// ═══════════════════════════════════════════════
/**
 * زر موحد
 * @param {Object} props
 * @param {React.ReactNode} props.children - محتوى الزر
 * @param {'primary'|'secondary'|'success'|'danger'|'warning'|'info'|'outline'|'ghost'} [props.variant='primary'] - النوع
 * @param {'sm'|'md'|'lg'} [props.size='md'] - الحجم
 * @param {boolean} [props.loading=false] - حالة التحميل
 * @param {boolean} [props.disabled=false] - معطّل
 * @param {boolean} [props.fullWidth=false] - بعرض كامل
 * @param {React.ComponentType} [props.icon] - أيقونة (Lucide)
 * @param {'start'|'end'} [props.iconPosition='start'] - موضع الأيقونة
 * @param {string} [props.type='button'] - نوع الزر
 * @param {Function} props.onClick - دالة النقر
 * @param {string} [props.className] - أنماط إضافية
 * @returns {JSX.Element}
 */
const Button = forwardRef(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    fullWidth = false,
    icon: Icon,
    iconPosition = 'start',
    type = 'button',
    onClick,
    className = '',
    ...rest
  },
  ref
) {
  const baseClasses =
    'inline-flex items-center justify-center font-medium rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = VARIANTS[variant] || VARIANTS.primary;
  const sizeClasses = SIZES[size] || SIZES.md;
  const widthClasses = fullWidth ? 'w-full' : '';

  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      className={`${baseClasses} ${variantClasses} ${sizeClasses} ${widthClasses} ${className}`}
      {...rest}
    >
      {loading ? (
        <>
          <Loading size="sm" />
          <span>جاري...</span>
        </>
      ) : (
        <>
          {Icon && iconPosition === 'start' && <Icon size={size === 'sm' ? 16 : 18} />}
          {children}
          {Icon && iconPosition === 'end' && <Icon size={size === 'sm' ? 16 : 18} />}
        </>
      )}
    </button>
  );
});

export default Button;