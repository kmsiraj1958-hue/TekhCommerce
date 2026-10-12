import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDashboardSummary } from './dashboardService.js';

const orders = [
  {
    order_id: 'ORD-1', status: 'Delivered', price: '1000', qty: 1, created_at: '2026-10-01 10:00',
    product_name: 'A', product_code: 'A-1', store: 'SNS',
    items: [{ sku: 'A-1', title: 'A', qty: 1, price: 1000 }],
  },
  {
    order_id: 'ORD-2', status: 'Pending', price: '500', qty: 1, created_at: '2026-10-02 10:00',
    product_name: 'B', product_code: 'B-1', store: 'VOGUE',
  },
];

test('dashboard sales and AOV use delivered orders only', () => {
  const data = computeDashboardSummary({
    orders,
    products: [{ code: 'A-1' }, { code: 'B-1' }],
    inventory: { 'A-1': { name: 'A', balance: 1, reorder_level: 3 } },
    start: '2026-10-01',
    end: '2026-10-02',
  });
  assert.equal(data.total_sale, 1000);
  assert.equal(data.average_order_value, 1000);
  assert.equal(data.pending_orders, 1);
  assert.equal(data.delivered_orders, 1);
  assert.equal(data.total_orders, 2);
  assert.equal(data.top_products[0].sku, 'A-1');
  assert.equal(data.low_stock[0].sku, 'A-1');
  assert.equal(data.sales_trend.length, 2);
  assert.equal(data.sales_trend[0].date, '2026-10-01');
  assert.equal(data.sales_trend[0].delivered_sales, 1000);
  assert.equal(data.sales_trend[0].orders, 1);
  assert.equal(data.sales_trend[1].date, '2026-10-02');
  assert.equal(data.sales_trend[1].orders, 1);
  assert.equal(data.sales_trend[1].delivered_sales, 0);
});

test('dashboard includes cashbook and returns blocks without inventing activity', () => {
  const data = computeDashboardSummary({
    orders,
    products: [{ code: 'A-1' }],
    inventory: {},
    start: '2026-10-01',
    end: '2026-10-02',
  });
  assert.equal(data.finance.recorded_receipts, 0);
  assert.equal(data.finance.mode, 'cashbook');
  assert.equal(data.returns.returned_orders, 0);
  assert.equal(data.returns.recorded_refund_amount, 0);
});

test('trend uses order created_at dates and does not invent empty days', () => {
  const data = computeDashboardSummary({
    orders,
    products: [{ code: 'A-1' }],
    inventory: {},
    start: '2026-01-01',
    end: '2026-12-31',
  });
  assert.deepEqual(data.sales_trend.map((row) => row.date), ['2026-10-01', '2026-10-02']);
  assert.equal(data.sales_trend.every((row) => row.orders > 0), true);
});
