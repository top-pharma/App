/**
 * @file reportPdfTemplate.js
 * @description
 * قالب HTML احترافي للـ PDF.
 *
 * الميزات:
 *  - RTL كامل + خط Tajawal (Google Fonts) مع fallback Arial.
 *  - ترويسة: شركة + عنوان + فترة + تاريخ.
 *  - جدول بأعمدة وأرقام محاذاة يسار.
 *  - صفوف إجمالي اختيارية.
 *  - علامة مائية شفافة.
 *  - تذييل: "سري" + ترقيم صفحات (يُدار من Puppeteer).
 */

/**
 * تهريب HTML لمنع XSS.
 * @param {*} str
 * @returns {string}
 */
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * تنسيق رقم بفاصل آلاف + خانتين.
 * @param {number} n
 * @returns {string}
 */
function fmtNumber(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * بناء HTML للتقرير.
 * @param {Object} params
 * @param {string} params.title
 * @param {string[]} params.columns
 * @param {Array<Array>} params.rows
 * @param {Object} [params.meta]
 * @param {string} [params.watermark]
 * @param {Array<Object>} [params.summaryRows]
 * @returns {string}
 */
export function buildReportHtml({
  title,
  columns,
  rows,
  meta = {},
  watermark = 'TOP PHARMA',
  summaryRows = [],
}) {
  const company = meta.company || 'TOP PHARMA MEDICAL COMPANY';
  const companyAr = meta.companyAr || 'شركة توب فارما الطبية';
  const periodLabel = meta.periodLabel || '';
  const generatedAt = meta.generatedAt || '';

  const watermarkHtml = watermark
    ? `<div class="watermark">${esc(watermark)}</div>`
    : '';

  const headerHtml = `
    <header class="report-header">
      <div class="header-right">
        <div class="company-name">${esc(company)}</div>
        <div class="company-sub">${esc(companyAr)}</div>
      </div>
      <div class="header-left">
        <div class="report-title">${esc(title)}</div>
        ${periodLabel ? `<div class="report-meta">${esc(periodLabel)}</div>` : ''}
        ${generatedAt ? `<div class="report-meta">أُنشئ: ${esc(generatedAt)}</div>` : ''}
      </div>
    </header>
  `;

  const tableHead = `
    <thead>
      <tr>
        ${columns.map((c) => `<th>${esc(c)}</th>`).join('')}
      </tr>
    </thead>
  `;

  const tableBody = `
    <tbody>
      ${
        rows.length === 0
          ? `<tr><td colspan="${columns.length}" class="empty">لا توجد بيانات في هذه الفترة</td></tr>`
          : rows
              .map(
                (row) => `
                  <tr>
                    ${row
                      .map((val) => {
                        const isNum = typeof val === 'number';
                        const content = isNum ? fmtNumber(val) : esc(val ?? '');
                        return `<td class="${isNum ? 'num' : ''}">${content}</td>`;
                      })
                      .join('')}
                  </tr>
                `
              )
              .join('')
      }
    </tbody>
  `;

  const summaryHtml =
    summaryRows.length > 0
      ? `
        <tfoot>
          ${summaryRows
            .map(
              (row) => `
                <tr>
                  ${columns
                    .map((_, i) => {
                      const val = row[i];
                      const isNum = typeof val === 'number';
                      const content = isNum ? fmtNumber(val) : esc(val ?? '');
                      return `<td class="${isNum ? 'num' : ''}">${content}</td>`;
                    })
                    .join('')}
                </tr>
              `
            )
            .join('')}
        </tfoot>
      `
      : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      font-family: 'Tajawal', 'Arial', sans-serif;
      font-size: 10px;
      color: #1F2937;
      background: #fff;
      direction: rtl;
    }
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 110px;
      font-weight: 700;
      color: rgba(30, 64, 175, 0.06);
      z-index: -1;
      pointer-events: none;
      white-space: nowrap;
      user-select: none;
      letter-spacing: 4px;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 12px;
      border-bottom: 2px solid #1E40AF;
      margin-bottom: 14px;
    }
    .header-right { text-align: right; }
    .header-left { text-align: left; }
    .company-name {
      font-size: 12px;
      font-weight: 700;
      color: #1E40AF;
      letter-spacing: 0.5px;
    }
    .company-sub {
      font-size: 10px;
      color: #6B7280;
      margin-top: 2px;
    }
    .report-title {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
    }
    .report-meta {
      font-size: 9px;
      color: #6B7280;
      margin-top: 3px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      font-size: 9.5px;
    }
    thead th {
      background: #1E40AF;
      color: #fff;
      padding: 7px 5px;
      text-align: right;
      font-weight: 600;
      font-size: 9.5px;
      border: 1px solid #1E40AF;
    }
    tbody td {
      padding: 5px;
      border: 1px solid #E5E7EB;
      text-align: right;
      vertical-align: middle;
    }
    tbody td.num {
      text-align: left;
      font-variant-numeric: tabular-nums;
    }
    tbody tr:nth-child(even) { background: #F9FAFB; }
    tbody td.empty {
      text-align: center;
      color: #9CA3AF;
      padding: 20px;
      font-style: italic;
    }
    tfoot td {
      background: #DBEAFE;
      color: #111827;
      font-weight: 700;
      padding: 6px 5px;
      border: 1px solid #1E40AF;
      text-align: right;
    }
    tfoot td.num {
      text-align: left;
      font-variant-numeric: tabular-nums;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  ${watermarkHtml}
  ${headerHtml}
  <table>
    ${tableHead}
    ${tableBody}
    ${summaryHtml}
  </table>
</body>
</html>`;
}

export default { buildReportHtml };