import test from 'node:test';
import assert from 'node:assert/strict';
import * as orderService from './orderService.js';
import { applyStatusToOrder } from './orderService.js';
import { issueDocument } from './documentService.js';

test('status pipeline reserves stock once and does not send WhatsApp twice', () => {
  const order = {
    order_id: 'ORD-PIPE-1',
    status: 'Pending',
    customer_phone: '03000000000',
    stock_reserved: false,
    stock_restocked: false,
    items: [],
    qty: 0,
  };
  const first = applyStatusToOrder(order, 'Confirmed');
  assert.equal(first.statusChanged, true);
  assert.equal(order.stock_reserved, true);
  assert.equal(first.notification.state, 'skipped_development');
  const second = applyStatusToOrder(order, 'Confirmed');
  assert.equal(second.statusChanged, false);
  assert.equal(second.stockReserved, false);
  assert.equal(second.notification.state, 'already_recorded');
});

test('Shipped without prior Confirmed still reserves stock once; Returned restores once', () => {
  const order = {
    order_id: 'ORD-PIPE-2',
    status: 'Pending',
    stock_reserved: false,
    stock_restocked: false,
    items: [],
    qty: 0,
  };
  applyStatusToOrder(order, 'Shipped', { sendWhatsapp: true });
  assert.equal(order.status, 'Shipped');
  assert.equal(order.stock_reserved, true);
  applyStatusToOrder(order, 'Shipped');
  assert.equal(order.stock_reserved, true);
  applyStatusToOrder(order, 'Returned');
  assert.equal(order.stock_restocked, true);
  const again = applyStatusToOrder(order, 'Returned');
  assert.equal(again.stockRestored, false);
});

test('issuing an invoice does not change order status, stock flags or WhatsApp records', () => {
  const order = orderService.loadOrders().find((row) => row.status === 'Delivered' && row.order_id);
  assert.ok(order);
  const snapshot = {
    status: order.status,
    stock_reserved: order.stock_reserved,
    notifications: JSON.stringify(order.notifications || {}),
  };
  issueDocument({
    type: 'sales_invoice',
    order_id: order.order_id,
    idempotency_key: `preserve-wa-${order.order_id}`,
  });
  const after = orderService.getOrderByOrderId(order.order_id);
  assert.equal(after.status, snapshot.status);
  assert.equal(after.stock_reserved, snapshot.stock_reserved);
  assert.equal(JSON.stringify(after.notifications || {}), snapshot.notifications);
});
