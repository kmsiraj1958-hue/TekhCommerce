import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { BRAND } from '../brand.js';
import { loadJson, saveJson } from '../utils/storage.js';
import { nowStamp, parseDatePrefix, safeNumber } from '../utils/helpers.js';
import * as orderService from './orderService.js';
import { computeDocumentTotals, linesFromOrder, money } from './documentCalc.js';

export const DOCUMENT_TYPES = {
  sales_invoice: { prefix: 'SI', financial: true, label: 'Sales invoice' },
  quotation: { prefix: 'QU', financial: false, label: 'Pro forma / quotation' },
  credit_note: { prefix: 'CN', financial: true, label: 'Credit note' },
  debit_note: { prefix: 'DN', financial: true, label: 'Debit note' },
  purchase_bill: { prefix: 'PB', financial: true, label: 'Purchase bill' },
  payment_receipt: { prefix: 'PR', financial: true, label: 'Customer payment receipt' },
  payment_voucher: { prefix: 'PV', financial: true, label: 'Payment voucher' },
  delivery_challan: { prefix: 'DC', financial: false, label: 'Delivery challan' },
};

const POSTED = new Set(['issued', 'partially_paid', 'paid', 'credited']);

function emptyStore() {
  return { sequences: {}, idempotency: {}, documents: [], events: [] };
}

export function loadDocumentStore() {
  const raw = loadJson(config.files.documents, emptyStore());
  return {
    sequences: raw.sequences || {},
    idempotency: raw.idempotency || {},
    documents: Array.isArray(raw.documents) ? raw.documents : [],
    events: Array.isArray(raw.events) ? raw.events : [],
  };
}

function saveStore(store) {
  saveJson(config.files.documents, store);
}

export function merchantProfile() {
  const saved = loadJson(config.files.merchantProfile, {});
  return {
    legal_name: saved.legal_name || BRAND.name,
    wordmark: saved.wordmark || BRAND.wordmark,
    address: saved.address || '',
    phone: saved.phone || '',
    email: saved.email || '',
    ntn: saved.ntn || '',
    fbr_disclaimer: 'Internal TekhCommerce document. Not an FBR-submitted digital invoice.',
    terms: saved.terms || 'Goods once sold are subject to the seller’s return policy. Payment is due as stated on this document.',
  };
}

function nextNumber(store, type, issueDate) {
  const year = (issueDate || '').slice(0, 4) || String(new Date().getFullYear());
  const key = `${DOCUMENT_TYPES[type].prefix}-${year}`;
  const current = parseInt(store.sequences[key] || 0, 10) || 0;
  const next = current + 1;
  store.sequences[key] = next;
  return `${key}-${String(next).padStart(5, '0')}`;
}

function appendEvent(store, documentId, fromStatus, toStatus, note) {
  store.events.push({
    id: uuidv4(),
    document_id: documentId,
    from_status: fromStatus || '',
    to_status: toStatus,
    note: note || '',
    at: nowStamp(),
  });
}

function uniqueOpen(store, type, sourceType, sourceId) {
  if (!sourceId) return null;
  return store.documents.find((row) => (
    row.type === type
    && row.source_type === sourceType
    && String(row.source_id) === String(sourceId)
    && row.status !== 'void'
  )) || null;
}

function financeStore() {
  return loadJson(config.files.finance, { accounts: [], entries: [] });
}

export function listDocuments({ type = '', start = '', end = '', q = '', status = '' } = {}) {
  const store = loadDocumentStore();
  const query = String(q || '').toLowerCase();
  const rows = store.documents.filter((row) => {
    if (type && row.type !== type) return false;
    if (status && row.status !== status) return false;
    const date = parseDatePrefix(row.issue_date || '');
    if (start && date && date < start) return false;
    if (end && date && date > end) return false;
    if (query) {
      const blob = `${row.number} ${row.customer_name || ''} ${row.supplier_name || ''} ${row.order_id || ''} ${row.original_document_no || ''}`.toLowerCase();
      if (!blob.includes(query)) return false;
    }
    return true;
  }).sort((a, b) => String(b.issue_date).localeCompare(String(a.issue_date)));
  return rows.map((row) => withBalances(row, store.documents));
}

