import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadJson } from '../utils/storage.js';
import { buildImportPlan, summarizePlan } from './jsonMap.js';
import { mergeStockMovements } from './mergeStock.js';
import { loadSkuManifest, manifestIsApproved } from './skuMap.js';
import { describeProfile, resolveImportProfile } from './sourceProfile.js';
import { getPrisma, isDatabaseConfigured, disconnectPrisma } from './prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadSourceData(files) {
  return {
    products: loadJson(files.products, []),
    orders: loadJson(files.orders, []),
    movements: loadJson(files.inventory, []),
    manufacturing: loadJson(files.manufacturing, { boms: [], production_orders: [] }),
    documents: loadJson(files.documents, { sequences: {}, idempotency: {}, documents: [], events: [] }),
    finance: loadJson(files.finance, { accounts: [], entries: [] }),
    courierSettings: loadJson(files.courierSettings, {}),
    courierEvents: loadJson(files.courierEvents, []),
    courierReceipts: loadJson(files.courierReceipts, []),
    courierWeekly: loadJson(files.courierWeekly, []),
    merchantProfile: loadJson(files.merchantProfile, {}),
    adSpend: loadJson(files.adSpend, {}),
    mnpDaily: loadJson(files.mnpDaily, []),
    mnpPayout: loadJson(files.mnpPayout, []),
    weekly: loadJson(files.weekly, []),
  };
}

export function dryRunImport(data, options = {}) {
  const plan = buildImportPlan(data, options);
  return summarizePlan(plan);
}

export function planStockApply(existingRows, incomingRows) {
  const merged = mergeStockMovements(existingRows, incomingRows);
  if (merged.conflicts.length) {
    throw new Error(`Stock movement conflicts (${merged.conflicts.length}). Import refused; history was not deleted.`);
  }
  return merged;
}

