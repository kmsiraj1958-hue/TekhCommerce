import { ITEM_TYPES, MOVE_TYPE, ORDER_STATUS } from './enums.js';
import { assertManifestTargets, identityKey, manifestIsApproved, resolveSku } from './skuMap.js';
import { sourceKeyForMovement } from './mergeStock.js';
import {
  collectOrphans,
  mapCourier,
  mapDocuments,
  mapFinance,
  mapManufacturingDetailed,
} from './domainMap.js';

function num(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function text(value) {
  return String(value ?? '').trim();
}

function emptyToNull(value) {
  const s = text(value);
  return s ? s : null;
}

export function mapStoresFromOrders(orders = []) {
  const codes = new Set(['LOCAL']);
  for (const order of orders) {
    const code = text(order.store).toUpperCase() || 'LOCAL';
    codes.add(code);
  }
  return [...codes].map((code) => ({
    code,
    name: code,
  }));
}

function mapItemType(product, options, issues) {
  const raw = text(product.item_type || product.itemType);
  if (raw) {
    if (!ITEM_TYPES.includes(raw)) {
      issues.push({ level: 'error', entity: 'product', message: `Unknown item_type "${raw}" on ${product.code || product.name}` });
      return null;
    }
    return raw;
  }
  const policy = options.legacyUntypedPolicy;
  if (policy === 'FINISHED_GOOD' && options.legacyUntypedApproved) {
    issues.push({
      level: 'warn',
      entity: 'product',
      message: `Legacy product ${product.code} has no item_type; snapshot uses FINISHED_GOOD by approved policy`,
    });
    return 'FINISHED_GOOD';
  }
  issues.push({
    level: 'error',
    entity: 'product',
    message: `Product ${product.code || identityKey(product)} has no item_type. Approve legacy_untyped_item_type_policy or classify the row.`,
  });
  return null;
}

export function mapProducts(products = [], options = {}) {
  const rows = [];
  const issues = [];
  const seen = new Set();
  const skuCounts = {};
  for (const product of products) {
    const sku = text(product.code);
    if (!sku) {
      issues.push({ level: 'error', entity: 'product', message: 'Missing product code', record: product.name || '' });
      continue;
    }
    skuCounts[sku] = (skuCounts[sku] || 0) + 1;
  }
  const duplicates = Object.keys(skuCounts).filter((sku) => skuCounts[sku] > 1);
  const applyMaps = Boolean(options.applyApprovedSkuMap && manifestIsApproved(options.skuManifest));
  for (const sku of duplicates) {
    issues.push({
      level: applyMaps ? 'warn' : 'error',
      entity: 'product',
      message: `Duplicate SKU ${sku}`,
      identities: products.filter((p) => text(p.code) === sku).map((p) => identityKey(p)),
    });
  }

  if (duplicates.length && !applyMaps) {
    issues.push({
      level: 'error',
      entity: 'sku_map',
      message: 'Duplicate SKUs cannot pass silently. Approve server/src/db/skuMapping.manifest.json before a production snapshot.',
    });
  }

  const catalogSkus = products.map((p) => text(p.code)).filter(Boolean);
  if (options.skuManifest) {
    issues.push(...assertManifestTargets(options.skuManifest, catalogSkus.filter((sku) => skuCounts[sku] === 1)));
  }

  for (const product of products) {
    const sourceSku = text(product.code);
    if (!sourceSku) continue;
    const resolved = resolveSku(product, options.skuManifest, { requireApproved: true });
    if (skuCounts[sourceSku] > 1 && !applyMaps) {
      continue;
    }
    if (skuCounts[sourceSku] > 1 && applyMaps && resolved.blocked) {
      issues.push({ level: 'error', entity: 'sku_map', message: resolved.message });
      continue;
    }
    const sku = applyMaps ? resolved.sku : sourceSku;
    if (seen.has(sku)) {
      issues.push({ level: 'error', entity: 'product', message: `Duplicate target SKU ${sku}` });
      continue;
    }
    const itemType = mapItemType(product, options, issues);
    if (!itemType) continue;
    seen.add(sku);
    rows.push({
      sku,
      sourceSku,
      name: text(product.name) || sku,
      itemType,
      category: text(product.category),
      price: num(product.price),
      cost: num(product.cost),
      openingStock: num(product.opening_stock),
      reorderLevel: num(product.reorder_level),
      uom: text(product.base_uom || product.uom) || 'pcs',
      hideFromStore: Boolean(product.hide_from_store) || itemType !== 'FINISHED_GOOD',
      conversionRules: product.conversion_rules || [],
      image: text(product.image),
      shopifySku: sourceSku,
      active: product.active !== false,
    });
  }

  return { rows, issues };
}

export function mapCustomers(orders = []) {
  const byKey = new Map();
  for (const order of orders) {
    const name = text(order.customer_name);
    const phone = text(order.customer_phone);
    if (!name && !phone) continue;
    const key = `${phone}|${name.toLowerCase()}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        name: name || 'Customer',
        phone,
        address: text(order.customer_address),
      });
    }
  }
  return [...byKey.values()];
}

export function shopifyIdentityKey(storeCode, shopifyOrderId) {
  if (!shopifyOrderId) return null;
  return `${String(storeCode || 'LOCAL').toUpperCase()}|${shopifyOrderId}`;
}

export function mapOrders(orders = [], skuRewrite = {}) {
  const rows = [];
  const issues = [];
  const orderIds = new Set();
  const shopifyKeys = new Set();

  for (const order of orders) {
    const orderId = text(order.order_id);
    if (!orderId) {
      issues.push({ level: 'error', entity: 'order', message: 'Missing order_id' });
      continue;
    }
    if (orderIds.has(orderId)) {
      issues.push({ level: 'error', entity: 'order', message: `Duplicate order_id ${orderId}` });
      continue;
    }
    orderIds.add(orderId);

    const storeCode = text(order.store).toUpperCase() || 'LOCAL';
    const shopifyOrderId = emptyToNull(order.shopify_order_id);
    const shopifyKey = shopifyIdentityKey(storeCode, shopifyOrderId);
    if (shopifyKey) {
      if (shopifyKeys.has(shopifyKey)) {
        issues.push({ level: 'error', entity: 'order', message: `Duplicate Shopify identity ${shopifyKey}` });
      }
      shopifyKeys.add(shopifyKey);
    }

    const statusKey = text(order.status) || 'Pending';
    const status = ORDER_STATUS[statusKey];
    if (!status) {
      issues.push({ level: 'error', entity: 'order', message: `Unknown status "${statusKey}" on ${orderId}` });
      continue;
    }

    const items = Array.isArray(order.items) && order.items.length
      ? order.items
      : [{ sku: order.product_code, title: order.product_name, qty: order.qty, price: order.price, variant: '' }];

    const rewrite = (sku) => skuRewrite[sku] || sku;

    rows.push({
      orderId,
      storeCode,
      source: text(order.source) || 'website',
      status,
      customerName: text(order.customer_name),
      customerPhone: text(order.customer_phone),
      customerAddress: text(order.customer_address),
      productName: text(order.product_name),
      productCode: rewrite(text(order.product_code)),
      qty: num(order.qty, 1),
      price: num(order.price),
      shopifyOrderId,
      shopifyOrderName: text(order.shopify_order_name),
      courier: text(order.courier),
      trackingNumber: text(order.tracking_number),
      stockReserved: Boolean(order.stock_reserved),
      stockRestocked: Boolean(order.stock_restocked),
      mnpCodAmount: num(order.mnp_cod_amount),
      mnpStatus: text(order.mnp_status),
      notifications: order.notifications || null,
      createdAt: order.created_at || null,
      items: items.map((item) => ({
        sku: rewrite(text(item.sku || item.code)),
        title: text(item.title || item.display || item.name),
        variant: text(item.variant),
        qty: num(item.qty, 1),
        price: num(item.price),
      })),
    });
  }

  return { rows, issues };
}

export function mapStockMovements(movements = [], skuRewrite = {}) {
  const rows = [];
  const issues = [];
  const seenKeys = new Map();

  for (let index = 0; index < movements.length; index += 1) {
    const movement = movements[index];
    const sku = skuRewrite[text(movement.code)] || text(movement.code);
    const qty = num(movement.qty);
    const rawType = text(movement.type).toLowerCase();
    const type = MOVE_TYPE[rawType];
    if (!sku) {
      issues.push({ level: 'error', entity: 'stock', message: 'Movement missing product code' });
      continue;
    }
    if (qty <= 0) {
      issues.push({ level: 'warn', entity: 'stock', message: `Non-positive qty for ${sku}` });
    }
    if (!type) {
      issues.push({
        level: 'error',
        entity: 'stock',
        message: `Unknown movement type "${movement.type}"`,
      });
      continue;
    }
    const sourceKey = sourceKeyForMovement({ ...movement, code: sku, type: rawType }, index, seenKeys);
    rows.push({
      sourceKey,
      sku,
      qty,
      type,
      uom: text(movement.uom),
      storeCode: text(movement.store).toUpperCase(),
      note: text(movement.note),
      ref: text(movement.ref),
      productionId: text(movement.production_id),
      userName: text(movement.user),
      occurredAt: movement.date || null,
    });
  }

  return { rows, issues };
}

export function mapManufacturing(store = {}) {
  const issues = [];
  const boms = store.boms || [];
  const productionOrders = store.production_orders || [];
  return {
    settings: store.settings || {},
    boms,
    productionOrders,
    issues,
  };
}

export function buildImportPlan(data = {}, options = {}) {
  const products = data.products || [];
  const orders = data.orders || [];
  const movements = data.movements || [];
  const productResult = mapProducts(products, options);
  const skuRewrite = {};
  for (const row of productResult.rows) {
    if (row.sourceSku && row.sourceSku !== row.sku) skuRewrite[row.sourceSku] = row.sku;
  }
  const orderResult = mapOrders(orders, skuRewrite);
  const moveResult = mapStockMovements(movements, skuRewrite);
  const mfg = mapManufacturingDetailed(data.manufacturing || {}, new Set(productResult.rows.map((row) => row.sku)));
  const orderIds = new Set(orderResult.rows.map((row) => row.orderId));
  const documents = mapDocuments(data.documents || {}, orderIds);
  const finance = mapFinance(data.finance || {});
  const courier = mapCourier({
    settings: data.courierSettings || {},
    events: data.courierEvents || [],
    receipts: data.courierReceipts || [],
    weekly: data.courierWeekly || [],
  });
  const orphanIssues = collectOrphans({
    products: productResult.rows,
    orders: orderResult.rows,
    movements: moveResult.rows,
  });
  const issues = [
    ...productResult.issues,
    ...orderResult.issues,
    ...moveResult.issues,
    ...mfg.issues,
    ...documents.issues,
    ...finance.issues,
    ...courier.issues,
    ...orphanIssues,
  ];

  return {
    sourceOfTruth: 'json',
    cutover: false,
    sourceProfile: options.sourceProfile || null,
    counts: {
      stores: mapStoresFromOrders(orders).length,
      products: productResult.rows.length,
      customers: mapCustomers(orders).length,
      orders: orderResult.rows.length,
      orderItems: orderResult.rows.reduce((sum, order) => sum + order.items.length, 0),
      stockMovements: moveResult.rows.length,
      boms: mfg.boms.length,
      productionOrders: mfg.productionOrders.length,
      documents: documents.rows.length,
      cashAccounts: finance.accounts.length,
      cashEntries: finance.entries.length,
      courierEvents: courier.events.length,
      courierReceipts: courier.receipts.length,
    },
    issues,
    blockingErrors: issues.filter((issue) => issue.level === 'error').length,
    stores: mapStoresFromOrders(orders),
    products: productResult.rows,
    customers: mapCustomers(orders),
    orders: orderResult.rows,
    stockMovements: moveResult.rows,
    manufacturing: mfg,
    documents,
    finance,
    courier,
    merchantProfile: data.merchantProfile || {},
    adSpend: data.adSpend || {},
    mnpDaily: data.mnpDaily || [],
    mnpPayout: data.mnpPayout || [],
    weekly: data.weekly || [],
  };
}

export function summarizePlan(plan) {
  return {
    sourceOfTruth: plan.sourceOfTruth,
    cutover: plan.cutover,
    sourceProfile: plan.sourceProfile,
    counts: plan.counts,
    blockingErrors: plan.blockingErrors,
    issueSample: plan.issues.slice(0, 20),
  };
}
