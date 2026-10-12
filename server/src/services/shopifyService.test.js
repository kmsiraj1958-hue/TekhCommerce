import test from 'node:test';
import assert from 'node:assert/strict';
import * as shopifyService from './shopifyService.js';
import * as orderService from './orderService.js';
import { fetchFinalStatus } from './mnpService.js';

test('Shopify orders-create is store-scoped: same external id may exist on another store', () => {
  const payload = {
    id: 'tekh-idem-shopify-shared',
    name: '#SHARED',
    total_price: '10.00',
    line_items: [{ title: 'Test', sku: 'DEMO-TEE-01', quantity: 1, price: '10' }],
  };
  const vogue = shopifyService.createOrderFromShopify('vogue', payload);
  const sns = shopifyService.createOrderFromShopify('sns', payload);
  assert.notEqual(vogue.order_id, sns.order_id);
  assert.equal(vogue.store, 'VOGUE');
  assert.equal(sns.store, 'SNS');
  const retry = shopifyService.createOrderFromShopify('vogue', payload);
  assert.equal(retry.order_id, vogue.order_id);
});

test('Shopify orders-create is idempotent on shopify_order_id', () => {
  const payload = {
    id: 'tekh-idem-shopify-1',
    name: '#TEST1',
    total_price: '10.00',
    line_items: [{ title: 'Test', sku: 'DEMO-TEE-01', quantity: 1, price: '10' }],
    customer: { first_name: 'Synthetic', last_name: 'Buyer' },
  };
  const first = shopifyService.createOrderFromShopify('vogue', payload);
  const second = shopifyService.createOrderFromShopify('vogue', { ...payload, total_price: '99.00' });
  assert.equal(first.order_id, second.order_id);
  assert.equal(first.shopify_order_id, 'tekh-idem-shopify-1');
  const copies = orderService.loadOrders().filter((row) => row.shopify_order_id === 'tekh-idem-shopify-1');
  assert.equal(copies.length, 1);
});

test('Shopify fulfillment uses the shared status pipeline without a second Shipped notification', () => {
  const created = shopifyService.createOrderFromShopify('sns', {
    id: 'tekh-idem-shopify-2',
    name: '#TEST2',
    total_price: '20.00',
    line_items: [{ title: 'Test', sku: 'DEMO-TEE-01', quantity: 1, price: '20' }],
  });
  shopifyService.updateFromFulfillment('sns', {
    order_id: 'tekh-idem-shopify-2',
    tracking_number: '1234567890123',
    tracking_company: 'M&P',
  });
  const order = orderService.getOrderByOrderId(created.order_id);
  assert.equal(order.status, 'Shipped');
  assert.equal(order.tracking_number, '1234567890123');
  assert.equal(order.stock_reserved, true);
  const firstNote = order.notifications?.whatsapp?.Shipped?.state;
  assert.equal(firstNote, 'skipped_development');
  shopifyService.updateFromFulfillment('sns', {
    order_id: 'tekh-idem-shopify-2',
    tracking_number: '1234567890123',
    tracking_company: 'M&P',
  });
  const again = orderService.getOrderByOrderId(created.order_id);
  assert.equal(again.notifications.whatsapp.Shipped.state, 'skipped_development');
});

test('M&P tracking HTTP is not called on the development dataset', async () => {
  let called = 0;
  const orig = global.fetch;
  global.fetch = async () => {
    called += 1;
    return { json: async () => ({ isSuccess: 'true' }) };
  };
  try {
    const resp = await fetchFinalStatus('vogue', '999999');
    assert.match(String(resp.message || ''), /disabled/i);
    assert.equal(called, 0);
  } finally {
    global.fetch = orig;
  }
});