async function applyImport(plan, { prisma } = {}) {
  if (plan.blockingErrors) {
    throw new Error(`Refusing to apply: ${plan.blockingErrors} blocking mapping error(s)`);
  }
  const client = prisma || await getPrisma();
  if (!client) throw new Error('DATABASE_URL is not set');

  await client.$transaction(async (tx) => {
    for (const store of plan.stores) {
      await tx.store.upsert({
        where: { code: store.code },
        create: store,
        update: { name: store.name },
      });
    }

    const productIds = {};
    for (const product of plan.products) {
      const saved = await tx.product.upsert({
        where: { sku: product.sku },
        create: {
          sku: product.sku,
          name: product.name,
          itemType: product.itemType,
          category: product.category,
          price: product.price,
          cost: product.cost,
          openingStock: product.openingStock,
          reorderLevel: product.reorderLevel,
          uom: product.uom,
          hideFromStore: product.hideFromStore,
          image: product.image,
          shopifySku: product.shopifySku,
        },
        update: {
          name: product.name,
          itemType: product.itemType,
          category: product.category,
          price: product.price,
          cost: product.cost,
          openingStock: product.openingStock,
          reorderLevel: product.reorderLevel,
          uom: product.uom,
          hideFromStore: product.hideFromStore,
          image: product.image,
        },
      });
      productIds[product.sku] = saved.id;
    }

    const existingMoves = await tx.stockMovement.findMany({ select: { sourceKey: true, sku: true, qty: true, type: true, storeCode: true, note: true, ref: true, occurredAt: true, productionOrderId: true } });
    const existingForMerge = existingMoves.map((row) => ({
      sourceKey: row.sourceKey,
      sku: row.sku,
      qty: Number(row.qty),
      type: row.type,
      storeCode: row.storeCode,
      note: row.note,
      ref: row.ref,
      productionId: row.productionOrderId || '',
      occurredAt: row.occurredAt?.toISOString?.() || '',
    }));
    const merged = planStockApply(existingForMerge, plan.stockMovements);
    if (merged.toCreate.length) {
      await tx.stockMovement.createMany({
        data: merged.toCreate.map((move) => ({
          sourceKey: move.sourceKey,
          sku: move.sku,
          qty: move.qty,
          type: move.type,
          uom: move.uom || '',
          storeCode: move.storeCode,
          note: move.note,
          ref: move.ref || '',
          userName: move.userName || '',
          productId: productIds[move.sku] || null,
          occurredAt: move.occurredAt ? new Date(String(move.occurredAt).replace(' ', 'T')) : new Date(),
        })),
        skipDuplicates: true,
      });
    }

    const storeIds = {};
    for (const store of plan.stores) {
      const saved = await tx.store.findUnique({ where: { code: store.code } });
      storeIds[store.code] = saved?.id;
    }
    for (const order of plan.orders || []) {
      const payload = {
        orderId: order.orderId,
        storeId: storeIds[order.storeCode] || null,
        storeCode: order.storeCode,
        source: order.source,
        status: order.status,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerAddress: order.customerAddress,
        productName: order.productName,
        productCode: order.productCode,
        qty: order.qty,
        price: order.price,
        shopifyOrderId: order.shopifyOrderId,
        shopifyOrderName: order.shopifyOrderName,
        courier: order.courier,
        trackingNumber: order.trackingNumber,
        stockReserved: order.stockReserved,
        stockRestocked: order.stockRestocked,
        mnpCodAmount: order.mnpCodAmount || 0,
        mnpStatus: order.mnpStatus || '',
      };
      const existing = await tx.order.findUnique({ where: { orderId: order.orderId } });
      if (existing) {
        await tx.order.update({ where: { id: existing.id }, data: payload });
      } else {
        await tx.order.create({
          data: {
            ...payload,
            items: {
              create: (order.items || []).map((item) => ({
                sku: item.sku,
                title: item.title,
                variant: item.variant,
                qty: item.qty,
                price: item.price,
                productId: productIds[item.sku] || null,
              })),
            },
          },
        });
      }
    }

    for (const account of plan.finance?.accounts || []) {
      await tx.cashAccount.upsert({
        where: { id: account.id },
        create: { id: account.id, code: account.code || account.id, name: account.name, type: account.type || 'asset' },
        update: { name: account.name, type: account.type || 'asset' },
      });
    }
    for (const entry of plan.finance?.entries || []) {
      await tx.cashbookEntry.upsert({
        where: { id: entry.id },
        create: {
          id: entry.id,
          type: entry.type,
          accountId: entry.accountId || null,
          category: entry.category || '',
          description: entry.description || '',
          amount: entry.amount,
          reference: entry.reference || '',
          date: entry.date || '',
          createdAt: entry.createdAt || '',
        },
        update: { amount: entry.amount, description: entry.description || '' },
      });
    }

    for (const doc of plan.documents?.rows || []) {
      await tx.document.upsert({
        where: { id: doc.id },
        create: {
          id: doc.id,
          type: doc.type,
          number: doc.number,
          status: doc.status,
          issueDate: doc.issueDate,
          dueDate: doc.dueDate,
          orderId: doc.orderId,
          sourceType: doc.sourceType,
          sourceId: doc.sourceId,
          originalDocumentId: doc.originalDocumentId,
          originalDocumentNo: doc.originalDocumentNo,
          customerName: doc.customerName,
          supplierName: doc.supplierName,
          store: doc.store,
          currency: doc.currency,
          payload: doc.payload,
        },
        update: { status: doc.status, payload: doc.payload },
      });
    }
    for (const [key, next] of Object.entries(plan.documents?.sequences || {})) {
      const [prefix, year] = String(key).split('-');
      await tx.documentSequence.upsert({
        where: { id: key },
        create: { id: key, prefix: prefix || key, year: year || '', next: Number(next) || 1 },
        update: { next: Number(next) || 1 },
      });
    }
    for (const [key, entityId] of Object.entries(plan.documents?.idempotency || {})) {
      await tx.idempotencyKey.upsert({
        where: { key },
        create: { key, entity: 'document', entityId: String(entityId) },
        update: { entityId: String(entityId) },
      });
    }

    if (plan.courier?.settings) {
      await tx.courierSettings.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          returnOverdueDays: Number(plan.courier.settings.return_overdue_days || 7),
          staleTrackingDays: Number(plan.courier.settings.stale_tracking_days || 5),
          settlementOverdueDays: Number(plan.courier.settings.settlement_overdue_days || 14),
          payload: plan.courier.settings,
        },
        update: { payload: plan.courier.settings },
      });
    }
    for (const event of plan.courier?.events || []) {
      await tx.courierEvent.upsert({
        where: { sourceKey: event.sourceKey },
        create: event,
        update: { status: event.status, location: event.location },
      });
    }
    for (const receipt of plan.courier?.receipts || []) {
      await tx.courierReceipt.upsert({
        where: { sourceKey: receipt.sourceKey },
        create: receipt,
        update: { payload: receipt.payload },
      });
    }

    await tx.jsonSnapshot.upsert({
      where: { id: 'ad_spend' },
      create: { id: 'ad_spend', kind: 'ad_spend', payload: plan.adSpend || {} },
      update: { payload: plan.adSpend || {} },
    });
    await tx.jsonSnapshot.upsert({
      where: { id: 'mnp_payout' },
      create: { id: 'mnp_payout', kind: 'mnp_payout', payload: plan.mnpPayout || [] },
      update: { payload: plan.mnpPayout || [] },
    });
    await tx.jsonSnapshot.upsert({
      where: { id: 'weekly_reports' },
      create: { id: 'weekly_reports', kind: 'weekly', payload: plan.weekly || [] },
      update: { payload: plan.weekly || [] },
    });

    for (const bom of plan.manufacturing?.boms || []) {
      await tx.bom.upsert({
        where: { id: bom.id },
        create: {
          id: bom.id,
          code: bom.code,
          name: bom.name || '',
          finishedSku: bom.finished_sku,
          outputQty: bom.output_qty || 1,
          outputUom: bom.output_uom || 'pcs',
          revision: bom.revision || 1,
          lines: {
            create: (bom.components || []).map((line) => ({
              componentSku: line.sku,
              quantity: line.qty,
              uom: line.uom || 'pcs',
              lineRole: line.role || 'RAW',
              expectedWastagePct: line.expected_wastage_pct || 0,
            })),
          },
        },
        update: { name: bom.name || '' },
      });
    }
  });
}

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  return { apply };
}

