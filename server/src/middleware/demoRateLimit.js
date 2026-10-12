const WINDOW_MS = 15 * 60 * 1000;
const MAX_WRITES = 30;
const buckets = new Map();

function limitedPath(req) {
  if (req.method !== 'POST') return false;
  const url = req.originalUrl || req.url || '';
  return url.startsWith('/api/auth/login')
    || url.startsWith('/api/orders/checkout')
    || url.startsWith('/api/orders/single')
    || url.startsWith('/api/orders/tiktok');
}

export function publicDemoWriteLimit(req, res, next) {
  if (!limitedPath(req)) return next();
  const now = Date.now();
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  const bucket = buckets.get(key) || [];
  const recent = bucket.filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_WRITES) {
    return res.status(429).json({ error: 'Too many demo requests. Please wait and try again.' });
  }
  recent.push(now);
  buckets.set(key, recent);
  next();
}
