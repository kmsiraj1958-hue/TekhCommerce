import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCashbookOverview, isRecordedRefund } from './cashbookService.js';

const finance = {
  accounts: [{ id: 'acc-cash', name: 'Cash', type: 'asset' }, { id: 'acc-receivable', name: 'AR', type: 'asset' }],
  entries: [
    { id: '1', type: 'income', amount: 1500, date: '2026-10-01', description: 'Counter sale', category: 'Sales' },
    { id: '2', type: 'expense', amount: 200, date: '2026-10-02', description: 'Packing', category: 'Ops' },
    { id: '3', type: 'expense', amount: 100, date: '2026-10-02', description: 'Customer refund', category: 'Refund' },
    { id: '4', type: 'income', amount: 900, date: '2026-01-01', description: 'Old receipt', category: 'Sales' },
    { id: '5', type: 'transfer', amount: 50, date: '2026-10-02', description: 'Cash to bank', category: 'Transfer' },
  ],
};

test('cashbook uses recorded receipts and expenses, not inferred order sales', () => {
  const data = computeCashbookOverview({ finance, start: '2026-10-01', end: '2026-10-31' });
  assert.equal(data.mode, 'cashbook');
  assert.equal(data.recorded_receipts, 1500);
  assert.equal(data.recorded_expenses, 300);
  assert.equal(data.net_cash_movement, 1200);
  assert.equal(data.recorded_refunds, 100);
  assert.equal(data.recorded_refund_count, 1);
  assert.equal(data.entry_count, 4);
  assert.equal(data.outstanding_receivables, null);
  assert.equal(data.payment_reconciliation.available, false);
});

test('refund detector only matches recorded refund wording', () => {
  assert.equal(isRecordedRefund({ description: 'Customer refund' }), true);
  assert.equal(isRecordedRefund({ description: 'Packing' }), false);
});
