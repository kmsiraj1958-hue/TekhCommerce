import test from 'node:test';
import assert from 'node:assert/strict';
import { convertQty } from './uom.js';

test('refuses conversion across incompatible families', () => {
  assert.throws(() => convertQty(1, 'kg', 'pcs'), /Cannot convert/);
});
