import { qtyDecimal } from './qty.js';

const MASS = { kg: 1000, g: 1, mg: 0.001 };
const VOLUME = { l: 1000, litre: 1000, liters: 1000, ml: 1 };
const COUNT = { pcs: 1, pc: 1, piece: 1, pieces: 1, pack: 1, packs: 1, ea: 1 };

function family(uom) {
  const u = String(uom || '').trim().toLowerCase();
  if (MASS[u] != null) return { kind: 'mass', factor: MASS[u], uom: u === 'mg' ? 'g' : u };
  if (VOLUME[u] != null) return { kind: 'volume', factor: VOLUME[u], uom: u };
  if (COUNT[u] != null) return { kind: 'count', factor: COUNT[u], uom: 'pcs' };
  return { kind: 'count', factor: 1, uom: u || 'pcs' };
}

export function convertQty(qty, fromUom, toUom, extraRules = []) {
  const amount = qtyDecimal(qty);
  const from = String(fromUom || '').trim().toLowerCase();
  const to = String(toUom || '').trim().toLowerCase();
  if (!to || from === to) return amount;
  const rule = extraRules.find((row) => (
    String(row.from || '').toLowerCase() === from && String(row.to || '').toLowerCase() === to
  ));
  if (rule) return qtyDecimal(amount * Number(rule.factor));
  const inverse = extraRules.find((row) => (
    String(row.from || '').toLowerCase() === to && String(row.to || '').toLowerCase() === from
  ));
  if (inverse && Number(inverse.factor)) return qtyDecimal(amount / Number(inverse.factor));
  const a = family(from);
  const b = family(to);
  if (a.kind !== b.kind) {
    throw new Error(`Cannot convert ${fromUom} to ${toUom}`);
  }
  return qtyDecimal((amount * a.factor) / b.factor);
}

export function normalizeUom(uom) {
  const u = String(uom || 'pcs').trim().toLowerCase();
  if (u === 'litre' || u === 'liters' || u === 'l') return 'l';
  if (u === 'piece' || u === 'pieces' || u === 'pc' || u === 'ea') return 'pcs';
  if (u === 'packs' || u === 'pack') return 'pack';
  return u;
}
