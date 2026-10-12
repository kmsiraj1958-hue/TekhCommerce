import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { loadJson, saveJson } from '../utils/storage.js';
import { nowStamp, parseDatePrefix } from '../utils/helpers.js';
import * as orderService from './orderService.js';
import * as mnpService from './mnpService.js';
import {
  DEFAULT_COURIER_SETTINGS,
  buildAccounts,
  buildAlerts,
  buildShipment,
  dedupeEventLog,
  listReturns as classifyReturns,
  previewDailyRows,
  reconcileCod,
  weekBounds,
  weeklyCourierReport,
} from './courierLogic.js';

function todayIso() {
  return parseDatePrefix(nowStamp()) || new Date().toISOString().slice(0, 10);
}

export function loadSettings() {
  return { ...DEFAULT_COURIER_SETTINGS, ...loadJson(config.files.courierSettings, {}) };
}

export function saveSettings(patch) {
  const next = {
    ...loadSettings(),
    ...patch,
    return_overdue_days: Math.max(1, parseInt(patch.return_overdue_days ?? loadSettings().return_overdue_days, 10) || 7),
    stale_tracking_days: Math.max(1, parseInt(patch.stale_tracking_days ?? loadSettings().stale_tracking_days, 10) || 5),
    settlement_overdue_days: Math.max(1, parseInt(patch.settlement_overdue_days ?? loadSettings().settlement_overdue_days, 10) || 14),
  };
  saveJson(config.files.courierSettings, next);
  return next;
}

export function loadReceipts() {
  return loadJson(config.files.courierReceipts, []);
}

export function loadEvents() {
  return dedupeEventLog(loadJson(config.files.courierEvents, []));
}

function appendEvents(entries) {
  const current = loadEvents();
  saveJson(config.files.courierEvents, dedupeEventLog([...current, ...entries]));
}

function loadSnapshots() {
  return loadJson(config.files.courierWeekly, []);
}

function allShipments() {
  const receipts = loadReceipts();
  const events = loadEvents();
  return orderService.loadOrders().map((order) => buildShipment(order, { receipts, events }));
}

export function getOverview() {
  const accounts = buildAccounts({
    orders: orderService.loadOrders(),
    receipts: loadReceipts(),
    credentials: {
      vogueUser: config.mnpUserVogue,
      voguePass: config.mnpPassVogue,
      snsUser: config.mnpUserSns,
      snsPass: config.mnpPassSns,
    },
  }).map((row) => (config.demoMode
        ? { ...row, live_tracking: false, integration_status: row.id === 'mnp' ? 'Development data — outbound courier API disabled' : row.integration_status }
    : row));
  return {
    accounts,
    notes: config.demoMode
      ? 'Local development dataset. Outbound M&P tracking calls are disabled. Live JSON is unused.'
      : 'Only M&P has a verified tracking/sync implementation. Other providers are listed as inactive adapters.',
  };
}

export function getShipments({ search = '', store = '', status = '', courier = '' } = {}) {
  let rows = allShipments();
  if (store) rows = rows.filter((row) => row.store === store.toUpperCase());
  if (courier) rows = rows.filter((row) => row.courier_id === courier);
  if (status) rows = rows.filter((row) => row.order_status === status || row.courier_status === status);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }
  return { shipments: rows, count: rows.length };
}

export function getReturns({ today = todayIso() } = {}) {
  const settings = loadSettings();
  const shipments = allShipments();
  const returns = classifyReturns(shipments, { today, overdueDays: settings.return_overdue_days });
  const counts = {};
  for (const row of returns) counts[row.return_state] = (counts[row.return_state] || 0) + 1;
  return { returns, counts, settings };
}

export function receiveReturn({ orderId, tracking, condition, qty, notes, user, receivedAt }) {
  const orders = orderService.loadOrders();
  const order = orders.find((row) => String(row.order_id) === String(orderId));
  if (!order) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    throw err;
  }
  const allowed = new Set(['ok', 'damaged', 'incomplete', 'disputed']);
  const cond = String(condition || 'ok').toLowerCase();
  if (!allowed.has(cond)) {
    const err = new Error('Condition must be ok, damaged, incomplete, or disputed');
    err.statusCode = 400;
    throw err;
  }
  const receipts = loadReceipts();
  const track = tracking || order.tracking_number || '';
  if (receipts.some((row) => row.order_id === order.order_id && String(row.tracking || '') === String(track))) {
    const err = new Error('A warehouse receipt already exists for this order/tracking. Courier RTS is not overwritten.');
    err.statusCode = 409;
    throw err;
  }
  const receipt = {
    id: uuidv4(),
    order_id: order.order_id,
    tracking: track,
    received_at: receivedAt || nowStamp(),
    received_by: user || 'admin',
    condition: cond,
    qty: parseInt(qty || order.qty || 1, 10) || 1,
    notes: notes || '',
    created_at: nowStamp(),
  };
  receipts.push(receipt);
  saveJson(config.files.courierReceipts, receipts);
  return receipt;
}

