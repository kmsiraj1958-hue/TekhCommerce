export function safeNumber(value) {
  try {
    if (value == null) return 0;
    if (typeof value === 'number') return value;
    const v = String(value).trim().replace(/,/g, '');
    return v ? parseFloat(v) : 0;
  } catch {
    return 0;
  }
}

export function parseDatePrefix(dtStr) {
  const s = (dtStr || '').trim();
  if (s.length >= 10 && s[4] === '-' && s[7] === '-') return s.slice(0, 10);
  return '';
}

export function toYyyyMmDd(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  if (s.length >= 10 && s[4] === '-' && s[7] === '-') return s.slice(0, 10);
  return s;
}

export function cleanConsignment(no) {
  if (!no) return '';
  return String(no).replace(/\D+/g, '');
}

export function extractCodeFromTitle(title) {
  if (!title) return '';
  const m = title.match(/\(\s*([A-Za-z]{2,8})\s*-\s*(\d{2,6})\s*\)/);
  return m ? `${m[1].toUpperCase()}-${m[2]}` : '';
}

export function cleanPhoneForWhatsapp(phone) {
  let p = String(phone || '').replace(/\D+/g, '');
  if (p.startsWith('03') && p.length === 11) p = '92' + p.slice(1);
  return p;
}

export function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function mnpStatusToOrderStatus(mnpStatus) {
  const s = (mnpStatus || '').trim().toLowerCase();
  if (s.includes('deliver')) return 'Delivered';
  if (s.includes('return') || s.includes('rts') || s.includes('undeliver')) return 'Returned';
  return '';
}

export function pick(row, keys) {
  for (const k of keys) {
    if (k in row && row[k] != null && row[k] !== '') return row[k];
  }
  return null;
}
