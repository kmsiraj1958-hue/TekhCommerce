import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_MANIFEST_PATH = path.join(__dirname, 'skuMapping.manifest.json');

export function identityKey(product = {}) {
  const name = String(product.name || '').trim();
  const category = String(product.category || '').trim();
  const opening = String(product.opening_stock ?? product.openingStock ?? '');
  const image = String(product.image || '').trim();
  const sku = String(product.code || product.source_sku || product.sku || '').trim();
  return `${sku}|${name}|${category}|${opening}|${image}`;
}

export function loadSkuManifest(filePath = DEFAULT_MANIFEST_PATH) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return raw;
}

export function manifestIsApproved(manifest) {
  return String(manifest?.approval_status || '') === 'approved';
}

export function resolveSku(product, manifest, { requireApproved = true } = {}) {
  if (!manifest) {
    return { sku: String(product.code || product.sku || '').trim(), mapped: false };
  }
  const key = identityKey(product);
  const row = (manifest.mappings || []).find((item) => item.identity_key === key);
  if (!row) {
    return { sku: String(product.code || product.sku || '').trim(), mapped: false };
  }
  if (requireApproved && (manifest.approval_status !== 'approved' || row.approval_status !== 'approved')) {
    return {
      sku: String(product.code || product.sku || '').trim(),
      mapped: false,
      blocked: true,
      proposed: row.proposed_sku,
      message: `SKU mapping for ${key} is not approved`,
    };
  }
  return { sku: row.proposed_sku, mapped: row.action === 'reassign', identity: key };
}

export function assertManifestTargets(manifest, catalogSkus = []) {
  const issues = [];
  const used = new Set(catalogSkus);
  const targets = new Set();
  for (const row of manifest.mappings || []) {
    if (row.action !== 'reassign') continue;
    if (targets.has(row.proposed_sku)) {
      issues.push({ level: 'error', entity: 'sku_map', message: `Duplicate proposed SKU ${row.proposed_sku}` });
    }
    targets.add(row.proposed_sku);
    if (used.has(row.proposed_sku) && row.proposed_sku !== row.source_sku) {
      issues.push({ level: 'error', entity: 'sku_map', message: `Proposed SKU ${row.proposed_sku} already exists in catalog` });
    }
  }
  return issues;
}
