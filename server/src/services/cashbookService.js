import { parseDatePrefix, safeNumber } from '../utils/helpers.js';

function roundMoney(value) {
  return Math.round(safeNumber(value) * 100) / 100;
}

function entryDate(entry) {
  return parseDatePrefix(entry.date || entry.createdAt || '') || '';
}

export function isRecordedRefund(entry = {}) {
  const blob = `${entry.category || ''} ${entry.description || ''} ${entry.reference || ''}`.toLowerCase();
  return blob.includes('refund');
}

export function computeCashbookOverview({ finance = {}, start, end } = {}) {
  const accounts = Array.isArray(finance.accounts) ? finance.accounts : [];
  const allEntries = Array.isArray(finance.entries) ? finance.entries : [];
  const inRange = allEntries.filter((entry) => {
    const date = entryDate(entry);
    if (!date) return false;
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  });

  let receipts = 0;
  let expenses = 0;
  let transfers = 0;
  let refunds = 0;
  let refundCount = 0;

  for (const entry of inRange) {
    const amount = safeNumber(entry.amount);
    if (entry.type === 'income') receipts += amount;
    else if (entry.type === 'expense') expenses += amount;
    else if (entry.type === 'transfer') transfers += amount;
    if (isRecordedRefund(entry)) {
      refunds += amount;
      refundCount += 1;
    }
  }

  const recent = [...inRange]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 8)
    .map((entry) => ({
      id: entry.id,
      date: entry.date || '',
      type: entry.type || '',
      description: entry.description || '',
      category: entry.category || '',
      amount: roundMoney(entry.amount),
      reference: entry.reference || '',
    }));

  return {
    mode: 'cashbook',
    range: { start: start || '', end: end || '' },
    recorded_receipts: roundMoney(receipts),
    recorded_expenses: roundMoney(expenses),
    net_cash_movement: roundMoney(receipts - expenses),
    recorded_refunds: roundMoney(refunds),
    recorded_refund_count: refundCount,
    transfer_total: roundMoney(transfers),
    entry_count: inRange.length,
    account_count: accounts.length,
    recent_entries: recent,
    outstanding_receivables: null,
    payment_reconciliation: {
      available: false,
      reason: 'This cashbook has no reconciliation status field. Courier payout files remain on Reports.',
    },
    notes: {
      nature: 'Cashbook of receipts and expenses posted in the ledger.',
      sales_vs_cash: 'Delivered order sales are not treated as cash received.',
      tekhaccounts: 'TekhAccounts is not connected.',
    },
    unavailable: [
      'trial balance',
      'profit and tax',
      'accounts receivable aging',
      'TekhAccounts integration',
      'payment reconciliation status',
    ],
  };
}
