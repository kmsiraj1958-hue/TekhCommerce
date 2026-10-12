import { config } from '../config.js';
import { cleanPhoneForWhatsapp, nowStamp } from '../utils/helpers.js';

export const WHATSAPP_STATUS_TRIGGERS = ['Confirmed', 'Shipped', 'Delivered', 'Returned'];

function buildMessage(order, status) {
  const orderId = order.order_id || '';
  const tracking = order.tracking_number || 'Not assigned';
  const messages = {
    Confirmed: `Dear Customer, your order ${orderId} has been confirmed. We will ship it soon.`,
    Shipped: `Dear Customer, your order ${orderId} has been shipped. Tracking number: ${tracking}.`,
    Delivered: `Dear Customer, your order ${orderId} has been delivered. Thank you for shopping with us.`,
    Returned: `Dear Customer, your order ${orderId} has been returned. Please contact us for details.`,
  };
  return messages[status] || `Dear Customer, your order ${orderId} status is now ${status}.`;
}

/** Real Graph API / wa.me sends are off on the isolated development dataset. */
export function outboundMessagingEnabled() {
  return !config.demoMode && !config.useDevelopmentData;
}

export async function sendTextMessage(phone, message) {
  if (!outboundMessagingEnabled()) {
    return false;
  }
  if (!config.whatsappAccessToken || !config.whatsappPhoneNumberId) {
    console.warn('WhatsApp API config missing');
    return false;
  }
  const toNumber = cleanPhoneForWhatsapp(phone);
  if (!toNumber) return false;

  const url = `https://graph.facebook.com/${config.whatsappApiVersion}/${config.whatsappPhoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.whatsappAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toNumber,
        type: 'text',
        text: { body: message },
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('WhatsApp send error:', err.message);
    return false;
  }
}

/**
 * Records notification state on the order. Does not claim provider delivery
 * receipts (this stack has no WhatsApp status webhook).
 */
export function notifyOrderStatus(order, status, { statusChanged = true } = {}) {
  if (!WHATSAPP_STATUS_TRIGGERS.includes(status)) {
    return { channel: 'whatsapp', state: 'not_applicable', status };
  }
  order.notifications = order.notifications || { whatsapp: {} };
  const existing = order.notifications.whatsapp[status];
  if (existing && ['sent', 'skipped_development', 'queued'].includes(existing.state)) {
    return { ...existing, state: 'already_recorded', prior: existing.state };
  }
  if (!statusChanged) {
    return { channel: 'whatsapp', state: 'already_recorded', prior: existing?.state || 'unchanged' };
  }

  if (!outboundMessagingEnabled()) {
    const rec = {
      channel: 'whatsapp',
      state: 'skipped_development',
      at: nowStamp(),
      reason: 'Isolated development dataset — outbound customer messages are disabled',
    };
    order.notifications.whatsapp[status] = rec;
    return rec;
  }

  const rec = {
    channel: 'whatsapp',
    state: 'queued',
    at: nowStamp(),
  };
  order.notifications.whatsapp[status] = rec;
  sendTextMessage(order.customer_phone || '', buildMessage(order, status)).then((ok) => {
    rec.state = ok ? 'sent' : 'failed';
  });
  return rec;
}

export function sendOrderStatusMessage(order, status) {
  return notifyOrderStatus(order, status, { statusChanged: true });
}

export { buildMessage };
