import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildImportPlan, mapProducts, mapOrders, mapStockMovements } from './jsonMap.js';
import { loadSkuManifest, identityKey } from './skuMap.js';
import { mergeStockMovements } from './mergeStock.js';
import { resolveImportProfile } from './sourceProfile.js';
import { productionPostingOperations, productionReversalOperations } from './productionPosting.js';
import { planStockApply, assertApplyAllowed } from './migrateFromJson.js';
import { MOVE_TYPE, ITEM_TYPES } from './enums.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const typed = (row) => ({ item_type: 'FINISHED_GOOD', ...row });

test('maps products and flags duplicate SKUs without dropping identity', () => {
  const { rows, issues } = mapProducts([
    typed({ code: 'CS-150', name: 'Cashew 150g', price: '100.5', cost: 40, opening_stock: 12, reorder_level: 3, category: 'Nuts' }),
    typed({ code: 'CS-150', name: 'Dup' }),
    { name: 'No code' },
  ]);
  assert.equal(rows.length, 0);
  assert.ok(issues.some((i) => i.message === 'Duplicate SKU CS-150'));
  assert.ok(issues.some((i) => i.message.includes('cannot pass silently')));
  assert.ok(issues.some((i) => i.message === 'Missing product code'));
});

test('approved SKU mappings apply only to the transformed snapshot', () => {
  const manifest = {
    approval_status: 'approved',
    mappings: [{
      identity_key: identityKey({ code: 'VIB-005', name: 'Gents Suit-Cotton', category: 'High Quality Khaddar', opening_stock: 10, image: '' }),
      source_sku: 'VIB-005',
      proposed_sku: 'VCK-013',
      action: 'reassign',
      approval_status: 'approved',
    }, {
      identity_key: identityKey({ code: 'VIB-005', name: 'Ladies Designer Purse', category: 'Purse', opening_stock: 3, image: '5.jpeg' }),
      source_sku: 'VIB-005',
      proposed_sku: 'VIB-005',
      action: 'keep',
      approval_status: 'approved',
    }],
  };
  const { rows, issues } = mapProducts([
    typed({ code: 'VIB-005', name: 'Ladies Designer Purse', category: 'Purse', opening_stock: 3, image: '5.jpeg', price: 1 }),
    typed({ code: 'VIB-005', name: 'Gents Suit-Cotton', category: 'High Quality Khaddar', opening_stock: 10, image: '', price: 1 }),
  ], { skuManifest: manifest, applyApprovedSkuMap: true, legacyUntypedApproved: true, legacyUntypedPolicy: 'FINISHED_GOOD' });
  const skus = rows.map((r) => r.sku).sort();
  assert.deepEqual(skus, ['VCK-013', 'VIB-005']);
});

test('maps observed item types and rejects unknown ones', () => {
  for (const itemType of ITEM_TYPES) {
    const { rows, issues } = mapProducts([typed({ code: itemType, name: itemType, item_type: itemType, opening_stock: 1 })]);
    assert.equal(rows[0].itemType, itemType);
    assert.equal(issues.filter((i) => i.level === 'error').length, 0);
  }
  const unknown = mapProducts([typed({ code: 'X', name: 'X', item_type: 'WIDGET' })]);
  assert.equal(unknown.rows.length, 0);
  assert.ok(unknown.issues.some((i) => i.message.includes('Unknown item_type')));
});

