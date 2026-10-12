import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import {
  REHEARSAL_IDENTITY,
  assertRehearsalImportSelection,
  assertRehearsalPreflight,
  guardRehearsalImport,
  inspectDatabaseUrl,
  sanitizeDatabaseMessage,
} from './rehearsalGuard.js';
import { runGuardedRehearsalMigrate } from './rehearsalMigrate.js';

const PASSWORD = 'test-only-password';

function databaseUrl({
  protocol = 'postgresql:',
  user = REHEARSAL_IDENTITY.user,
  password = PASSWORD,
  host = REHEARSAL_IDENTITY.host,
  port = REHEARSAL_IDENTITY.port,
  database = REHEARSAL_IDENTITY.database,
} = {}) {
  const scheme = protocol.replace(/:$/, '');
  return `${scheme}://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function env(overrides = {}, urlOverrides = {}) {
  return {
    DATABASE_URL: databaseUrl(urlOverrides),
    TEKH_IMPORT_SOURCE: 'demo',
    TEKH_IMPORT_TARGET: 'rehearsal',
    ...overrides,
  };
}

function matchingServer(overrides = {}) {
  return {
    database: REHEARSAL_IDENTITY.database,
    port: REHEARSAL_IDENTITY.port,
    user: REHEARSAL_IDENTITY.user,
    ...overrides,
  };
}

async function expectRefusal(fn, pattern) {
  try {
    await fn();
  } catch (err) {
    assert.match(err.message, pattern);
    assert.equal(err.message.includes(PASSWORD), false);
    assert.equal(/postgres(?:ql)?:\/\//i.test(err.message), false);
    return;
  }
  assert.fail('expected the rehearsal guard to refuse');
}

test('URL inspection keeps the password out of the identity', () => {
  const identity = inspectDatabaseUrl(databaseUrl());
  assert.deepEqual(identity, {
    host: '127.0.0.1',
    port: 5434,
    database: 'tekhcommerce_rehearsal',
    user: 'rehearsal',
  });
  assert.equal(Object.hasOwn(identity, 'password'), false);
  assert.equal(JSON.stringify(identity).includes(PASSWORD), false);
});

test('missing, invalid, and non-PostgreSQL URLs fail closed without echoing secrets', async () => {
  await expectRefusal(
    () => assertRehearsalPreflight({ DATABASE_URL: '' }, { queryIdentity: async () => { throw new Error('should not connect'); } }),
    /DATABASE_URL is missing/,
  );
  await expectRefusal(
    () => assertRehearsalPreflight({ DATABASE_URL: `not-a-url ${PASSWORD}` }),
    /not a valid URL/,
  );
  await expectRefusal(
    () => assertRehearsalPreflight({ DATABASE_URL: `mysql://rehearsal:${PASSWORD}@127.0.0.1:5434/tekhcommerce_rehearsal` }),
    /not a PostgreSQL URL/,
  );
});

test('wrong host, port, database, and user in the URL do not connect', async () => {
  const cases = [
    { url: { host: 'localhost' }, pattern: /DATABASE_URL host is "localhost"/ },
    { url: { host: '203.0.113.50' }, pattern: /DATABASE_URL host is "203.0.113.50"/ },
    { url: { host: '[::1]' }, pattern: /DATABASE_URL host/ },
    { url: { port: 5432 }, pattern: /DATABASE_URL port is 5432/ },
    { url: { port: 5433 }, pattern: /DATABASE_URL port is 5433/ },
    { url: { database: 'tekhshopify' }, pattern: /DATABASE_URL database is "tekhshopify"/ },
    { url: { database: 'postgres' }, pattern: /DATABASE_URL database is "postgres"/ },
    { url: { user: 'postgres' }, pattern: /DATABASE_URL user is "postgres"/ },
  ];
  for (const item of cases) {
    let called = 0;
    await expectRefusal(
      () => assertRehearsalPreflight(env({}, item.url), {
        queryIdentity: async () => {
          called += 1;
          return matchingServer();
        },
      }),
      item.pattern,
    );
    assert.equal(called, 0, JSON.stringify(item.url));
  }
});

