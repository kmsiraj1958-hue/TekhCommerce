import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { applyOnboardingPreview, listSheets, previewOnboarding, REQUIRED_FIELDS } from './onboardingService.js';

function workbook(rows) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Items');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

test('onboarding preview refuses unmapped columns and does not invent values', () => {
  const sheets = listSheets(workbook([
    { SKU: 'FG-1', Name: 'Cashew 150g', Type: 'FINISHED_GOOD', UOM: 'pcs', Opening: '6' },
  ]));
  const unmapped = previewOnboarding({ sheets, mapping: {}, sheetName: 'Items' });
  assert.equal(unmapped.ok, false);
  assert.equal(REQUIRED_FIELDS.every((field) => unmapped.issues.some((issue) => issue.field === field)), true);

  const mapped = previewOnboarding({
    sheets,
    sheetName: 'Items',
    mapping: { sku: 'SKU', name: 'Name', item_type: 'Type', base_uom: 'UOM', opening_qty: 'Opening' },
  });
  assert.equal(mapped.ok, true);
  assert.equal(mapped.rows[0].sku, 'FG-1');
  assert.equal(mapped.rows[0].cost, null);

  assert.throws(() => applyOnboardingPreview(mapped, { confirm: false }), /confirm/);
});

test('onboarding duplicate SKUs and unknown item types block apply', () => {
  const sheets = listSheets(workbook([
    { SKU: 'A', Name: 'One', Type: 'WIDGET', UOM: 'pcs', Opening: '1' },
    { SKU: 'A', Name: 'Two', Type: 'FINISHED_GOOD', UOM: 'pcs', Opening: '2' },
  ]));
  const preview = previewOnboarding({
    sheets,
    sheetName: 'Items',
    mapping: { sku: 'SKU', name: 'Name', item_type: 'Type', base_uom: 'UOM', opening_qty: 'Opening' },
  });
  assert.equal(preview.ok, false);
  assert.ok(preview.rows[0].errors.some((msg) => msg.includes('item_type')));
  assert.ok(preview.rows[1].errors.some((msg) => msg.includes('Duplicate')));
});
