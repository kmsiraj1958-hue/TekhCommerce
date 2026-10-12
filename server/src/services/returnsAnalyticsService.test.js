import test from 'node:test';
import assert from 'node:assert/strict';
import { computeReturnsAnalytics, extractOrderIdFromNote } from './returnsAnalyticsService.js';

test('extracts order ids from stock-return notes', () => {
  assert.equal(extractOrderIdFromNote('Stock restored: ORD-0001'), 'ORD-0001');
  assert.equal(extractOrderIdFromNote('manual return'), '');
});

test('flags orphan and unreconciled stock returns separately from returned orders', () => {
  const data = computeReturnsAnalytics({
    start: '2026-03-01',
    end: '2026-04-01',
    orders: [
      { order_id: 'ORD-0001', status: 'Booked', created_at: '2026-03-31 11:11', qty: 1, price: '100' },
      { order_id: 'ORD-0002', status: 'Returned', created_at: '2026-03-20 09:00', status_updated_at: '2026-03-22 09:00', qty: 2, price: '50' },
    ],
    movements: [
      { date: '2026-03-25 10:56', code: 'VIB-003', qty: 1, type: 'return_in', note: 'Stock restored: ORD-0001' },
      { date: '2026-03-31 11:42', code: 'SC-304', qty: 1, type: 'return_in', note: 'Stock restored: ORD-0005' },
      { date: '2026-03-22 10:00', code: 'A-1', qty: 2, type: 'return_in', note: 'Stock restored: ORD-0002' },
    ],
    financeEntries: [],
  });
  assert.equal(data.returned_orders, 1);
  assert.equal(data.returned_qty, 2);
  assert.equal(data.linked_stock_return_events, 1);
  assert.equal(data.linked_stock_return_qty, 2);
  assert.equal(data.unreconciled_stock_returns, 1);
  assert.equal(data.orphan_stock_returns, 1);
  assert.equal(data.recorded_refund_amount, 0);
  assert.deepEqual(data.trend.map((row) => row.date), ['2026-03-22']);
  assert.equal(data.trend[0].linked_qty, 2);
});
