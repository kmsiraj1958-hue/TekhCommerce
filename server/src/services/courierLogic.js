import { cleanConsignment, parseDatePrefix, safeNumber } from '../utils/helpers.js';
import { PROVIDERS, providerForStore, mnpCredentialStatus } from '../couriers/adapters.js';

export const RETURN_STATES = {
  A_UNDELIVERED: 'delivery_failed',
  B_INITIATED: 'return_initiated',
  C_IN_TRANSIT: 'return_in_transit',
  D_OVERDUE: 'return_overdue',
  E_RECEIVED: 'warehouse_received',
  F_DISPUTED: 'received_disputed',
  G_CUSTOMER: 'customer_return',
};

export const RETURN_LABELS = {
  [RETURN_STATES.A_UNDELIVERED]: 'Delivery failed / undelivered',
  [RETURN_STATES.B_INITIATED]: 'Return initiated by courier',
  [RETURN_STATES.C_IN_TRANSIT]: 'Return in transit to warehouse',
  [RETURN_STATES.D_OVERDUE]: 'Return overdue / not received',
  [RETURN_STATES.E_RECEIVED]: 'Physically received at warehouse',
  [RETURN_STATES.F_DISPUTED]: 'Received damaged / incomplete / disputed',
  [RETURN_STATES.G_CUSTOMER]: 'Customer return after delivery',
};

export const DEFAULT_COURIER_SETTINGS = {
  return_overdue_days: 7,
  stale_tracking_days: 5,
  settlement_overdue_days: 14,
};

