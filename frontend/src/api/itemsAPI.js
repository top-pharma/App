/**
 * @file itemsAPI.js
 * @description دوال API الخاصة بالأصناف.
 */

import axiosInstance from './axiosInstance.js';

export async function listItems(params = {}) {
  const { data } = await axiosInstance.get('/items', { params });
  return data.data;
}

export async function getItem(id) {
  const { data } = await axiosInstance.get(`/items/${id}`);
  return data.data;
}

export async function getItemByBarcode(barcode) {
  const { data } = await axiosInstance.get(`/items/barcode/${encodeURIComponent(barcode)}`);
  return data.data;
}

export async function createItem(payload) {
  const { data } = await axiosInstance.post('/items', payload);
  return data.data;
}

export async function updateItem(id, payload) {
  const { data } = await axiosInstance.patch(`/items/${id}`, payload);
  return data.data;
}

export async function deleteItem(id) {
  const { data } = await axiosInstance.delete(`/items/${id}`);
  return data.data;
}

export default {
  listItems, getItem, getItemByBarcode,
  createItem, updateItem, deleteItem,
};