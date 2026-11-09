/**
 * @file itemsAPI.js
 * @description دوال API للأصناف — Phase A.8.
 */

import axiosInstance from './axiosInstance.js';
import { normalizeListWithId, withId } from './_helpers.js';

export async function listItems(params = {}) {
  const { data } = await axiosInstance.get('/items', { params });
  return normalizeListWithId(data);
}

export async function getItem(id) {
  const { data } = await axiosInstance.get(`/items/${id}`);
  return withId(data.data);
}

export async function getItemByBarcode(barcode) {
  const { data } = await axiosInstance.get(
    `/items/barcode/${encodeURIComponent(barcode)}`
  );
  return withId(data.data);
}

export async function createItem(payload) {
  const { data } = await axiosInstance.post('/items', payload);
  return withId(data.data);
}

export async function updateItem(id, payload) {
  const { data } = await axiosInstance.patch(`/items/${id}`, payload);
  return withId(data.data);
}

export async function deleteItem(id) {
  const { data } = await axiosInstance.delete(`/items/${id}`);
  return data.data;
}

export default {
  listItems,
  getItem,
  getItemByBarcode,
  createItem,
  updateItem,
  deleteItem,
};