export function roundMoney(value) {
  return Math.round(safeNumber(value) * 100) / 100;
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysBetween(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const a = new Date(`${startIso}T00:00:00`);
  const b = new Date(`${endIso}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

export function weekBounds(isoDate, weekStartsOn = 1) {
  const d = new Date(`${isoDate}T00:00:00`);
  const day = d.getDay();
  const diff = weekStartsOn === 1 ? (day === 0 ? 6 : day - 1) : day;
  const start = new Date(d);
  start.setDate(d.getDate() - diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const ymd = (dt) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  };
  return { start: ymd(start), end: ymd(end) };
}

export function normalizeCourierStatus(raw = '', orderStatus = '') {
  const text = String(raw || '').trim();
  const lower = text.toLowerCase();
  let normalized = 'unknown';
  if (lower.includes('deliver') && !lower.includes('undeliver')) normalized = 'delivered';
  else if (lower.includes('undeliver') || lower.includes('fail')) normalized = 'undelivered';
  else if (/\brto\b/.test(lower) || lower.includes('return to origin') || lower.includes('returning')) normalized = 'returning';
  else if (lower.includes('return') || lower.includes('rts')) normalized = 'returned';
  else if (lower.includes('transit') || lower.includes('on route')) normalized = 'in_transit';
  else if (lower.includes('book')) normalized = 'booked';
  else if (orderStatus === 'Delivered') normalized = 'delivered';
  else if (orderStatus === 'Returned') normalized = 'returned';
  else if (orderStatus === 'Shipped') normalized = 'in_transit';
  else if (orderStatus === 'Booked') normalized = 'booked';
  else if (orderStatus) normalized = String(orderStatus).toLowerCase();
  return { original: text, normalized };
}

function inRange(date, start, end) {
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

export function shipmentKey(order) {
  const tracking = cleanConsignment(order.tracking_number || '');
  return tracking || String(order.order_id || order.id || '');
}

export function buildShipment(order, { receipts = [], events = [] } = {}) {
  const provider = providerForStore(order.store);
  const tracking = cleanConsignment(order.tracking_number || '');
  const status = normalizeCourierStatus(order.mnp_status || '', order.status || '');
  const key = shipmentKey(order);
  const receipt = receipts.find((row) => row.order_id === order.order_id || (tracking && cleanConsignment(row.tracking) === tracking)) || null;
  const relatedEvents = events.filter((ev) => ev.order_id === order.order_id || (tracking && cleanConsignment(ev.tracking) === tracking));
  const latestEvent = relatedEvents.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0] || null;
  const shippingCharge = order.shipping_charge ?? order.mnp_shipping_charge;
  const returnCharge = order.return_charge ?? order.mnp_return_charge;
  return {
    order_id: order.order_id,
    store: (order.store || '').toUpperCase(),
    courier_id: provider.id,
    courier_name: order.courier || provider.name,
    tracking,
    booked_at: order.booked_at || order.created_at || '',
    created_at: order.created_at || '',
    customer_name: order.customer_name || '',
    reference: order.shopify_order_name || order.order_id,
    order_status: order.status || '',
    courier_status_original: status.original,
    courier_status: status.normalized,
    latest_event: latestEvent ? latestEvent.status : (status.original || order.status || ''),
    latest_event_at: latestEvent?.at || order.status_updated_at || '',
    dispatched_at: order.dispatched_at || order.stock_reserved_at || '',
    delivered_at: order.delivered_at || '',
    returned_at: order.returned_at || '',
    last_location: order.mnp_last_location || latestEvent?.location || '',
    expected_return_at: order.expected_return_at || '',
    cod_amount: order.mnp_cod_amount == null || order.mnp_cod_amount === '' ? null : roundMoney(order.mnp_cod_amount),
    order_value: roundMoney(order.price),
    payment_id: order.mnp_payment_id || '',
    shipping_charge: shippingCharge == null || shippingCharge === '' ? null : roundMoney(shippingCharge),
    return_charge: returnCharge == null || returnCharge === '' ? null : roundMoney(returnCharge),
    attempts: order.mnp_attempts || '',
    notes: order.mnp_notes || '',
    customer_return: Boolean(order.customer_return),
    warehouse_receipt: receipt,
    key,
  };
}

export function uniqueShipments(shipments) {
  const map = new Map();
  for (const row of shipments) {
    if (!map.has(row.key)) map.set(row.key, row);
  }
  return [...map.values()];
}

export function classifyReturn(shipment, { today, overdueDays }) {
  const receipt = shipment.warehouse_receipt;
  if (receipt) {
    const condition = String(receipt.condition || 'ok').toLowerCase();
    if (['damaged', 'incomplete', 'disputed'].includes(condition)) return RETURN_STATES.F_DISPUTED;
    return RETURN_STATES.E_RECEIVED;
  }
  const raw = `${shipment.courier_status_original || ''} ${shipment.latest_event || ''}`.toLowerCase();
  const norm = shipment.courier_status;
  if (shipment.customer_return || (shipment.delivered_at && /customer return/.test(raw))) {
    return RETURN_STATES.G_CUSTOMER;
  }
  const looksUndelivered = norm === 'undelivered' || (/undeliver|fail/.test(raw) && !/return|rts|rto/.test(raw));
  const looksReturning = norm === 'returning' || /in transit to (origin|warehouse)|returning/.test(raw);
  const looksReturned = !looksUndelivered && (
    shipment.order_status === 'Returned' || norm === 'returned' || /return|rts|\brto\b/.test(raw)
  );
  if (!looksUndelivered && !looksReturning && !looksReturned) return null;

  const start = parseDatePrefix(shipment.returned_at || shipment.latest_event_at || shipment.created_at || '');
  const elapsed = daysBetween(start, today);
  if (looksReturned && elapsed != null && elapsed > overdueDays) return RETURN_STATES.D_OVERDUE;
  if (looksReturning) return RETURN_STATES.C_IN_TRANSIT;
  if (looksUndelivered && !looksReturned) return RETURN_STATES.A_UNDELIVERED;
  return RETURN_STATES.B_INITIATED;
}

export function buildAccounts({ orders = [], credentials = {}, receipts = [] } = {}) {
  const creds = mnpCredentialStatus(credentials);
  const shipments = uniqueShipments(orders.map((order) => buildShipment(order, { receipts })));
  return PROVIDERS.map((provider) => {
    const rows = shipments.filter((row) => row.courier_id === provider.id);
    const live = provider.id === 'mnp'
      ? { VOGUE: creds.VOGUE, SNS: creds.SNS, any: creds.VOGUE || creds.SNS }
      : { any: false };
    return {
      id: provider.id,
      name: provider.name,
      live_tracking: Boolean(provider.liveTracking && live.any),
      integration_status: provider.liveTracking
        ? (live.any ? 'credentials configured' : 'credentials missing — sync will skip')
        : 'not implemented',
      notes: provider.notes,
      shipment_count: rows.length,
      with_tracking: rows.filter((row) => row.tracking).length,
      stores: provider.stores,
    };
  });
}

export function listReturns(shipments, { today, overdueDays }) {
  const unique = uniqueShipments(shipments);
  const rows = [];
  for (const shipment of unique) {
    const state = classifyReturn(shipment, { today, overdueDays });
    if (!state) continue;
    const initiated = parseDatePrefix(shipment.returned_at || shipment.latest_event_at || '');
    rows.push({
      ...shipment,
      return_state: state,
      return_label: RETURN_LABELS[state],
      return_initiated_at: initiated,
      expected_return_at: shipment.expected_return_at || (initiated ? addDays(initiated, overdueDays) : ''),
      physical_receipt_at: shipment.warehouse_receipt?.received_at || '',
      disposition: shipment.warehouse_receipt?.condition || '',
    });
  }
  return rows;
}

export const COD_FORMULAS = [
  'COD expected = sum of mnp_cod_amount on delivered shipments that have that field. Order price is not COD.',
  'COD remitted = sum of payout Net Payable (aggregate settlements). Not summed with shipment COD.',
  'Payout RR Amount is the courier-reported COD in the settlement file, not a second remittance.',
  'Delivery charges = payout Invoice Amount. Return charges = payout Return Charges when present.',
  'Expected net (settlement) = RR Amount − Invoice Amount − Return Charges − Tax Amount.',
  'Unreconciled difference = expected net − Net Payable, at payout-row level.',
  'Shipment-level outstanding is only computed when mnp_payment_id matches a payout Payment ID.',
];

export function reconcileCod({ shipments = [], payouts = [], start = '', end = '' } = {}) {
  const unique = uniqueShipments(shipments);
  const delivered = unique.filter((row) => row.order_status === 'Delivered' || row.courier_status === 'delivered');
  const deliveredInRange = delivered.filter((row) => {
    const date = parseDatePrefix(row.delivered_at || row.created_at || '');
    return !start && !end ? true : inRange(date, start, end);
  });
  const withCod = deliveredInRange.filter((row) => row.cod_amount != null);
  const missingCod = deliveredInRange.length - withCod.length;
  const expectedFromShipments = roundMoney(withCod.reduce((sum, row) => sum + row.cod_amount, 0));

  const payoutRows = [];
  let rr = 0;
  let charges = 0;
  let returnCharges = 0;
  let tax = 0;
  let remitted = 0;
  const seenPayout = new Set();
  for (const p of payouts) {
    const paidOn = parseDatePrefix(String(p['Paid On'] || ''));
    if (start && paidOn && paidOn < start) continue;
    if (end && paidOn && paidOn > end) continue;
    const key = `${p.store || ''}|${p['Payment ID'] || ''}|${p['Instrument Number'] || ''}|${p['Paid On'] || ''}`;
    if (seenPayout.has(key)) continue;
    seenPayout.add(key);
    const rowRr = roundMoney(p['RR Amount']);
    const rowCharge = roundMoney(p['Invoice Amount']);
    const rowRet = roundMoney(p['Return Charges'] || 0);
    const rowTax = roundMoney(p['Tax Amount']);
    const rowNet = roundMoney(p['Net Payable']);
    const expectedNet = roundMoney(rowRr - rowCharge - rowRet - rowTax);
    payoutRows.push({
      store: p.store,
      paid_on: p['Paid On'] || '',
      payment_id: p['Payment ID'] || '',
      rr_amount: rowRr,
      delivery_charges: rowCharge,
      return_charges: rowRet,
      tax: rowTax,
      expected_net: expectedNet,
      remitted: rowNet,
      difference: roundMoney(expectedNet - rowNet),
      instrument_number: p['Instrument Number'] || '',
    });
    rr += rowRr;
    charges += rowCharge;
    returnCharges += rowRet;
    tax += rowTax;
    remitted += rowNet;
  }

  const matched = [];
  let matchedExpected = 0;
  let matchedRemitted = 0;
  for (const ship of withCod) {
    if (!ship.payment_id) continue;
    const pay = payoutRows.find((row) => String(row.payment_id) === String(ship.payment_id));
    if (!pay) continue;
    matched.push({ order_id: ship.order_id, payment_id: ship.payment_id, cod_amount: ship.cod_amount });
    matchedExpected += ship.cod_amount;
  }
  for (const pay of payoutRows) {
    if (matched.some((row) => String(row.payment_id) === String(pay.payment_id))) matchedRemitted += pay.remitted;
  }

  const shipmentOutstanding = missingCod === deliveredInRange.length && deliveredInRange.length > 0
    ? null
    : (matched.length ? roundMoney(expectedFromShipments - matchedExpected) : null);

  return {
    range: { start, end },
    formulas: COD_FORMULAS,
    shipment: {
      delivered_count: deliveredInRange.length,
      with_cod_field: withCod.length,
      missing_cod_field: missingCod,
      expected_cod: missingCod && !withCod.length ? null : expectedFromShipments,
      expected_cod_available: Boolean(withCod.length),
    },
    settlement: {
      payout_rows: payoutRows.length,
      courier_reported_cod_rr: roundMoney(rr),
      delivery_charges: roundMoney(charges),
      return_charges: roundMoney(returnCharges),
      other_deductions_tax: roundMoney(tax),
      net_expected_settlement: roundMoney(rr - charges - returnCharges - tax),
      actual_recorded_settlement: roundMoney(remitted),
      unreconciled_difference: roundMoney((rr - charges - returnCharges - tax) - remitted),
    },
    matching: {
      orders_matched_by_payment_id: matched.length,
      shipment_outstanding: shipmentOutstanding,
      note: matched.length
        ? 'Outstanding uses unmatched shipment COD after payment-id joins.'
        : 'No mnp_payment_id joined to payout Payment ID, so shipment-level outstanding is unavailable.',
    },
    collected_by_courier: {
      available: false,
      reason: 'M&P records here do not include a separate “collected by courier” field distinct from settlement RR Amount / Net Payable.',
    },
    rows: payoutRows,
    unavailable: [
      ...(withCod.length ? [] : ['shipment-level COD expected (no mnp_cod_amount on delivered orders)']),
      'COD collected by courier (distinct from remittance)',
      ...(matched.length ? [] : ['shipment-level COD outstanding']),
      'per-shipment delivery/return charges (not stored on orders)',
    ],
  };
}

export function weeklyCourierReport({
  shipments = [],
  returns = [],
  payouts = [],
  start,
  end,
  store = '',
} = {}) {
  const ships = shipments.filter((row) => !store || row.store === store);
  const rets = returns.filter((row) => !store || row.store === store);
  const createdIn = (row) => inRange(parseDatePrefix(row.created_at || row.booked_at || ''), start, end);
  const dateIn = (value) => inRange(parseDatePrefix(value || ''), start, end);

  const newBookings = ships.filter((row) => createdIn(row) && (row.tracking || ['Booked', 'Shipped', 'Delivered', 'Returned'].includes(row.order_status)));
  const dispatched = ships.filter((row) => dateIn(row.dispatched_at) || (row.order_status === 'Shipped' && createdIn(row)));
  const delivered = ships.filter((row) => dateIn(row.delivered_at) || (row.order_status === 'Delivered' && createdIn(row) && !row.delivered_at));
  const failures = rets.filter((row) => row.return_state === RETURN_STATES.A_UNDELIVERED);
  const initiated = rets.filter((row) => [RETURN_STATES.B_INITIATED, RETURN_STATES.C_IN_TRANSIT, RETURN_STATES.D_OVERDUE].includes(row.return_state));
  const received = rets.filter((row) => [RETURN_STATES.E_RECEIVED, RETURN_STATES.F_DISPUTED].includes(row.return_state) && dateIn(row.physical_receipt_at));
  const pendingReceipt = rets.filter((row) => [RETURN_STATES.B_INITIATED, RETURN_STATES.C_IN_TRANSIT, RETURN_STATES.D_OVERDUE].includes(row.return_state));
  const overdue = rets.filter((row) => row.return_state === RETURN_STATES.D_OVERDUE);
  const customer = rets.filter((row) => row.return_state === RETURN_STATES.G_CUSTOMER);
  const recon = reconcileCod({ shipments: ships, payouts, start, end });

  const trackingCounts = {};
  for (const row of ships) {
    if (!row.tracking) continue;
    trackingCounts[row.tracking] = (trackingCounts[row.tracking] || 0) + 1;
  }
  const duplicateTracking = Object.entries(trackingCounts).filter(([, n]) => n > 1).map(([tracking, count]) => ({ tracking, count }));

  return {
    range: { start, end, store: store || 'ALL' },
    opening_pending: {
      available: false,
      reason: 'No historical open-pipeline snapshot exists, so opening pending is not invented.',
    },
    new_bookings: newBookings.length,
    dispatched: dispatched.length,
    delivered: delivered.length,
    delivery_failures: failures.length,
    returns_initiated: initiated.length,
    returns_received: received.length,
    returns_pending_receipt: pendingReceipt.length,
    returns_overdue: overdue.length,
    customer_returns: customer.length,
    expected_cod: recon.shipment.expected_cod,
    actual_remittances: recon.settlement.actual_recorded_settlement,
    delivery_charges: recon.settlement.delivery_charges,
    return_charges: recon.settlement.return_charges,
    settlement_difference: recon.settlement.unreconciled_difference,
    unmatched: {
      duplicate_tracking: duplicateTracking,
      delivered_without_cod_field: recon.shipment.missing_cod_field,
    },
    unavailable: recon.unavailable,
  };
}

export function buildAlerts({
  returns = [],
  shipments = [],
  reconciliation,
  settings = DEFAULT_COURIER_SETTINGS,
  today,
} = {}) {
  const alerts = [];
  for (const row of returns.filter((r) => r.return_state === RETURN_STATES.D_OVERDUE)) {
    alerts.push({
      type: 'return_overdue',
      severity: 'warning',
      order_id: row.order_id,
      tracking: row.tracking,
      message: `${row.order_id} is pending warehouse receipt (not marked lost).`,
    });
  }
  for (const row of uniqueShipments(shipments)) {
    if (!row.tracking) continue;
    if (['Delivered', 'Returned'].includes(row.order_status) || ['delivered', 'returned'].includes(row.courier_status)) continue;
    const last = parseDatePrefix(row.latest_event_at || row.created_at || '');
    const elapsed = daysBetween(last, today);
    if (elapsed != null && elapsed > settings.stale_tracking_days) {
      alerts.push({
        type: 'stale_tracking',
        severity: 'info',
        order_id: row.order_id,
        tracking: row.tracking,
        message: `No tracking timestamp newer than ${settings.stale_tracking_days} days.`,
      });
    }
  }
  if (reconciliation?.settlement?.unreconciled_difference) {
    alerts.push({
      type: 'settlement_difference',
      severity: 'warning',
      message: `Settlement difference Rs ${reconciliation.settlement.unreconciled_difference}.`,
    });
  }
  const trackingCounts = {};
  for (const row of shipments) {
    if (!row.tracking) continue;
    trackingCounts[row.tracking] = (trackingCounts[row.tracking] || 0) + 1;
  }
  for (const [tracking, count] of Object.entries(trackingCounts)) {
    if (count > 1) {
      alerts.push({ type: 'duplicate_tracking', severity: 'warning', tracking, message: `Tracking ${tracking} is on ${count} shipment rows.` });
    }
  }
  for (const row of returns.filter((r) => r.return_state === RETURN_STATES.F_DISPUTED)) {
    alerts.push({
      type: 'disputed_return',
      severity: 'warning',
      order_id: row.order_id,
      message: `${row.order_id} received as ${row.disposition}.`,
    });
  }
  const deliveredOpen = uniqueShipments(shipments).filter((row) => row.order_status === 'Delivered' && row.cod_amount != null);
  if (deliveredOpen.length && reconciliation && reconciliation.settlement.payout_rows === 0) {
    const oldest = deliveredOpen
      .map((row) => parseDatePrefix(row.delivered_at || row.created_at || ''))
      .filter(Boolean)
      .sort()[0];
    const elapsed = daysBetween(oldest, today);
    if (elapsed != null && elapsed > settings.settlement_overdue_days) {
      alerts.push({
        type: 'settlement_overdue',
        severity: 'info',
        message: `Delivered COD exists but no payout rows in range after ${settings.settlement_overdue_days} days. Not assumed lost.`,
      });
    }
  }
  return alerts;
}

export function dedupeEventLog(events = []) {
  const seen = new Set();
  const out = [];
  for (const ev of events) {
    const key = `${ev.order_id || ''}|${cleanConsignment(ev.tracking || '')}|${ev.status || ''}|${ev.at || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ev);
  }
  return out;
}

export function previewDailyRows(rows, { orders = [], store }) {
  const seen = new Set();
  const preview = [];
  let duplicates_in_file = 0;
  let matched = 0;
  let unmatched = 0;
  for (const r of rows) {
    const consignment = cleanConsignment(String(r['Consignment Number'] || r.Consignment || r['Consignment (Tracking No)'] || r['Consignment (Tracking No.)'] || ''));
    const status = String(r.Status || '').trim();
    if (!consignment) continue;
    const fileDup = seen.has(consignment);
    if (fileDup) duplicates_in_file += 1;
    seen.add(consignment);
    const order = orders.find((o) => (o.store || '').toUpperCase() === store && cleanConsignment(o.tracking_number || '') === consignment);
    if (order) matched += 1;
    else unmatched += 1;
    preview.push({
      consignment,
      status,
      duplicate_in_file: fileDup,
      matched_order: order?.order_id || '',
    });
  }
  return { rows: preview, duplicates_in_file, matched, unmatched };
}
