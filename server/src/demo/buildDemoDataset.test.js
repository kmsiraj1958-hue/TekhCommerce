import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildDemoDataset, summarizeDemoDataset } from './buildDemoDataset.js';
import { writeDemoDataset } from './writeDemoDataset.js';
import { computeDashboardSummary } from '../services/dashboardService.js';
import { computeCashbookOverview } from '../services/cashbookService.js';
import { computeReturnsAnalytics } from '../services/returnsAnalyticsService.js';
import { reconcileCod, classifyReturn, RETURN_STATES, buildShipment } from '../services/courierLogic.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

test('demo dataset is internally consistent and not treated as live sales cash', () => {
  const data = buildDemoDataset();
  const summary = summarizeDemoDataset(data);
  assert.ok(summary.orders > 20);
  const retail = data.products.filter((p) => String(p.code).startsWith('DEMO-'));
  assert.equal(retail.length, 12);
  assert.ok(retail.every((p) => p.item_type === 'FINISHED_GOOD'));
  assert.equal(data.products.find((p) => p.code === 'RAW-CASHEW-G').item_type, 'RAW_MATERIAL');
  assert.equal(data.products.find((p) => p.code === 'PKG-POUCH-150').item_type, 'PACKAGING_MATERIAL');
  assert.equal(data.products.find((p) => p.code === 'FG-CASHEW-150').item_type, 'FINISHED_GOOD');
  assert.ok(data.products.every((p) => ['FINISHED_GOOD', 'RAW_MATERIAL', 'PACKAGING_MATERIAL'].includes(p.item_type)));
  assert.equal(data.orders.some((o) => o.status === 'Cancelled'), false);
  const dash = computeDashboardSummary({
    orders: data.orders,
    products: data.products,
    inventory: {},
    finance: data.finance,
    movements: data.inventory_movements,
    start: '2026-08-12',
    end: '2026-10-11',
  });
  const deliveredSales = data.orders.filter((o) => o.status === 'Delivered').reduce((s, o) => s + Number(o.price), 0);
  assert.equal(dash.total_sale, Math.round(deliveredSales * 100) / 100);
  const cash = computeCashbookOverview({ finance: data.finance, start: '2026-08-12', end: '2026-10-11' });
  assert.notEqual(cash.recorded_receipts, dash.total_sale);
  assert.ok(cash.recorded_refund_count >= 0);
  const shipments = data.orders.map((o) => buildShipment(o, { receipts: data.courier_return_receipts, events: data.courier_event_log }));
  const recon = reconcileCod({ shipments, payouts: data.mnp_payout_reports, start: '2026-08-12', end: '2026-10-11' });
  assert.equal(recon.settlement.payout_rows, [...new Set(data.mnp_payout_reports.map((p) => `${p.store}|${p['Payment ID']}|${p['Instrument Number']}|${p['Paid On']}`))].length);
  const returning = shipments.filter((s) => (s.courier_status_original || '').includes('Returning'));
  for (const row of returning) {
    assert.notEqual(classifyReturn(row, { today: '2026-10-11', overdueDays: 7 }), RETURN_STATES.E_RECEIVED);
  }
  const returns = computeReturnsAnalytics({
    orders: data.orders,
    movements: data.inventory_movements,
    financeEntries: data.finance.entries,
    start: '2026-08-12',
    end: '2026-10-11',
  });
  assert.ok(returns.orphan_stock_returns >= 0);
});

test('writeDemoDataset does not change live orders.json or the working demo dataset', () => {
  const liveFiles = [
    path.join(repoRoot, 'orders.json'),
    path.join(repoRoot, 'products.json'),
    path.join(repoRoot, 'inventory_movements.json'),
    path.join(repoRoot, 'server', 'data', 'finance.json'),
    path.join(repoRoot, 'server', 'data', 'vendor-license.json'),
  ].filter((file) => fs.existsSync(file));
  const before = liveFiles.map((file) => fs.readFileSync(file));
  const workingDemo = path.join(repoRoot, 'server', 'data', 'demo');
  const workingFiles = fs.readdirSync(workingDemo)
    .filter((name) => fs.statSync(path.join(workingDemo, name)).isFile());
  const workingBefore = new Map(workingFiles.map((name) => [name, fs.readFileSync(path.join(workingDemo, name))]));

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tekh-demo-seed-'));
  const serverDir = path.join(tempRoot, 'server');
  try {
    const result = writeDemoDataset({ force: true, serverDir });
    liveFiles.forEach((file, index) => {
      assert.equal(fs.readFileSync(file).equals(before[index]), true, file);
    });
    for (const [name, bytes] of workingBefore) {
      assert.equal(fs.readFileSync(path.join(workingDemo, name)).equals(bytes), true, name);
    }
    assert.ok(String(result.dir).replace(/\\/g, '/').includes('server/data/demo'));
    assert.equal(path.resolve(result.dir), path.resolve(serverDir, 'data', 'demo'));
    assert.equal(fs.existsSync(path.join(result.dir, 'orders.json')), true);
    const demoOrders = JSON.parse(fs.readFileSync(path.join(result.dir, 'orders.json'), 'utf8'));
    const demoProducts = JSON.parse(fs.readFileSync(path.join(result.dir, 'products.json'), 'utf8'));
    const liveOrders = JSON.parse(before[0].toString('utf8'));
    assert.notEqual(demoOrders[0]?.order_id, liveOrders[0]?.order_id);
    assert.ok(demoProducts.every((p) => ['FINISHED_GOOD', 'RAW_MATERIAL', 'PACKAGING_MATERIAL'].includes(p.item_type)));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
