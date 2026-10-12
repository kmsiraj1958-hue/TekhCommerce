import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { loadJson, saveJson } from '../utils/storage.js';
import { nowStamp } from '../utils/helpers.js';
import { qtyDecimal, qtyAdd, qtySub } from './qty.js';
import { convertQty, normalizeUom } from './uom.js';
import * as productService from './productService.js';
import * as inventoryService from './inventoryService.js';

const ITEM_TYPES = ['RAW_MATERIAL', 'PACKAGING_MATERIAL', 'FINISHED_GOOD'];
const PO_STATUSES = ['draft', 'released', 'in_progress', 'posting', 'posted', 'cancelled', 'reversed'];

const CASHEW = {
  raw: {
    code: 'RAW-CASHEW-G',
    name: 'Raw cashews',
    item_type: 'RAW_MATERIAL',
    base_uom: 'g',
    opening_stock: 1000,
    reorder_level: 200,
    cost: 2,
    hide_from_store: true,
    category: 'Raw materials',
    active: true,
  },
  pouch: {
    code: 'PKG-POUCH-150',
    name: 'Packaging pouch 150 g',
    item_type: 'PACKAGING_MATERIAL',
    base_uom: 'pcs',
    opening_stock: 50,
    reorder_level: 12,
    cost: 5,
    hide_from_store: true,
    category: 'Packaging',
    active: true,
  },
  fg: {
    code: 'FG-CASHEW-150',
    name: 'Cashew Pack 150 g',
    item_type: 'FINISHED_GOOD',
    base_uom: 'pcs',
    opening_stock: 0,
    reorder_level: 6,
    cost: 0,
    price: 450,
    hide_from_store: false,
    category: 'Nuts',
    active: true,
  },
};

function emptyStore() {
  return {
    settings: { allow_negative_stock: false, costing_method: 'standard_product_cost' },
    boms: [],
    production_orders: [],
    posting_log: [],
  };
}

export function loadManufacturing() {
  const raw = loadJson(config.files.manufacturing, emptyStore());
  return {
    ...emptyStore(),
    ...raw,
    settings: { ...emptyStore().settings, ...(raw.settings || {}) },
    boms: raw.boms || [],
    production_orders: raw.production_orders || [],
    posting_log: raw.posting_log || [],
  };
}

export function saveManufacturing(store) {
  saveJson(config.files.manufacturing, store);
}

export function isSellableProduct(product) {
  if (!product || product.active === false) return false;
  const type = product.item_type || 'FINISHED_GOOD';
  if (type !== 'FINISHED_GOOD') return false;
  return product.hide_from_store !== true;
}

export function onHand(code) {
  const summary = inventoryService.calculateInventory();
  const row = summary[code];
  if (row) return qtyDecimal(row.balance);
  const product = productService.getProductByCode(code);
  return qtyDecimal(product?.opening_stock || 0);
}

function productUom(product) {
  return normalizeUom(product?.base_uom || product?.uom || 'pcs');
}

function conversionRules(product) {
  return Array.isArray(product?.conversion_rules) ? product.conversion_rules : [];
}

export function qtyInBase(product, qty, fromUom) {
  return convertQty(qty, fromUom || productUom(product), productUom(product), conversionRules(product));
}

export function explodeBom(bom, outputQty) {
  const multiplier = qtyDecimal(outputQty) / qtyDecimal(bom.output_qty || 1);
  return (bom.components || []).map((component) => {
    const planned = qtyDecimal(qtyDecimal(component.qty) * multiplier);
    const expectedWastage = qtyDecimal(planned * (Number(component.expected_wastage_pct || 0) / 100));
    return {
      sku: component.sku,
      role: component.role || inferRole(component.sku),
      uom: component.uom,
      planned_qty: planned,
      expected_wastage_qty: expectedWastage,
      required_qty: qtyAdd(planned, expectedWastage),
    };
  });
}

function inferRole(sku) {
  const product = productService.getProductByCode(sku);
  if (product?.item_type === 'PACKAGING_MATERIAL') return 'PACKAGING';
  return 'RAW';
}

