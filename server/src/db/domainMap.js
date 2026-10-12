import { sourceKeyForMovement } from './mergeStock.js';

function text(value) {
  return String(value ?? '').trim();
}

export function mapDocuments(store = {}, orderIds = new Set()) {
  const issues = [];
  const documents = Array.isArray(store.documents) ? store.documents : [];
  const events = Array.isArray(store.events) ? store.events : [];
  const sequences = store.sequences || {};
  const idempotency = store.idempotency || {};
  const rows = documents.map((doc) => {
    if (doc.order_id && orderIds.size && !orderIds.has(String(doc.order_id))) {
      issues.push({ level: 'error', entity: 'document', message: `Document ${doc.number} references missing order ${doc.order_id}` });
    }
    return {
      id: doc.id,
      type: doc.type,
      number: doc.number,
      status: doc.status || 'issued',
      issueDate: doc.issue_date || '',
      dueDate: doc.due_date || '',
      orderId: doc.order_id || '',
      sourceType: doc.source_type || '',
      sourceId: String(doc.source_id || ''),
      originalDocumentId: doc.original_document_id || '',
      originalDocumentNo: doc.original_document_no || '',
      customerName: doc.customer_name || '',
      supplierName: doc.supplier_name || '',
      store: doc.store || '',
      currency: doc.currency || 'PKR',
      payload: doc,
      lines: Array.isArray(doc.lines) ? doc.lines : [],
    };
  });
  return { rows, events, sequences, idempotency, issues };
}

export function mapFinance(finance = {}) {
  const issues = [];
  const accounts = Array.isArray(finance.accounts) ? finance.accounts : [];
  const entries = Array.isArray(finance.entries) ? finance.entries : [];
  const accountIds = new Set(accounts.map((row) => row.id));
  for (const entry of entries) {
    if (entry.accountId && !accountIds.has(entry.accountId)) {
      issues.push({ level: 'error', entity: 'finance', message: `Cashbook entry ${entry.id} references missing account ${entry.accountId}` });
    }
  }
  return { accounts, entries, issues };
}

export function mapCourier({ settings = {}, events = [], receipts = [], weekly = [] } = {}) {
  const eventRows = (Array.isArray(events) ? events : []).map((row, index) => ({
    sourceKey: sourceKeyForMovement({
      id: row.id,
      code: row.order_id || row.tracking || 'event',
      qty: index + 1,
      type: 'opening',
      date: row.at,
      note: `${row.status}|${row.tracking || ''}`,
    }, index, new Map()),
    orderId: text(row.order_id),
    tracking: text(row.tracking),
    status: text(row.status),
    at: text(row.at),
    location: text(row.location),
    payload: row,
  }));
  const receiptRows = (Array.isArray(receipts) ? receipts : []).map((row, index) => ({
    sourceKey: row.id || sourceKeyForMovement({
      id: row.id,
      code: row.order_id || 'receipt',
      qty: 1,
      type: 'opening',
      date: row.received_at || row.date || String(index),
      note: 'receipt',
    }, index, new Map()),
    orderId: text(row.order_id),
    payload: row,
  }));
  return { settings, events: eventRows, receipts: receiptRows, weekly, issues: [] };
}

export function mapManufacturingDetailed(store = {}, productSkus = new Set()) {
  const issues = [];
  const boms = store.boms || [];
  const productionOrders = store.production_orders || [];
  for (const bom of boms) {
    if (bom.finished_sku && productSkus.size && !productSkus.has(bom.finished_sku)) {
      issues.push({ level: 'error', entity: 'bom', message: `BOM ${bom.code} finished SKU ${bom.finished_sku} is not in the catalog` });
    }
    for (const line of bom.components || []) {
      if (productSkus.size && !productSkus.has(line.sku)) {
        issues.push({ level: 'error', entity: 'bom', message: `BOM ${bom.code} component ${line.sku} is not in the catalog` });
      }
    }
  }
  return { settings: store.settings || {}, boms, productionOrders, postingLog: store.posting_log || [], issues };
}

export function collectOrphans({ products = [], orders = [], movements = [] }) {
  const issues = [];
  const skus = new Set(products.map((row) => row.sku));
  for (const order of orders) {
    for (const item of order.items || []) {
      if (item.sku && !skus.has(item.sku)) {
        issues.push({ level: 'error', entity: 'order', message: `Order ${order.orderId} line SKU ${item.sku} is not in the catalog` });
      }
    }
  }
  for (const move of movements) {
    if (move.sku && !skus.has(move.sku)) {
      issues.push({ level: 'error', entity: 'stock', message: `Movement ${move.sourceKey} SKU ${move.sku} is not in the catalog` });
    }
  }
  return issues;
}
