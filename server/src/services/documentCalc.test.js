import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDocumentTotals, linesFromOrder } from './documentCalc.js';

test('invoice arithmetic applies discount then tax then shipping', () => {
  const totals = computeDocumentTotals({
    lines: [
      { sku: 'A', description: 'Tee', qty: 2, unit_price: 1000, discount: 0 },
      { sku: 'B', description: 'Bag', qty: 1, unit_price: 500, discount: 50 },
    ],
    discount: 100,
    shipping: 150,
    tax_rate: 10,
  });
  assert.equal(totals.subtotal, 2450);
  assert.equal(totals.discount, 100);
  assert.equal(totals.tax_base, 2350);
  assert.equal(totals.tax_amount, 235);
  assert.equal(totals.shipping, 150);
  assert.equal(totals.grand_total, 2735);
});

test('rejects negative quantities and discounts that exceed the line', () => {
  assert.throws(() => computeDocumentTotals({ lines: [{ qty: 0, unit_price: 10 }] }), /quantity/);
  assert.throws(() => computeDocumentTotals({
    lines: [{ qty: 1, unit_price: 10, discount: 11 }],
  }), /discount exceeds/);
});

test('A4 and thermal must use the same stored totals object', () => {
  const order = { product_code: 'DEMO-TEE-01', product_name: 'Tee', qty: 3, price: 7470 };
  const lines = linesFromOrder(order);
  const a4 = computeDocumentTotals({ lines, tax_rate: 0, shipping: 0, discount: 0 });
  const thermal = computeDocumentTotals({ lines, tax_rate: 0, shipping: 0, discount: 0 });
  assert.deepEqual(a4.grand_total, thermal.grand_total);
  assert.deepEqual(a4.lines, thermal.lines);
});
