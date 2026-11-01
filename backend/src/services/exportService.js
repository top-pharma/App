/**
 * @file exportService.js
 * @description
 * خدمة التصدير — Excel (exceljs) + PDF (puppeteer-core + Chrome/Edge).
 *
 * المبادئ:
 *  - Excel: RTL + ترويسة + صفوف ملونة بالتبادل + عرض أعمدة ثابت.
 *  - PDF: HTML → A4 RTL + خط عربي + علامة مائية + ترقيم صفحات.
 *  - البحث التلقائي عن Chrome/Edge (Windows/Mac/Linux) + دعم CHROME_PATH.
 *  - التصديران named + default (للتوافق مع أي نمط استيراد).
 */

import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer-core';

import { AppError } from '../middlewares/errorMiddleware.js';
import { logger } from '../utils/logger.js';
import { buildReportHtml } from '../templates/reportPdfTemplate.js';

/* ═════════════════════════════════════════════════════════════
 * 1) كشف مسار Chrome/Edge
 * ═════════════════════════════════════════════════════════════ */

/**
 * إيجاد مسار Chrome/Edge المثبت على الجهاز.
 * يجرّب CHROME_PATH أولاً، ثم المسارات الشائعة لكل نظام.
 *
 * @returns {string} المسار المطلق للتنفيذ
 * @throws {AppError} CHROME_NOT_FOUND
 */
export function findChromeExecutable() {
  // 1. متغير البيئة
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const candidates = [];

  if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env['LOCALAPPDATA'] || '';

    candidates.push(
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      local && path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge'
    );
  }

  for (const c of candidates.filter(Boolean)) {
    if (fs.existsSync(c)) return c;
  }

  throw new AppError(
    'لم يُعثر على Chrome أو Edge. ثبّت أحدهما، أو عيّن CHROME_PATH في .env',
    500,
    'CHROME_NOT_FOUND'
  );
}

/* ═════════════════════════════════════════════════════════════
 * 2) تصدير Excel
 * ═════════════════════════════════════════════════════════════ */

/**
 * إنشاء ملف Excel (.xlsx) من بيانات جدولية.
 *
 * @param {Object} params
 * @param {string} params.title - عنوان التقرير
 * @param {string[]} params.columns - أسماء الأعمدة (بالترتيب)
 * @param {Array<Array>} params.rows - الصفوف (قيم خام، لا كائنات)
 * @param {Object} [params.meta] - { periodLabel, from, to, generatedAt, company, companyAr }
 * @param {Array<Object>} [params.summaryRows] - صفوف إجمالي اختيارية
 * @returns {Promise<Buffer>}
 */