export function getDocument(id) {
  const store = loadDocumentStore();
  const row = store.documents.find((doc) => doc.id === id || doc.number === id);
  if (!row) return null;
  return {
    ...withBalances(row, store.documents),
    events: store.events.filter((event) => event.document_id === row.id),
    merchant: merchantProfile(),
    fbr: {
      submitted: false,
      status: 'not_submitted',
      note: 'TekhDigitalInvoice / FBR is not connected. This PDF/print is an internal document only.',
    },
  };
}

function withBalances(row, all) {
  if (row.type !== 'sales_invoice' || row.status === 'void') {
    return { ...row, balance_due: row.type === 'sales_invoice' ? row.totals?.grand_total || 0 : 0 };
  }
  const credits = all.filter((doc) => doc.type === 'credit_note' && doc.original_document_id === row.id && doc.status !== 'void')
    .reduce((sum, doc) => sum + money(doc.totals?.grand_total), 0);
  const receipts = all.filter((doc) => doc.type === 'payment_receipt' && doc.original_document_id === row.id && doc.status !== 'void')
    .reduce((sum, doc) => sum + money(doc.totals?.grand_total), 0);
  const debits = all.filter((doc) => doc.type === 'debit_note' && doc.original_document_id === row.id && doc.status !== 'void')
    .reduce((sum, doc) => sum + money(doc.totals?.grand_total), 0);
  const balance = money(money(row.totals.grand_total) + debits - credits - receipts);
  let status = row.status;
  if (balance <= 0 && receipts + credits > 0) status = 'paid';
  else if (receipts > 0 || credits > 0) status = 'partially_paid';
  return {
    ...row,
    status,
    allocated_receipts: money(receipts),
    allocated_credits: money(credits),
    allocated_debits: money(debits),
    balance_due: Math.max(0, balance),
    payment_status: balance <= 0 ? 'paid' : (receipts > 0 || credits > 0 || debits > 0) ? 'partial' : 'unpaid',
  };
}

export function unissuedSalesCandidates() {
  const store = loadDocumentStore();
  const issued = new Set(store.documents
    .filter((row) => row.type === 'sales_invoice' && row.status !== 'void')
    .map((row) => row.order_id));
  return orderService.loadOrders()
    .filter((order) => ['Confirmed', 'Booked', 'Shipped', 'Delivered'].includes(order.status) && !issued.has(order.order_id))
    .map((order) => ({
      order_id: order.order_id,
      status: order.status,
      customer_name: order.customer_name,
      date: parseDatePrefix(order.delivered_at || order.created_at),
      amount: safeNumber(order.price),
      store: order.store,
      note: 'Delivered or in-fulfilment is not proof of payment or of an issued invoice.',
    }));
}

