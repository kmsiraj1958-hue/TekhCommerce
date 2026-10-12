import test from 'node:test';
import assert from 'node:assert/strict';
import { sendTextMessage, notifyOrderStatus, outboundMessagingEnabled } from './whatsappService.js';

test('development profile disables outbound WhatsApp and does not call Graph API', async () => {
  assert.equal(outboundMessagingEnabled(), false);
  let called = 0;
  const orig = global.fetch;
  global.fetch = async () => {
    called += 1;
    return { ok: true };
  };
  try {
    assert.equal(await sendTextMessage('03001234567', 'hello'), false);
    assert.equal(called, 0);
  } finally {
    global.fetch = orig;
  }
});

test('status templates record skipped_development and do not claim delivery', () => {
  const order = { order_id: 'ORD-0001', customer_phone: '03001234567', notifications: { whatsapp: {} } };
  const first = notifyOrderStatus(order, 'Confirmed', { statusChanged: true });
  assert.equal(first.state, 'skipped_development');
  assert.notEqual(first.state, 'delivered');
  const again = notifyOrderStatus(order, 'Confirmed', { statusChanged: true });
  assert.equal(again.state, 'already_recorded');
});
