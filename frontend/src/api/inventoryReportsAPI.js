/**
 * @file inventoryReportsAPI.js
 */

import axiosInstance from './axiosInstance.js';

export async function getBalances(params = {}) {
  const { data } = await axiosInstance.get('/reports/inventory/balances', {
    params,
  });
  return data.data;
}

export async function getNearExpiry(params = {}) {
  const { data } = await axiosInstance.get('/reports/inventory/near-expiry', {
    params,
  });
  return data.data;
}

export async function getBelowReorder() {
  const { data } = await axiosInstance.get('/reports/inventory/below-reorder');
  return data.data;
}

const PATHS = Object.freeze({
  balances: '/reports/inventory/balances',
  'near-expiry': '/reports/inventory/near-expiry',
  'below-reorder': '/reports/inventory/below-reorder',
});

export async function exportInventoryReport(reportName, format, params = {}) {
  const path = PATHS[reportName];
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
  getBalances,
  getNearExpiry,
  getBelowReorder,
  exportInventoryReport,
};