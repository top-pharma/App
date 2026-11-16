/**
 * @file reportsAPI.js
 * @description
 * API client للتقارير — مالية الآن + مبيعات/عملاء/موردين/مخزون لاحقاً.
 *
 * ✅ v10.4 (2026-11-15):
 * - حُذف `checks` من `REPORT_PATHS` (Check أُلغي في 🅲).
 */

import axiosInstance from './axiosInstance.js';

/* ─────────────────────────────────────────────────────────────
 * 1) التقارير المالية — 5
 * ───────────────────────────────────────────────────────────── */

export async function getTrialBalance({ from, to }) {
  const { data } = await axiosInstance.get('/reports/finance/trial-balance', {
    params: { from, to },
  });
  return data.data;
}

export async function getCashTransactions(params) {
  const { data } = await axiosInstance.get('/reports/finance/cash-transactions', {
    params,
  });
  return data.data;
}

export async function getFundBalances() {
  const { data } = await axiosInstance.get('/reports/finance/fund-balances');
  return data.data;
}

export async function getExpenses({ from, to }) {
  const { data } = await axiosInstance.get('/reports/finance/expenses', {
    params: { from, to },
  });
  return data.data;
}

export async function getIncomeSummary({ from, to }) {
  const { data } = await axiosInstance.get('/reports/finance/income-summary', {
    params: { from, to },
  });
  return data.data;
}

/* ─────────────────────────────────────────────────────────────
 * 2) التصدير الموحد
 * ───────────────────────────────────────────────────────────── */

const REPORT_PATHS = Object.freeze({
  'trial-balance': '/reports/finance/trial-balance',
  'cash-transactions': '/reports/finance/cash-transactions',
  'fund-balances': '/reports/finance/fund-balances',
  expenses: '/reports/finance/expenses',
  'income-summary': '/reports/finance/income-summary',
});

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
  getExpenses,
  getIncomeSummary,
  exportFinanceReport,
};