test('omitted URL port is treated as PostgreSQL default 5432 and refused', async () => {
  let called = 0;
  const url = `postgresql://rehearsal:${PASSWORD}@127.0.0.1/tekhcommerce_rehearsal`;
  await expectRefusal(
    () => assertRehearsalPreflight({ DATABASE_URL: url }, {
      queryIdentity: async () => {
        called += 1;
        return matchingServer();
      },
    }),
    /port is 5432/,
  );
  assert.equal(called, 0);
});

test('connected server identity must match database, port, and user', async () => {
  const cases = [
    { server: { database: 'postgres' }, pattern: /connected server database is "postgres"/ },
    { server: { port: 5432 }, pattern: /connected server port is 5432/ },
    { server: { user: 'postgres' }, pattern: /connected server user is "postgres"/ },
    {
      server: { database: 'tekhshopify', port: 5433, user: 'tekhshopify' },
      pattern: /connected server database is "tekhshopify".*port is 5433.*user is "tekhshopify"/,
    },
  ];
  for (const item of cases) {
    let called = 0;
    await expectRefusal(
      () => assertRehearsalPreflight(env(), {
        queryIdentity: async () => {
          called += 1;
          return matchingServer(item.server);
        },
      }),
      item.pattern,
    );
    assert.equal(called, 1);
  }
});

test('server port returned as bigint is compared numerically', async () => {
  await expectRefusal(
    () => assertRehearsalPreflight(env(), {
      queryIdentity: async () => ({ database: 'tekhcommerce_rehearsal', port: 5432n, db_user: 'rehearsal' }),
    }),
    /connected server port is 5432/,
  );
  const result = await assertRehearsalPreflight(env(), {
    queryIdentity: async () => ({ database: 'tekhcommerce_rehearsal', port: 5434n, db_user: 'rehearsal' }),
  });
  assert.equal(result.server.port, 5434);
  assert.equal(JSON.stringify(result).includes(PASSWORD), false);
});

test('connection failures fail closed and redact passwords', async () => {
  const leaked = `Can't reach postgresql://rehearsal:${PASSWORD}@203.0.113.50:5432/postgres`;
  await expectRefusal(
    () => assertRehearsalPreflight(env(), {
      queryIdentity: async () => {
        throw new Error(leaked);
      },
    }),
    /database connection failed/,
  );
  assert.equal(sanitizeDatabaseMessage(new Error('ECONNREFUSED 127.0.0.1:5434')), 'ECONNREFUSED 127.0.0.1:5434');
  assert.equal(sanitizeDatabaseMessage(leaked).includes(PASSWORD), false);
});

test('empty identity row and unexpected source or target are refused before connect', async () => {
  await expectRefusal(
    () => assertRehearsalPreflight(env(), { queryIdentity: async () => null }),
    /did not return an identity row/,
  );
  const selections = [
    { TEKH_IMPORT_SOURCE: '', TEKH_IMPORT_TARGET: 'rehearsal' },
    { TEKH_IMPORT_SOURCE: 'live', TEKH_IMPORT_TARGET: 'rehearsal' },
    { TEKH_IMPORT_SOURCE: 'demo', TEKH_IMPORT_TARGET: 'production-snapshot' },
    { TEKH_IMPORT_SOURCE: 'demo', TEKH_IMPORT_TARGET: '' },
    { TEKH_IMPORT_SOURCE: 'other', TEKH_IMPORT_TARGET: 'other' },
  ];
  for (const selection of selections) {
    let called = 0;
    await expectRefusal(
      () => guardRehearsalImport(env(selection), {
        queryIdentity: async () => {
          called += 1;
          return matchingServer();
        },
      }),
      /TEKH_IMPORT_SOURCE=demo and TEKH_IMPORT_TARGET=rehearsal/,
    );
    assert.equal(called, 0, JSON.stringify(selection));
  }
  assert.doesNotThrow(() => assertRehearsalImportSelection(env({
    TEKH_IMPORT_SOURCE: ' Demo ',
    TEKH_IMPORT_TARGET: 'Rehearsal',
  })));
});