export async function exportToExcel({
  title,
  columns,
  rows,
  meta = {},
  summaryRows = [],
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = meta.company || 'Pharma System';
  workbook.created = new Date();

  const sheetName = String(title || 'تقرير')
    .slice(0, 30)
    .replace(/[\\/*?:[\]]/g, '-');

  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ rightToLeft: true }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
  });

  const totalCols = Math.max(1, columns.length);

  // ─── 1. الترويسة (3 أسطر) ───
  sheet.mergeCells(1, 1, 1, totalCols);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = meta.companyAr || meta.company || 'TOP PHARMA';
  titleCell.font = { size: 12, bold: true, color: { argb: 'FF1E40AF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 22;

  sheet.mergeCells(2, 1, 2, totalCols);
  const subTitleCell = sheet.getCell(2, 1);
  subTitleCell.value = title;
  subTitleCell.font = { size: 16, bold: true, color: { argb: 'FF111827' } };
  subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 28;

  sheet.mergeCells(3, 1, 3, totalCols);
  const metaCell = sheet.getCell(3, 1);
  const metaLine = [
    meta.periodLabel || '',
    meta.generatedAt ? `أُنشئ: ${meta.generatedAt}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
  metaCell.value = metaLine;
  metaCell.font = { size: 9, color: { argb: 'FF6B7280' }, italic: true };
  metaCell.alignment = { horizontal: 'center' };

  // ─── 2. رأس الجدول (صف 5) ───
  const headerRow = sheet.getRow(5);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E40AF' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF1E40AF' } },
      bottom: { style: 'thin', color: { argb: 'FF1E40AF' } },
      left: { style: 'thin', color: { argb: 'FF1E40AF' } },
      right: { style: 'thin', color: { argb: 'FF1E40AF' } },
    };
  });
  headerRow.height = 26;

  // ─── 3. الصفوف ───
  rows.forEach((row, ri) => {
    const r = sheet.getRow(6 + ri);
    row.forEach((val, ci) => {
      const cell = r.getCell(ci + 1);
      const isNumber = typeof val === 'number';
      cell.value = val ?? '';
      cell.alignment = {
        horizontal: isNumber ? 'left' : 'right',
        vertical: 'middle',
        wrapText: false,
      };
      cell.border = {
        top: { style: 'hair', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
        left: { style: 'hair', color: { argb: 'FFE5E7EB' } },
        right: { style: 'hair', color: { argb: 'FFE5E7EB' } },
      };
      cell.font = { size: 10 };
      if (isNumber) cell.numFmt = '#,##0.00';
      if (ri % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' },
        };
      }
    });
  });

  // ─── 4. صفوف الإجمالي ───
  let footerRowIndex = 6 + rows.length;
  if (summaryRows.length > 0) {
    for (let s = 0; s < summaryRows.length; s++) {
      const summaryRow = summaryRows[s];
      const r = sheet.getRow(footerRowIndex + s);
      columns.forEach((_, ci) => {
        const cell = r.getCell(ci + 1);
        const rawVal = summaryRow[ci];
        const isNumber = typeof rawVal === 'number';
        cell.value = rawVal ?? '';
        cell.font = { bold: true, size: 10, color: { argb: 'FF111827' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFDBEAFE' },
        };
        cell.alignment = {
          horizontal: isNumber ? 'left' : 'right',
          vertical: 'middle',
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF1E40AF' } },
          bottom: { style: 'thin', color: { argb: 'FF1E40AF' } },
        };
        if (isNumber) cell.numFmt = '#,##0.00';
      });
      r.height = 22;
    }
    footerRowIndex += summaryRows.length;
  }

  // ─── 5. عرض الأعمدة ───
  columns.forEach((_, i) => {
    sheet.getColumn(i + 1).width = 18;
  });

  // ─── 6. التذييل ───
  const footerLineIdx = footerRowIndex + 2;
  sheet.mergeCells(footerLineIdx, 1, footerLineIdx, totalCols);
  const footerCell = sheet.getCell(footerLineIdx, 1);
  footerCell.value = `TOP PHARMA — سري — للاستخدام الداخلي فقط — ${
    meta.generatedAt || ''
  }`;
  footerCell.font = { size: 8, italic: true, color: { argb: 'FF9CA3AF' } };
  footerCell.alignment = { horizontal: 'center' };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/* ═════════════════════════════════════════════════════════════
 * 3) تصدير PDF
 * ═════════════════════════════════════════════════════════════ */

/**
 * إنشاء ملف PDF من قالب HTML (A4 RTL + علامة مائية).
 *
 * @param {Object} params
 * @param {string} params.title
 * @param {string[]} params.columns
 * @param {Array<Array>} params.rows
 * @param {Object} [params.meta]
 * @param {string} [params.watermark='TOP PHARMA']
 * @param {Array<Object>} [params.summaryRows]
 * @returns {Promise<Buffer>}
 */
export async function exportToPdf({
  title,
  columns,
  rows,
  meta = {},
  watermark = 'TOP PHARMA',
  summaryRows = [],
}) {
  const executablePath = findChromeExecutable();

  const html = buildReportHtml({
    title,
    columns,
    rows,
    meta,
    watermark,
    summaryRows,
  });

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none',
      ],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width:100%;padding:0 14mm;font-size:8px;color:#9CA3AF;text-align:center;font-family:Arial,sans-serif;direction:rtl;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>
      `,
    });

    return Buffer.from(pdfBuffer);
  } catch (err) {
    logger.error(`[exportService] فشل PDF: ${err.message}`);
    if (err instanceof AppError) throw err;
    throw new AppError('فشل توليد PDF.', 500, 'PDF_GENERATION_FAILED');
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        logger.warn(`[exportService] فشل إغلاق المتصفح: ${closeErr.message}`);
      }
    }
  }
}

/* ═════════════════════════════════════════════════════════════
 * 4) التصدير الافتراضي (للتوافق مع default import)
 * ═════════════════════════════════════════════════════════════ */

export default {
  exportToExcel,
  exportToPdf,
  findChromeExecutable,
};