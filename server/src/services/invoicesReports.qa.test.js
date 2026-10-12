import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { authRequired } from '../middleware/auth.js';
import { computeDocumentTotals, linesFromOrder, money } from './documentCalc.js';
import {
  issueDocument,
  getDocument,
  listDocuments,
  DOCUMENT_TYPES,
} from './documentService.js';
import { runReport, reportToCsv } from './reportCentreService.js';
import * as orderService from './orderService.js';
import { loadJson } from '../utils/storage.js';
import { outboundMessagingEnabled, sendTextMessage } from './whatsappService.js';
import { fetchFinalStatus } from './mnpService.js';
import * as shopifyService from './shopifyService.js';
import { reconcileCod, uniqueShipments, buildShipment } from './courierLogic.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function liveHashes() {
  return {
    products: fs.readFileSync(path.join(repoRoot, 'products.json')),
    orders: fs.readFileSync(path.join(repoRoot, 'orders.json')),
    license: fs.readFileSync(path.join(repoRoot, 'server', 'data', 'vendor-license.json')),
  };
}

function eligibleOrder() {
  const issued = new Set(listDocuments({ type: 'sales_invoice' }).filter((row) => row.status !== 'void').map((row) => row.order_id));
  return orderService.loadOrders().find((order) => (
    ['Confirmed', 'Booked', 'Shipped', 'Delivered'].includes(order.status) && !issued.has(order.order_id)
  ));
}

