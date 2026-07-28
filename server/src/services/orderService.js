import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { loadJson, saveJson } from '../utils/storage.js';
import { safeNumber, nowStamp } from '../utils/helpers.js';
import * as inventory from './inventoryService.js';
import * as whatsapp from './whatsappService.js';

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

export function updateOrderStatus(orderId, status, { sendWhatsapp = true } = {}) {
  const allowed = new Set(['Pending', 'Confirmed', 'Booked', 'Shipped', 'Delivered', 'Returned']);
  const normalized = (status || '').trim().replace(/\b\w/g, (c) => c.toUpperCase());
  if (!allowed.has(normalized)) throw new Error('Invalid status');

  const orders = loadOrders();
  const order = orders.find((o) => String(o.order_id) === String(orderId));
  if (!order) return null;

  order.status = normalized;
  order.status_updated_at = nowStamp();

  if (normalized === 'Confirmed' && !order.stock_reserved) {
    inventory.reserveStockForOrder(order);
  }
  if (normalized === 'Returned' && order.stock_reserved && !order.stock_restocked) {
    inventory.restoreStockForOrder(order);
  }

  saveOrders(orders);

  if (sendWhatsapp && ['Confirmed', 'Shipped', 'Delivered', 'Returned'].includes(normalized)) {
    whatsapp.sendOrderStatusMessage(order, normalized);
  }

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
  const orders = loadOrders();
  const products = loadJson(config.files.products, []);
  const delivered = orders.filter((o) => o.status === 'Delivered');
  return {
    total_products: products.length,
    total_orders: orders.length,
    pending_orders: orders.filter((o) => o.status === 'Pending').length,
    booked_orders: orders.filter((o) => o.status === 'Booked').length,
    shipped_orders: orders.filter((o) => o.status === 'Shipped').length,
    delivered_orders: delivered.length,
    returned_orders: orders.filter((o) => o.status === 'Returned').length,
    total_sale: delivered.reduce((sum, o) => sum + safeNumber(o.price), 0),
  };
}

export function buildWhatsappCheckoutUrl(order, customer) {
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