test('maps orders, treats blank shopify ids as null, and scopes Shopify identity to store', () => {
  const { rows, issues } = mapOrders([
    {
      order_id: 'ORD-0001',
      store: 'vogue',
      status: 'Confirmed',
      shopify_order_id: '',
      customer_name: 'A',
      customer_phone: '03001234567',
      product_name: 'Cashew',
      product_code: 'CS-150',
      qty: 2,
      price: '500',
      items: [{ sku: 'CS-150', title: 'Cashew 150g', qty: 2, price: 250 }],
    },
    {
      order_id: 'ORD-0001',
      shopify_order_id: '111',
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'CONFIRMED');
  assert.equal(rows[0].shopifyOrderId, null);
  assert.equal(rows[0].storeCode, 'VOGUE');
  assert.ok(issues.some((i) => i.message.includes('Duplicate order_id')));

  const twoStores = mapOrders([
    { order_id: 'A', store: 'VOGUE', status: 'Pending', shopify_order_id: '999' },
    { order_id: 'B', store: 'SNS', status: 'Pending', shopify_order_id: '999' },
  ]);
  assert.equal(twoStores.rows.length, 2);
  assert.equal(twoStores.issues.filter((i) => i.level === 'error').length, 0);

  const sameStore = mapOrders([
    { order_id: 'A', store: 'VOGUE', status: 'Pending', shopify_order_id: '999' },
    { order_id: 'B', store: 'VOGUE', status: 'Pending', shopify_order_id: '999' },
  ]);
  assert.ok(sameStore.issues.some((i) => i.message.includes('Duplicate Shopify identity')));

  const unknownStatus = mapOrders([{ order_id: 'Z', store: 'LOCAL', status: 'Wizard' }]);
  assert.ok(unknownStatus.issues.some((i) => i.message.includes('Unknown status')));
});

test('maps all observed stock movements and rejects unknown types without dropping them silently', () => {
  const types = Object.keys(MOVE_TYPE);
  const mapped = mapStockMovements(types.map((type, i) => ({
    id: `m${i}`,
    code: 'CS-150',
    qty: 1,
    type,
    store: 'LOCAL',
  })));
  assert.equal(mapped.rows.length, types.length);
  assert.ok(mapped.rows.some((row) => row.type === 'CONSUMPTION'));
  assert.ok(mapped.rows.some((row) => row.type === 'WASTAGE'));
  assert.ok(mapped.rows.some((row) => row.type === 'PRODUCTION_IN'));
  assert.ok(mapped.rows.some((row) => row.type === 'REVERSAL_IN'));
  const unknown = mapStockMovements([{ code: 'CS-150', qty: 1, type: 'not-a-type' }]);
  assert.equal(unknown.rows.length, 0);
  assert.ok(unknown.issues.some((i) => i.message.includes('Unknown movement type')));
});

test('buildImportPlan stays cutover=false and JSON as source of truth', () => {
  const plan = buildImportPlan({
    products: [typed({ code: 'A-1', name: 'A', price: 1, opening_stock: 10 })],
    orders: [{
      order_id: 'ORD-9',
      store: 'LOCAL',
      status: 'Pending',
      customer_name: 'B',
      customer_phone: '1',
      product_code: 'A-1',
      qty: 1,
      price: 1,
    }],
    movements: [{ id: 'mv-1', code: 'A-1', qty: 1, type: 'purchase' }],
  });
  assert.equal(plan.sourceOfTruth, 'json');
  assert.equal(plan.cutover, false);
  assert.equal(plan.counts.products, 1);
  assert.equal(plan.counts.orders, 1);
  assert.equal(plan.counts.stockMovements, 1);
  assert.equal(plan.blockingErrors, 0);
  assert.equal(plan.counts.documents, 0);
  assert.equal(plan.counts.cashEntries, 0);
});

test('documents and cashbook are included in the import plan', () => {
  const plan = buildImportPlan({
    products: [typed({ code: 'A-1', name: 'A', price: 1, opening_stock: 10 })],
    orders: [{ order_id: 'ORD-9', store: 'LOCAL', status: 'Pending', product_code: 'A-1', qty: 1, price: 1 }],
    movements: [{ id: 'mv-1', code: 'A-1', qty: 1, type: 'purchase' }],
    documents: { documents: [{ id: 'd1', type: 'sales_invoice', number: 'SI-1', order_id: 'ORD-9', lines: [] }], sequences: {}, idempotency: {}, events: [] },
    finance: { accounts: [{ id: 'acc-cash', code: '1000', name: 'Cash', type: 'asset' }], entries: [{ id: 'e1', type: 'income', accountId: 'acc-cash', amount: 10 }] },
  });
  assert.equal(plan.counts.documents, 1);
  assert.equal(plan.counts.cashEntries, 1);
  assert.equal(plan.blockingErrors, 0);
});

test('orphan stock SKUs block the import plan', () => {
  const plan = buildImportPlan({
    products: [typed({ code: 'A-1', name: 'A', opening_stock: 1 })],
    movements: [{ id: 'mv-x', code: 'MISSING', qty: 1, type: 'purchase' }],
  });
  assert.ok(plan.issues.some((issue) => issue.message.includes('MISSING')));
  assert.ok(plan.blockingErrors > 0);
});

test('live SKU manifest is pending review and VCK-013..016 are proposed', () => {
  const manifest = loadSkuManifest();
  assert.equal(manifest.approval_status, 'pending_review');
  const reassign = manifest.mappings.filter((row) => row.action === 'reassign').map((row) => row.proposed_sku);
  assert.deepEqual(reassign, ['VCK-013', 'VCK-014', 'VCK-015', 'VCK-016']);
});

test('repeated stock import does not delete or duplicate movements', () => {
  const incoming = mapStockMovements([
    { id: 'abc', code: 'CS-150', qty: 6, type: 'dispatch', store: 'LOCAL', note: 'Order confirmed: ORD-1' },
  ]).rows;
  const first = mergeStockMovements([], incoming);
  assert.equal(first.toCreate.length, 1);
  assert.equal(first.wouldDelete, 0);
  const second = mergeStockMovements(first.toCreate, incoming);
  assert.equal(second.toCreate.length, 0);
  assert.equal(second.unchanged.length, 1);
  assert.equal(planStockApply(first.toCreate, incoming).toCreate.length, 0);
  const conflict = {
    ...incoming[0],
    qty: 9,
  };
  assert.throws(() => planStockApply(first.toCreate, [conflict]), /conflicts/);
});

test('demo cannot target production-snapshot and missing source fails closed', () => {
  const missing = resolveImportProfile({});
  assert.equal(missing.ok, false);
  const mixed = resolveImportProfile({ TEKH_IMPORT_SOURCE: 'demo', TEKH_IMPORT_TARGET: 'production-snapshot' });
  assert.equal(mixed.ok, false);
  const demo = resolveImportProfile({ TEKH_IMPORT_SOURCE: 'demo', TEKH_IMPORT_TARGET: 'rehearsal' });
  assert.equal(demo.ok, true);
  assert.match(demo.files.products.replace(/\\/g, '/'), /server\/data\/demo\/products\.json/);
  const live = resolveImportProfile({ TEKH_IMPORT_SOURCE: 'live', TEKH_IMPORT_TARGET: 'rehearsal' });
  assert.equal(live.ok, true);
  assert.equal(path.normalize(live.files.products), path.normalize(path.join(repoRoot, 'products.json')));
  assert.notEqual(live.files.products, demo.files.products);
});

test('production posting contract is atomic and reversals keep history', () => {
  const posted = productionPostingOperations({
    status: 'in_progress',
    finished_sku: 'FG-CASHEW-150',
    actual_output_qty: 6,
    actual_components: [
      { sku: 'RAW-CASHEW-G', consumed_qty: 900, wastage_qty: 25 },
      { sku: 'PKG-POUCH-150', consumed_qty: 6, wastage_qty: 0 },
    ],
  });
  assert.equal(posted.atomic, true);
  assert.equal(posted.duplicate, false);
  assert.ok(posted.operations.some((step) => step.step === 'insert_stock_movements'));
  const types = posted.operations.find((step) => step.movements).movements.map((row) => row.type);
  assert.deepEqual(types, ['CONSUMPTION', 'WASTAGE', 'CONSUMPTION', 'PRODUCTION_IN']);
  const retry = productionPostingOperations({ status: 'posted' });
  assert.equal(retry.duplicate, true);
  const reverse = productionReversalOperations({ status: 'posted' });
  assert.equal(reverse.preserveOriginal, true);
});

test('production-snapshot apply is refused without approved mappings', () => {
  const profile = { source: 'demo', target: 'production-snapshot' };
  assert.throws(
    () => assertApplyAllowed(profile, { blockingErrors: 0 }, { CONFIRM_JSON_IMPORT: 'YES' }),
    /Demo dataset cannot apply to a production-snapshot/,
  );
  assert.throws(
    () => assertApplyAllowed({ source: 'live', target: 'rehearsal' }, { blockingErrors: 0 }, { CONFIRM_JSON_IMPORT: 'YES' }),
    /Live dataset apply is not authorized/,
  );
});

test('live JSON and vendor-license hashes are unchanged by mapping files', () => {
  const live = [
    ['products.json', '66AAEDCA2EA14512543A3F38A2A246138CE5CE26D93A0292270DE989817D7EB1'],
    ['orders.json', '56AE322325938CA6351981BF5DFD9A95881F1833C7A13FC58E1DAD1C4D1C4595'],
    ['inventory_movements.json', '0B0D95991A773B4D54FC84191041D613A3A28C035DA7AF4E20F2564E0AC28DD8'],
    [path.join('server', 'data', 'vendor-license.json'), 'A5061AE76586C48505E648F7B4BAB428C3C3AB73F95DEBB65CBD539F2B96AA85'],
  ];
  for (const [file, expected] of live) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(repoRoot, file))).digest('hex').toUpperCase();
    assert.equal(hash, expected, file);
  }
});