test('import guard reaches the server check only after demo/rehearsal is selected', async () => {
  const calls = [];
  await guardRehearsalImport(env(), {
    queryIdentity: async () => {
      calls.push('query');
      return matchingServer();
    },
  });
  assert.deepEqual(calls, ['query']);
});

test('guarded migrate does not spawn Prisma unless the identity check passes', async () => {
  let spawned = 0;
  await expectRefusal(
    () => runGuardedRehearsalMigrate({
      env: env({}, { database: 'postgres' }),
      queryIdentity: async () => {
        throw new Error('should not connect');
      },
      spawnMigrate: async () => {
        spawned += 1;
      },
    }),
    /DATABASE_URL database is "postgres"/,
  );
  await expectRefusal(
    () => runGuardedRehearsalMigrate({
      env: env(),
      queryIdentity: async () => matchingServer({ user: 'postgres' }),
      spawnMigrate: async () => {
        spawned += 1;
      },
    }),
    /connected server user is "postgres"/,
  );
  await expectRefusal(
    () => runGuardedRehearsalMigrate({
      env: env(),
      queryIdentity: async () => {
        throw new Error(`postgresql://rehearsal:${PASSWORD}@127.0.0.1:5434/tekhcommerce_rehearsal`);
      },
      spawnMigrate: async () => {
        spawned += 1;
      },
    }),
    /database connection failed/,
  );
  assert.equal(spawned, 0);
  const calls = [];
  await runGuardedRehearsalMigrate({
    env: env(),
    queryIdentity: async () => {
      calls.push('query');
      return matchingServer();
    },
    spawnMigrate: async () => {
      calls.push('migrate');
    },
  });
  assert.deepEqual(calls, ['query', 'migrate']);
});

test('rehearsal import and migrate commands call the guard before writes', () => {
  const importer = fs.readFileSync(new URL('./rehearseImport.js', import.meta.url), 'utf8');
  const guardAt = importer.indexOf('await guardRehearsalImport(');
  const clientAt = importer.indexOf('new PrismaClient');
  const applyAt = importer.indexOf('await applyImport(');
  assert.ok(guardAt > 0);
  assert.ok(clientAt > guardAt);
  assert.ok(applyAt > guardAt);
  const migrate = fs.readFileSync(new URL('./rehearsalMigrate.js', import.meta.url), 'utf8');
  const body = migrate.slice(migrate.indexOf('export async function runGuardedRehearsalMigrate'));
  const checkAt = body.indexOf('await assertRehearsalPreflight(');
  const deployAt = body.indexOf('await runPrismaMigrateDeploy(');
  assert.ok(checkAt > 0);
  assert.ok(deployAt > checkAt);
});

test('existing production and live-data protections stay in place', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['db:migrate'], 'prisma migrate deploy');
  assert.equal(pkg.scripts['json:import:apply'], 'node src/db/migrateFromJson.js --apply');
  assert.equal(pkg.scripts['json:import:rehearse'], 'node src/db/rehearseImport.js');
  assert.equal(pkg.scripts['db:migrate:rehearse'], 'node src/db/rehearsalMigrate.js');
  const applySource = fs.readFileSync(new URL('./migrateFromJson.js', import.meta.url), 'utf8');
  const guardStart = applySource.indexOf('export function assertApplyAllowed');
  const guardBody = applySource.slice(guardStart, applySource.indexOf('async function main'));
  assert.match(guardBody, /Live dataset apply is not authorized in this phase/);
  assert.match(guardBody, /Refusing apply against a hosted production-looking DATABASE_URL/);
  assert.match(guardBody, /render\\.com\|neon\\.tech\|amazonaws\\.com/);
  assert.match(guardBody, /CONFIRM_JSON_IMPORT/);
});

test('identity query uses current_database, inet_server_port, and current_user', () => {
  const source = fs.readFileSync(new URL('./rehearsalGuard.js', import.meta.url), 'utf8');
  assert.match(source, /current_database\(\)/);
  assert.match(source, /inet_server_port\(\)/);
  assert.match(source, /current_user/);
});
