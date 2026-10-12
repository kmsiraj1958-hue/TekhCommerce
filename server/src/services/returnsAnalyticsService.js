import { parseDatePrefix, safeNumber } from '../utils/helpers.js';
import { isRecordedRefund } from './cashbookService.js';

const RETURN_TYPES = new Set(['return', 'return_in']);

export function extractOrderIdFromNote(note = '') {
  const match = String(note).match(/ORD-\d+/i);
  return match ? match[0].toUpperCase() : '';
}

function inRange(date, start, end) {
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function classifyStockReturn(move, ordersById) {
  const orderId = extractOrderIdFromNote(move.note);
  if (!orderId) {
    return { classification: 'orphan', order_id: '', reason: 'No order id on the stock-return note.' };
  }
  const order = ordersById.get(orderId);
  if (!order) {
    return { classification: 'orphan', order_id: orderId, reason: `No current order ${orderId}.` };
  }
  if (order.status !== 'Returned') {
    return {
      classification: 'unreconciled',
      order_id: orderId,
      reason: `Stock return cites ${orderId}, whose status is ${order.status || 'unknown'} rather than Returned.`,
    };
  }
  return { classification: 'linked', order_id: orderId, reason: '' };
}

export function computeReturnsAnalytics({
  orders = [],
  movements = [],
  financeEntries = [],
  start,
  end,
} = {}) {
  const ordersById = new Map(orders.map((order) => [String(order.order_id || '').toUpperCase(), order]));

  const returnedOrders = orders.filter((order) => {
    if (order.status !== 'Returned') return false;
    const date = parseDatePrefix(order.status_updated_at || order.created_at || '');
    return inRange(date, start, end);
  });

  const stockEvents = movements
    .filter((move) => RETURN_TYPES.has(String(move.type || '').toLowerCase()))
    .map((move) => {
      const date = parseDatePrefix(move.date || '');
      const classed = classifyStockReturn(move, ordersById);
      return {
        date,
        sku: String(move.code || '').trim(),
        qty: parseInt(move.qty || 0, 10) || 0,
        store: move.store || '',
        note: move.note || '',
        type: move.type || '',
        ...classed,
      };
    })
    .filter((row) => inRange(row.date, start, end));

  const linked = stockEvents.filter((row) => row.classification === 'linked');
  const unreconciled = stockEvents.filter((row) => row.classification === 'unreconciled');
  const orphan = stockEvents.filter((row) => row.classification === 'orphan');

  const byDay = new Map();
  for (const row of linked) {
    if (!byDay.has(row.date)) byDay.set(row.date, { date: row.date, linked_qty: 0, linked_events: 0 });
    const bucket = byDay.get(row.date);
    bucket.linked_qty += row.qty;
    bucket.linked_events += 1;
  }
  const trend = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  const refundEntries = (financeEntries || []).filter((entry) => {
    if (!isRecordedRefund(entry)) return false;
    const date = parseDatePrefix(entry.date || entry.createdAt || '');
    return inRange(date, start, end);
  });
  const refundAmount = Math.round(refundEntries.reduce((sum, entry) => sum + safeNumber(entry.amount), 0) * 100) / 100;

  const returnedQty = returnedOrders.reduce((sum, order) => sum + (parseInt(order.qty || 0, 10) || 0), 0);

  return {
    range: { start: start || '', end: end || '' },
    returned_orders: returnedOrders.length,
    returned_qty: returnedQty,
    linked_stock_return_events: linked.length,
    linked_stock_return_qty: linked.reduce((sum, row) => sum + row.qty, 0),
    unreconciled_stock_returns: unreconciled.length,
    orphan_stock_returns: orphan.length,
    recorded_refund_amount: refundAmount,
    recorded_refund_count: refundEntries.length,
    trend,
    breakdown: {
      returned_orders: returnedOrders.length,
      linked_stock_returns: linked.length,
      unreconciled_stock_returns: unreconciled.length,
      orphan_stock_returns: orphan.length,
    },
    flagged: [...unreconciled, ...orphan].slice(0, 12),
    recent_stock_returns: [...stockEvents]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 8),
    recent_returned_orders: returnedOrders
      .sort((a, b) => String(b.status_updated_at || b.created_at || '').localeCompare(String(a.status_updated_at || a.created_at || '')))
      .slice(0, 8)
      .map((order) => ({
        order_id: order.order_id,
        created_at: order.created_at || '',
        status_updated_at: order.status_updated_at || '',
        qty: order.qty,
        price: order.price,
        store: order.store || '',
        product_name: order.product_name || '',
      })),
    notes: {
      inventory_vs_money: 'Stock returns and cash refunds are separate. Order value is not treated as a refund.',
      shopify_refunds: 'Shopify refund webhooks are not implemented. Only orders-create and fulfillments are processed.',
      flagged: 'Unreconciled and orphan return_in rows are excluded from confirmed order-return metrics.',
    },
    unavailable: [
      ...(refundEntries.length ? [] : ['cash refund amounts (none recorded in the cashbook)']),
      'Shopify refund integration',
    ],
  };
}