export function assertApplyAllowed(profile, plan, env = process.env) {
  if (profile.source === 'demo' && profile.target === 'production-snapshot') {
    throw new Error('Demo dataset cannot apply to a production-snapshot.');
  }
  if (env.CONFIRM_JSON_IMPORT !== 'YES') {
    throw new Error('Refusing --apply without CONFIRM_JSON_IMPORT=YES');
  }
  if (profile.target === 'production-snapshot' && !manifestIsApproved(loadSkuManifest())) {
    throw new Error('Refusing production-snapshot apply until SKU mapping manifest is approved.');
  }
  if (profile.source === 'live') {
    throw new Error('Live dataset apply is not authorized in this phase.');
  }
  const dbUrl = String(env.DATABASE_URL || '');
  if (/render\.com|neon\.tech|amazonaws\.com/i.test(dbUrl)) {
    throw new Error('Refusing apply against a hosted production-looking DATABASE_URL.');
  }
  if (plan.blockingErrors) {
    throw new Error(`Refusing to apply: ${plan.blockingErrors} blocking mapping error(s)`);
  }
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const profile = resolveImportProfile(process.env);
  if (!profile.ok) {
    throw new Error(profile.error);
  }

  const skuManifest = loadSkuManifest();
  const demoUntyped = profile.source === 'demo' && String(process.env.TEKH_IMPORT_ALLOW_LEGACY_UNTYPED || '') === 'YES';
  const data = loadSourceData(profile.files);
  const plan = buildImportPlan(data, {
    sourceProfile: describeProfile(profile),
    skuManifest,
    applyApprovedSkuMap: manifestIsApproved(skuManifest),
    legacyUntypedPolicy: demoUntyped ? 'FINISHED_GOOD' : skuManifest.legacy_untyped_item_type_policy?.when_item_type_missing,
    legacyUntypedApproved: demoUntyped || (
      skuManifest.legacy_untyped_item_type_policy?.approval_status === 'approved'
      && skuManifest.legacy_untyped_item_type_policy?.allow_on_production_import
    ),
  });
  const summary = {
    ...summarizePlan(plan),
    applyRequested: apply,
    message: 'JSON files were not modified. Application source of truth remains JSON.',
  };

  const outPath = path.join(__dirname, '../../../backups/last-json-import-plan.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf-8');

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Plan written to ${outPath}`);

  if (!apply) {
    console.log('Dry run only. No PostgreSQL writes. Source of truth is still JSON.');
    return;
  }

  assertApplyAllowed(profile, plan, process.env);
  if (!isDatabaseConfigured()) {
    throw new Error('DATABASE_URL is not set');
  }

  await applyImport(plan);
  console.log('Snapshot imported into PostgreSQL. Application services still use JSON until cutover.');
  await disconnectPrisma();
}

const invoked = process.argv[1] && path.normalize(process.argv[1]).includes('migrateFromJson.js');
if (invoked) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

export { applyImport };
