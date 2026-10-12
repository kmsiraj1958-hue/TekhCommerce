import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { convertQty } from './uom.js';
import { qtyDecimal } from './qty.js';
import * as productService from './productService.js';
import * as inventoryService from './inventoryService.js';
import * as manufacturing from './manufacturingService.js';
import { reserveStockForOrder } from './inventoryService.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const liveFiles = [
  path.join(repoRoot, 'products.json'),
  path.join(repoRoot, 'orders.json'),
  path.join(repoRoot, 'inventory_movements.json'),
  path.join(repoRoot, 'server', 'data', 'vendor-license.json'),
];

test.describe({ concurrency: 1 }, () => {
  const snapshots = {};
  const originalFiles = { ...config.files };
  const workingDemo = path.dirname(originalFiles.products);
  let sandbox = '';
  let workingBefore = new Map();

  const tracked = () => [
    config.files.products,
    config.files.inventory,
    config.files.manufacturing,
  ];

  function workingDigests() {
    return new Map(fs.readdirSync(workingDemo)
      .filter((name) => fs.statSync(path.join(workingDemo, name)).isFile())
      .map((name) => [name, fs.readFileSync(path.join(workingDemo, name))]));
  }

  test.before(() => {
    assert.match(originalFiles.manufacturing.replace(/\\/g, '/'), /server\/data\/demo\/manufacturing\.json/);
    workingBefore = workingDigests();
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'tekh-mfg-'));
    for (const [key, file] of Object.entries(originalFiles)) {
      if (typeof file !== 'string') continue;
      const normalized = path.normalize(file);
      const root = path.normalize(workingDemo);
      if (normalized !== root && !normalized.startsWith(root + path.sep)) continue;
      const dest = path.join(sandbox, path.relative(workingDemo, file));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (fs.existsSync(file) && fs.statSync(file).isFile()) fs.copyFileSync(file, dest);
      else fs.mkdirSync(dest, { recursive: true });
      config.files[key] = dest;
    }
    assert.notEqual(path.normalize(config.files.products), path.normalize(originalFiles.products));
    for (const file of tracked()) {
      snapshots[file] = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.from('');
    }
  });

  test.after(() => {
    Object.assign(config.files, originalFiles);
    try {
      const after = workingDigests();
      for (const [name, bytes] of workingBefore) {
        assert.equal(after.get(name)?.equals(bytes), true, `working demo file changed: ${name}`);
      }
    } finally {
      if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  function resetDemoLayer() {
    for (const file of tracked()) {
      if (snapshots[file]?.length) fs.writeFileSync(file, snapshots[file]);
    }
    manufacturing.ensureCpgDemoItems();
  }

  test('decimal unit conversion stays exact across kg/g and ml/l', () => {
    assert.equal(convertQty(1, 'kg', 'g'), 1000);
    assert.equal(convertQty(150, 'g', 'kg'), 0.15);
    assert.equal(convertQty(2.5, 'l', 'ml'), 2500);
    assert.equal(qtyDecimal(900.1234567), 900.123457);
  });

  test('BOM for six cashew packs requires 900 g and six pouches', () => {
    resetDemoLayer();
    const bom = manufacturing.listBoms().find((row) => row.code === 'BOM-CASHEW-150');
    const exploded = manufacturing.explodeBom(bom, 6);
    const cashew = exploded.find((row) => row.sku === 'RAW-CASHEW-G');
    const pouch = exploded.find((row) => row.sku === 'PKG-POUCH-150');
    assert.equal(cashew.planned_qty, 900);
    assert.equal(pouch.planned_qty, 6);
  });

  test('cashew acceptance: 1000 = 900 FG + 25 waste + 75 remaining', () => {
    resetDemoLayer();
    const liveBefore = liveFiles.map((file) => fs.readFileSync(file));
    const products = productService.loadProducts();
    const existingOpenings = Object.fromEntries(
      products.filter((row) => !['RAW-CASHEW-G', 'PKG-POUCH-150', 'FG-CASHEW-150'].includes(row.code))
        .map((row) => [row.code, row.opening_stock]),
    );

    const bom = manufacturing.listBoms().find((row) => row.code === 'BOM-CASHEW-150');
    let order = manufacturing.createProductionOrder({ bom_id: bom.id, planned_output_qty: 6 });
    order = manufacturing.updateProductionOrder(order.id, {
      status: 'in_progress',
      actual_output_qty: 6,
      actual_components: [
        { sku: 'RAW-CASHEW-G', role: 'RAW', uom: 'g', consumed_qty: 900, wastage_qty: 25 },
        { sku: 'PKG-POUCH-150', role: 'PACKAGING', uom: 'pcs', consumed_qty: 6, wastage_qty: 0 },
      ],
    });
    const cancelledBalance = manufacturing.onHand('RAW-CASHEW-G');
    assert.equal(cancelledBalance, 1000);

    const posted = manufacturing.postProduction(order.id);
    assert.equal(posted.order.status, 'posted');
    assert.equal(manufacturing.onHand('RAW-CASHEW-G'), 75);
    assert.equal(manufacturing.onHand('PKG-POUCH-150'), 44);
    assert.equal(manufacturing.onHand('FG-CASHEW-150'), 6);

    const inv = inventoryService.calculateInventory();
    assert.equal(inv['RAW-CASHEW-G'].consumption, 900);
    assert.equal(inv['RAW-CASHEW-G'].wastage, 25);
    assert.equal(inv['FG-CASHEW-150'].production_in, 6);
    assert.equal(posted.order.costs.material, 1800);
    assert.equal(posted.order.costs.wastage, 50);
    assert.equal(posted.order.costs.packaging, 30);
    assert.equal(posted.order.costs.total, 1880);
    assert.equal(posted.order.costs.per_unit, 313.33);

    const retry = manufacturing.postProduction(order.id);
    assert.equal(retry.duplicate, true);
    assert.equal(manufacturing.onHand('RAW-CASHEW-G'), 75);

    const after = productService.loadProducts();
    for (const [code, opening] of Object.entries(existingOpenings)) {
      const row = after.find((item) => item.code === code);
      assert.equal(row.opening_stock, opening, `opening changed for ${code}`);
    }
    liveFiles.forEach((file, i) => {
      assert.equal(fs.readFileSync(file).equals(liveBefore[i]), true, `live file changed: ${file}`);
    });
  });

  test('insufficient stock and cancel leave inventory unchanged', () => {
    resetDemoLayer();
    const bom = manufacturing.listBoms().find((row) => row.code === 'BOM-CASHEW-150');
    const order = manufacturing.createProductionOrder({ bom_id: bom.id, planned_output_qty: 6 });
    manufacturing.updateProductionOrder(order.id, {
      actual_components: [
        { sku: 'RAW-CASHEW-G', role: 'RAW', uom: 'g', consumed_qty: 5000, wastage_qty: 0 },
        { sku: 'PKG-POUCH-150', role: 'PACKAGING', uom: 'pcs', consumed_qty: 6, wastage_qty: 0 },
      ],
    });
    assert.throws(() => manufacturing.postProduction(order.id), /Insufficient stock/);
    assert.equal(manufacturing.onHand('RAW-CASHEW-G'), 1000);

    const other = manufacturing.createProductionOrder({ bom_id: bom.id, planned_output_qty: 6 });
    manufacturing.updateProductionOrder(other.id, { status: 'cancelled' });
    assert.throws(() => manufacturing.postProduction(other.id), /cancelled or reversed/);
    assert.equal(manufacturing.onHand('FG-CASHEW-150'), 0);
  });

  test('reversal writes reversing movements and does not delete history', () => {
    resetDemoLayer();
    const bom = manufacturing.listBoms().find((row) => row.code === 'BOM-CASHEW-150');
    const order = manufacturing.createProductionOrder({ bom_id: bom.id, planned_output_qty: 6 });
    manufacturing.updateProductionOrder(order.id, {
      actual_components: [
        { sku: 'RAW-CASHEW-G', role: 'RAW', uom: 'g', consumed_qty: 900, wastage_qty: 25 },
        { sku: 'PKG-POUCH-150', role: 'PACKAGING', uom: 'pcs', consumed_qty: 6, wastage_qty: 0 },
      ],
    });
    manufacturing.postProduction(order.id);
    manufacturing.reverseProduction(order.id);
    const movements = inventoryService.loadMovements().filter((row) => row.production_id === order.id);
    assert.ok(movements.some((row) => row.type === 'consumption'));
    assert.ok(movements.some((row) => row.type === 'reversal_in'));
    assert.equal(manufacturing.onHand('RAW-CASHEW-G'), 1000);
    assert.equal(manufacturing.getProductionOrder(order.id).status, 'reversed');
  });

  test('sales dispatch is idempotent and does not use production_in twice', () => {
    resetDemoLayer();
    const before = inventoryService.loadMovements().length;
    const order = { order_id: 'TEST-SALE-1', product_code: 'FG-CASHEW-150', qty: 2, items: [{ sku: 'FG-CASHEW-150', qty: 2 }] };
    assert.equal(reserveStockForOrder(order), true);
    assert.equal(reserveStockForOrder(order), false);
    const added = inventoryService.loadMovements().length - before;
    assert.equal(added, 1);
  });
});
