import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { loadJson, saveJson } from '../utils/storage.js';
import { nowStamp } from '../utils/helpers.js';
import { qtyDecimal, qtyAdd, qtySub } from './qty.js';

const IN_TYPES = ['purchase', 'manual_add', 'stock_in', 'opening', 'production_in', 'reversal_in'];
const OUT_TYPES = ['dispatch', 'stock_out', 'consumption', 'wastage', 'reversal_out'];

export function loadMovements() {
  return loadJson(config.files.inventory, []);
}

export function saveMovements(data) {
  saveJson(config.files.inventory, data);
}

export function addMovement(entry) {
  const movements = loadMovements();
  const row = normalizeMovement(entry);
  movements.push(row);
  saveMovements(movements);
  return row;
}

export function addMovementBatch(entries) {
  const movements = loadMovements();
  const rows = entries.map((entry) => normalizeMovement(entry));
  saveMovements([...movements, ...rows]);
  return rows;
}

function normalizeMovement(entry = {}) {
  return {
    id: entry.id || uuidv4(),
    date: entry.date || nowStamp(),
    code: String(entry.code || '').trim(),
    qty: qtyDecimal(entry.qty),
    uom: entry.uom || '',
    type: String(entry.type || '').toLowerCase(),
    store: entry.store || '',
    note: entry.note || '',
    ref: entry.ref || '',
    production_id: entry.production_id || '',
    user: entry.user || '',
  };
}

function loadProducts() {
  return loadJson(config.files.products, []);
}

export function calculateInventory() {
  const products = loadProducts();
  const movements = loadMovements();
  const summary = {};

  for (const p of products) {
    const code = (p.code || '').trim();
    if (!code) continue;
    summary[code] = {
      name: p.name || '',
      item_type: p.item_type || 'FINISHED_GOOD',
      uom: p.base_uom || p.uom || 'pcs',
      opening: qtyDecimal(p.opening_stock || 0),
      stock_in: 0,
      dispatch: 0,
      consumption: 0,
      wastage: 0,
      production_in: 0,
      return_in: 0,
      damage: 0,
      adjustment_plus: 0,
      adjustment_minus: 0,
      reorder_level: qtyDecimal(p.reorder_level || 0),
      cost: Number(p.cost || 0),
    };
  }

  for (const m of movements) {
    const code = String(m.code || '').trim();
    const qty = qtyDecimal(m.qty);
    const mtype = String(m.type || '').toLowerCase();
    if (!summary[code]) continue;

    if (IN_TYPES.includes(mtype)) {
      if (mtype === 'production_in') summary[code].production_in = qtyAdd(summary[code].production_in, qty);
      else summary[code].stock_in = qtyAdd(summary[code].stock_in, qty);
    } else if (OUT_TYPES.includes(mtype)) {
      if (mtype === 'consumption') summary[code].consumption = qtyAdd(summary[code].consumption, qty);
      else if (mtype === 'wastage') summary[code].wastage = qtyAdd(summary[code].wastage, qty);
      else summary[code].dispatch = qtyAdd(summary[code].dispatch, qty);
    } else if (['return', 'return_in'].includes(mtype)) summary[code].return_in = qtyAdd(summary[code].return_in, qty);
    else if (mtype === 'damage') summary[code].damage = qtyAdd(summary[code].damage, qty);
    else if (mtype === 'adjustment' || mtype === 'adjustment_plus') summary[code].adjustment_plus = qtyAdd(summary[code].adjustment_plus, qty);
    else if (mtype === 'adjustment_minus') summary[code].adjustment_minus = qtyAdd(summary[code].adjustment_minus, qty);
  }

  for (const code of Object.keys(summary)) {
    const s = summary[code];
    s.balance = qtySub(
      qtyAdd(s.opening, s.stock_in, s.return_in, s.adjustment_plus, s.production_in),
      qtyAdd(s.dispatch, s.damage, s.adjustment_minus, s.consumption, s.wastage),
    );
    s.qty_value = Math.round(s.balance * Number(s.cost || 0) * 100) / 100;
    s.low_stock = s.balance <= s.reorder_level;
  }

  return summary;
}

function dispatchItems(order, notePrefix) {
  const items = order.items?.length ? order.items : [{
    sku: order.product_code,
    qty: order.qty,
  }];
  for (const item of items) {
    const code = (item.sku || '').trim();
    const qty = qtyDecimal(item.qty);
    if (code && qty > 0) {
      addMovement({
        code,
        qty,
        type: 'dispatch',
        note: `${notePrefix}: ${order.order_id}`,
        store: order.store || '',
      });
    }
  }
}

export function reserveStockForOrder(order) {
  if (order.stock_reserved) return false;
  dispatchItems(order, 'Order confirmed');
  order.stock_reserved = true;
  order.stock_reserved_at = nowStamp();
  return true;
}

export function restoreStockForOrder(order) {
  if (!order.stock_reserved || order.stock_restocked) return false;
  const items = order.items?.length ? order.items : [{ sku: order.product_code, qty: order.qty }];
  for (const item of items) {
    const code = (item.sku || '').trim();
    const qty = qtyDecimal(item.qty);
    if (code && qty > 0) {
      addMovement({
        code,
        qty,
        type: 'return_in',
        note: `Stock restored: ${order.order_id}`,
        store: order.store || '',
      });
    }
  }
  order.stock_restocked = true;
  order.stock_restocked_at = nowStamp();
  return true;
}