test.describe('invoices and reports QA', { concurrency: 1 }, () => {
test('QA 1–6 documents: issue, duplicate, layouts, payment, credit/debit, distinct types', () => {
  const before = liveHashes();
  const order = eligibleOrder();
  assert.ok(order, 'need an uninvoiced eligible order in the demo dataset');

  const expected = computeDocumentTotals({ lines: linesFromOrder(order), tax_rate: 0, discount: 0, shipping: 0 });
  const issued = issueDocument({
    type: 'sales_invoice',
    order_id: order.order_id,
    idempotency_key: `qa-si-${order.order_id}`,
    tax_rate: 0,
  });
  assert.equal(issued.duplicate, false);
  assert.equal(issued.document.type, 'sales_invoice');
  assert.equal(issued.document.order_id, order.order_id);
  assert.equal(issued.document.totals.grand_total, expected.grand_total);
  assert.equal(issued.document.payment_status, 'unpaid');
  assert.ok(issued.document.status !== 'paid');
  assert.equal(orderService.getOrderByOrderId(order.order_id).status, order.status);

  const retry = issueDocument({
    type: 'sales_invoice',
    order_id: order.order_id,
    idempotency_key: `qa-si-${order.order_id}`,
    tax_rate: 17,
  });
  assert.equal(retry.duplicate, true);
  assert.equal(retry.document.number, issued.document.number);
  assert.equal(retry.document.totals.grand_total, issued.document.totals.grand_total);
  assert.equal(retry.document.totals.tax_rate, issued.document.totals.tax_rate);

  const loaded = getDocument(issued.document.id);
  const a4 = loaded.totals;
  const thermal = getDocument(issued.document.id).totals;
  assert.deepEqual(thermal, a4);
  assert.equal(a4.grand_total, issued.document.totals.grand_total);

  const finance = loadJson(config.files.finance, { entries: [] });
  const usedReceipts = new Set(listDocuments({ type: 'payment_receipt' }).map((row) => row.finance_entry_id));
  const usedVouchers = new Set(listDocuments({ type: 'payment_voucher' }).map((row) => row.finance_entry_id));
  const income = (finance.entries || [])
    .filter((entry) => entry.type === 'income' && !usedReceipts.has(entry.id))
    .sort((a, b) => Number(a.amount) - Number(b.amount))[0];
  assert.ok(income, 'demo cashbook must contain an income entry');
  const receipt = issueDocument({
    type: 'payment_receipt',
    original_document_id: issued.document.id,
    finance_entry_id: income.id,
    idempotency_key: `qa-pr-${income.id}-${issued.document.id}`,
  });
  assert.equal(receipt.document.type, 'payment_receipt');
  assert.equal(receipt.document.finance_entry_id, income.id);
  const afterPay = getDocument(issued.document.id);
  assert.equal(afterPay.totals.grand_total, issued.document.totals.grand_total);
  assert.equal(afterPay.allocated_receipts, money(income.amount));
  const expectedBalance = money(issued.document.totals.grand_total - income.amount);
  if (expectedBalance <= 0) {
    assert.equal(afterPay.payment_status, 'paid');
    assert.equal(afterPay.balance_due, 0);
  } else {
    assert.equal(afterPay.payment_status, 'partial');
    assert.equal(afterPay.balance_due, expectedBalance);
  }

  const originalTotal = afterPay.totals.grand_total;
  const credit = issueDocument({
    type: 'credit_note',
    original_document_id: issued.document.id,
    reason: 'QA authorised return allowance',
    amount: 25,
    idempotency_key: `qa-cn-${issued.document.id}`,
  });
  const debit = issueDocument({
    type: 'debit_note',
    original_document_id: issued.document.id,
    reason: 'QA authorised extra charge',
    amount: 10,
    idempotency_key: `qa-dn-${issued.document.id}`,
  });
  const adjusted = getDocument(issued.document.id);
  assert.equal(adjusted.totals.grand_total, originalTotal);
  assert.equal(credit.document.original_document_id, issued.document.id);
  assert.equal(debit.document.original_document_id, issued.document.id);
  assert.ok(adjusted.allocated_credits >= 25);
  assert.ok(adjusted.allocated_debits >= 10);
  const rawBalance = money(originalTotal + adjusted.allocated_debits - adjusted.allocated_credits - adjusted.allocated_receipts);
  assert.equal(adjusted.balance_due, Math.max(0, rawBalance));
  assert.equal(adjusted.totals.grand_total, originalTotal);

  const quoteOrder = orderService.loadOrders().find((row) => row.order_id !== order.order_id && ['Pending', 'Confirmed', 'Booked', 'Shipped', 'Delivered'].includes(row.status));
  const financeBefore = fs.readFileSync(config.files.finance);
  const quote = issueDocument({ type: 'quotation', order_id: quoteOrder.order_id, idempotency_key: `qa-qu-${quoteOrder.order_id}` });
  const challan = issueDocument({ type: 'delivery_challan', order_id: quoteOrder.order_id, idempotency_key: `qa-dc-${quoteOrder.order_id}` });
  const bill = issueDocument({
    type: 'purchase_bill',
    supplier_name: 'QA Packaging Vendor',
    lines: [{ description: 'Mailer bags', qty: 2, unit_price: 50 }],
    idempotency_key: `qa-pb-${Date.now()}`,
  });
  const expense = (finance.entries || []).find((entry) => entry.type === 'expense' && !usedVouchers.has(entry.id));
  const voucher = issueDocument({
    type: 'payment_voucher',
    finance_entry_id: expense.id,
    idempotency_key: `qa-pv-${expense.id}`,
  });
  assert.equal(quote.document.type, 'quotation');
  assert.equal(quote.document.posted, false);
  assert.equal(DOCUMENT_TYPES.quotation.financial, false);
  assert.equal(challan.document.posted, false);
  assert.equal(DOCUMENT_TYPES.delivery_challan.financial, false);
  assert.equal(bill.document.posted, true);
  assert.equal(voucher.document.posted, true);
  assert.equal(fs.readFileSync(config.files.finance).equals(financeBefore), true);
  assert.notEqual(quote.document.type, issued.document.type);
  assert.notEqual(challan.document.type, receipt.document.type);

  const after = liveHashes();
  assert.equal(after.products.equals(before.products), true);
  assert.equal(after.orders.equals(before.orders), true);
  assert.equal(after.license.equals(before.license), true);
  assert.match(config.files.documents.replace(/\\/g, '/'), /server\/data\/demo\//);
});

test('QA 7–8 reports: date/store filters, CSV, no double-count of COD/payouts/returns', () => {
  const wide = runReport('sales_summary', { start: '2026-08-12', end: '2026-10-11' });
  const empty = runReport('sales_summary', { start: '1999-01-01', end: '1999-01-02' });
  assert.equal(empty.totals.orders, 0);
  assert.ok(wide.totals.orders > 0);
  assert.notEqual(wide.totals.order_revenue, wide.totals.cash_collected_on_invoices);

  const allReg = runReport('sales_register', { start: '2026-08-12', end: '2026-10-11' });
  const vogue = runReport('sales_register', { start: '2026-08-12', end: '2026-10-11', store: 'VOGUE' });
  assert.ok(vogue.rows.every((row) => String(row.store).toUpperCase() === 'VOGUE'));
  assert.ok(vogue.totals.rows <= allReg.totals.rows);
  const summaryVogue = runReport('sales_summary', { start: '2026-08-12', end: '2026-10-11', store: 'VOGUE' });
  assert.ok(summaryVogue.totals.orders <= wide.totals.orders);

  const csv = reportToCsv(allReg);
  assert.match(csv, /order_id/);
  assert.ok(csv.split('\n').length > 2);

  const invoices = runReport('invoice_register', { start: '2026-08-01', end: '2026-10-11' });
  const posted = listDocuments({ type: 'sales_invoice', start: '2026-08-01', end: '2026-10-11' });
  const registerIds = invoices.rows.filter((row) => row.type === 'sales_invoice').map((row) => row.number).sort();
  const postedIds = posted.map((row) => row.number).sort();
  assert.deepEqual(registerIds, postedIds);

  const returns = runReport('returns_refunds', { start: '2026-08-12', end: '2026-10-11' });
  assert.ok(Object.prototype.hasOwnProperty.call(returns.totals, 'returned_orders'));
  assert.ok(Object.prototype.hasOwnProperty.call(returns.totals, 'credit_note_amount'));
  assert.ok(Object.prototype.hasOwnProperty.call(returns.totals, 'cash_refund_amount'));

  const orders = orderService.loadOrders();
  const shipments = uniqueShipments(orders.map((order) => buildShipment(order, { receipts: [], events: [] })));
  const payouts = loadJson(config.files.mnpPayout, []);
  const recon = reconcileCod({ shipments, payouts, start: '2026-08-12', end: '2026-10-11' });
  const centre = runReport('cod_settlement', { start: '2026-08-12', end: '2026-10-11' });
  assert.equal(centre.totals.payout_rows, recon.settlement.payout_rows);
  const uniqueKeys = new Set(payouts.map((p) => `${p.store}|${p['Payment ID']}|${p['Instrument Number']}|${p['Paid On']}`));
  assert.ok(recon.settlement.payout_rows <= uniqueKeys.size);
});

test('QA 9 auth, duplicate handling and data-path isolation', async () => {
  const app = express();
  app.use(express.json());
  app.get('/secure', authRequired, (req, res) => res.json({ ok: true, user: req.user.sub }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const unauth = await fetch(`http://127.0.0.1:${port}/secure`);
    assert.equal(unauth.status, 401);
    const token = jwt.sign({ sub: 'qa' }, config.jwtSecret, { expiresIn: '5m' });
    const auth = await fetch(`http://127.0.0.1:${port}/secure`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(auth.status, 200);
    const bad = await fetch(`http://127.0.0.1:${port}/secure`, { headers: { Authorization: 'Bearer not-a-token' } });
    assert.equal(bad.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  assert.match(config.files.documents.replace(/\\/g, '/'), /server\/data\/demo\/documents\.json/);
  assert.match(config.files.orders.replace(/\\/g, '/'), /server\/data\/demo\/orders\.json/);
  assert.notEqual(config.files.orders, path.join(repoRoot, 'orders.json'));
});

test('QA 10 smoke: WhatsApp, Shopify HMAC path and M&P stay non-outbound on development data', async () => {
  assert.equal(outboundMessagingEnabled(), false);
  let fetches = 0;
  const orig = global.fetch;
  global.fetch = async () => {
    fetches += 1;
    return { ok: true, json: async () => ({ isSuccess: 'true' }) };
  };
  try {
    assert.equal(await sendTextMessage('03001234567', 'QA'), false);
    const mnp = await fetchFinalStatus('vogue', '1234567');
    assert.match(String(mnp.message || ''), /disabled/i);
    assert.equal(fetches, 0);
  } finally {
    global.fetch = orig;
  }

  assert.equal(shopifyService.verifyWebhook('', Buffer.from('{}'), ''), false);
  const created = shopifyService.createOrderFromShopify('vogue', {
    id: 'qa-smoke-shopify',
    total_price: '1',
    line_items: [{ title: 'QA', sku: 'DEMO-TEE-01', quantity: 1, price: '1' }],
  });
  const again = shopifyService.createOrderFromShopify('vogue', {
    id: 'qa-smoke-shopify',
    total_price: '9',
    line_items: [{ title: 'QA', sku: 'DEMO-TEE-01', quantity: 1, price: '9' }],
  });
  assert.equal(created.order_id, again.order_id);
});
});