export function issueDocument(payload = {}) {
  const type = payload.type;
  if (!DOCUMENT_TYPES[type]) throw Object.assign(new Error('Unknown document type'), { status: 400 });

  const store = loadDocumentStore();
  const idem = String(payload.idempotency_key || '').trim();
  if (idem && store.idempotency[idem]) {
    const existing = store.documents.find((row) => row.id === store.idempotency[idem]);
    if (existing && existing.status !== 'void') {
      return { document: withBalances(existing, store.documents), duplicate: true };
    }
  }

  const issueDate = parseDatePrefix(payload.issue_date || nowStamp()) || new Date().toISOString().slice(0, 10);
  let order = null;
  if (payload.order_id) {
    order = orderService.getOrderByOrderId(payload.order_id);
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  }

  if (['sales_invoice', 'quotation', 'delivery_challan'].includes(type)) {
    if (!order) throw Object.assign(new Error('Order reference is required'), { status: 400 });
    const open = uniqueOpen(store, type, 'order', order.order_id);
    if (open) return { document: withBalances(open, store.documents), duplicate: true };
  }

  if (type === 'sales_invoice' && !['Confirmed', 'Booked', 'Shipped', 'Delivered'].includes(order.status)) {
    throw Object.assign(new Error('Sales invoices can be issued from Confirmed, Booked, Shipped or Delivered orders only'), { status: 400 });
  }

  let original = null;
  if (['credit_note', 'debit_note', 'payment_receipt'].includes(type) && payload.original_document_id) {
    original = store.documents.find((row) => row.id === payload.original_document_id || row.number === payload.original_document_id);
    if (!original || original.status === 'void') throw Object.assign(new Error('Original document not found'), { status: 404 });
    if (original.type !== 'sales_invoice') throw Object.assign(new Error('Adjustments must reference a sales invoice'), { status: 400 });
  }
  if (['credit_note', 'debit_note'].includes(type) && !original) {
    throw Object.assign(new Error('Credit/debit notes require the original sales invoice'), { status: 400 });
  }

  let financeEntry = null;
  if (type === 'payment_receipt' || type === 'payment_voucher') {
    const finance = financeStore();
    financeEntry = (finance.entries || []).find((entry) => entry.id === payload.finance_entry_id);
    if (!financeEntry) throw Object.assign(new Error('Receipts and vouchers must link a recorded cashbook entry'), { status: 400 });
    if (type === 'payment_receipt' && financeEntry.type !== 'income') {
      throw Object.assign(new Error('Payment receipts must link an income cashbook entry'), { status: 400 });
    }
    if (type === 'payment_voucher' && financeEntry.type !== 'expense') {
      throw Object.assign(new Error('Payment vouchers must link an expense cashbook entry'), { status: 400 });
    }
    const used = uniqueOpen(store, type, 'finance_entry', financeEntry.id);
    if (used) return { document: withBalances(used, store.documents), duplicate: true };
  }

  if (type === 'purchase_bill' && !String(payload.supplier_name || '').trim()) {
    throw Object.assign(new Error('Purchase bills require a supplier name from a real purchase — do not invent suppliers'), { status: 400 });
  }

  const rawLines = payload.lines?.length
    ? payload.lines
    : type === 'payment_receipt' || type === 'payment_voucher'
      ? [{ sku: '', description: financeEntry.description || type, qty: 1, unit_price: financeEntry.amount, discount: 0 }]
      : type === 'credit_note' || type === 'debit_note'
        ? (payload.lines?.length ? payload.lines : [{
          sku: '',
          description: payload.reason || type,
          qty: 1,
          unit_price: payload.amount ?? original.totals.grand_total,
          discount: 0,
        }])
        : linesFromOrder(order || {});

  const totals = computeDocumentTotals({
    lines: rawLines,
    discount: payload.discount || 0,
    shipping: payload.shipping ?? order?.shipping_charge ?? 0,
    tax_rate: payload.tax_rate || 0,
    tax_shipping: payload.tax_shipping,
  });

  const doc = {
    id: uuidv4(),
    type,
    number: nextNumber(store, type, issueDate),
    status: 'issued',
    issue_date: issueDate,
    due_date: parseDatePrefix(payload.due_date || '') || '',
    order_id: order?.order_id || '',
    source_type: financeEntry ? 'finance_entry' : order ? 'order' : (original ? 'document' : 'manual'),
    source_id: financeEntry?.id || order?.order_id || original?.id || '',
    original_document_id: original?.id || '',
    original_document_no: original?.number || '',
    finance_entry_id: financeEntry?.id || '',
    customer_name: payload.customer_name || order?.customer_name || original?.customer_name || '',
    customer_phone: payload.customer_phone || order?.customer_phone || original?.customer_phone || '',
    customer_address: payload.customer_address || order?.customer_address || original?.customer_address || '',
    supplier_name: payload.supplier_name || '',
    store: order?.store || payload.store || '',
    payment_method: payload.payment_method || (order ? 'COD' : financeEntry ? financeEntry.category || '' : ''),
    reason: payload.reason || '',
    notes: payload.notes || '',
    tax_document: type === 'sales_invoice',
    fbr_submitted: false,
    totals,
    lines: totals.lines,
    posted: Boolean(DOCUMENT_TYPES[type].financial),
    created_at: nowStamp(),
  };

  store.documents.push(doc);
  if (idem) store.idempotency[idem] = doc.id;
  appendEvent(store, doc.id, '', 'issued', payload.reason || type);
  saveStore(store);
  return { document: withBalances(doc, store.documents), duplicate: false };
}

export function voidDocument(id, reason = '') {
  const store = loadDocumentStore();
  const doc = store.documents.find((row) => row.id === id || row.number === id);
  if (!doc) throw Object.assign(new Error('Document not found'), { status: 404 });
  if (doc.status === 'void') return { document: doc };
  const prev = doc.status;
  doc.status = 'void';
  doc.void_reason = reason || 'Voided';
  doc.voided_at = nowStamp();
  appendEvent(store, doc.id, prev, 'void', reason);
  saveStore(store);
  return { document: doc };
}

export function documentTypes() {
  return Object.entries(DOCUMENT_TYPES).map(([id, meta]) => ({ id, ...meta, fbr: false }));
}

export { POSTED };
