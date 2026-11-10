/**
 * @file InvoicePrint.jsx
 * @description قالب طباعة الفاتورة (A4) — نسخة 3 (2026-11-10).
 *
 * ✅ الحل الجذري:
 * - كتابة HTML كامل في نافذة الطباعة (بدون innerHTML).
 * - العلامة المائية: 120mm × 120mm (بدل 500px) — لا تأخذ الحيز.
 * - الترويسة: تظهر بالكامل (لوغو + اسم + إيميل).
 * - A4 واحدة: `height: 297mm` + `box-sizing: border-box` + `overflow: hidden`.
 * - الفوتر: `position: absolute; bottom: 0` (لا يرتفع).
 * - المعاينة: `items-start` + العلامة المائية 200px (بدل 500px).
 */

import { useRef, useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import Button from '../UI/Button.jsx';
import { formatCurrency, formatDate } from '../../utils/formatters.js';

const COMPANY_NAME = 'شركة توب فارمة التجارية لتوزيع الأدوية';

function InvoicePrint({ invoice, company, onClose }) {
  // ✅ منع تمرير الصفحة خلف المعاينة
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  const handlePrint = () => {
    const logoUrl = company.logoUrl || '/logo.png';
    const absoluteLogoUrl = logoUrl.startsWith('http')
      ? logoUrl
      : `${window.location.origin}${logoUrl}`;

    // ✅ بناء HTML كامل — بدون innerHTML
    const itemsRows = (invoice.items || []).map((item, idx) => `
      <tr>
        <td style="border:1px solid #000;padding:3px 4px;text-align:center;">${idx + 1}</td>
        <td style="border:1px solid #000;padding:3px 4px;text-align:right;">${item.item?.tradeName || item.item || '—'}</td>
        <td style="border:1px solid #000;padding:3px 4px;text-align:center;">${item.quantity}</td>
        <td style="border:1px solid #000;padding:3px 4px;text-align:center;">${formatCurrency(item.unitPrice, false)}</td>
        <td style="border:1px solid #000;padding:3px 4px;text-align:center;">${item.unit || '—'}</td>
        <td style="border:1px solid #000;padding:3px 4px;text-align:center;">${formatDate(item.expiry)}</td>
        <td style="border:1px solid #000;padding:3px 4px;text-align:center;">${formatCurrency(item.total, false)}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8" />
          <title>فاتورة ${invoice.invoiceNumber}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            @page { size: A4 portrait; margin: 6mm; }
            html, body {
              font-family: 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif;
              font-size: 10px;
              color: #000;
              background: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .page {
              position: relative;
              width: 100%;
              height: 285mm;
              overflow: hidden;
              display: flex;
              flex-direction: column;
            }
            /* العلامة المائية — 120mm فقط */
            .watermark {
              position: absolute;
              top: 50%; left: 50%;
              transform: translate(-50%, -50%);
              width: 120mm; height: 120mm;
              object-fit: contain;
              opacity: 0.035;
              filter: grayscale(100%);
              z-index: 0;
              pointer-events: none;
            }
            .content {
              position: relative;
              z-index: 1;
              display: flex;
              flex-direction: column;
              height: 100%;
            }
            /* الترويسة */
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #000;
              padding-bottom: 5px;
              margin-bottom: 6px;
              gap: 6px;
            }
            .header-logo { width: 65px; height: 45px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
            .header-logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
            .header-center { text-align: center; flex: 1; }
            .header-center h1 { font-size: 14px; font-weight: 800; margin: 0; }
            .header-center p { font-size: 9px; color: #444; margin: 1px 0; }
            .header-center .contact { font-size: 8px; color: #666; margin-top: 1px; }
            /* بيانات العميل */
            .info-grid { border: 1px solid #000; margin-bottom: 6px; font-size: 9px; }
            .info-row { display: grid; grid-template-columns: 1fr 1.5fr 1fr 1.5fr; border-bottom: 1px solid #000; }
            .info-row:last-child { border-bottom: none; }
            .info-cell { padding: 3px 5px; border-left: 1px solid #000; }
            .info-cell:first-child { border-left: none; }
            .info-label { background: #f3f4f6; font-weight: 700; }
            /* جدول الأصناف */
            table.items { width: 100%; border-collapse: collapse; font-size: 9px; margin-bottom: 6px; }
            table.items th { background: #f3f4f6; font-weight: 700; border: 1px solid #000; padding: 3px 4px; text-align: center; }
            /* المجاميع */
            .bottom { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; margin-bottom: 6px; }
            .notes { flex: 1; font-size: 8px; line-height: 1.5; }
            .notes .title { font-weight: 700; margin-bottom: 2px; }
            .totals { width: 60mm; border: 1px solid #000; font-size: 9px; }
            .totals-row { display: flex; border-bottom: 1px solid #000; }
            .totals-row:last-child { border-bottom: none; }
            .totals-label { width: 50%; padding: 3px 4px; border-left: 1px solid #000; background: #f3f4f6; font-weight: 700; text-align: center; }
            .totals-value { width: 50%; padding: 3px 4px; text-align: center; }
            /* التذييل — مثبت في الأسفل */
            .footer {
              position: absolute;
              bottom: 0;
              left: 0;
              right: 0;
              border-top: 1px solid #000;
              padding-top: 4px;
              text-align: center;
              font-size: 8px;
              color: #333;
              line-height: 1.5;
            }
            .footer .company-name { font-size: 10px; font-weight: 700; color: #000; margin-bottom: 1px; }
          </style>
        </head>
        <body>
          <div class="page">
            <img class="watermark" src="${absoluteLogoUrl}" alt="" onerror="this.style.display='none'" />
            <div class="content">
              <!-- الترويسة -->
              <div class="header">
                <div class="header-logo">
                  <img src="${absoluteLogoUrl}" alt="Logo" onerror="this.style.display='none'" />
                </div>
                <div class="header-center">
                  <h1>${company.name || COMPANY_NAME}</h1>
                  <p>${company.subtitle || 'أدوية - مستلزمات طبية - كوزمتك'}</p>
                  <div class="contact">
                    هاتف: ${company.phone || '—'} | بريد: ${company.email || '—'}
                  </div>
                </div>
                <div class="header-logo">
                  <img src="${absoluteLogoUrl}" alt="Logo" onerror="this.style.display='none'" />
                </div>
              </div>

              <!-- بيانات العميل -->
              <div class="info-grid">
                <div class="info-row">
                  <div class="info-cell info-label">العميل</div>
                  <div class="info-cell">${invoice.pharmacy?.name || '—'}</div>
                  <div class="info-cell info-label">تاريخ الفاتورة</div>
                  <div class="info-cell">${formatDate(invoice.invoiceDate)}</div>
                </div>
                <div class="info-row">
                  <div class="info-cell info-label">العنوان</div>
                  <div class="info-cell">${invoice.pharmacy?.address || '—'}</div>
                  <div class="info-cell info-label">نوع الفاتورة</div>
                  <div class="info-cell">مبيعات</div>
                </div>
                <div class="info-row">
                  <div class="info-cell info-label">المندوب</div>
                  <div class="info-cell">${invoice.salesRep?.name || '—'}</div>
                  <div class="info-cell info-label">رقم الفاتورة</div>
                  <div class="info-cell" style="font-family:monospace;">${invoice.invoiceNumber}</div>
                </div>
              </div>

              <!-- جدول الأصناف -->
              <table class="items">
                <thead>
                  <tr>
                    <th style="width:20px;">م</th>
                    <th>البيان</th>
                    <th style="width:40px;">الكمية</th>
                    <th style="width:60px;">سعر الوحدة</th>
                    <th style="width:40px;">الوحدة</th>
                    <th style="width:60px;">الصلاحية</th>
                    <th style="width:60px;">الجملة</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsRows}
                </tbody>
              </table>

              <!-- الشروط + المجاميع -->
              <div class="bottom">
                <div class="notes">
                  <div class="title">شروط:</div>
                  <div>لا تُقبل رد البضاعة بعد أسبوع من تاريخ استلام الفاتورة.</div>
                  <div>أي تحويل لحساب غير حساب الشركة غير معتمد.</div>
                  ${invoice.notes ? `<div style="margin-top:4px;color:#555;"><strong>ملاحظات:</strong> ${invoice.notes}</div>` : ''}
                </div>
                <div class="totals">
                  <div class="totals-row">
                    <div class="totals-label">خصم</div>
                    <div class="totals-value">${formatCurrency(invoice.discount?.computedAmount || 0, false)}</div>
                  </div>
                  <div class="totals-row">
                    <div class="totals-label">صافي الفاتورة</div>
                    <div class="totals-value">${formatCurrency(invoice.total, false)}</div>
                  </div>
                  <div class="totals-row">
                    <div class="totals-label">مستلم نقداً</div>
                    <div class="totals-value">${formatCurrency(invoice.paidAmount, false)}</div>
                  </div>
                  <div class="totals-row">
                    <div class="totals-label">مستلم بالبنك</div>
                    <div class="totals-value">0.00</div>
                  </div>
                  <div class="totals-row">
                    <div class="totals-label">آجل الفاتورة</div>
                    <div class="totals-value" style="font-weight:700;">${formatCurrency(invoice.remainingAmount, false)}</div>
                  </div>
                </div>
              </div>

              <!-- التذييل -->
              <div class="footer">
                <div class="company-name">${company.name || COMPANY_NAME}</div>
                <div>حساب الشركة (بنك): ${company.bankName || '—'} - ${company.bankAccount || '—'} باسم: ${company.bankAccountName || COMPANY_NAME}</div>
                <div>للاتصال: ${company.phone || '—'} | البريد الإلكتروني: ${company.email || '—'}</div>
                <div>${company.address || '—'}</div>
              </div>
            </div>
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 300);
            };
          </script>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('يرجى السماح بالنوافذ المنبثقة للطباعة.');
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div className="min-h-full flex flex-col items-center py-4 px-2">
        {/* شريط الأدوات — sticky */}
        <div className="w-full max-w-[210mm] sticky top-0 z-10 flex justify-between items-center bg-white p-3 rounded-t-lg shadow-md mb-2 print:hidden">
          <h3 className="font-bold text-lg text-neutral-900">معاينة الفاتورة</h3>
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

        {/* معاينة الفاتورة — العلامة المائية 200px فقط */}
        <div
          className="relative bg-white text-black w-full max-w-[210mm] shadow-xl p-6"
          dir="rtl"
          style={{ minHeight: 'auto' }}
        >
          {/* العلامة المائية للمعاينة — 200px */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <img
              src={company.logoUrl || '/logo.png'}
              alt="Watermark"
              className="w-[200px] h-[200px] object-contain"
              style={{ opacity: 0.04, filter: 'grayscale(100%)' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>

          <div className="relative z-10 flex flex-col">
            {/* الترويسة */}
            <div className="flex justify-between items-center border-b-2 border-black pb-2 mb-3 gap-2">
              <div className="w-20 h-14 flex items-center justify-center">
                <img
                  src={company.logoUrl || '/logo.png'}
                  alt="Logo"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
              <div className="text-center flex-1">
                <h1 className="text-lg font-bold">{company.name || COMPANY_NAME}</h1>
                <p className="text-xs text-neutral-600">{company.subtitle || 'أدوية - مستلزمات طبية - كوزمتك'}</p>
                <div className="text-[10px] text-neutral-500 mt-0.5">
                  هاتف: {company.phone || '—'} | بريد: {company.email || '—'}
                </div>
              </div>
              <div className="w-20 h-14 flex items-center justify-center">
                <img
                  src={company.logoUrl || '/logo.png'}
                  alt="Logo"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
            </div>

            {/* بيانات العميل */}
            <div className="border border-black rounded mb-3 text-xs">
              <div className="grid grid-cols-4 border-b border-black">
                <div className="p-1.5 border-l border-black font-bold bg-neutral-100">العميل</div>
                <div className="p-1.5 border-l border-black">{invoice.pharmacy?.name || '—'}</div>
                <div className="p-1.5 border-l border-black font-bold bg-neutral-100">تاريخ الفاتورة</div>
                <div className="p-1.5">{formatDate(invoice.invoiceDate)}</div>
              </div>
              <div className="grid grid-cols-4 border-b border-black">
                <div className="p-1.5 border-l border-black font-bold bg-neutral-100">العنوان</div>
                <div className="p-1.5 border-l border-black">{invoice.pharmacy?.address || '—'}</div>
                <div className="p-1.5 border-l border-black font-bold bg-neutral-100">نوع الفاتورة</div>
                <div className="p-1.5">مبيعات</div>
              </div>
              <div className="grid grid-cols-4">
                <div className="p-1.5 border-l border-black font-bold bg-neutral-100">المندوب</div>
                <div className="p-1.5 border-l border-black">{invoice.salesRep?.name || '—'}</div>
                <div className="p-1.5 border-l border-black font-bold bg-neutral-100">رقم الفاتورة</div>
                <div className="p-1.5 font-mono">{invoice.invoiceNumber}</div>
              </div>
            </div>

            {/* جدول الأصناف */}
            <table className="w-full border-collapse border border-black text-xs mb-3">
              <thead>
                <tr className="bg-neutral-100">
                  <th className="border border-black p-1 w-8">م</th>
                  <th className="border border-black p-1">البيان</th>
                  <th className="border border-black p-1 w-14">الكمية</th>
                  <th className="border border-black p-1 w-20">سعر الوحدة</th>
                  <th className="border border-black p-1 w-14">الوحدة</th>
                  <th className="border border-black p-1 w-20">الصلاحية</th>
                  <th className="border border-black p-1 w-20">الجملة</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items?.map((item, idx) => (
                  <tr key={idx}>
                    <td className="border border-black p-1 text-center">{idx + 1}</td>
                    <td className="border border-black p-1 pr-2 text-right">{item.item?.tradeName || item.item}</td>
                    <td className="border border-black p-1 text-center">{item.quantity}</td>
                    <td className="border border-black p-1 text-center">{formatCurrency(item.unitPrice, false)}</td>
                    <td className="border border-black p-1 text-center">{item.unit || '—'}</td>
                    <td className="border border-black p-1 text-center">{formatDate(item.expiry)}</td>
                    <td className="border border-black p-1 text-center">{formatCurrency(item.total, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* الشروط + المجاميع */}
            <div className="flex justify-between items-start gap-3 mb-3">
              <div className="flex-1 text-xs space-y-1">
                <p className="font-bold">شروط:</p>
                <p className="text-[10px]">لا تُقبل رد البضاعة بعد أسبوع من تاريخ استلام الفاتورة.</p>
                <p className="text-[10px]">أي تحويل لحساب غير حساب الشركة غير معتمد.</p>
              </div>
              <div className="w-64 border border-black text-xs">
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

            {/* التذييل */}
            <div className="border-t border-black pt-2 mt-auto text-center text-[10px] text-neutral-700">
              <p className="font-bold text-xs">{company.name || COMPANY_NAME}</p>
              <p>حساب الشركة (بنك): {company.bankName || '—'} - {company.bankAccount || '—'} باسم: {company.bankAccountName || COMPANY_NAME}</p>
              <p>للاتصال: {company.phone || '—'} | البريد الإلكتروني: {company.email || '—'}</p>
              <p>{company.address || '—'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InvoicePrint;