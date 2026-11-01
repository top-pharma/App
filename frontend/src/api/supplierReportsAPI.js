/**
 * @file supplierReportsAPI.js
 */

import axiosInstance from './axiosInstance.js';

export async function getStatement(supplierId, params) {
  const { data } = await axiosInstance.get(
    `/reports/suppliers/statement/${supplierId}`,
    { params }
  );
  return data.data;
}

export async function getBalances() {
  const { data } = await axiosInstance.get('/reports/suppliers/balances');
  return data.data;
}

const PATHS = Object.freeze({
  balances: '/reports/suppliers/balances',
});

export async function exportSupplierReport(reportName, format, params = {}) {
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
  getStatement,
  getBalances,
  exportSupplierReport,
};