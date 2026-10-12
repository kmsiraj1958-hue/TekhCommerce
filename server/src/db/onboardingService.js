import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { ITEM_TYPES } from './enums.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ONBOARDING_DIR = path.resolve(__dirname, '../../data/onboarding');

export const REQUIRED_FIELDS = ['sku', 'name', 'item_type', 'base_uom', 'opening_qty'];
export const OPTIONAL_FIELDS = ['cost', 'price', 'category', 'reorder_level', 'supplier_name', 'purchase_uom', 'conversion_factor'];

function text(value) {
  return String(value ?? '').trim();
}

export function listSheets(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  return workbook.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '', raw: false });
    const columns = rows[0] ? Object.keys(rows[0]) : XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 })[0] || [];
    return { name, columns: Array.isArray(columns) ? columns.map(String) : [], rowCount: rows.length, rows };
  });
}

export function previewOnboarding({ sheets, mapping, sheetName }) {
  const issues = [];
  if (!sheetName) {
    issues.push({ level: 'error', field: 'sheet', message: 'Select a worksheet. Column names are not guessed.' });
    return { ok: false, issues, rows: [], columns: [] };
  }
  const sheet = sheets.find((row) => row.name === sheetName);
  if (!sheet) {
    issues.push({ level: 'error', field: 'sheet', message: `Worksheet "${sheetName}" was not found` });
    return { ok: false, issues, rows: [], columns: [] };
  }
  const map = mapping || {};
  for (const field of REQUIRED_FIELDS) {
    if (!text(map[field])) {
      issues.push({ level: 'error', field, message: `Map a source column for ${field}. Silent guessing is disabled.` });
    } else if (!sheet.columns.includes(map[field])) {
      issues.push({ level: 'error', field, message: `Column "${map[field]}" is not in sheet ${sheetName}` });
    }
  }
  if (issues.length) return { ok: false, issues, rows: [], columns: sheet.columns };

  const seen = new Map();
  const rows = [];
  for (const raw of sheet.rows) {
    const sku = text(raw[map.sku]);
    const name = text(raw[map.name]);
    const itemType = text(raw[map.item_type]).toUpperCase();
    const uom = text(raw[map.base_uom]);
    const opening = Number(String(raw[map.opening_qty]).replace(/,/g, ''));
    const rowIssues = [];
    if (!sku) rowIssues.push('Missing SKU');
    if (!name) rowIssues.push('Missing name');
    if (!ITEM_TYPES.includes(itemType)) rowIssues.push(`item_type must be one of ${ITEM_TYPES.join(', ')}`);
    if (!uom) rowIssues.push('Missing base_uom');
    if (!Number.isFinite(opening)) rowIssues.push('opening_qty is not a number — value was not invented');
    if (sku && seen.has(sku)) rowIssues.push(`Duplicate SKU ${sku} (also row ${seen.get(sku)})`);
    if (sku) seen.set(sku, rows.length + 2);
    const costRaw = map.cost ? raw[map.cost] : '';
    const priceRaw = map.price ? raw[map.price] : '';
    rows.push({
      sku,
      name,
      item_type: itemType,
      base_uom: uom,
      opening_qty: Number.isFinite(opening) ? opening : null,
      cost: map.cost && text(costRaw) !== '' ? Number(costRaw) : null,
      price: map.price && text(priceRaw) !== '' ? Number(priceRaw) : null,
      category: map.category ? text(raw[map.category]) : '',
      reorder_level: map.reorder_level && text(raw[map.reorder_level]) !== '' ? Number(raw[map.reorder_level]) : null,
      supplier_name: map.supplier_name ? text(raw[map.supplier_name]) : '',
      errors: rowIssues,
    });
  }
  const blocking = rows.filter((row) => row.errors.length).length;
  return {
    ok: blocking === 0,
    issues,
    columns: sheet.columns,
    rowCount: rows.length,
    blocking,
    duplicates: rows.filter((row) => row.errors.some((msg) => msg.startsWith('Duplicate'))).length,
    rows,
    destination: ONBOARDING_DIR,
    isolation: 'server/data/onboarding — never live JSON or demo fixtures',
  };
}

export function applyOnboardingPreview(preview, { confirm } = {}) {
  if (!confirm) {
    throw Object.assign(new Error('Onboarding apply requires explicit confirm=true'), { status: 400 });
  }
  if (!preview?.ok) {
    throw Object.assign(new Error('Onboarding apply refused: preview has validation errors'), { status: 400 });
  }
  fs.mkdirSync(ONBOARDING_DIR, { recursive: true });
  const file = path.join(ONBOARDING_DIR, 'catalog.json');
  const payload = {
    dataset: 'client_onboarding',
    isolated_from: ['live JSON', 'VOGUE/SNS catalog', 'server/data/demo'],
    imported_at: new Date().toISOString(),
    products: preview.rows,
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8');
  return { ok: true, file, count: preview.rows.length };
}
