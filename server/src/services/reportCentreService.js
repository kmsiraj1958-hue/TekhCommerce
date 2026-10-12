import { config } from '../config.js';
import { loadJson } from '../utils/storage.js';
import { parseDatePrefix, safeNumber } from '../utils/helpers.js';
import * as orderService from './orderService.js';
import * as productService from './productService.js';
import * as inventoryService from './inventoryService.js';
import { computeCashbookOverview, isRecordedRefund } from './cashbookService.js';
import { computeReturnsAnalytics } from './returnsAnalyticsService.js';
import { listDocuments } from './documentService.js';
import { money } from './documentCalc.js';
import * as mnpService from './mnpService.js';
import {
  buildShipment,
  listReturns,
  reconcileCod,
  weekBounds,
  weeklyCourierReport,
} from './courierLogic.js';
import { loadReceipts, loadEvents, loadSettings } from './courierService.js';
import { MFG_REPORT_FAMILIES, manufacturingReports } from './manufacturingService.js';

function inRange(date, start, end) {
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((key) => csvEscape(row[key])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export const REPORT_FAMILIES = [
  { id: 'sales_summary', category: 'Sales & Invoicing', title: 'Sales summary' },
  { id: 'sales_register', category: 'Sales & Invoicing', title: 'Sales register' },
  { id: 'invoice_register', category: 'Sales & Invoicing', title: 'Invoice register' },
  { id: 'returns_refunds', category: 'Sales & Invoicing', title: 'Returns, refunds and credit notes' },
  { id: 'stock_on_hand', category: 'Inventory & Purchasing', title: 'Stock on hand and low stock' },
  { id: 'stock_movements', category: 'Inventory & Purchasing', title: 'Stock movements and valuation' },
  { id: 'purchases', category: 'Inventory & Purchasing', title: 'Purchases and supplier balances' },
  { id: 'courier_weekly', category: 'Courier Accounts', title: 'Weekly courier performance' },
  { id: 'cod_settlement', category: 'Courier Accounts', title: 'COD settlement and reconciliation' },
  { id: 'cashbook_register', category: 'Finance & Compliance', title: 'Cashbook and payment register' },
  { id: 'tax_fbr', category: 'Finance & Compliance', title: 'Tax and FBR invoice register' },
  { id: 'financial_statements', category: 'Finance & Compliance', title: 'Financial statements' },
  ...MFG_REPORT_FAMILIES,
];

function defaultRange(start, end) {
  const today = new Date().toISOString().slice(0, 10);
  return { start: start || weekBounds(today).start, end: end || today };
}

export function runReport(family, { start, end, q = '', store = '' } = {}) {
  const range = defaultRange(start, end);
  const orders = orderService.loadOrders();
  const products = productService.loadProducts();
  const movements = inventoryService.loadMovements();
  const finance = loadJson(config.files.finance, { accounts: [], entries: [] });
  const inventory = inventoryService.calculateInventory();

  switch (family) {
    case 'sales_summary':
      return salesSummary(orders, range, store);
    case 'sales_register':
      return salesRegister(orders, range, q, store);
    case 'invoice_register':
      return invoiceRegister(range, q, store);
    case 'returns_refunds':
      return returnsRefunds(orders, movements, finance, range);
    case 'stock_on_hand':
      return stockOnHand(inventory, products);
    case 'stock_movements':
      return stockMovements(movements, products, inventory, range);
    case 'purchases':
      return purchases(movements, range);
    case 'courier_weekly':
      return courierWeekly(orders, range, store);
    case 'cod_settlement':
      return codSettlement(orders, range, store);
    case 'cashbook_register':
      return cashbookRegister(finance, range);
    case 'tax_fbr':
      return taxFbr(range);
    case 'financial_statements':
      return financialStatements();
    default: {
      const mfg = manufacturingReports(family, range);
      if (mfg) return mfg;
      throw Object.assign(new Error('Unknown report family'), { status: 400 });
    }
  }
}

function salesSummary(orders, range, store = '') {
  const inPeriod = orders.filter((order) => {
    if (!inRange(parseDatePrefix(order.created_at), range.start, range.end)) return false;
    if (store && String(order.store || '').toUpperCase() !== store.toUpperCase()) return false;
    return true;
  });
  const delivered = inPeriod.filter((order) => order.status === 'Delivered');
  const invoices = listDocuments({ type: 'sales_invoice', start: range.start, end: range.end })
    .filter((row) => row.status !== 'void')
    .filter((row) => !store || String(row.store || '').toUpperCase() === store.toUpperCase());
  const orderRevenue = money(delivered.reduce((sum, order) => sum + safeNumber(order.price), 0));
  const invoiced = money(invoices.reduce((sum, row) => sum + safeNumber(row.totals?.grand_total), 0));
  const collected = money(invoices.reduce((sum, row) => sum + safeNumber(row.allocated_receipts), 0));
  const cod = money(delivered.reduce((sum, order) => sum + safeNumber(order.mnp_cod_amount), 0));
  return {
    family: 'sales_summary',
    range,
    available: true,
    source: 'Delivered orders.price for order revenue; posted sales invoices for invoiced amount; payment receipts for collected cash; mnp_cod_amount for courier COD expected.',
    totals: {
      orders: inPeriod.length,
      delivered: delivered.length,
      order_revenue: orderRevenue,
      invoices_issued: invoices.length,
      invoiced_amount: invoiced,
      cash_collected_on_invoices: collected,
      courier_cod_expected: cod,
    },
    notes: [
      'Order revenue is not cash received.',
      'Issued invoices are not FBR submissions.',
      'Courier COD is not bank settlement.',
    ],
    rows: [],
  };
}

function salesRegister(orders, range, q, store) {
  const query = String(q || '').toLowerCase();
  const rows = [];
  for (const order of orders) {
    const date = parseDatePrefix(order.created_at);
    if (!inRange(date, range.start, range.end)) continue;
    if (store && String(order.store || '').toUpperCase() !== store.toUpperCase()) continue;
    const items = order.items?.length ? order.items : [{ sku: order.product_code, title: order.product_name, qty: order.qty, price: order.price }];
    for (const item of items) {
      const row = {
        date,
        order_id: order.order_id,
        status: order.status,
        store: order.store,
        channel: order.source,
        customer: order.customer_name,
        sku: item.sku || item.code || '',
        product: item.title || item.display || order.product_name,
        qty: item.qty,
        amount: order.items?.length ? money(safeNumber(item.price) * safeNumber(item.qty || 1)) : safeNumber(order.price),
      };
      if (query && !JSON.stringify(row).toLowerCase().includes(query)) continue;
      rows.push(row);
    }
  }
  return {
    family: 'sales_register',
    range,
    available: true,
    source: 'orders.json line items filtered by created_at on the server.',
    totals: { rows: rows.length, amount: money(rows.reduce((s, r) => s + safeNumber(r.amount), 0)) },
    rows,
  };
}

function invoiceRegister(range, q, store = '') {
  const rows = listDocuments({ start: range.start, end: range.end, q }).filter((row) => (
    ['sales_invoice', 'credit_note', 'debit_note', 'quotation'].includes(row.type)
    && (!store || String(row.store || '').toUpperCase() === store.toUpperCase())
  )).map((row) => ({
    number: row.number,
    type: row.type,
    date: row.issue_date,
    customer: row.customer_name,
    order_id: row.order_id,
    status: row.status,
    gross: row.totals?.grand_total,
    tax: row.totals?.tax_amount,
    balance_due: row.balance_due,
    payment_status: row.payment_status || '',
    fbr: 'not_submitted',
  }));
  return {
    family: 'invoice_register',
    range,
    available: true,
    source: 'Posted documents in documents.json. Empty until invoices are issued. Delivered orders are not auto-invoiced.',
    totals: {
      documents: rows.length,
      gross: money(rows.filter((r) => r.type === 'sales_invoice').reduce((s, r) => s + safeNumber(r.gross), 0)),
    },
    rows,
  };
}

function returnsRefunds(orders, movements, finance, range) {
  const analytics = computeReturnsAnalytics({
    orders,
    movements,
    financeEntries: finance.entries || [],
    start: range.start,
    end: range.end,
  });
  const credits = listDocuments({ type: 'credit_note', start: range.start, end: range.end })
    .filter((row) => row.status !== 'void');
  const refunds = (finance.entries || []).filter((entry) => {
    const date = parseDatePrefix(entry.date || entry.createdAt);
    return inRange(date, range.start, range.end) && isRecordedRefund(entry);
  });
  return {
    family: 'returns_refunds',
    range,
    available: true,
    source: 'Returned orders, stock return_in movements, credit notes, and cashbook entries whose text contains refund — kept as separate measures.',
    totals: {
      returned_orders: analytics.returned_orders,
      credit_notes: credits.length,
      credit_note_amount: money(credits.reduce((s, r) => s + safeNumber(r.totals?.grand_total), 0)),
      cash_refunds: refunds.length,
      cash_refund_amount: money(refunds.reduce((s, r) => s + safeNumber(r.amount), 0)),
    },
    notes: ['A credit note is not a cash refund.', 'A courier RTS is not a warehouse receipt.'],
    rows: credits.map((row) => ({
      number: row.number,
      date: row.issue_date,
      original: row.original_document_no,
      amount: row.totals?.grand_total,
      reason: row.reason,
    })),
  };
}

function stockOnHand(inventory, products) {
  const rows = Object.entries(inventory).map(([sku, row]) => ({
    sku,
    name: row.name,
    balance: row.balance,
    reorder_level: row.reorder_level,
    low_stock: row.balance <= row.reorder_level,
    cost: safeNumber(products.find((p) => p.code === sku)?.cost),
    qty_value: money(row.balance * safeNumber(products.find((p) => p.code === sku)?.cost)),
  }));
  return {
    family: 'stock_on_hand',
    range: {},
    available: true,
    source: 'opening_stock plus movements. Value uses product.cost × qty (not FIFO layers).',
    totals: { skus: rows.length, low_stock: rows.filter((r) => r.low_stock).length, qty_value: money(rows.reduce((s, r) => s + r.qty_value, 0)) },
    rows,
  };
}

function stockMovements(movements, products, inventory, range) {
  const rows = movements.filter((move) => inRange(parseDatePrefix(move.date), range.start, range.end)).map((move) => ({
    date: parseDatePrefix(move.date),
    sku: move.code,
    type: move.type,
    qty: move.qty,
    note: move.note,
    unit_cost: safeNumber(products.find((p) => p.code === move.code)?.cost),
  }));
  return {
    family: 'stock_movements',
    range,
    available: true,
    source: 'inventory_movements.json. Valuation is product.cost snapshot, not a perpetual inventory ledger.',
    totals: { movements: rows.length },
    rows,
  };
}

function purchases(movements, range) {
  const bills = listDocuments({ type: 'purchase_bill', start: range.start, end: range.end }).filter((row) => row.status !== 'void');
  const receipts = movements.filter((move) => ['purchase', 'stock_in', 'manual_add'].includes(String(move.type || '').toLowerCase())
    && inRange(parseDatePrefix(move.date), range.start, range.end));
  return {
    family: 'purchases',
    range,
    available: true,
    source: 'Purchase bills from documents.json; stock receipts from inventory movements. Supplier AP balances exist only when purchase bills are posted.',
    totals: {
      purchase_bills: bills.length,
      bill_amount: money(bills.reduce((s, r) => s + safeNumber(r.totals?.grand_total), 0)),
      stock_receipt_lines: receipts.length,
    },
    supplier_balances: bills.length
      ? 'Computed from posted purchase bills only (no invented suppliers).'
      : 'Unavailable until purchase bills are issued. Stock receipts are not supplier invoices.',
    rows: bills.map((row) => ({
      number: row.number,
      date: row.issue_date,
      supplier: row.supplier_name,
      amount: row.totals?.grand_total,
      status: row.status,
    })),
  };
}

function courierWeekly(orders, range, store) {
  const settings = loadSettings();
  const receipts = loadReceipts();
  const events = loadEvents();
  const shipments = orders.map((order) => buildShipment(order, { receipts, events, settings }));
  const returns = listReturns(shipments, { today: range.end, overdueDays: settings.return_overdue_days });
  const report = weeklyCourierReport({ shipments, returns, payouts: mnpService.loadPayoutRows(), start: range.start, end: range.end, store });
  return {
    family: 'courier_weekly',
    range,
    available: true,
    source: 'Orders + courier receipts/events + weeklyCourierReport. Week bounds should be passed as start/end (Monday–Sunday recommended).',
    totals: {
      bookings: report.new_bookings,
      delivered: report.delivered,
      delivery_failures: report.delivery_failures,
      returns_in_transit: report.returns_initiated,
      warehouse_received: report.returns_received,
    },
    rows: [],
    detail: report,
  };
}

function codSettlement(orders, range, store) {
  const settings = loadSettings();
  const receipts = loadReceipts();
  const events = loadEvents();
  const shipments = orders.map((order) => buildShipment(order, { receipts, events, settings }))
    .filter((row) => !store || row.store === store);
  const recon = reconcileCod({ shipments, payouts: mnpService.loadPayoutRows(), start: range.start, end: range.end });
  return {
    family: 'cod_settlement',
    range,
    available: true,
    source: 'mnp_cod_amount on delivered shipments vs payout XLSX Net Payable / RR Amount. Collected-by-courier is unavailable.',
    totals: recon.settlement,
    matching: recon.matching,
    collected_by_courier: recon.collected_by_courier,
    rows: recon.rows || [],
  };
}

function cashbookRegister(finance, range) {
  const overview = computeCashbookOverview({ finance, start: range.start, end: range.end });
  const rows = (finance.entries || []).filter((entry) => inRange(parseDatePrefix(entry.date || entry.createdAt), range.start, range.end))
    .map((entry) => ({
      id: entry.id,
      date: parseDatePrefix(entry.date || entry.createdAt),
      type: entry.type,
      description: entry.description,
      category: entry.category,
      amount: entry.amount,
      reference: entry.reference,
      refund: isRecordedRefund(entry),
    }));
  return {
    family: 'cashbook_register',
    range,
    available: true,
    source: 'finance.json cashbook entries. Not a general ledger.',
    totals: {
      receipts: overview.recorded_receipts,
      expenses: overview.recorded_expenses,
      net_cash_movement: overview.net_cash_movement,
      recorded_refunds: overview.recorded_refunds,
    },
    rows,
  };
}

function taxFbr(range) {
  const rows = listDocuments({ type: 'sales_invoice', start: range.start, end: range.end })
    .filter((row) => row.status !== 'void')
    .map((row) => ({
      number: row.number,
      date: row.issue_date,
      tax_amount: row.totals?.tax_amount,
      grand_total: row.totals?.grand_total,
      fbr_status: 'not_submitted',
      fbr_irn: '',
    }));
  return {
    family: 'tax_fbr',
    range,
    available: true,
    fbr_live: false,
    source: 'Internal sales invoices with tax fields. TekhDigitalInvoice/FBR is not connected; no acknowledgements are stored.',
    totals: { invoices: rows.length, tax_amount: money(rows.reduce((s, r) => s + safeNumber(r.tax_amount), 0)) },
    rows,
  };
}

function financialStatements() {
  return {
    family: 'financial_statements',
    available: false,
    reason: 'TekhCommerce records a cashbook only. General Ledger, Trial Balance, Profit & Loss, Balance Sheet and Cash Flow require double-entry accounting in TekhAccounts.',
    tekhaccounts: 'not_connected',
    rows: [],
  };
}

export function reportToCsv(report) {
  if (!report.available) {
    return toCsv(['status', 'reason'], [{ status: 'unavailable', reason: report.reason }]);
  }
  const rows = report.rows?.length ? report.rows : [report.totals || {}];
  const headers = Object.keys(rows[0] || { empty: '' });
  return toCsv(headers, rows);
}
