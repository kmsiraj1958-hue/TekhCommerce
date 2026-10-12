import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { issueDocument, listDocuments, voidDocument } from './documentService.js';
import * as orderService from './orderService.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('document engine numbering, money separation, idempotency and live isolation', () => {
  assert.match(config.files.documents.replace(/\\/g, '/'), /server\/data\/demo\/documents\.json/);

  const live = [
    path.join(repoRoot, 'orders.json'),
    path.join(repoRoot, 'products.json'),
    path.join(repoRoot, 'server', 'data', 'vendor-license.json'),
  ];
  const before = live.map((file) => fs.readFileSync(file));

  const delivered = orderService.loadOrders().filter((row) => row.status === 'Delivered');
  const shipped = orderService.loadOrders().find((row) => row.status === 'Shipped') || delivered[1];
  assert.ok(delivered.length && shipped);

  const order = delivered[0];
  const key = `test-si-${order.order_id}`;
  const first = issueDocument({ type: 'sales_invoice', order_id: order.order_id, idempotency_key: key, tax_rate: 0 });
  const retry = issueDocument({ type: 'sales_invoice', order_id: order.order_id, idempotency_key: key, tax_rate: 99 });
  assert.equal(retry.duplicate, true);
  assert.equal(retry.document.number, first.document.number);
  assert.equal(retry.document.totals.tax_rate, first.document.totals.tax_rate);
  assert.equal(first.document.payment_status, 'unpaid');

  const credit = issueDocument({
    type: 'credit_note',
    original_document_id: first.document.id,
    reason: 'Damaged item',
    amount: 10,
    idempotency_key: `cn-${first.document.id}-10`,
  });
  assert.equal(credit.document.original_document_id, first.document.id);
  const afterCredit = listDocuments({ type: 'sales_invoice' }).find((row) => row.id === first.document.id);
  assert.equal(afterCredit.totals.grand_total, first.document.totals.grand_total);
  assert.ok(afterCredit.allocated_credits >= 10);

  issueDocument({ type: 'quotation', order_id: shipped.order_id, idempotency_key: `qu-${shipped.order_id}` });
  issueDocument({ type: 'delivery_challan', order_id: shipped.order_id, idempotency_key: `dc-${shipped.order_id}` });

  const voided = voidDocument(first.document.id, 'Test void — use credit notes in production');
  assert.equal(voided.document.status, 'void');

  live.forEach((file, index) => {
    assert.equal(fs.readFileSync(file).equals(before[index]), true, file);
  });
});
