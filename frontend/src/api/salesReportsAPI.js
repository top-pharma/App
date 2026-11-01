/**
 * @file salesReportsAPI.js — Phase 4 + Sales Rep Statement
 */

import axiosInstance from './axiosInstance.js';

export async function getInvoices(params) {
  const { data } = await axiosInstance.get('/reports/sales/invoices', { params });
  return data.data;
}

export async function getByRep(params) {
  const { data } = await axiosInstance.get('/reports/sales/by-rep', { params });
  return data.data;
}

export async function getByItem(params) {
  const { data } = await axiosInstance.get('/reports/sales/by-item', { params });
  return data.data;
}

export async function getCommissions(params) {
  const { data } = await axiosInstance.get('/reports/sales/commissions', { params });
  return data.data;
}

export async function getDiscounts(params) {
  const { data } = await axiosInstance.get('/reports/sales/discounts', { params });
  return data.data;
}

export async function getSalesRepStatement(salesRepId, params = {}) {
  const { data } = await axiosInstance.get(
    `/reports/sales/statement/${salesRepId}`,
    { params }
  );
  return data.data;
}

/* ─────────────────────────────────────────────────────────────
 * التصدير
 * ───────────────────────────────────────────────────────────── */

const PATHS = Object.freeze({
  invoices: '/reports/sales/invoices',
  'by-rep': '/reports/sales/by-rep',
  'by-item': '/reports/sales/by-item',
  commissions: '/reports/sales/commissions',
  discounts: '/reports/sales/discounts',
  // 'statement' handled specially (needs ID interpolation)
});

export async function exportSalesReport(reportName, format, params = {}) {
  let path;
  if (reportName === 'statement') {
    if (!params.salesRepId) throw new Error('salesRepId مطلوب');
    path = `/reports/sales/statement/${params.salesRepId}`;
  } else {
    path = PATHS[reportName];
  }
  if (!path) throw new Error(`تقرير غير معروف: ${reportName}`);

  const response = await axiosInstance.get(path, {
    params: { ...params, format },
    responseType: 'blob',
  });

  const cd = response.headers?.['content-disposition'] || '';
  let filename = `${reportName}.${format}`;
  const m = cd.match(/filename="?([^"]+)"?/);
  if (m && m[1]) filename = decodeURIComponent(m[1]);

  return { blob: response.data, filename };
}

export default {
  getInvoices,
  getByRep,
  getByItem,
  getCommissions,
  getDiscounts,
  getSalesRepStatement,
  exportSalesReport,
};