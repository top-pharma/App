/**
 * @file InvoicePrint.jsx
 * @description
 * قالب طباعة الفاتورة (A4) بترويسة الشركة، تذييل، وعلامة مائية.
 * يعتمد على بيانات `Invoice` من الـ Backend + إعدادات `Settings`.
 *
 * لماذا هذا الملف؟
 * - يحاكي شكل الفواتير الورقية الاحترافية (مثل نموذج Phenom المرفق).
 * - يدعم RTL بشكل كامل + أرقام إنجليزية (باستخدام formatters.js).
 * - يعمل كـ Preview داخل التطبيق + عند الطباعة (window.print).
 * - يستخدم @media print لإخفاء الأزرار وإظهار الترويسة فقط.
 * - ماء العلامة المائية: صورة شعار الشركة مكررة في المنتصف بشفافية 5%
 *   (تظهر خلف الجداول كما في الصورة المرفقة).
 */

import { useRef } from 'react';
import { Printer, X } from 'lucide-react';
import Button from '../UI/Button.jsx';
import { formatCurrency, formatDate } from '../../utils/formatters.js';

// ═══════════════════════════════════════════════
// 1. المكوّن
// ═══════════════════════════════════════════════

/**
 * قالب طباعة الفاتورة
 * @param {Object} props
 * @param {Object} props.invoice - بيانات الفاتورة من الـ Backend
 * @param {Object} props.company - إعدادات الشركة (الاسم، الهاتف، البنك، إلخ)
 * @param {Function} [props.onClose] - دالة إغلاق النافذة (اختياري)
 * @returns {JSX.Element}
 */
