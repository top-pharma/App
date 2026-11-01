/**
 * @file customerReportsAPI.js — Phase 4
 */

import axiosInstance from './axiosInstance.js';

export async function getStatement(customerId, params) {
  const { data } = await axiosInstance.get(
    `/reports/customers/statement/${customerId}`,
    { params }
  );
  return data.data;
}

export async function getAging(params = {}) {
  const { data } = await axiosInstance.get('/reports/customers/aging', { params });
  return data.data;
}

const PATHS = Object.freeze({
  aging: '/reports/customers/aging',
  // 'statement' handled specially (needs ID)
});

export async function exportCustomerReport(reportName, format, params = {}) {
  let path;
  if (reportName === 'statement') {
    if (!params.customerId) throw new Error('customerId مطلوب');
    path = `/reports/customers/statement/${params.customerId}`;
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
  getStatement,
  getAging,
  exportCustomerReport,
};