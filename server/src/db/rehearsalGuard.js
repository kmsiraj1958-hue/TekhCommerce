import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const guardDir = path.dirname(fileURLToPath(import.meta.url));

export function loadRehearsalEnv() {
  if (String(process.env.DATABASE_URL || '').trim()) return;
  delete process.env.DATABASE_URL;
  dotenv.config({ path: path.resolve(guardDir, '../../../.env') });
}

export const REHEARSAL_IDENTITY = Object.freeze({
  host: '127.0.0.1',
  port: 5434,
  database: 'tekhcommerce_rehearsal',
  user: 'rehearsal',
});

const URL_FIELDS = ['host', 'port', 'database', 'user'];
const SERVER_FIELDS = ['database', 'port', 'user'];

export class RehearsalGuardError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RehearsalGuardError';
  }
}

function formatValue(value) {
  if (value === undefined || value === null || value === '') return 'missing';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'invalid';
  const text = String(value);
  if (text.length > 80 || /[@\s/\\]/.test(text) || text.includes('://')) return 'redacted';
  return JSON.stringify(text);
}

export function sanitizeDatabaseMessage(input) {
  const text = input instanceof Error ? input.message : String(input ?? '');
  if (/postgres(?:ql)?:\/\//i.test(text) || /[a-z][a-z0-9+.-]*:\/\/\S+/i.test(text) || /:[^:@\s/]*@/.test(text)) {
    return 'Rehearsal preflight refused: database connection failed.';
  }
  return text || 'Rehearsal preflight refused: database connection failed.';
}

export function inspectDatabaseUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) {
    throw new RehearsalGuardError('Rehearsal preflight refused: DATABASE_URL is missing.');
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new RehearsalGuardError('Rehearsal preflight refused: DATABASE_URL is not a valid URL.');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new RehearsalGuardError('Rehearsal preflight refused: DATABASE_URL is not a PostgreSQL URL.');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ''));
  const port = url.port ? Number(url.port) : 5432;
  const user = decodeURIComponent(url.username);
  return {
    host: url.hostname,
    port,
    database,
    user,
  };
}

function mismatches(expected, actual, fields) {
  const problems = [];
  for (const field of fields) {
    if (actual[field] !== expected[field]) {
      problems.push(`${field} is ${formatValue(actual[field])}, expected ${formatValue(expected[field])}`);
    }
  }
  return problems;
}

export function assertUrlMatchesRehearsal(identity) {
  const problems = mismatches(REHEARSAL_IDENTITY, identity, URL_FIELDS);
  if (problems.length) {
    throw new RehearsalGuardError(`Rehearsal preflight refused: DATABASE_URL ${problems.join('; ')}.`);
  }
}

export function normalizeServerIdentity(row) {
  if (!row || typeof row !== 'object') {
    throw new RehearsalGuardError('Rehearsal preflight refused: connected server did not return an identity row.');
  }
  const database = row.database ?? row.current_database;
  const user = row.user ?? row.db_user ?? row.current_user;
  const portRaw = row.port ?? row.inet_server_port;
  const port = typeof portRaw === 'bigint' ? Number(portRaw) : Number(portRaw);
  return {
    database: database == null ? '' : String(database),
    port,
    user: user == null ? '' : String(user),
  };
}

export function assertServerMatchesRehearsal(identity) {
  const normalized = normalizeServerIdentity(identity);
  const problems = mismatches(REHEARSAL_IDENTITY, normalized, SERVER_FIELDS);
  if (problems.length) {
    throw new RehearsalGuardError(`Rehearsal preflight refused: connected server ${problems.join('; ')}.`);
  }
  return normalized;
}

export async function queryServerIdentity(databaseUrl) {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const rows = await prisma.$queryRaw`
      SELECT current_database() AS database,
             inet_server_port() AS port,
             current_user AS "db_user"
    `;
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) {
      throw new RehearsalGuardError('Rehearsal preflight refused: connected server did not return an identity row.');
    }
    return normalizeServerIdentity(row);
  } catch (err) {
    if (err instanceof RehearsalGuardError) throw err;
    throw new RehearsalGuardError(sanitizeDatabaseMessage(err));
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

export async function assertRehearsalPreflight(env = process.env, { queryIdentity } = {}) {
  const urlIdentity = inspectDatabaseUrl(env.DATABASE_URL);
  assertUrlMatchesRehearsal(urlIdentity);
  const query = queryIdentity || queryServerIdentity;
  let row;
  try {
    row = await query(env.DATABASE_URL);
  } catch (err) {
    if (err instanceof RehearsalGuardError) throw err;
    throw new RehearsalGuardError(sanitizeDatabaseMessage(err));
  }
  const serverIdentity = assertServerMatchesRehearsal(row);
  return { url: urlIdentity, server: serverIdentity };
}

export function assertRehearsalImportSelection(env = process.env) {
  const source = String(env.TEKH_IMPORT_SOURCE ?? '').trim().toLowerCase();
  const target = String(env.TEKH_IMPORT_TARGET ?? '').trim().toLowerCase();
  if (source !== 'demo' || target !== 'rehearsal') {
    throw new RehearsalGuardError(
      `Rehearsal import requires TEKH_IMPORT_SOURCE=demo and TEKH_IMPORT_TARGET=rehearsal. Received source ${formatValue(source)} and target ${formatValue(target)}.`,
    );
  }
}

export async function guardRehearsalImport(env = process.env, deps = {}) {
  assertRehearsalImportSelection(env);
  await assertRehearsalPreflight(env, deps);
}
