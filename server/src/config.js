import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { resolveDataFiles, resolveDataProfile } from './demo/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const BASE_DIR = path.resolve(__dirname, '../..');
export const SERVER_DIR = path.resolve(__dirname, '..');

const dataDecision = resolveDataProfile({
  nodeEnv: process.env.NODE_ENV,
  tekhData: process.env.TEKH_DATA,
  useLiveJson: process.env.USE_LIVE_JSON,
  publicDemo: process.env.TEKH_PUBLIC_DEMO,
});
if (!dataDecision.ok) {
  throw new Error(dataDecision.error);
}

const PUBLIC_DEMO_SECRET_KEYS = [
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'SHOPIFY_SECRET_VOGUE',
  'SHOPIFY_SECRET_SNS',
  'MNP_USER_VOGUE',
  'MNP_PASS_VOGUE',
  'MNP_USER_SNS',
  'MNP_PASS_SNS',
  'VENDOR_LICENSE_SECRET',
  'DATABASE_URL',
];

if (dataDecision.publicDemo) {
  const adminUser = String(process.env.ADMIN_USER || '').trim();
  const adminPass = String(process.env.ADMIN_PASS || '');
  const jwtSecret = String(process.env.JWT_SECRET || '');
  if (!adminUser || !adminPass || !jwtSecret) {
    throw new Error('Public demo requires ADMIN_USER, ADMIN_PASS, and JWT_SECRET. Refusing default credentials.');
  }
  if (adminPass === '1234' || jwtSecret === 'change-me-in-production') {
    throw new Error('Public demo refused default ADMIN_PASS or JWT_SECRET.');
  }
  for (const key of PUBLIC_DEMO_SECRET_KEYS) delete process.env[key];
}
export const useDevelopmentData = dataDecision.useDemo;
/** Alias used by existing integration guards (no UI switch). */
export const demoMode = useDevelopmentData;

export const config = {
  /** Canonical persistence until a verified JSON→Postgres cutover (Phase 2+). */
  sourceOfTruth: 'json',
  canonicalStack: 'react-express',
  useDevelopmentData,
  demoMode,
  publicDemo: Boolean(dataDecision.publicDemo),
  databaseUrl: process.env.DATABASE_URL || '',
  port: Number(process.env.PORT) || 5010,
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  adminUser: process.env.ADMIN_USER || 'kmsiraj',
  adminPass: process.env.ADMIN_PASS || '1234',
  whatsappNumber: process.env.WHATSAPP_NUMBER || '923284270904',
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  whatsappApiVersion: process.env.WHATSAPP_API_VERSION || 'v23.0',
  shopifySecretVogue: process.env.SHOPIFY_SECRET_VOGUE || '',
  shopifySecretSns: process.env.SHOPIFY_SECRET_SNS || '',
  mnpUserVogue: configSafeCred('MNP_USER_VOGUE'),
  mnpPassVogue: configSafeCred('MNP_PASS_VOGUE'),
  mnpUserSns: configSafeCred('MNP_USER_SNS'),
  mnpPassSns: configSafeCred('MNP_PASS_SNS'),
  mnpBase: 'https://mnpcourier.com/mycodapi',
  files: resolveDataFiles({ demoMode: useDevelopmentData, baseDir: BASE_DIR, serverDir: SERVER_DIR }),
  dataProfile: dataDecision.profile,
};

function configSafeCred(name) {
  return process.env[name] || '';
}
