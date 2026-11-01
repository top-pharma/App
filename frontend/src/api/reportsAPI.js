
/**
 * @file reportsAPI.js
 * @description
 * API client للتقارير — مالية الآن + مبيعات/عملاء/موردين/مخزون لاحقاً.
 *
 * المبادئ:
 *  - كل دالة get → data.data (يستدعي axiosInstance).
 *  - التصدير: responseType: 'blob'.
 *  - ملف filename يُستخرج من content-disposition.
 */

import axiosInstance from './axiosInstance.js';

/* ─────────────────────────────────────────────────────────────
 * 1) التقارير المالية — 6
 * ───────────────────────────────────────────────────────────── */

/**
 * ميزان المراجعة.
 * @param {{from: string, to: string}} params
 */
export async function getTrialBalance({ from, to }) {
  const { data } = await axiosInstance.get('/reports/finance/trial-balance', {
    params: { from, to },
  });
  return data.data;
}

/**
 * الحركات النقدية.
 * @param {Object} params - { from, to, direction, method, cashFundId, bankAccountId }
 */
export async function getCashTransactions(params) {
  const { data } = await axiosInstance.get('/reports/finance/cash-transactions', {
    params,
  });
  return data.data;
}

/**
 * أرصدة الصناديق والبنك.
 */
export async function getFundBalances() {
  const { data } = await axiosInstance.get('/reports/finance/fund-balances');
  return data.data;
}

/**
 * الشيكات.
 * @param {Object} params - { from, to, status, type }
 */
export async function getChecks(params = {}) {
  const { data } = await axiosInstance.get('/reports/finance/checks', { params });
  return data.data;
}

/**
 * المصروفات.
 * @param {{from: string, to: string}} params
 */
export async function getExpenses({ from, to }) {
  const { data } = await axiosInstance.get('/reports/finance/expenses', {
    params: { from, to },
  });
  return data.data;
}

/**
 * الإيرادات - المصروفات.
 * @param {{from: string, to: string}} params
 */
export async function getIncomeSummary({ from, to }) {
  const { data } = await axiosInstance.get('/reports/finance/income-summary', {
    params: { from, to },
  });
  return data.data;
}

/* ─────────────────────────────────────────────────────────────
 * 2) التصدير الموحد
 * ───────────────────────────────────────────────────────────── */

/**
 * خريطة اسم التقرير → مساره (يُستخدم في التصدير).
 */
const REPORT_PATHS = Object.freeze({
  'trial-balance': '/reports/finance/trial-balance',
  'cash-transactions': '/reports/finance/cash-transactions',
  'fund-balances': '/reports/finance/fund-balances',
  checks: '/reports/finance/checks',
  expenses: '/reports/finance/expenses',
  'income-summary': '/reports/finance/income-summary',
});

/**
 * تصدير تقرير مالي.
 * @param {string} reportName - اسم التقرير (من REPORT_PATHS)
 * @param {'xlsx'|'pdf'} format
 * @param {Object} params - فلاتر التقرير
 * @returns {Promise<{blob: Blob, filename: string}>}
 */
export async function exportFinanceReport(reportName, format, params = {}) {
  const path = REPORT_PATHS[reportName];
  if (!path) {
    throw new Error(`تقرير غير معروف: ${reportName}`);
  }

  const response = await axiosInstance.get(path, {
    params: { ...params, format },
    responseType: 'blob',
  });

  const contentDisposition = response.headers?.['content-disposition'] || '';
  let filename = `${reportName}.${format}`;
  const match = contentDisposition.match(/filename="?([^"]+)"?/);
  if (match && match[1]) {
    filename = decodeURIComponent(match[1]);
  }

  return { blob: response.data, filename };
}

export default {
  getTrialBalance,
  getCashTransactions,
  getFundBalances,
  getChecks,
  getExpenses,
  getIncomeSummary,
  exportFinanceReport,
};