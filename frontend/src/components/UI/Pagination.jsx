/**
 * @file Pagination.jsx
 * @description ترقيم الصفحات (Pagination)
 *
 * لماذا هذا الملف:
 * - التنقل بين صفحات الجداول.
 * - عرض معلومات (من - إلى - الإجمالي).
 * - اختيار عدد العناصر في الصفحة.
 */

import { ChevronRight, ChevronLeft } from 'lucide-react';

import { PAGINATION } from '../../utils/constants.js';
import { formatNumber } from '../../utils/formatters.js';

// ═══════════════════════════════════════════════
// 1. المكون
// ═══════════════════════════════════════════════
/**
 * ترقيم الصفحات
 * @param {Object} props
 * @param {number} props.page - الصفحة الحالية
 * @param {number} props.limit - عدد العناصر في الصفحة
 * @param {number} props.total - الإجمالي
 * @param {Function} props.onPageChange - دالة تغيير الصفحة
 * @param {Function} [props.onLimitChange] - دالة تغيير limit
 * @returns {JSX.Element|null}
 */
function Pagination({ page, limit, total, onPageChange, onLimitChange }) {
  // ✅ لا نعرض إذا لا يوجد عناصر
  if (!total || total === 0) {
    return null;
  }

  const totalPages = Math.ceil(total / limit);
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  // ═══════════════════════════════════════════════
  // 2. توليد أرقام الصفحات (مع ...)
  // ═══════════════════════════════════════════════
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i += 1) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      let start = Math.max(2, page - 1);
      let end = Math.min(totalPages - 1, page + 1);

      if (page <= 3) {
        start = 2;
        end = 4;
      }

      if (page >= totalPages - 2) {
        start = totalPages - 3;
        end = totalPages - 1;
      }

      if (start > 2) {
        pages.push('...');
      }

      for (let i = start; i <= end; i += 1) {
        pages.push(i);
      }

      if (end < totalPages - 1) {
        pages.push('...');
      }

      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  // ═══════════════════════════════════════════════
  // 3. Render
  // ═══════════════════════════════════════════════
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-3">
      {/* ✅ معلومات */}
      <div className="text-sm text-neutral-600">
        عرض <span className="numeric font-medium">{formatNumber(startItem)}</span> -{' '}
        <span className="numeric font-medium">{formatNumber(endItem)}</span> من{' '}
        <span className="numeric font-medium">{formatNumber(total)}</span>
      </div>

      <div className="flex items-center gap-4">
        {/* ✅ اختيار limit */}
        {onLimitChange && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-neutral-600">لكل صفحة:</span>
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="px-2 py-1 rounded border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              {PAGINATION.LIMIT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ✅ أزرار التنقل */}
        <div className="flex items-center gap-1">
          {/* ✅ السابق */}
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-1.5 rounded-md text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="الصفحة السابقة"
          >
            <ChevronRight size={18} />
          </button>

          {/* ✅ أرقام الصفحات */}
          {pageNumbers.map((num, idx) => {
            if (num === '...') {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="px-2 text-neutral-400 select-none"
                >
                  ...
                </span>
              );
            }

            const isActive = num === page;

            return (
              <button
                key={num}
                type="button"
                onClick={() => onPageChange(num)}
                className={`min-w-[32px] h-8 px-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-800 text-white'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="numeric">{num}</span>
              </button>
            );
          })}

          {/* ✅ التالي */}
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-1.5 rounded-md text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="الصفحة التالية"
          >
            <ChevronLeft size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Pagination;