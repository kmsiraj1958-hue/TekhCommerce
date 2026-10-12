import crypto from 'crypto';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatLocalMinute(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

const VALID_INSTANT = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const BROKEN_ZONE = /(?:Z|[+-]\d{1,2}(?::?\d{2})?)$/i;
const NAIVE_MINUTE = /^(\d{4}-\d{2}-\d{2})[Tt ](\d{2}:\d{2})/;

/**
 * Fingerprints compare the local minute. Naive source stamps keep their
 * stated clock time. Date objects and zoned ISO strings are the same instant
 * read back from PostgreSQL, formatted in local time.
 */
function normDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'Invalid Date' : formatLocalMinute(value);
  }
  if (value == null) return '';
  const text = String(value).trim();
  if (!text) return '';
  if (VALID_INSTANT.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? text : formatLocalMinute(parsed);
  }
  if (BROKEN_ZONE.test(text)) return text;
  const naive = NAIVE_MINUTE.exec(text);
  if (naive) return `${naive[1]} ${naive[2]}`;
  return text;
}

export function movementFingerprint(row) {
  return [
    row.sku,
    row.qty,
    row.type,
    row.storeCode || '',
    row.note || '',
    row.ref || '',
    row.productionId || row.production_id || '',
    normDate(row.occurredAt || row.date),
  ].join('|');
}

export function sourceKeyForMovement(movement, index, seen = new Map()) {
  const id = String(movement.id || movement.sourceKey || '').trim();
  if (id) return `json-id:${id}`;
  const base = `json-fp:${crypto.createHash('sha256').update(movementFingerprint({
    sku: movement.code || movement.sku,
    qty: movement.qty,
    type: movement.type,
    storeCode: movement.store || movement.storeCode,
    note: movement.note,
    ref: movement.ref,
    productionId: movement.production_id || movement.productionId,
    occurredAt: movement.date || movement.occurredAt,
  })).digest('hex').slice(0, 24)}`;
  const n = (seen.get(base) || 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base}#${n}`;
}

/**
 * Re-apply must never delete existing rows. Conflicts fail closed.
 */
export function mergeStockMovements(existing = [], incoming = []) {
  const byKey = new Map(existing.map((row) => [row.sourceKey, row]));
  const toCreate = [];
  const conflicts = [];
  const unchanged = [];

  for (const row of incoming) {
    const current = byKey.get(row.sourceKey);
    if (!current) {
      toCreate.push(row);
      continue;
    }
    if (movementFingerprint(current) !== movementFingerprint(row)) {
      conflicts.push({
        sourceKey: row.sourceKey,
        existing: movementFingerprint(current),
        incoming: movementFingerprint(row),
      });
      continue;
    }
    unchanged.push(row.sourceKey);
  }

  return {
    toCreate,
    conflicts,
    unchanged,
    wouldDelete: 0,
  };
}
