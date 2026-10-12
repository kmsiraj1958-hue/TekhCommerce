import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertRehearsalPreflight, loadRehearsalEnv, sanitizeDatabaseMessage } from './rehearsalGuard.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function prismaCliPath(dir = serverDir) {
  return path.join(dir, 'node_modules', 'prisma', 'build', 'index.js');
}

export function runPrismaMigrateDeploy(env = process.env) {
  const cli = prismaCliPath();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'migrate', 'deploy'], {
      cwd: serverDir,
      env,
      stdio: 'inherit',
    });
    child.on('error', (err) => {
      reject(new Error(sanitizeDatabaseMessage(err)));
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`prisma migrate deploy exited with code ${code ?? 'null'}`));
    });
  });
}

export async function runGuardedRehearsalMigrate({
  env = process.env,
  queryIdentity,
  spawnMigrate,
} = {}) {
  await assertRehearsalPreflight(env, { queryIdentity });
  if (spawnMigrate) {
    await spawnMigrate();
    return;
  }
  await runPrismaMigrateDeploy(env);
}

const invoked = process.argv[1] && process.argv[1].includes('rehearsalMigrate.js');
if (invoked) {
  loadRehearsalEnv();
  runGuardedRehearsalMigrate().catch((err) => {
    console.error(sanitizeDatabaseMessage(err));
    process.exit(1);
  });
}
