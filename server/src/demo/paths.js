import path from 'path';

const LIVE_BASENAMES = new Set([
  'products.json',
  'orders.json',
  'inventory_movements.json',
  'ad_spend.json',
  'mnp_daily_reports.json',
  'mnp_payout_reports.json',
  'weekly_reports.json',
  'finance.json',
  'courier-settings.json',
  'courier-return-receipts.json',
  'courier-event-log.json',
  'courier-weekly-snapshots.json',
  'vendor-license.json',
  'documents.json',
  'merchant-profile.json',
  'manufacturing.json',
]);

export function parseDemoMode(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Dataset profile from process environment — not a UI switch.
 * Local scripts set TEKH_DATA=demo. Production must set NODE_ENV=production and TEKH_DATA=live.
 * A public client demo sets TEKH_PUBLIC_DEMO=yes with TEKH_DATA=demo. That mode cannot select live JSON.
 */
export function resolveDataProfile({ nodeEnv, tekhData, useLiveJson, publicDemo } = {}) {
  const env = String(nodeEnv || '').toLowerCase();
  const data = String(tekhData || '').trim().toLowerCase();
  const liveEscape = parseDemoMode(useLiveJson);
  const demoHost = parseDemoMode(publicDemo);

  if (data && !['demo', 'development', 'live'].includes(data)) {
    return { ok: false, error: `Unknown TEKH_DATA=${tekhData}. Use demo or live.` };
  }
  if (demoHost && (data === 'live' || liveEscape || data === 'development')) {
    return { ok: false, error: 'Public demo cannot use live business data. Refusing to start.' };
  }
  if (demoHost && data !== 'demo') {
    return { ok: false, error: 'Public demo requires TEKH_DATA=demo.' };
  }
  if (env === 'production' && (data === 'demo' || data === 'development') && !demoHost) {
    return { ok: false, error: 'NODE_ENV=production cannot use the demo dataset.' };
  }
  if (demoHost) {
    return { ok: true, profile: 'demo', useDemo: true, publicDemo: true };
  }
  if (env === 'production') {
    return { ok: true, profile: 'live', useDemo: false, publicDemo: false };
  }
  if (data === 'live' || liveEscape) {
    return { ok: true, profile: 'live', useDemo: false, publicDemo: false };
  }
  return { ok: true, profile: 'demo', useDemo: true, publicDemo: false };
}

/** Fail closed when a server process would otherwise guess the dataset. */
export function assertStartupDataProfile(decision, { nodeEnv, tekhData, publicDemo } = {}) {
  if (!decision?.ok) {
    throw new Error(decision?.error || 'Dataset configuration is invalid.');
  }
  const env = String(nodeEnv || '').toLowerCase();
  const data = String(tekhData || '').trim().toLowerCase();
  const demoHost = parseDemoMode(publicDemo);
  if (demoHost) {
    if (!decision.publicDemo || decision.profile !== 'demo') {
      throw new Error('Public demo refused to start.');
    }
    return;
  }
  if (decision.publicDemo) {
    throw new Error('Public demo flag was set without TEKH_PUBLIC_DEMO. Refusing to start.');
  }
  if (env === 'production' && data !== 'live') {
    throw new Error('Production requires TEKH_DATA=live. Refusing to start with an implicit dataset.');
  }
  if (env === 'production' && decision.profile !== 'live') {
    throw new Error('Production refused to start with the demo dataset.');
  }
  if (!env && !data) {
    throw new Error('Dataset configuration is ambiguous. Use npm run dev (demo data) or NODE_ENV=production TEKH_DATA=live.');
  }
}

export function useDevelopmentDataset(opts = {}) {
  const decision = resolveDataProfile(opts);
  if (!decision.ok) return false;
  return decision.useDemo;
}

export function developmentDir(serverDir) {
  return path.join(serverDir, 'data', 'development');
}

export function demoDir(serverDir) {
  return path.join(serverDir, 'data', 'demo');
}

export function isInsideDemoDir(filePath, serverDir) {
  const target = path.normalize(filePath);
  const dirs = [
    path.normalize(developmentDir(serverDir)),
    path.normalize(path.join(serverDir, 'data', 'demo')),
  ];
  return dirs.some((dir) => target === dir || target.startsWith(dir + path.sep));
}

export function isProtectedLiveFile(filePath, { baseDir, serverDir }) {
  const target = path.normalize(filePath);
  if (isInsideDemoDir(target, serverDir)) return false;
  const base = path.basename(target);
  if (!LIVE_BASENAMES.has(base)) return false;
  const liveRoot = path.normalize(baseDir);
  const liveData = path.normalize(path.join(serverDir, 'data'));
  return target.startsWith(liveRoot + path.sep) || target.startsWith(liveData + path.sep) || target === liveRoot;
}

export function resolveDataFiles({ demoMode, baseDir, serverDir }) {
  const jsonRoot = demoMode ? demoDir(serverDir) : baseDir;
  const overlayRoot = demoMode ? demoDir(serverDir) : path.join(serverDir, 'data');
  const uploads = demoMode ? path.join(demoDir(serverDir), 'uploads') : path.join(baseDir, 'uploads');
  return {
    products: path.join(jsonRoot, 'products.json'),
    orders: path.join(jsonRoot, 'orders.json'),
    inventory: path.join(jsonRoot, 'inventory_movements.json'),
    adSpend: path.join(jsonRoot, 'ad_spend.json'),
    mnpDaily: path.join(jsonRoot, 'mnp_daily_reports.json'),
    mnpPayout: path.join(jsonRoot, 'mnp_payout_reports.json'),
    weekly: path.join(jsonRoot, 'weekly_reports.json'),
    finance: path.join(overlayRoot, 'finance.json'),
    courierSettings: path.join(overlayRoot, 'courier-settings.json'),
    courierReceipts: path.join(overlayRoot, 'courier-return-receipts.json'),
    courierEvents: path.join(overlayRoot, 'courier-event-log.json'),
    courierWeekly: path.join(overlayRoot, 'courier-weekly-snapshots.json'),
    invoices: path.join(overlayRoot, 'invoices.json'),
    documents: path.join(overlayRoot, 'documents.json'),
    merchantProfile: path.join(overlayRoot, 'merchant-profile.json'),
    manufacturing: path.join(overlayRoot, 'manufacturing.json'),
    accessUsers: path.join(overlayRoot, 'access-users.json'),
    uploads,
    images: path.join(baseDir, 'static', 'images'),
    autoReports: path.join(uploads, 'auto_reports'),
    archive: path.join(uploads, 'archive'),
  };
}
