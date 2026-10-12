import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RETURN_STATES,
  buildShipment,
  classifyReturn,
  dedupeEventLog,
  listReturns,
  previewDailyRows,
  reconcileCod,
  uniqueShipments,
  weekBounds,
  weeklyCourierReport,
  buildAlerts,
} from './courierLogic.js';

const today = '2026-10-11';

test('duplicate courier events do not create extra return rows', () => {
  const order = {
    order_id: 'ORD-9', store: 'SNS', status: 'Returned', tracking_number: '12345',
    mnp_status: 'Returned to Origin', returned_at: '2026-10-01 10:00', created_at: '2026-09-20 10:00',
  };
  const events = [
    { order_id: 'ORD-9', tracking: '12345', status: 'Returned to Origin', at: '2026-10-01 10:00' },
    { order_id: 'ORD-9', tracking: '12345', status: 'Returned to Origin', at: '2026-10-01 10:00' },
    { order_id: 'ORD-9', tracking: '12345', status: 'Returned to Origin', at: '2026-10-01 11:00' },
  ];
  const shipments = [
    buildShipment(order, { events: dedupeEventLog(events) }),
    buildShipment(order, { events: dedupeEventLog(events) }),
  ];
  const returns = listReturns(shipments, { today, overdueDays: 7 });
  assert.equal(returns.length, 1);
  assert.equal(uniqueShipments(shipments).length, 1);
});

test('return in transit is not warehouse receipt; physical receipt is a separate state', () => {
  const inTransit = buildShipment({
    order_id: 'ORD-1', store: 'VOGUE', status: 'Returned', tracking_number: '111',
    mnp_status: 'Returning to origin', returned_at: '2026-10-08', created_at: '2026-10-01',
  });
  assert.equal(classifyReturn(inTransit, { today, overdueDays: 7 }), RETURN_STATES.C_IN_TRANSIT);

  const received = buildShipment({
    order_id: 'ORD-1', store: 'VOGUE', status: 'Returned', tracking_number: '111',
    mnp_status: 'Returning to origin', returned_at: '2026-10-08',
  }, {
    receipts: [{ order_id: 'ORD-1', tracking: '111', condition: 'ok', received_at: '2026-10-10' }],
  });
  assert.equal(classifyReturn(received, { today, overdueDays: 7 }), RETURN_STATES.E_RECEIVED);
  assert.notEqual(classifyReturn(inTransit, { today, overdueDays: 7 }), RETURN_STATES.E_RECEIVED);
});

test('undelivered courier status is not treated as a customer refund', () => {
  const row = buildShipment({
    order_id: 'ORD-2', store: 'SNS', status: 'Returned', tracking_number: '222',
    mnp_status: 'Undelivered', price: '900', created_at: '2026-10-01',
  });
  assert.equal(classifyReturn(row, { today, overdueDays: 7 }), RETURN_STATES.A_UNDELIVERED);
});

test('COD uses mnp_cod_amount and payout nets, not order price, and does not double-count payouts', () => {
  const shipments = [
    buildShipment({ order_id: 'ORD-A', store: 'VOGUE', status: 'Delivered', tracking_number: '1', mnp_cod_amount: 1000, price: '5000', delivered_at: '2026-10-01', mnp_payment_id: 'P1' }),
    buildShipment({ order_id: 'ORD-B', store: 'VOGUE', status: 'Delivered', tracking_number: '2', price: '8000', delivered_at: '2026-10-02' }),
  ];
  const payouts = [
    { store: 'VOGUE', 'Payment ID': 'P1', 'Paid On': '2026-10-05', 'RR Amount': 1000, 'Invoice Amount': 100, 'Tax Amount': 10, 'Net Payable': 890, 'Return Charges': 0, 'Instrument Number': 'I1' },
    { store: 'VOGUE', 'Payment ID': 'P1', 'Paid On': '2026-10-05', 'RR Amount': 1000, 'Invoice Amount': 100, 'Tax Amount': 10, 'Net Payable': 890, 'Return Charges': 0, 'Instrument Number': 'I1' },
  ];
  const data = reconcileCod({ shipments, payouts, start: '2026-10-01', end: '2026-10-31' });
  assert.equal(data.shipment.expected_cod, 1000);
  assert.equal(data.shipment.missing_cod_field, 1);
  assert.equal(data.settlement.payout_rows, 1);
  assert.equal(data.settlement.actual_recorded_settlement, 890);
  assert.equal(data.settlement.net_expected_settlement, 890);
  assert.equal(data.settlement.unreconciled_difference, 0);
  assert.equal(data.collected_by_courier.available, false);
});

test('weekly bounds start Monday and include Sunday', () => {
  assert.deepEqual(weekBounds('2026-10-11'), { start: '2026-10-05', end: '2026-10-11' });
  assert.deepEqual(weekBounds('2026-10-05'), { start: '2026-10-05', end: '2026-10-11' });
});

test('unmatched and incomplete courier records are listed, not invented', () => {
  const shipments = [
    buildShipment({ order_id: 'ORD-A', store: 'VOGUE', status: 'Delivered', tracking_number: '99', price: '100', delivered_at: '2026-10-06' }),
    buildShipment({ order_id: 'ORD-B', store: 'VOGUE', status: 'Booked', tracking_number: '99', created_at: '2026-10-07' }),
  ];
  const report = weeklyCourierReport({
    shipments,
    returns: [],
    payouts: [],
    start: '2026-10-05',
    end: '2026-10-11',
  });
  assert.equal(report.opening_pending.available, false);
  assert.equal(report.expected_cod, null);
  assert.equal(report.unmatched.duplicate_tracking[0].tracking, '99');
  assert.equal(report.unmatched.delivered_without_cod_field, 1);
});

test('alerts come from records and settings, not hardcoded counts', () => {
  const overdueShip = buildShipment({
    order_id: 'ORD-R', store: 'SNS', status: 'Returned', tracking_number: '333',
    mnp_status: 'RTS', returned_at: '2026-09-01', created_at: '2026-08-01',
  });
  const returns = listReturns([overdueShip], { today, overdueDays: 7 });
  const alerts = buildAlerts({
    returns,
    shipments: [overdueShip],
    reconciliation: { settlement: { unreconciled_difference: 12, payout_rows: 1 } },
    settings: { return_overdue_days: 7, stale_tracking_days: 5, settlement_overdue_days: 14 },
    today,
  });
  assert.equal(alerts.some((a) => a.type === 'return_overdue'), true);
  assert.equal(alerts.some((a) => a.type === 'settlement_difference'), true);
});

test('daily preview flags file duplicates and unmatched consignments', () => {
  const preview = previewDailyRows([
    { 'Consignment Number': '555', Status: 'Delivered' },
    { 'Consignment Number': '555', Status: 'Delivered' },
    { Consignment: '999', Status: 'Returned' },
  ], { store: 'VOGUE', orders: [{ store: 'VOGUE', tracking_number: '555', order_id: 'ORD-5' }] });
  assert.equal(preview.duplicates_in_file, 1);
  assert.equal(preview.matched, 2);
  assert.equal(preview.unmatched, 1);
});
