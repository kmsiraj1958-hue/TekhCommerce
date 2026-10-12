import test from 'node:test';
import assert from 'node:assert/strict';
import { runReport, reportToCsv, toCsv } from './reportCentreService.js';

test('financial statements are unavailable without TekhAccounts', () => {
  const report = runReport('financial_statements', { start: '2026-08-12', end: '2026-10-11' });
  assert.equal(report.available, false);
  assert.match(report.reason, /TekhAccounts/);
  assert.equal(report.tekhaccounts, 'not_connected');
});

test('sales summary date filters run on the server and keep money streams distinct', () => {
  const report = runReport('sales_summary', { start: '2026-08-12', end: '2026-10-11' });
  assert.equal(report.available, true);
  assert.ok(Object.prototype.hasOwnProperty.call(report.totals, 'order_revenue'));
  assert.ok(Object.prototype.hasOwnProperty.call(report.totals, 'invoiced_amount'));
  assert.ok(Object.prototype.hasOwnProperty.call(report.totals, 'cash_collected_on_invoices'));
  assert.ok(Object.prototype.hasOwnProperty.call(report.totals, 'courier_cod_expected'));
  const empty = runReport('sales_summary', { start: '1999-01-01', end: '1999-01-02' });
  assert.equal(empty.totals.orders, 0);
});

test('tax FBR register never invents a submission', () => {
  const report = runReport('tax_fbr', { start: '2026-08-12', end: '2026-10-11' });
  assert.equal(report.fbr_live, false);
  for (const row of report.rows) {
    assert.equal(row.fbr_status, 'not_submitted');
    assert.equal(row.fbr_irn, '');
  }
});

test('CSV export is generated from report rows', () => {
  const csv = toCsv(['a', 'b'], [{ a: '1', b: 'x,y' }]);
  assert.match(csv, /"x,y"/);
  const unavailable = reportToCsv(runReport('financial_statements', {}));
  assert.match(unavailable, /unavailable/);
});
