/**
 * @file Card.jsx
 * @description بطاقة موحدة لعرض المحتوى
 *
 * لماذا هذا الملف:
 * - توحيد شكل البطاقات.
 * - دعم Header / Body / Footer.
 * - دعم العنوان والأيقونة.
 */

/**
 * بطاقة موحدة
 * @param {Object} props
 * @param {React.ReactNode} [props.title] - العنوان
 * @param {React.ReactNode} [props.subtitle] - العنوان الفرعي
 * @param {React.ComponentType} [props.icon] - أيقونة العنوان
 * @param {React.ReactNode} [props.actions] - أزرار في الرأس
 * @param {React.ReactNode} props.children - المحتوى
 * @param {React.ReactNode} [props.footer] - الفوتر
 * @param {boolean} [props.noPadding=false] - بلا padding داخلي
 * @param {string} [props.className] - أنماط إضافية
 * @returns {JSX.Element}
 */
function Card({
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
  footer,
  noPadding = false,
  className = '',
}) {
  const hasHeader = title || subtitle || Icon || actions;

  return (
    <div
      className={`bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden ${className}`}
    >
      {/* ✅ الرأس */}
      {hasHeader && (
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-neutral-200">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary-50 text-primary-800 flex items-center justify-center">
                <Icon size={20} />
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="text-lg font-bold text-neutral-900 truncate">{title}</h3>
              )}
              {subtitle && (
                <p className="text-sm text-neutral-500 truncate">{subtitle}</p>
              )}
            </div>
          </div>

          {actions && <div className="flex-shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
      )}

      {/* ✅ المحتوى */}
      <div className={noPadding ? '' : 'p-6'}>{children}</div>

      {/* ✅ الفوتر */}
      {footer && (
        <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50">{footer}</div>
      )}
    </div>
  );
}

export default Card;