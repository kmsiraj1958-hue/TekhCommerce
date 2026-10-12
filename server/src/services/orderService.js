import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { loadJson, saveJson } from '../utils/storage.js';
import { safeNumber, nowStamp } from '../utils/helpers.js';
import * as inventory from './inventoryService.js';
import * as whatsapp from './whatsappService.js';
import { getDashboardSummary } from './dashboardService.js';

export { getDashboardSummary };

export function loadOrders() {
  return loadJson(config.files.orders, []);
}

export function saveOrders(data) {
  saveJson(config.files.orders, data);
}

export function generateOrderId(orders) {
  let maxNum = 0;
  for (const o of orders) {
    const oid = String(o.order_id || '').replace('ORD-', '');
    const n = parseInt(oid, 10);
    if (!isNaN(n)) maxNum = Math.max(maxNum, n);
  }
  return `ORD-${String(maxNum + 1).padStart(4, '0')}`;
}

export function getOrderByOrderId(orderId) {
  return loadOrders().find((o) => String(o.order_id) === String(orderId)) || null;
}

export function createOrder(payload) {
  const orders = loadOrders();
  const order = {
    id: uuidv4(),
    order_id: generateOrderId(orders),
    store: payload.store || 'LOCAL',
    source: payload.source || 'website',
    items: payload.items || [],
    product_name: payload.product_name || '',
    product_code: payload.product_code || '',
    qty: payload.qty || 1,
    price: typeof payload.price === 'number' ? payload.price.toFixed(2) : String(payload.price || '0'),
    customer_name: payload.customer_name || '',
    customer_phone: payload.customer_phone || '',
    customer_address: payload.customer_address || '',
    status: 'Pending',
    courier: '',
    tracking_number: '',
    stock_reserved: false,
    stock_restocked: false,
    created_at: nowStamp(),
    ...payload.extra,
  };
  orders.push(order);
  saveOrders(orders);
  return order;
}

const ALLOWED_STATUSES = new Set(['Pending', 'Confirmed', 'Booked', 'Shipped', 'Delivered', 'Returned']);
const RESERVE_STATUSES = new Set(['Confirmed', 'Booked', 'Shipped', 'Delivered']);

/**
 * Single status pipeline for admin, Shopify fulfillment and M&P updates.
 * Stock flags and WhatsApp records are idempotent; callers save the orders array.
 */
export function applyStatusToOrder(order, status, { sendWhatsapp = true, stamps = {} } = {}) {
  const normalized = (status || '').trim().replace(/\b\w/g, (c) => c.toUpperCase());
  if (!ALLOWED_STATUSES.has(normalized)) throw new Error('Invalid status');

  const previous = (order.status || 'Pending').trim();
  const statusChanged = previous !== normalized;
  if (statusChanged) {
    order.status = normalized;
    order.status_updated_at = nowStamp();
    if (normalized === 'Shipped') order.shipped_at = stamps.shipped_at || nowStamp();
    if (normalized === 'Delivered') order.delivered_at = stamps.delivered_at || nowStamp();
    if (normalized === 'Returned') order.returned_at = stamps.returned_at || nowStamp();
  }

  let stockReserved = false;
  let stockRestored = false;
  if (RESERVE_STATUSES.has(normalized)) {
    stockReserved = Boolean(inventory.reserveStockForOrder(order));
  }
  if (normalized === 'Returned') {
    stockRestored = Boolean(inventory.restoreStockForOrder(order));
  }

  let notification = null;
  if (sendWhatsapp) {
    notification = whatsapp.notifyOrderStatus(order, normalized, { statusChanged });
  }

  return { order, previous, statusChanged, stockReserved, stockRestored, notification };
}

export function updateOrderStatus(orderId, status, { sendWhatsapp = true } = {}) {
  const orders = loadOrders();
  const order = orders.find((o) => String(o.order_id) === String(orderId));
  if (!order) return null;
  applyStatusToOrder(order, status, { sendWhatsapp });
  saveOrders(orders);
  return order;
}

export function deleteOrder(orderId) {
  const orders = loadOrders();
  const target = orders.find((o) => o.order_id === orderId);
  if (!target) return false;
  inventory.restoreStockForOrder(target);
  saveOrders(orders.filter((o) => o.order_id !== orderId));
  return true;
}

export function getDashboardStats() {
  return getDashboardSummary();
}

export function buildWhatsappCheckoutUrl(order, customer) {
  if (config.demoMode) {
    return '#whatsapp-disabled-on-development-data';
  }
  const msg = `Order Received:
ID: ${order.order_id}
Products: ${order.product_name}
Qty: ${order.qty}
Price: ${order.price}

Customer: ${customer.name}
Phone: ${customer.phone}
Address: ${customer.address}

Reply YES to confirm.`;
  return `https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(msg)}`;
}