function InvoicePrint({ invoice, company, onClose }) {
  const printRef = useRef(null);

  // دالة الطباعة (تستدعي طباعة المتصفح على القسم المحدد)
  const handlePrint = () => {
    const printContent = printRef.current;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html dir="rtl" lang="ar">
        <head>
          <title>فاتورة ${invoice.invoiceNumber}</title>
          <style>
            /* تضمين Tailwind أو CSS يدوي كافي للطباعة */
            body { font-family: 'Tajawal', sans-serif; margin: 0; padding: 0; }
            .print-container { width: 100%; max-width: 210mm; margin: auto; padding: 10mm; }
            .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.05; z-index: 0; }
            .relative-z { position: relative; z-index: 10; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #000; padding: 4px 8px; text-align: center; }
            th { background-color: #f3f4f6; }
            .totals-table td { border: none; text-align: right; padding: 4px 0; }
            .footer { border-top: 1px solid #000; padding-top: 5px; font-size: 10px; text-align: center; }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
          <script>window.print(); window.close();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex flex-col items-center justify-center p-4 overflow-y-auto">
      {/* شريط الأدوات (لا يُطبع) */}
      <div className="w-full max-w-[210mm] flex justify-between items-center bg-white p-3 rounded-t-lg print:hidden">
        <h3 className="font-bold text-lg">معاينة الفاتورة</h3>
        <div className="flex gap-2">
          <Button variant="primary" onClick={handlePrint} icon={Printer}>
            طباعة
          </Button>
          {onClose && (
            <Button variant="ghost" onClick={onClose} icon={X}>
              إغلاق
            </Button>
          )}
        </div>
      </div>

      {/* محتوى الفاتورة (يُطبع) */}
      <div
        ref={printRef}
        className="print-container relative bg-white text-black w-full max-w-[210mm] min-h-[297mm] shadow-xl print:shadow-none p-6"
        dir="rtl"
      >
        {/* 1. العلامة المائية (Watermark) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <img
            src={company.logoUrl || '/logo-placeholder.png'}
            alt="Watermark"
            className="w-[500px] h-[500px] object-contain opacity-[0.05]"
            style={{ filter: 'grayscale(100%)' }}
          />
        </div>

        {/* 2. المحتوى الفعلي */}
        <div className="relative z-10">
          {/* الترويسة (Header) */}
          <div className="flex justify-between items-center border-b-2 border-black pb-2 mb-4">
            <div className="w-24 h-16 flex items-center justify-center">
              <img
                src={company.logoUrl || '/logo-placeholder.png'}
                alt="Logo"
                className="max-w-full max-h-full object-contain"
              />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold">{company.name || 'شركة توب فارما الطبية'}</h1>
              <p className="text-sm text-neutral-600">{company.subtitle || 'أدوية - مستلزمات طبية - كوزمتك'}</p>
            </div>
            <div className="w-24 h-16 flex items-center justify-center">
              <img
                src={company.logoUrl || '/logo-placeholder.png'}
                alt="Logo"
                className="max-w-full max-h-full object-contain"
              />
            </div>
          </div>

          {/* بيانات العميل والفاتورة (Grid) */}
          <div className="border border-black rounded mb-4 text-sm">
            <div className="grid grid-cols-4 border-b border-black">
              <div className="p-2 border-l border-black font-bold bg-neutral-100">العميل</div>
              <div className="p-2 border-l border-black">{invoice.pharmacy?.name || '—'}</div>
              <div className="p-2 border-l border-black font-bold bg-neutral-100">تاريخ الفاتورة</div>
              <div className="p-2">{formatDate(invoice.invoiceDate)}</div>
            </div>
            <div className="grid grid-cols-4 border-b border-black">
              <div className="p-2 border-l border-black font-bold bg-neutral-100">العنوان</div>
              <div className="p-2 border-l border-black">{invoice.pharmacy?.address || '—'}</div>
              <div className="p-2 border-l border-black font-bold bg-neutral-100">نوع الفاتورة</div>
              <div className="p-2">مبيعات</div>
            </div>
            <div className="grid grid-cols-4">
              <div className="p-2 border-l border-black font-bold bg-neutral-100">المندوب</div>
              <div className="p-2 border-l border-black">{invoice.salesRep?.name || '—'}</div>
              <div className="p-2 border-l border-black font-bold bg-neutral-100">رقم الفاتورة</div>
              <div className="p-2 font-mono">{invoice.invoiceNumber}</div>
            </div>
          </div>

          {/* جدول الأصناف */}
          <table className="w-full border-collapse border border-black text-sm mb-4">
            <thead>
              <tr className="bg-neutral-100">
                <th className="border border-black p-1 w-8">م</th>
                <th className="border border-black p-1">البيان</th>
                <th className="border border-black p-1 w-16">الكمية</th>
                <th className="border border-black p-1 w-20">سعر الوحدة</th>
                <th className="border border-black p-1 w-16">الوحدة</th>
                <th className="border border-black p-1 w-20">الصلاحية</th>
                <th className="border border-black p-1 w-24">الجملة</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items?.map((item, idx) => (
                <tr key={idx}>
                  <td className="border border-black p-1 text-center">{idx + 1}</td>
                  <td className="border border-black p-1 pr-2">{item.item?.tradeName || item.item}</td>
                  <td className="border border-black p-1 text-center">{item.quantity}</td>
                  <td className="border border-black p-1 text-center">{formatCurrency(item.unitPrice, false)}</td>
                  <td className="border border-black p-1 text-center">{item.unit || '—'}</td>
                  <td className="border border-black p-1 text-center">{formatDate(item.expiry)}</td>
                  <td className="border border-black p-1 text-center">{formatCurrency(item.total, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* المجاميع والشروط */}
          <div className="flex justify-between items-start gap-4 mb-4">
            {/* الشروط */}
            <div className="flex-1 text-sm space-y-2">
              <p className="font-bold">شروط:</p>
              <p>لا تُقبل رد البضاعة بعد أسبوع من تاريخ استلام الفاتورة.</p>
              <p>أي تحويل لحساب غير حساب الشركة غير معتمد.</p>
              {invoice.notes && (
                <div className="mt-2 text-xs text-neutral-600">
                  <strong>ملاحظات:</strong> {invoice.notes}
                </div>
              )}
            </div>

            {/* جدول المجاميع */}
            <div className="w-72 border border-black text-sm">
              <div className="flex border-b border-black">
                <div className="w-1/2 p-1 border-l border-black font-bold bg-neutral-100 text-center">خصم</div>
                <div className="w-1/2 p-1 text-center">{formatCurrency(invoice.discount?.computedAmount || 0, false)}</div>
              </div>
              <div className="flex border-b border-black">
                <div className="w-1/2 p-1 border-l border-black font-bold bg-neutral-100 text-center">صافي الفاتورة</div>
                <div className="w-1/2 p-1 text-center">{formatCurrency(invoice.total, false)}</div>
              </div>
              <div className="flex border-b border-black">
                <div className="w-1/2 p-1 border-l border-black font-bold bg-neutral-100 text-center">مستلم نقداً</div>
                <div className="w-1/2 p-1 text-center">{formatCurrency(invoice.paidAmount, false)}</div>
              </div>
              <div className="flex border-b border-black">
                <div className="w-1/2 p-1 border-l border-black font-bold bg-neutral-100 text-center">مستلم بالبنك</div>
                <div className="w-1/2 p-1 text-center">0.00</div>
              </div>
              <div className="flex">
                <div className="w-1/2 p-1 border-l border-black font-bold bg-neutral-100 text-center">آجل الفاتورة</div>
                <div className="w-1/2 p-1 text-center font-bold">{formatCurrency(invoice.remainingAmount, false)}</div>
              </div>
            </div>
          </div>

          {/* التذييل (Footer) */}
          <div className="border-t border-black pt-2 mt-4 text-center text-xs text-neutral-700">
            <p className="font-bold text-sm">{company.name || 'شركة توب فارما الطبية'}</p>
            <p>حساب الشركة (بنك): {company.bankName} - {company.bankAccount} باسم: {company.bankAccountName}</p>
            <p>للاتصال: {company.phone} | البريد الإلكتروني: {company.email}</p>
            <p>{company.address}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InvoicePrint;