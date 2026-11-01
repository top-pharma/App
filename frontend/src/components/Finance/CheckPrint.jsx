/**
 * CheckPrint.jsx
 *
 * قالب طباعة شيك A4 RTL.
 * يعرض تفاصيل الشيك مع توقيعات.
 */

import { forwardRef } from 'react';
import { format } from 'date-fns';

const formatDate = (date) => {
  if (!date) return '-';
  try {
    return format(new Date(date), 'dd/MM/yyyy');
  } catch {
    return '-';
  }
};

const formatAmount = (amount) => {
  return Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const CheckPrint = forwardRef(({ check }, ref) => {
  if (!check) return null;

  const isIncoming = check.type === 'incoming';
  const counterparty = isIncoming
    ? check.customerId?.name || 'عميل'
    : check.supplierId?.name || 'مورد';

  const statusLabels = {
    pending: 'معلّق (لم يُحصَّل)',
    collected: 'مُحصَّل',
    paid: 'مدفوع',
    bounced: 'مرتد',
    cancelled: 'ملغى',
  };

  return (
    <div
      ref={ref}
      dir="rtl"
      className="bg-white p-8 text-gray-900"
      style={{ width: '210mm', minHeight: '297mm', margin: '0 auto' }}
    >
      {/* الرأس */}
      <div className="border-b-2 border-blue-700 pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-blue-700">TOP PHARMA MEDICAL CO.</h1>
            <p className="text-sm text-gray-600 mt-1">شركة توب فارما الطبية</p>
          </div>
          <div className="text-left">
            <h2 className="text-xl font-semibold text-gray-800">
              {isIncoming ? 'شيك وارد' : 'شيك صادر'}
            </h2>
            <p className="text-sm text-gray-600">رقم: {check.checkNumber}</p>
          </div>
        </div>
      </div>

      {/* التفاصيل */}
      <table className="w-full border-collapse mb-6">
        <tbody>
          <tr>
            <td className="border border-gray-300 p-3 bg-gray-50 font-semibold w-1/3">رقم الشيك</td>
            <td className="border border-gray-300 p-3">{check.checkNumber}</td>
          </tr>
          <tr>
            <td className="border border-gray-300 p-3 bg-gray-50 font-semibold">البنك</td>
            <td className="border border-gray-300 p-3">{check.bankName}</td>
          </tr>
          <tr>
            <td className="border border-gray-300 p-3 bg-gray-50 font-semibold">
              {isIncoming ? 'العميل' : 'المورد'}
            </td>
            <td className="border border-gray-300 p-3">{counterparty}</td>
          </tr>
          <tr>
            <td className="border border-gray-300 p-3 bg-gray-50 font-semibold">المبلغ</td>
            <td className="border border-gray-300 p-3 font-bold text-lg">
              {formatAmount(check.amount)} SDG
            </td>
          </tr>
          <tr>
            <td className="border border-gray-300 p-3 bg-gray-50 font-semibold">تاريخ الإصدار</td>
            <td className="border border-gray-300 p-3">{formatDate(check.issueDate)}</td>
          </tr>
          <tr>
            <td className="border border-gray-300 p-3 bg-gray-50 font-semibold">تاريخ الاستحقاق</td>
            <td className="border border-gray-300 p-3">{formatDate(check.dueDate)}</td>
          </tr>
          <tr>
            <td className="border border-gray-300 p-3 bg-gray-50 font-semibold">الحالة</td>
            <td className="border border-gray-300 p-3">{statusLabels[check.status] || check.status}</td>
          </tr>
          {check.notes && (
            <tr>
              <td className="border border-gray-300 p-3 bg-gray-50 font-semibold">ملاحظات</td>
              <td className="border border-gray-300 p-3">{check.notes}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* التوقيعات */}
      <div className="grid grid-cols-2 gap-8 mt-16">
        <div className="text-center">
          <div className="border-t border-gray-400 pt-2 mt-16">
            <p className="text-sm font-semibold">توقيع المستلم</p>
          </div>
        </div>
        <div className="text-center">
          <div className="border-t border-gray-400 pt-2 mt-16">
            <p className="text-sm font-semibold">توقيع المحاسب</p>
          </div>
        </div>
      </div>

      {/* التذييل */}
      <div className="mt-12 pt-4 border-t border-gray-300 text-center text-xs text-gray-500">
        <p>TOP PHARMA MEDICAL COMPANY — السودان</p>
        <p className="mt-1">تم الطباعة في: {formatDate(new Date())}</p>
      </div>
    </div>
  );
});

CheckPrint.displayName = 'CheckPrint';

export default CheckPrint;