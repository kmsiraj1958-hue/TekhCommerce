import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { demoDir, resolveDataFiles } from '../demo/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../../..');
export const SERVER_DIR = path.resolve(__dirname, '../..');

const ALLOWED_SOURCE = new Set(['live', 'demo']);
const ALLOWED_TARGET = new Set(['rehearsal', 'production-snapshot']);

export function resolveImportProfile(env = process.env) {
  const source = String(env.TEKH_IMPORT_SOURCE || '').trim().toLowerCase();
  const target = String(env.TEKH_IMPORT_TARGET || '').trim().toLowerCase();
  if (!ALLOWED_SOURCE.has(source)) {
    return {
      ok: false,
      error: 'TEKH_IMPORT_SOURCE is required and must be live or demo. Refusing an implicit dataset.',
    };
  }
  if (!ALLOWED_TARGET.has(target)) {
    return {
      ok: false,
      error: 'TEKH_IMPORT_TARGET is required and must be rehearsal or production-snapshot.',
    };
  }
  if (source === 'demo' && target === 'production-snapshot') {
    return { ok: false, error: 'Demo dataset cannot target a production-snapshot import.' };
  }
  const databaseUrl = String(env.DATABASE_URL || '');
  if (source === 'demo' && /render\.com|neon\.tech|amazonaws\.com/i.test(databaseUrl)) {
    return { ok: false, error: 'Demo import refused because DATABASE_URL looks like a hosted production database.' };
  }
  const useDemo = source === 'demo';
  const files = resolveDataFiles({ demoMode: useDemo, baseDir: REPO_ROOT, serverDir: SERVER_DIR });
  const demoRoot = demoDir(SERVER_DIR);
  if (useDemo) {
    const ok = String(files.products).replace(/\\/g, '/').includes('/data/demo/');
    if (!ok) return { ok: false, error: 'Demo source did not resolve under server/data/demo.' };
  } else {
    const blocked = String(files.products).replace(/\\/g, '/').includes('/data/demo/');
    if (blocked) return { ok: false, error: 'Live source refused because it resolved inside the demo directory.' };
    if (path.normalize(files.products) === path.normalize(path.join(demoRoot, 'products.json'))) {
      return { ok: false, error: 'Live and demo product paths collided.' };
    }
  }
  for (const [name, filePath] of Object.entries({
    products: files.products,
    orders: files.orders,
    inventory: files.inventory,
  })) {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: `Source file missing for ${name}: ${filePath}` };
    }
  }
  return {
    ok: true,
    source,
    target,
    useDemo,
    files,
    sourceOfTruth: 'json',
    cutover: false,
    databaseUrlConfigured: Boolean(databaseUrl),
  };
}

export function describeProfile(profile) {
  return {
    source: profile.source,
    target: profile.target,
    products: profile.files.products,
    orders: profile.files.orders,
    inventory: profile.files.inventory,
    manufacturing: profile.files.manufacturing,
    sourceOfTruth: 'json',
    cutover: false,
  };
}
