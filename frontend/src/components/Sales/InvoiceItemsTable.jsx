/**
 * @file InvoiceItemsTable.jsx
 * @description
 * جدول بنود الفاتورة القابل للتعديل.
 * يعرض البنود ويسمح بتعديل الكمية وسعر الوحدة، وحذف البند.
 *
 * لماذا هذا الملف؟
 * - فصل عرض البنود عن منطق إضافتها (الذي يتم في InvoiceForm + FefoSelector).
 * - يضمن حساب `total` لكل بند تلقائياً عند تغيير الكمية أو السعر.
 * - يُظهر إجمالي الفاتورة (Grand Total) أسفل الجدول.
 * - قابل لإعادة الاستخدام في `DeliveryNoteForm` (نفس البنية).
 * - يعرض تحذيراً واضحاً عند ترك "رقم الدفعة" فارغاً (سيُختار بـ FEFO).
 *
 * ملاحظة:
 * - البند (item) قد يحمل `batch` محدداً (اختيار يدوي) أو فارغاً (FEFO تلقائي).
 * - عند الحفظ، إذا كان batch فارغاً، فإن `invoiceService` يُقسّم البند إلى عدة
 *   بنود (واحد لكل دفعة يُرجعها selectFEFO).
 */

import { Trash2, Package, AlertCircle } from 'lucide-react';

import { formatCurrency, formatDate } from '../../utils/formatters.js';

// ═══════════════════════════════════════════════
// 1. المكون
// ═══════════════════════════════════════════════

/**
 * جدول بنود الفاتورة القابل للتعديل.
 *
 * @param {Object} props
 * @param {Array<Object>} props.items - بنود الفاتورة الحالية.
 *   كل بند: { item, itemName, batch, expiry, quantity, unit, unitPrice, total }
 * @param {(newItems: Array) => void} props.onChange - دالة تحديث البنود.
 * @param {boolean} [props.disabled=false] - تعطيل التعديل.
 * @param {string} [props.emptyMessage='لا توجد بنود بعد. اضغط "إضافة بند" للبدء.'] - رسالة الحالة الفارغة.
 * @param {boolean} [props.showBatchWarning=true] - عرض تحذير عند غياب الـ batch.
 * @returns {JSX.Element}
 */
