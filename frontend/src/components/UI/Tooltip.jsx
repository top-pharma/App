/**
 * @file Tooltip.jsx
 * @description تلميح (Tooltip) بسيط
 *
 * لماذا هذا الملف:
 * - شرح الحقول المعقدة.
 * - يظهر عند Hover.
 * - يختفي عند الخروج.
 */

import { useState } from 'react';

/**
 * تلميح
 * @param {Object} props
 * @param {React.ReactNode} props.children - العنصر الذي يُظهر التلميح
 * @param {string} props.content - محتوى التلميح
 * @param {'top'|'bottom'|'right'|'left'} [props.position='top'] - الموضع
 * @param {number} [props.delay=200] - التأخير (ms)
 * @returns {JSX.Element}
 */
function Tooltip({ children, content, position = 'top', delay = 200 }) {
  const [isVisible, setIsVisible] = useState(false);
  let timeoutId = null;

  const show = () => {
    timeoutId = setTimeout(() => setIsVisible(true), delay);
  };

  const hide = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    setIsVisible(false);
  };

  // ✅ موضع التلميح
  const positionClasses = {
    top: 'bottom-full right-1/2 translate-x-1/2 mb-2',
    bottom: 'top-full right-1/2 translate-x-1/2 mt-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  };

  // ✅ سهم التلميح
  const arrowClasses = {
    top: 'top-full right-1/2 translate-x-1/2 border-t-neutral-800',
    bottom: 'bottom-full right-1/2 translate-x-1/2 border-b-neutral-800',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-neutral-800',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-neutral-800',
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}

      {isVisible && content && (
        <div
          className={`absolute z-50 ${positionClasses[position]} pointer-events-none`}
          role="tooltip"
        >
          <div className="bg-neutral-800 text-white text-xs rounded-md px-2.5 py-1.5 shadow-lg max-w-xs whitespace-normal text-center">
            {content}
          </div>
          <div
            className={`absolute w-0 h-0 border-4 border-transparent ${arrowClasses[position]}`}
          />
        </div>
      )}
    </div>
  );
}

export default Tooltip;