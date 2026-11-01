/**
 * @file ToastContainer.jsx
 * @description حاوية الإشعارات (ثابتة في الزاوية)
 *
 * لماذا هذا الملف:
 * - عرض كل الإشعارات في مكان واحد.
 * - ثابتة في أعلى اليسار (RTL: أعلى اليسار).
 * - لا تعيق التفاعل (pointer-events).
 */

import { createPortal } from 'react-dom';

import { useToast } from '../../hooks/useToast.js';

import Toast from './Toast.jsx';

/**
 * حاوية الإشعارات
 * @returns {JSX.Element}
 */
function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return createPortal(
    <div
      className="fixed top-20 left-4 z-[100] w-full max-w-sm space-y-3 pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast {...toast} onClose={removeToast} />
        </div>
      ))}
    </div>,
    document.body
  );
}

export default ToastContainer;