export function ensureCpgDemoItems() {
  const products = productService.loadProducts();
  let changed = false;
  for (const item of Object.values(CASHEW)) {
    if (!products.some((row) => row.code === item.code)) {
      products.push({
        price: 0,
        image: '',
        conversion_rules: [],
        costing_method: 'standard_product_cost',
        ...item,
      });
      changed = true;
    }
  }
  if (changed) productService.saveProducts(products);

  const store = loadManufacturing();
  if (!store.boms.some((row) => row.code === 'BOM-CASHEW-150')) {
    store.boms.push(createBomRecord({
      code: 'BOM-CASHEW-150',
      name: 'Cashew Pack 150 g',
      finished_sku: CASHEW.fg.code,
      output_qty: 1,
      output_uom: 'pcs',
      components: [
        { sku: CASHEW.raw.code, qty: 150, uom: 'g', role: 'RAW', expected_wastage_pct: 0 },
        { sku: CASHEW.pouch.code, qty: 1, uom: 'pcs', role: 'PACKAGING', expected_wastage_pct: 0 },
      ],
    }));
    saveManufacturing(store);
  }
  return { products: productService.loadProducts(), manufacturing: loadManufacturing() };
}

function nextNumber(prefix, existing) {
  const nums = existing
    .map((row) => Number(String(row.number || '').replace(/^[A-Z-]+/, '')))
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${String(next).padStart(5, '0')}`;
}

function createBomRecord(input) {
  const finished = productService.getProductByCode(input.finished_sku);
  if (!finished) throw new Error('Finished product not found');
  if ((finished.item_type || 'FINISHED_GOOD') !== 'FINISHED_GOOD') {
    throw new Error('BOM finished SKU must be a finished good');
  }
  const components = (input.components || []).map((row) => {
    const product = productService.getProductByCode(row.sku);
    if (!product) throw new Error(`Unknown component ${row.sku}`);
    return {
      sku: row.sku,
      qty: qtyDecimal(row.qty),
      uom: normalizeUom(row.uom || productUom(product)),
      role: row.role || inferRole(row.sku),
      expected_wastage_pct: Number(row.expected_wastage_pct || 0),
    };
  });
  return {
    id: input.id || uuidv4(),
    code: input.code || `BOM-${Date.now()}`,
    name: input.name || finished.name,
    finished_sku: input.finished_sku,
    output_qty: qtyDecimal(input.output_qty || 1),
    output_uom: normalizeUom(input.output_uom || productUom(finished)),
    components,
    status: input.status || 'active',
    revision: Number(input.revision || 1),
    effective_from: input.effective_from || nowStamp().slice(0, 10),
    created_at: nowStamp(),
    superseded_by: '',
  };
}

export function listBoms() {
  ensureCpgDemoItems();
  return loadManufacturing().boms;
}

export function saveBom(input) {
  ensureCpgDemoItems();
  const store = loadManufacturing();
  if (input.id) {
    const current = store.boms.find((row) => row.id === input.id);
    if (!current) throw Object.assign(new Error('BOM not found'), { status: 404 });
    if (usedByPostedProduction(current.id, current.revision)) {
      current.status = 'superseded';
      const next = createBomRecord({
        ...input,
        id: uuidv4(),
        revision: current.revision + 1,
        code: current.code,
      });
      current.superseded_by = next.id;
      store.boms.push(next);
      saveManufacturing(store);
      return next;
    }
    const updated = createBomRecord({ ...current, ...input, id: current.id, revision: current.revision });
    store.boms = store.boms.map((row) => (row.id === current.id ? updated : row));
    saveManufacturing(store);
    return updated;
  }
  const bom = createBomRecord(input);
  store.boms.push(bom);
  saveManufacturing(store);
  return bom;
}

function usedByPostedProduction(bomId, revision) {
  return loadManufacturing().production_orders.some((row) => (
    row.bom_id === bomId && Number(row.bom_revision) === Number(revision) && ['posted', 'reversed', 'posting'].includes(row.status)
  ));
}

export function listProductionOrders() {
  ensureCpgDemoItems();
  recoverStuckPostings();
  return loadManufacturing().production_orders;
}

export function getProductionOrder(id) {
  recoverStuckPostings();
  const order = loadManufacturing().production_orders.find((row) => row.id === id);
  if (!order) throw Object.assign(new Error('Production order not found'), { status: 404 });
  return enrichProduction(order);
}

function enrichProduction(order) {
  const availability = (order.planned_components || []).map((row) => {
    const onhand = onHand(row.sku);
    return { ...row, on_hand: onhand, shortfall: Math.max(0, qtySub(row.required_qty, onhand)) };
  });
  return { ...order, availability };
}

export function createProductionOrder(input) {
  ensureCpgDemoItems();
  const store = loadManufacturing();
  const bom = store.boms.find((row) => row.id === input.bom_id || row.code === input.bom_id);
  if (!bom || bom.status === 'inactive') throw Object.assign(new Error('Active BOM not found'), { status: 400 });
  const plannedOutput = qtyDecimal(input.planned_output_qty);
  if (plannedOutput <= 0) throw Object.assign(new Error('Planned output must be greater than zero'), { status: 400 });
  const planned = explodeBom(bom, plannedOutput);
  const order = {
    id: uuidv4(),
    number: nextNumber('PO', store.production_orders),
    bom_id: bom.id,
    bom_code: bom.code,
    bom_revision: bom.revision,
    finished_sku: bom.finished_sku,
    planned_output_qty: plannedOutput,
    actual_output_qty: plannedOutput,
    planned_components: planned,
    actual_components: planned.map((row) => ({
      sku: row.sku,
      role: row.role,
      uom: row.uom,
      consumed_qty: row.planned_qty,
      wastage_qty: 0,
    })),
    extra_costs: qtyDecimal(input.extra_costs || 0),
    status: 'draft',
    costs: null,
    movement_ids: [],
    posting_token: '',
    created_at: nowStamp(),
    posted_at: '',
    reversed_at: '',
    user: input.user || '',
  };
  store.production_orders.push(order);
  saveManufacturing(store);
  return enrichProduction(order);
}

export function updateProductionOrder(id, patch) {
  const store = loadManufacturing();
  const order = store.production_orders.find((row) => row.id === id);
  if (!order) throw Object.assign(new Error('Production order not found'), { status: 404 });
  if (['posted', 'reversed', 'cancelled', 'posting'].includes(order.status)) {
    throw Object.assign(new Error('Posted, reversed or cancelled orders cannot be edited'), { status: 400 });
  }
  if (patch.status && ['released', 'in_progress', 'draft', 'cancelled'].includes(patch.status)) {
    if (patch.status === 'cancelled' && order.status === 'posted') {
      throw Object.assign(new Error('Posted production cannot be cancelled; reverse it instead'), { status: 400 });
    }
    order.status = patch.status;
  }
  if (patch.actual_output_qty != null) order.actual_output_qty = qtyDecimal(patch.actual_output_qty);
  if (patch.extra_costs != null) order.extra_costs = qtyDecimal(patch.extra_costs);
  if (Array.isArray(patch.actual_components)) {
    order.actual_components = patch.actual_components.map((row) => ({
      sku: row.sku,
      role: row.role || inferRole(row.sku),
      uom: row.uom,
      consumed_qty: qtyDecimal(row.consumed_qty),
      wastage_qty: qtyDecimal(row.wastage_qty),
    }));
  }
  saveManufacturing(store);
  return enrichProduction(order);
}

function previewLines(order) {
  const products = productService.loadProducts();
  const lines = [];
  for (const component of order.actual_components || []) {
    const product = products.find((row) => row.code === component.sku);
    if (!product) throw Object.assign(new Error(`Unknown component ${component.sku}`), { status: 400 });
    const consume = qtyInBase(product, component.consumed_qty, component.uom);
    const waste = qtyInBase(product, component.wastage_qty, component.uom);
    if (consume > 0) {
      lines.push({
        code: component.sku,
        qty: consume,
        uom: productUom(product),
        type: 'consumption',
        role: component.role,
        unit_cost: Number(product.cost || 0),
      });
    }
    if (waste > 0) {
      lines.push({
        code: component.sku,
        qty: waste,
        uom: productUom(product),
        type: 'wastage',
        role: component.role,
        unit_cost: Number(product.cost || 0),
      });
    }
  }
  const output = qtyDecimal(order.actual_output_qty);
  if (output <= 0) throw Object.assign(new Error('Actual output must be greater than zero'), { status: 400 });
  lines.push({
    code: order.finished_sku,
    qty: output,
    uom: productUom(productService.getProductByCode(order.finished_sku)),
    type: 'production_in',
    role: 'FINISHED',
    unit_cost: 0,
  });
  return lines;
}

function costingFromLines(lines, extraCosts, outputQty) {
  let material = 0;
  let packaging = 0;
  let wastage = 0;
  for (const line of lines) {
    const amount = Math.round(line.qty * Number(line.unit_cost || 0) * 100) / 100;
    if (line.type === 'wastage') wastage += amount;
    else if (line.type === 'consumption' && line.role === 'PACKAGING') packaging += amount;
    else if (line.type === 'consumption') material += amount;
  }
  const extra = Math.round(Number(extraCosts || 0) * 100) / 100;
  const total = Math.round((material + packaging + wastage + extra) * 100) / 100;
  const perUnit = outputQty ? Math.round((total / outputQty) * 100) / 100 : 0;
  return {
    method: 'standard_product_cost',
    material: Math.round(material * 100) / 100,
    packaging: Math.round(packaging * 100) / 100,
    wastage: Math.round(wastage * 100) / 100,
    extra,
    total,
    per_unit: perUnit,
    assumption: 'Component product.cost × actual base-unit qty. Not FIFO layers. Not a general ledger.',
  };
}

export function previewProduction(id) {
  const order = getProductionOrder(id);
  if (['posted', 'reversed'].includes(order.status)) return { order, lines: [], costs: order.costs };
  const lines = previewLines(order);
  const costs = costingFromLines(lines, order.extra_costs, order.actual_output_qty);
  return { order, lines, costs };
}

function assertStock(lines) {
  const store = loadManufacturing();
  if (store.settings.allow_negative_stock) return;
  const needed = {};
  for (const line of lines) {
    if (['consumption', 'wastage'].includes(line.type)) {
      needed[line.code] = qtyAdd(needed[line.code] || 0, line.qty);
    }
  }
  for (const [code, qty] of Object.entries(needed)) {
    const available = onHand(code);
    if (available + 1e-9 < qty) {
      throw Object.assign(new Error(`Insufficient stock for ${code}: need ${qty}, have ${available}`), { status: 400 });
    }
  }
}

export function recoverStuckPostings() {
  const store = loadManufacturing();
  let changed = false;
  const movements = inventoryService.loadMovements();
  for (const order of store.production_orders) {
    if (order.status !== 'posting') continue;
    const related = movements.filter((row) => row.production_id === order.id);
    if (related.length) {
      order.status = 'posted';
      order.posted_at = order.posted_at || nowStamp();
      order.movement_ids = related.map((row) => row.id);
      store.posting_log.push({ at: nowStamp(), production_id: order.id, event: 'recovered_posted' });
      changed = true;
    } else {
      order.status = 'in_progress';
      order.posting_token = '';
      store.posting_log.push({ at: nowStamp(), production_id: order.id, event: 'recovered_in_progress' });
      changed = true;
    }
  }
  if (changed) saveManufacturing(store);
}

export function postProduction(id, { user } = {}) {
  recoverStuckPostings();
  const store = loadManufacturing();
  const order = store.production_orders.find((row) => row.id === id);
  if (!order) throw Object.assign(new Error('Production order not found'), { status: 404 });
  if (order.status === 'posted') return { duplicate: true, order: enrichProduction(order) };
  if (order.status === 'cancelled' || order.status === 'reversed') {
    throw Object.assign(new Error('Cannot post a cancelled or reversed order'), { status: 400 });
  }
  const lines = previewLines(order);
  assertStock(lines);
  const costs = costingFromLines(lines, order.extra_costs, order.actual_output_qty);
  const token = uuidv4();
  order.status = 'posting';
  order.posting_token = token;
  saveManufacturing(store);

  const movementIds = [];
  try {
    const entries = lines.map((line) => ({
      code: line.code,
      qty: line.qty,
      uom: line.uom,
      type: line.type,
      note: `Production ${order.number}`,
      ref: order.number,
      production_id: order.id,
      user: user || order.user || '',
    }));
    const saved = inventoryService.addMovementBatch(entries);
    movementIds.push(...saved.map((row) => row.id));
    const products = productService.loadProducts();
    const fg = products.find((row) => row.code === order.finished_sku);
    if (fg) {
      fg.cost = costs.per_unit;
      fg.last_production_cost = costs;
      productService.saveProducts(products);
    }
    const latest = loadManufacturing();
    const posted = latest.production_orders.find((row) => row.id === id);
    posted.status = 'posted';
    posted.posted_at = nowStamp();
    posted.costs = costs;
    posted.movement_ids = movementIds;
    posted.preview_lines = lines;
    latest.posting_log.push({ at: posted.posted_at, production_id: id, event: 'posted', token });
    saveManufacturing(latest);
    return { duplicate: false, order: enrichProduction(posted) };
  } catch (err) {
    const latest = loadManufacturing();
    const failed = latest.production_orders.find((row) => row.id === id);
    if (failed && failed.status === 'posting') {
      failed.status = 'in_progress';
      failed.posting_token = '';
      latest.posting_log.push({ at: nowStamp(), production_id: id, event: 'post_failed', error: err.message });
      saveManufacturing(latest);
    }
    throw err;
  }
}

export function reverseProduction(id, { user } = {}) {
  recoverStuckPostings();
  const store = loadManufacturing();
  const order = store.production_orders.find((row) => row.id === id);
  if (!order) throw Object.assign(new Error('Production order not found'), { status: 404 });
  if (order.status !== 'posted') throw Object.assign(new Error('Only posted production can be reversed'), { status: 400 });
  const original = inventoryService.loadMovements().filter((row) => row.production_id === order.id && !String(row.type || '').startsWith('reversal'));
  const reversals = original.map((row) => ({
    code: row.code,
    qty: row.qty,
    uom: row.uom,
    type: ['consumption', 'wastage', 'dispatch'].includes(row.type) ? 'reversal_in' : 'reversal_out',
    note: `Reversal of ${order.number}`,
    ref: `${order.number}-REV`,
    production_id: order.id,
    user: user || '',
  }));
  const saved = inventoryService.addMovementBatch(reversals);
  order.status = 'reversed';
  order.reversed_at = nowStamp();
  order.reversal_movement_ids = saved.map((row) => row.id);
  store.posting_log.push({ at: order.reversed_at, production_id: id, event: 'reversed' });
  saveManufacturing(store);
  return enrichProduction(order);
}

export function inventoryByType(itemType) {
  ensureCpgDemoItems();
  const products = productService.loadProducts();
  const summary = inventoryService.calculateInventory();
  return products
    .filter((row) => (row.item_type || 'FINISHED_GOOD') === itemType)
    .map((row) => ({
      ...row,
      ...(summary[row.code] || { balance: qtyDecimal(row.opening_stock || 0) }),
    }));
}

export function manufacturingReports(family, range = {}) {
  ensureCpgDemoItems();
  recoverStuckPostings();
  const products = productService.loadProducts();
  const summary = inventoryService.calculateInventory();
  const movements = inventoryService.loadMovements();
  const orders = loadManufacturing().production_orders;
  const byType = (type) => products
    .filter((row) => (row.item_type || 'FINISHED_GOOD') === type)
    .map((row) => {
      const inv = summary[row.code] || {};
      return {
        sku: row.code,
        name: row.name,
        uom: row.base_uom || 'pcs',
        balance: inv.balance ?? qtyDecimal(row.opening_stock || 0),
        reorder_level: qtyDecimal(row.reorder_level || 0),
        low_stock: (inv.balance ?? qtyDecimal(row.opening_stock || 0)) <= qtyDecimal(row.reorder_level || 0),
        qty_value: inv.qty_value ?? Math.round(qtyDecimal(row.opening_stock || 0) * Number(row.cost || 0) * 100) / 100,
      };
    });

  if (family === 'rm_stock') return pack('rm_stock', 'Raw-material stock on hand', byType('RAW_MATERIAL'));
  if (family === 'pkg_stock') return pack('pkg_stock', 'Packaging stock on hand', byType('PACKAGING_MATERIAL'));
  if (family === 'fg_stock') return pack('fg_stock', 'Finished-goods stock', byType('FINISHED_GOOD'));
  if (family === 'material_receipts_issues') {
    const rows = movements.filter((row) => {
      const type = String(row.type || '').toLowerCase();
      return ['purchase', 'stock_in', 'consumption', 'wastage', 'production_in', 'dispatch', 'return_in'].includes(type);
    }).map((row) => ({
      date: row.date,
      sku: row.code,
      type: row.type,
      qty: row.qty,
      uom: row.uom,
      ref: row.ref || row.note,
      production_id: row.production_id || '',
    }));
    return pack('material_receipts_issues', 'Material receipts and issues', rows);
  }
  if (family === 'production_register') {
    return pack('production_register', 'Production-order register', orders.map((row) => ({
      number: row.number,
      status: row.status,
      finished_sku: row.finished_sku,
      planned: row.planned_output_qty,
      actual: row.actual_output_qty,
      posted_at: row.posted_at,
      total_cost: row.costs?.total ?? '',
    })));
  }
  if (family === 'production_yield') {
    const posted = orders.filter((row) => row.status === 'posted');
    return pack('production_yield', 'Production output and yield', posted.map((row) => {
      const plannedRm = (row.planned_components || []).filter((c) => c.role !== 'PACKAGING').reduce((s, c) => s + Number(c.planned_qty || 0), 0);
      const usedRm = (row.actual_components || []).filter((c) => c.role !== 'PACKAGING').reduce((s, c) => s + Number(c.consumed_qty || 0) + Number(c.wastage_qty || 0), 0);
      return {
        number: row.number,
        finished_sku: row.finished_sku,
        output: row.actual_output_qty,
        planned_rm: plannedRm,
        used_rm: usedRm,
        yield_pct: usedRm ? Math.round((plannedRm / usedRm) * 10000) / 100 : '',
      };
    }));
  }
  if (family === 'wastage_variance') {
    return pack('wastage_variance', 'Expected versus actual wastage', orders.filter((row) => row.status === 'posted').flatMap((row) => (
      (row.planned_components || []).map((planned) => {
        const actual = (row.actual_components || []).find((c) => c.sku === planned.sku) || {};
        return {
          number: row.number,
          sku: planned.sku,
          expected_wastage: planned.expected_wastage_qty,
          actual_wastage: actual.wastage_qty || 0,
          variance: qtySub(actual.wastage_qty || 0, planned.expected_wastage_qty || 0),
        };
      })
    )));
  }
  if (family === 'consumption_by_fg') {
    return pack('consumption_by_fg', 'Material consumption by finished product', orders.filter((row) => row.status === 'posted').flatMap((row) => (
      (row.actual_components || []).map((c) => ({
        finished_sku: row.finished_sku,
        sku: c.sku,
        consumed: c.consumed_qty,
        wastage: c.wastage_qty,
        number: row.number,
      }))
    )));
  }
  if (family === 'mfg_cost_per_unit') {
    return pack('mfg_cost_per_unit', 'Manufacturing cost per unit', orders.filter((row) => row.status === 'posted').map((row) => ({
      number: row.number,
      finished_sku: row.finished_sku,
      output: row.actual_output_qty,
      material: row.costs?.material,
      packaging: row.costs?.packaging,
      wastage: row.costs?.wastage,
      extra: row.costs?.extra,
      total: row.costs?.total,
      per_unit: row.costs?.per_unit,
    })));
  }
  if (family === 'inventory_valuation_mfg') {
    const rows = Object.entries(summary).map(([sku, row]) => ({
      sku,
      name: row.name,
      item_type: row.item_type,
      balance: row.balance,
      cost: row.cost,
      qty_value: row.qty_value,
    }));
    return pack('inventory_valuation_mfg', 'Inventory valuation (product.cost × on-hand)', rows);
  }
  if (family === 'low_stock_mfg') {
    const rows = Object.entries(summary).filter(([, row]) => row.low_stock).map(([sku, row]) => ({
      sku, name: row.name, item_type: row.item_type, balance: row.balance, reorder_level: row.reorder_level,
    }));
    return pack('low_stock_mfg', 'Low-stock and reorder alerts', rows);
  }
  void range;
  return null;
}

function pack(family, source, rows) {
  return {
    family,
    available: true,
    source,
    totals: { rows: rows.length },
    rows,
  };
}

export const MFG_REPORT_FAMILIES = [
  { id: 'rm_stock', category: 'Manufacturing', title: 'Raw-material stock on hand' },
  { id: 'pkg_stock', category: 'Manufacturing', title: 'Packaging stock on hand' },
  { id: 'fg_stock', category: 'Manufacturing', title: 'Finished-goods stock' },
  { id: 'material_receipts_issues', category: 'Manufacturing', title: 'Material receipts and issues' },
  { id: 'production_register', category: 'Manufacturing', title: 'Production-order register' },
  { id: 'production_yield', category: 'Manufacturing', title: 'Production output and yield' },
  { id: 'wastage_variance', category: 'Manufacturing', title: 'Expected versus actual wastage' },
  { id: 'consumption_by_fg', category: 'Manufacturing', title: 'Material consumption by finished product' },
  { id: 'mfg_cost_per_unit', category: 'Manufacturing', title: 'Manufacturing cost per unit' },
  { id: 'inventory_valuation_mfg', category: 'Manufacturing', title: 'Inventory valuation' },
  { id: 'low_stock_mfg', category: 'Manufacturing', title: 'Low-stock and reorder alerts' },
];

export const CASHEW_SKUS = CASHEW;
export { ITEM_TYPES, PO_STATUSES };
