import crypto from 'crypto';
import { config } from '../config.js';
import { extractCodeFromTitle, safeNumber, nowStamp } from '../utils/helpers.js';
import * as orderService from './orderService.js';

export function verifyWebhook(secret, rawBody, hmacHeader) {
  if (!secret || !hmacHeader) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

export function getSecret(store) {
  return store.toLowerCase() === 'vogue' ? config.shopifySecretVogue : config.shopifySecretSns;
}

export function createOrderFromShopify(store, payload) {
  const storeLabel = store.toUpperCase();
  const orders = orderService.loadOrders();
  const shopifyOrderId = String(payload.id || '');
  if (shopifyOrderId) {
    const existing = orders.find((row) => (
      String(row.store || '').toUpperCase() === storeLabel
      && String(row.shopify_order_id) === shopifyOrderId
    ));
    if (existing) return existing;
  }
  const customer = payload.customer || {};
  const customerName = `${(customer.first_name || '').trim()} ${(customer.last_name || '').trim()}`.trim()
    || payload.contact_email || 'Customer';
  const phone = payload.phone || customer.phone || '';
  const ship = payload.shipping_address || {};
  const addressParts = [ship.address1, ship.address2, ship.city, ship.province, ship.zip, ship.country]
    .map((p) => String(p || '').trim()).filter(Boolean);
  const customerAddress = addressParts.join(' ');

  const items = (payload.line_items || []).map((it) => {
    let sku = it.sku || '';
    if (!sku || sku === 'None') sku = extractCodeFromTitle(it.title || '');
    const variant = it.variant_title || '';
    const title = it.title || '';
    return {
      title,
      variant,
      display: variant ? `${title} (${variant})` : title,
      sku,
      qty: parseInt(it.quantity || 1, 10) || 1,
      price: safeNumber(it.price),
    };
  });

  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const totalPrice = safeNumber(payload.total_price);

  const newOrder = {
    id: crypto.randomUUID(),
    order_id: orderService.generateOrderId(orders),
    store: storeLabel,
    source: 'shopify',
    shopify_order_id: String(payload.id || ''),
    shopify_order_name: payload.name || '',
    items,
    product_name: items[0]?.display || 'Shopify Order',
    product_code: items[0]?.sku || '',
    qty: totalQty || 1,
    price: totalPrice.toFixed(2),
    customer_name: customerName,
    customer_phone: phone,
    customer_address: customerAddress,
    status: 'Pending',
    courier: '',
    tracking_number: '',
    stock_reserved: false,
    stock_restocked: false,
    created_at: nowStamp(),
  };

  orders.push(newOrder);
  orderService.saveOrders(orders);
  return newOrder;
}

export function updateFromFulfillment(store, payload) {
  const orders = orderService.loadOrders();
  const fulfillment = payload.fulfillment && typeof payload.fulfillment === 'object' ? payload.fulfillment : payload;
  const shopifyOrderId = String(fulfillment.order_id || payload.order_id || '');
  if (!shopifyOrderId) return false;

  let trackingNumber = '';
  const trackingNumbers = fulfillment.tracking_numbers || [];
  if (Array.isArray(trackingNumbers) && trackingNumbers.length) {
    trackingNumber = String(trackingNumbers[0] || '');
  }
  if (!trackingNumber && fulfillment.tracking_number) {
    trackingNumber = String(fulfillment.tracking_number);
  }

  let updated = false;
  for (const o of orders) {
    if (String(o.store || '').toLowerCase() === store.toLowerCase() && String(o.shopify_order_id) === shopifyOrderId) {
      if (fulfillment.tracking_company) o.courier = fulfillment.tracking_company;
      if (trackingNumber) {
        o.tracking_number = trackingNumber;
        orderService.applyStatusToOrder(o, 'Shipped', {
          sendWhatsapp: true,
          stamps: { shipped_at: nowStamp() },
        });
      }
      updated = true;
      break;
    }
  }

  if (updated) orderService.saveOrders(orders);
  return updated;
}
