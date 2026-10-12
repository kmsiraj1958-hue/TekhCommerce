import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStockMovements, movementFingerprint, sourceKeyForMovement } from './mergeStock.js';

const STAMP = '2026-08-13 17:10';

function minute(occurredAt) {
  return movementFingerprint({
    sku: 'DEMO-SOCK-01',
    qty: 1,
    type: 'DISPATCH',
    storeCode: 'VOGUE',
    note: 'DEMO dispatch: DEM-0001',
    ref: '',
    productionId: '',
    occurredAt,
  }).split('|').at(-1);
}

function sameInstantWithOffset(date, offsetMinutes) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  const pad = (value) => String(value).padStart(2, '0');
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function plannedRows() {
  const source = [
    {
      code: 'DEMO-SOCK-01',
      qty: 1,
      type: 'DISPATCH',
      store: 'VOGUE',
      note: 'DEMO dispatch: DEM-0001',
      date: STAMP,
    },
    {
      id: '741f40c2-ba9b-4af5-bcba-49bc434721ab',
      code: 'DEMO-TEE-01',
      qty: 1,
      type: 'DISPATCH',
      store: 'SNS',
      note: 'Order confirmed: ORD-0005',
      date: '2026-08-16 09:00',
    },
  ];
  const seen = new Map();
  return source.map((movement, index) => ({
    sourceKey: sourceKeyForMovement(movement, index, seen),
    sku: movement.code,
    qty: movement.qty,
    type: movement.type,
    storeCode: movement.store,
    note: movement.note,
    ref: '',
    productionId: '',
    occurredAt: movement.date,
  }));
}

function isoReadBack(row) {
  return {
    ...row,
    occurredAt: new Date(String(row.occurredAt).replace(' ', 'T')).toISOString(),
  };
}

function dateReadBack(row) {
  return {
    ...row,
    occurredAt: new Date(String(row.occurredAt).replace(' ', 'T')),
  };
}

test('naive stamp, local Date, and UTC ISO share one timestamp fingerprint', () => {
  const localDate = new Date(STAMP.replace(' ', 'T'));
  const iso = localDate.toISOString();
  const expected = minute(STAMP);
  assert.equal(expected, STAMP);
  assert.equal(minute(localDate), expected);
  assert.equal(minute(iso), expected);
  assert.equal(minute(iso.replace('.000Z', 'Z')), expected);
  assert.equal(minute(`${iso.slice(0, 19)}+00:00`), expected);
  assert.equal(minute(sameInstantWithOffset(localDate, 330)), expected);
  assert.equal(minute(sameInstantWithOffset(localDate, -480)), expected);
});

test('read-back rows with the same fields are unchanged', () => {
  const incoming = plannedRows();
  const fromIso = mergeStockMovements(incoming.map(isoReadBack), incoming);
  const fromDate = mergeStockMovements(incoming.map(dateReadBack), incoming);
  for (const merged of [fromIso, fromDate]) {
    assert.equal(merged.conflicts.length, 0);
    assert.equal(merged.toCreate.length, 0);
    assert.equal(merged.unchanged.length, incoming.length);
    assert.equal(merged.wouldDelete, 0);
  }
});

test('a changed quantity or note still conflicts', () => {
  const incoming = plannedRows();
  const existing = incoming.map(isoReadBack);
  const changedQty = mergeStockMovements(existing, [{ ...incoming[0], qty: 4 }, incoming[1]]);
  assert.equal(changedQty.conflicts.length, 1);
  assert.equal(changedQty.conflicts[0].sourceKey, incoming[0].sourceKey);
  assert.equal(changedQty.toCreate.length, 0);
  assert.equal(changedQty.unchanged.length, 1);

  const changedNote = mergeStockMovements(existing, [incoming[0], { ...incoming[1], note: 'Order confirmed: ORD-0005 edited' }]);
  assert.equal(changedNote.conflicts.length, 1);
  assert.equal(changedNote.conflicts[0].sourceKey, incoming[1].sourceKey);
  assert.equal(changedNote.toCreate.length, 0);
  assert.equal(changedNote.unchanged.length, 1);
});

test('a second plan with json-fp and json-id keys creates nothing and conflicts with nothing', () => {
  const incoming = plannedRows();
  assert.match(incoming[0].sourceKey, /^json-fp:/);
  assert.match(incoming[1].sourceKey, /^json-id:/);
  const first = mergeStockMovements([], incoming);
  assert.equal(first.toCreate.length, 2);
  const second = mergeStockMovements(first.toCreate.map(isoReadBack), incoming);
  assert.equal(second.conflicts.length, 0);
  assert.equal(second.toCreate.length, 0);
  assert.deepEqual(second.unchanged, incoming.map((row) => row.sourceKey));
});

test('invalid timestamps stay explicit and distinct', () => {
  assert.equal(minute(''), '');
  assert.equal(minute(null), '');
  assert.equal(minute(undefined), '');
  assert.equal(minute('   '), '');
  assert.equal(minute('not-a-date'), 'not-a-date');
  assert.equal(minute('also-bad'), 'also-bad');
  assert.notEqual(minute('not-a-date'), minute('also-bad'));
  assert.notEqual(minute('not-a-date'), minute(''));
  assert.equal(minute(new Date('nope')), 'Invalid Date');
  assert.notEqual(minute(new Date('nope')), minute(''));
  assert.equal(minute('2026-13-99T99:99:00Z'), '2026-13-99T99:99:00Z');
  assert.equal(minute('2026-08-13T17:10:00+5'), '2026-08-13T17:10:00+5');
  assert.notEqual(minute('2026-08-13T17:10:00+5'), minute(STAMP));

  const broken = mergeStockMovements(
    [{ sourceKey: 'json-id:bad', sku: 'DEMO-SOCK-01', qty: 1, type: 'DISPATCH', storeCode: 'VOGUE', note: '', occurredAt: 'not-a-date' }],
    [{ sourceKey: 'json-id:bad', sku: 'DEMO-SOCK-01', qty: 1, type: 'DISPATCH', storeCode: 'VOGUE', note: '', occurredAt: 'also-bad' }],
  );
  assert.equal(broken.conflicts.length, 1);
  assert.equal(broken.toCreate.length, 0);
  assert.equal(broken.unchanged.length, 0);
});
