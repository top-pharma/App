/**
 * @file Table.jsx
 * @description جدول موحد لعرض البيانات
 *
 * لماذا هذا الملف:
 * - توحيد شكل الجداول.
 * - دعم: الأعمدة، البيانات، التحميل، الحالة الفارغة.
 * - دعم RTL.
 * - متجاوب.
 */

import { Inbox } from 'lucide-react';

import Loading from './Loading.jsx';

// ═══════════════════════════════════════════════
// 1. المكون
// ═══════════════════════════════════════════════
/**
 * جدول موحد
 * @param {Object} props
 * @param {Array<{key: string, label: string, align?: 'start'|'center'|'end', width?: string, render?: Function}>} props.columns - الأعمدة
 * @param {Array<Object>} props.data - البيانات
 * @param {Function} [props.onRowClick] - عند النقر على صف
 * @param {boolean} [props.loading=false] - التحميل
 * @param {string} [props.emptyMessage='لا توجد بيانات'] - رسالة الفراغ
 * @param {string} [props.rowKey='_id'] - مفتاح الصف
 * @param {string} [props.className] - أنماط إضافية
 * @returns {JSX.Element}
 *
 * @example
 * <Table
 *   columns={[
 *     { key: 'name', label: 'الاسم' },
 *     { key: 'price', label: 'السعر', align: 'end', render: (row) => formatCurrency(row.price) },
 *   ]}
 *   data={items}
 *   loading={isLoading}
 * />
 */
function Table({
  columns,
  data,
  onRowClick,
  loading = false,
  emptyMessage = 'لا توجد بيانات',
  rowKey = '_id',
  className = '',
}) {
  // ═══════════════════════════════════════════════
  // 2. حالة التحميل
  // ═══════════════════════════════════════════════
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-neutral-200 p-8">
        <Loading text="جاري التحميل..." />
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // 3. حالة الفراغ
  // ═══════════════════════════════════════════════
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto mb-4">
          <Inbox size={32} />
        </div>
        <p className="text-neutral-600">{emptyMessage}</p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // 4. محاذاة الأعمدة
  // ═══════════════════════════════════════════════
  const getAlignClass = (align = 'start') => {
    const map = {
      start: 'text-right',
      center: 'text-center',
      end: 'text-left',
    };
    return map[align] || map.start;
  };

  // ═══════════════════════════════════════════════
  // 5. Render
  // ═══════════════════════════════════════════════
  return (
    <div
      className={`bg-white rounded-lg border border-neutral-200 overflow-hidden ${className}`}
    >
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          {/* ✅ الرأس */}
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 font-bold text-neutral-700 whitespace-nowrap ${getAlignClass(
                    col.align
                  )}`}
                  style={{ width: col.width }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          {/* ✅ الجسم */}
          <tbody className="divide-y divide-neutral-100">
            {data.map((row, index) => (
              <tr
                key={row[rowKey] || index}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`
                  transition-colors
                  ${onRowClick ? 'cursor-pointer hover:bg-neutral-50' : ''}
                  ${index % 2 === 0 ? 'bg-white' : 'bg-neutral-50/30'}
                `}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-neutral-800 ${getAlignClass(col.align)}`}
                  >
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Table;