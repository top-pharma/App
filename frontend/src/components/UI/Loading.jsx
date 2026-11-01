/**
 * @file Loading.jsx
 * @description مؤشر تحميل موحد
 *
 * لماذا هذا الملف:
 * - توحيد شكل التحميل.
 * - دعم أحجام متعددة.
 * - دعم النص.
 * - دعم ملء الشاشة.
 */

// ═══════════════════════════════════════════════
// 1. الأحجام
// ═══════════════════════════════════════════════
const SIZES = {
  sm: { spinner: 'w-4 h-4 border-2', text: 'text-xs' },
  md: { spinner: 'w-6 h-6 border-2', text: 'text-sm' },
  lg: { spinner: 'w-10 h-10 border-3', text: 'text-base' },
  xl: { spinner: 'w-14 h-14 border-4', text: 'text-lg' },
};

// ═══════════════════════════════════════════════
// 2. المكون
// ═══════════════════════════════════════════════
/**
 * مؤشر تحميل
 * @param {Object} props
 * @param {'sm'|'md'|'lg'|'xl'} [props.size='md'] - الحجم
 * @param {string} [props.text] - النص
 * @param {boolean} [props.fullScreen=false] - ملء الشاشة
 * @param {string} [props.className] - أنماط إضافية
 * @returns {JSX.Element}
 */
function Loading({ size = 'md', text, fullScreen = false, className = '' }) {
  const sizeConfig = SIZES[size] || SIZES.md;

  const spinner = (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className={`${sizeConfig.spinner} border-primary-200 border-t-primary-800 rounded-full animate-spin`}
        role="status"
        aria-label="جاري التحميل"
      />
      {text && <p className={`${sizeConfig.text} text-neutral-600`}>{text}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm ${className}`}
      >
        {spinner}
      </div>
    );
  }

  return <div className={`flex items-center justify-center p-4 ${className}`}>{spinner}</div>;
}

export default Loading;