function InvoiceItemsTable({
  items,
  onChange,
  disabled = false,
  emptyMessage = 'لا توجد بنود بعد. اضغط "إضافة بند" للبدء.',
  showBatchWarning = true,
}) {
  // ═══════════════════════════════════════════════
  // 2. دوال التحديث
  // ═══════════════════════════════════════════════

  /**
   * تحديث حقل في بند معين، مع إعادة حساب الإجمالي عند تعديل الكمية/السعر.
   */
  const updateItem = (index, field, value) => {
    const newItems = [...items];
    const updated = { ...newItems[index] };

    // تحويل رقمي للحقول الرقمية
    if (field === 'quantity' || field === 'unitPrice') {
      updated[field] = value === '' ? 0 : parseFloat(value) || 0;
    } else {
      updated[field] = value;
    }

    // إعادة حساب الإجمالي
    if (field === 'quantity' || field === 'unitPrice') {
      const qty = field === 'quantity' ? updated[field] : (updated.quantity || 0);
      const price = field === 'unitPrice' ? updated[field] : (updated.unitPrice || 0);
      updated.total = Math.round(qty * price * 100) / 100;
    }

    newItems[index] = updated;
    onChange(newItems);
  };

  /**
   * حذف بند من الجدول.
   */
  const removeItem = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    onChange(newItems);
  };

  // ═══════════════════════════════════════════════
  // 3. الحساب الكلي
  // ═══════════════════════════════════════════════

  const grandTotal = items.reduce(
    (sum, item) => sum + (parseFloat(item.total) || 0),
    0
  );
  const totalQuantity = items.reduce(
    (sum, item) => sum + (parseFloat(item.quantity) || 0),
    0
  );

  // ═══════════════════════════════════════════════
  // 4. الحالة الفارغة
  // ═══════════════════════════════════════════════

  if (!items || items.length === 0) {
    return (
      <div className="border-2 border-dashed border-neutral-300 rounded-lg p-12 text-center bg-neutral-50">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center">
          <Package size={32} />
        </div>
        <p className="text-neutral-600">{emptyMessage}</p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // 5. الجدول
  // ═══════════════════════════════════════════════

  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {/* ─── الرأس ─── */}
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th className="px-3 py-3 text-right font-bold text-neutral-700 w-10">#</th>
              <th className="px-3 py-3 text-right font-bold text-neutral-700 min-w-[200px]">
                الصنف
              </th>
              <th className="px-3 py-3 text-center font-bold text-neutral-700 w-28">
                الدفعة
              </th>
              <th className="px-3 py-3 text-center font-bold text-neutral-700 w-28">
                الصلاحية
              </th>
              <th className="px-3 py-3 text-center font-bold text-neutral-700 w-24">
                الكمية
              </th>
              <th className="px-3 py-3 text-center font-bold text-neutral-700 w-20">
                الوحدة
              </th>
              <th className="px-3 py-3 text-left font-bold text-neutral-700 w-28">
                السعر
              </th>
              <th className="px-3 py-3 text-left font-bold text-neutral-700 w-28">
                الإجمالي
              </th>
              <th className="px-3 py-3 text-center w-12" />
            </tr>
          </thead>

          {/* ─── الجسم ─── */}
          <tbody className="divide-y divide-neutral-100">
            {items.map((item, index) => {
              const itemName = item.itemName || item.item?.tradeName || '—';
              const scientificName = item.item?.scientificName || '';
              const hasBatch = Boolean(item.batch);
              const isExpired = item.expiry && new Date(item.expiry) < new Date();

              return (
                <tr key={`${index}-${item.item?._id || item.item}-${item.batch || 'auto'}`} className="hover:bg-neutral-50/50">
                  {/* # */}
                  <td className="px-3 py-2 text-center text-neutral-500 numeric">
                    {index + 1}
                  </td>

                  {/* الصنف */}
                  <td className="px-3 py-2">
                    <p className="font-medium text-neutral-900">{itemName}</p>
                    {scientificName && (
                      <p className="text-xs text-neutral-500">{scientificName}</p>
                    )}
                  </td>

                  {/* الدفعة */}
                  <td className="px-3 py-2 text-center">
                    {hasBatch ? (
                      <span className="inline-block font-mono text-xs px-2 py-1 bg-neutral-100 rounded">
                        {item.batch}
                      </span>
                    ) : showBatchWarning ? (
                      <span className="inline-flex items-center gap-1 text-xs text-warning-700 font-medium" title="سيُختار تلقائياً بـ FEFO">
                        <AlertCircle size={12} />
                        تلقائي
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>

                  {/* الصلاحية */}
                  <td className="px-3 py-2 text-center text-xs">
                    {item.expiry ? (
                      <span className={isExpired ? 'text-danger-700 font-bold' : 'text-neutral-700'}>
                        {formatDate(item.expiry)}
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>

                  {/* الكمية (قابلة للتعديل) */}
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.quantity || ''}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                      disabled={disabled}
                      min="0.0001"
                      step="0.01"
                      className="w-full px-2 py-1.5 text-center rounded border border-neutral-300 text-sm numeric focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:bg-neutral-100"
                    />
                  </td>

                  {/* الوحدة */}
                  <td className="px-3 py-2 text-center text-xs text-neutral-600">
                    {item.unit || '—'}
                  </td>

                  {/* السعر (قابل للتعديل) */}
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.unitPrice || ''}
                      onChange={(e) => updateItem(index, 'unitPrice', e.target.value)}
                      disabled={disabled}
                      min="0"
                      step="0.01"
                      className="w-full px-2 py-1.5 text-left rounded border border-neutral-300 text-sm numeric focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:bg-neutral-100"
                    />
                  </td>

                  {/* الإجمالي (محسوب) */}
                  <td className="px-3 py-2 text-left numeric font-bold text-neutral-900">
                    {formatCurrency(item.total || 0, false)}
                  </td>

                  {/* حذف */}
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      disabled={disabled}
                      className="p-1.5 rounded text-danger-600 hover:bg-danger-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="حذف البند"
                      title="حذف البند"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* ─── الفوتر (الإجمالي) ─── */}
          <tfoot className="bg-neutral-50 border-t-2 border-neutral-300">
            <tr>
              <td colSpan={4} className="px-3 py-3 text-left text-sm text-neutral-600">
                إجمالي البنود: <strong className="numeric">{items.length}</strong>
                {' '}&middot;{' '}
                إجمالي الكمية: <strong className="numeric">{totalQuantity.toFixed(2)}</strong>
              </td>
              <td colSpan={5} className="px-3 py-3 text-left">
                <span className="text-sm text-neutral-600 ml-2">المجموع الفرعي:</span>
                <span className="text-lg font-bold numeric text-primary-800">
                  {formatCurrency(grandTotal)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default InvoiceItemsTable;