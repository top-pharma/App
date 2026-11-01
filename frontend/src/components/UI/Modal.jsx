/**
 * @file Modal.jsx
 * @description نافذة منبثقة موحدة
 *
 * لماذا هذا الملف:
 * - توحيد شكل النوافذ المنبثقة.
 * - دعم أحجام متعددة.
 * - دعم الإغلاق بـ Escape + النقر خارج.
 * - منع التمرير عند الفتح.
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { X } from 'lucide-react';

// ═══════════════════════════════════════════════
// 1. الأحجام
// ═══════════════════════════════════════════════
const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-7xl',
};

// ═══════════════════════════════════════════════
// 2. المكون
// ═══════════════════════════════════════════════
/**
 * نافذة منبثقة
 * @param {Object} props
 * @param {boolean} props.isOpen - مفتوحة؟
 * @param {Function} props.onClose - دالة الإغلاق
 * @param {string} [props.title] - العنوان
 * @param {React.ReactNode} props.children - المحتوى
 * @param {React.ReactNode} [props.footer] - الفوتر
 * @param {'sm'|'md'|'lg'|'xl'|'full'} [props.size='md'] - الحجم
 * @param {boolean} [props.closeOnOverlay=true] - الإغلاق بالنقر خارج
 * @param {boolean} [props.showCloseButton=true] - إظهار زر X
 * @returns {JSX.Element|null}
 */
function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnOverlay = true,
  showCloseButton = true,
}) {
  // ═══════════════════════════════════════════════
  // 3. إغلاق بـ Escape + منع التمرير
  // ═══════════════════════════════════════════════
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // ✅ منع تمرير الخلفية
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  // ═══════════════════════════════════════════════
  // 4. لا نعرض شيئاً إذا كانت مغلقة
  // ═══════════════════════════════════════════════
  if (!isOpen) {
    return null;
  }

  // ═══════════════════════════════════════════════
  // 5. النقر على الخلفية
  // ═══════════════════════════════════════════════
  const handleOverlayClick = (e) => {
    if (closeOnOverlay && e.target === e.currentTarget) {
      onClose();
    }
  };

  const sizeClass = SIZES[size] || SIZES.md;

  // ═══════════════════════════════════════════════
  // 6. Render (via Portal)
  // ═══════════════════════════════════════════════
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        className={`w-full ${sizeClass} bg-white rounded-lg shadow-xl animate-slide-up max-h-[90vh] flex flex-col`}
      >
        {/* ✅ الرأس */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-neutral-200 flex-shrink-0">
            {title && (
              <h2 id="modal-title" className="text-lg font-bold text-neutral-900">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                aria-label="إغلاق"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}

        {/* ✅ المحتوى */}
        <div className="px-6 py-4 overflow-y-auto flex-1">{children}</div>

        {/* ✅ الفوتر */}
        {footer && (
          <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-end gap-2 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default Modal;