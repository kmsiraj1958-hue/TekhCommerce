import { config } from '../config.js';
import { loadJson, saveJson } from '../utils/storage.js';

export function loadProducts() {
  return loadJson(config.files.products, []);
}

export function saveProducts(data) {
  saveJson(config.files.products, data);
}

export function getProductByCode(code) {
  return loadProducts().find((p) => p.code === code) || null;
}

export function getCategories() {
  const products = loadProducts();
  return [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
}
