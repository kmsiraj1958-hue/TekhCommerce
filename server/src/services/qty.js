/** Quantity precision (6 dp). Not monetary precision. */
export function qtyDecimal(value) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1e6) / 1e6;
}

export function qtyAdd(...values) {
  return qtyDecimal(values.reduce((sum, value) => sum + qtyDecimal(value), 0));
}

export function qtySub(a, b) {
  return qtyDecimal(qtyDecimal(a) - qtyDecimal(b));
}
