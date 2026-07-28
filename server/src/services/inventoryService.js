import { config } from '../config.js';
import { loadJson, saveJson } from '../utils/storage.js';
import { nowStamp } from '../utils/helpers.js';

export function loadMovements() {
  return loadJson(config.files.inventory, []);
}

export function saveMovements(data) {
  saveJson(config.files.inventory, data);
}

export function addMovement({ code, qty, type, note = '', store = '' }) {
  const movements = loadMovements();
  movements.push({
    date: nowStamp(),
    code,
    qty,
    type,
    store,
    note,
  });
  saveMovements(movements);
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
      opening: parseInt(p.opening_stock || 0, 10) || 0,
      stock_in: 0,
      dispatch: 0,
      return_in: 0,
      damage: 0,
      adjustment_plus: 0,
      adjustment_minus: 0,
      reorder_level: parseInt(p.reorder_level || 0, 10) || 0,
    };
  }

  for (const m of movements) {
    const code = String(m.code || '').trim();
    const qty = parseInt(m.qty || 0, 10) || 0;
    const mtype = String(m.type || '').toLowerCase();
    if (!summary[code]) continue;

    if (['purchase', 'manual_add', 'stock_in'].includes(mtype)) summary[code].stock_in += qty;
    else if (['dispatch', 'stock_out'].includes(mtype)) summary[code].dispatch += qty;
    else if (['return', 'return_in'].includes(mtype)) summary[code].return_in += qty;
    else if (mtype === 'damage') summary[code].damage += qty;
    else if (mtype === 'adjustment') summary[code].adjustment_plus += qty;
  }

  for (const code of Object.keys(summary)) {
    const s = summary[code];
    s.balance = s.opening + s.stock_in + s.return_in + s.adjustment_plus - s.dispatch - s.damage - s.adjustment_minus;
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
    const qty = parseInt(item.qty || 0, 10) || 0;
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
    const qty = parseInt(item.qty || 0, 10) || 0;
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
