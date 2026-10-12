import { PrismaClient } from '@prisma/client';
import { buildImportPlan, summarizePlan } from './jsonMap.js';
import { applyImport, loadSourceData, planStockApply } from './migrateFromJson.js';
import { guardRehearsalImport, loadRehearsalEnv, sanitizeDatabaseMessage } from './rehearsalGuard.js';
import { describeProfile, resolveImportProfile } from './sourceProfile.js';

export async function runRehearsal({ prisma, queryIdentity, env = process.env } = {}) {
  await guardRehearsalImport(env, { queryIdentity });
  const profile = resolveImportProfile(env);
  if (!profile.ok) throw new Error(profile.error);
  const data = loadSourceData(profile.files);
  const plan = buildImportPlan(data, {
    sourceProfile: describeProfile(profile),
    legacyUntypedPolicy: 'FINISHED_GOOD',
    legacyUntypedApproved: env.TEKH_IMPORT_ALLOW_LEGACY_UNTYPED === 'YES',
  });
  const summary = summarizePlan(plan);
  if (plan.blockingErrors) {
    return { ok: false, phase: 'map', summary };
  }
  const ownsClient = !prisma;
  const client = prisma || new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  try {
    await applyImport(plan, { prisma: client });
    const first = {
      products: await client.product.count(),
      orders: await client.order.count(),
      movements: await client.stockMovement.count(),
      documents: await client.document.count(),
      cashEntries: await client.cashbookEntry.count(),
      courierEvents: await client.courierEvent.count(),
    };
    await applyImport(plan, { prisma: client });
    const second = {
      products: await client.product.count(),
      orders: await client.order.count(),
      movements: await client.stockMovement.count(),
      documents: await client.document.count(),
    };
    const existing = await client.stockMovement.findMany({ select: { sourceKey: true, sku: true, qty: true, type: true, storeCode: true, note: true, ref: true, occurredAt: true } });
    const merge = planStockApply(existing.map((row) => ({
      ...row,
      qty: Number(row.qty),
      productionId: '',
      occurredAt: row.occurredAt,
    })), plan.stockMovements);
    const value = (await client.product.findMany()).reduce((sum, row) => sum + Number(row.openingStock) * Number(row.cost), 0);
    return {
      ok: first.movements === second.movements && merge.toCreate.length === 0,
      sourceOfTruth: 'json',
      cutover: false,
      summary,
      first,
      second,
      stockValueFromOpeningTimesCost: Math.round(value * 100) / 100,
      repeatCreates: merge.toCreate.length,
    };
  } finally {
    if (ownsClient) await client.$disconnect().catch(() => {});
  }
}

const invoked = process.argv[1] && process.argv[1].includes('rehearseImport.js');
if (invoked) {
  loadRehearsalEnv();
  runRehearsal().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  }).catch((err) => {
    console.error(sanitizeDatabaseMessage(err));
    process.exit(1);
  });
}
