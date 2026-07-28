import { config } from '../config.js';
import { cleanPhoneForWhatsapp } from '../utils/helpers.js';

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

export async function sendTextMessage(phone, message) {
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

export function sendOrderStatusMessage(order, status) {
  const phone = order.customer_phone || '';
  const message = buildMessage(order, status);
  return sendTextMessage(phone, message);
}
