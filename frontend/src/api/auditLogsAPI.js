/**
 * @file auditLogsAPI.js
 * @description دوال API لسجل التدقيق (AuditLog).
 */

import axiosInstance from './axiosInstance.js';
import { normalizeListWithId, withId } from './_helpers.js';

export async function listAuditLogs(params = {}) {
  const { data } = await axiosInstance.get('/audit-logs', { params });
  return normalizeListWithId(data);
}

export async function getAuditLog(id) {
  const { data } = await axiosInstance.get(`/audit-logs/${id}`);
  return withId(data.data);
}

export async function getResourceAuditLogs(resource, resourceId, params = {}) {
  const { data } = await axiosInstance.get(
    `/audit-logs/resource/${resource}/${resourceId}`,
    { params }
  );
  return normalizeListWithId(data);
}

export async function getAuditSummary(params = {}) {
  const { data } = await axiosInstance.get('/audit-logs/summary', { params });
  return data.data;
}

export default {
  listAuditLogs,
  getAuditLog,
  getResourceAuditLogs,
  getAuditSummary,
};