export function getReconciliation({ start = '', end = '' } = {}) {
  return reconcileCod({
    shipments: allShipments(),
    payouts: mnpService.loadPayoutRows(),
    start,
    end,
  });
}

export function getWeekly({ start, end, store = '', save = false, confirm = false } = {}) {
  const today = todayIso();
  const bounds = start && end ? { start, end } : weekBounds(today);
  const settings = loadSettings();
  const shipments = allShipments();
  const returns = classifyReturns(shipments, { today, overdueDays: settings.return_overdue_days });
  const report = weeklyCourierReport({
    shipments,
    returns,
    payouts: mnpService.loadPayoutRows(),
    start: bounds.start,
    end: bounds.end,
    store,
  });
  if (save) {
    const snapshots = loadSnapshots();
    const existing = snapshots.find((row) => row.range?.start === bounds.start && row.range?.end === bounds.end && (row.range?.store || 'ALL') === (store || 'ALL'));
    if (existing?.reconciliation_status === 'reconciled' && !confirm) {
      const err = new Error('A reconciled snapshot already exists for this period. Pass confirm=true to add another copy; previous snapshot is kept.');
      err.statusCode = 409;
      throw err;
    }
    const snapshot = {
      ...report,
      generated_at: nowStamp(),
      reconciliation_status: 'draft',
    };
    snapshots.push(snapshot);
    saveJson(config.files.courierWeekly, snapshots);
    report.saved = true;
  }
  report.history = loadSnapshots().filter((row) => (row.range?.store || 'ALL') === (store || 'ALL')).slice(-12);
  return report;
}

export function weeklyToCsv(report) {
  const lines = [
    config.useDevelopmentData ? 'label,development-sample' : 'label,live',
    'metric,value',
    `range,${report.range.start}..${report.range.end}`,
    `store,${report.range.store}`,
    `opening_pending,unavailable`,
    `new_bookings,${report.new_bookings}`,
    `dispatched,${report.dispatched}`,
    `delivered,${report.delivered}`,
    `delivery_failures,${report.delivery_failures}`,
    `returns_initiated,${report.returns_initiated}`,
    `returns_received,${report.returns_received}`,
    `returns_pending_receipt,${report.returns_pending_receipt}`,
    `returns_overdue,${report.returns_overdue}`,
    `customer_returns,${report.customer_returns}`,
    `expected_cod,${report.expected_cod ?? 'unavailable'}`,
    `actual_remittances,${report.actual_remittances}`,
    `delivery_charges,${report.delivery_charges}`,
    `return_charges,${report.return_charges}`,
    `settlement_difference,${report.settlement_difference}`,
  ];
  return lines.join('\n');
}

export function getAlerts({ today = todayIso() } = {}) {
  const settings = loadSettings();
  const shipments = allShipments();
  const returns = classifyReturns(shipments, { today, overdueDays: settings.return_overdue_days });
  const reconciliation = reconcileCod({
    shipments,
    payouts: mnpService.loadPayoutRows(),
  });
  return {
    alerts: buildAlerts({ returns, shipments, reconciliation, settings, today }),
    settings,
  };
}

export async function syncCourier() {
  const before = orderService.loadOrders().map((o) => ({ order_id: o.order_id, status: o.status, mnp_status: o.mnp_status || '' }));
  const count = await mnpService.syncOrdersWithMnp();
  const after = orderService.loadOrders();
  const entries = [];
  for (const order of after) {
    const prev = before.find((row) => row.order_id === order.order_id);
    if (!prev) continue;
    if ((prev.mnp_status || '') !== (order.mnp_status || '') || prev.status !== order.status) {
      entries.push({
        order_id: order.order_id,
        tracking: order.tracking_number || '',
        status: order.mnp_status || order.status,
        at: nowStamp(),
        location: order.mnp_last_location || '',
      });
    }
  }
  if (entries.length) appendEvents(entries);
  return { count, events_logged: entries.length };
}

export function previewDailyImport(store, filepath) {
  const rows = mnpService.readXlsxFirstSheet(filepath);
  return previewDailyRows(rows, { orders: orderService.loadOrders(), store });
}

export { weekBounds };
