import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import {
  parseDemoMode,
  useDevelopmentDataset,
  resolveDataProfile,
  assertStartupDataProfile,
  resolveDataFiles,
  isProtectedLiveFile,
  isInsideDemoDir,
  demoDir,
} from './paths.js';
import { saveJson } from '../utils/storage.js';
import { useDevelopmentData } from '../config.js';

const baseDir = path.resolve('C:/app');
const serverDir = path.resolve('C:/app/server');

test('USE_LIVE_JSON parse helper defaults off', () => {
  assert.equal(parseDemoMode(undefined), false);
  assert.equal(parseDemoMode('true'), true);
});

test('local non-production uses demo dataset; production uses live JSON', () => {
  assert.equal(useDevelopmentDataset({ nodeEnv: undefined, tekhData: 'demo' }), true);
  assert.equal(useDevelopmentDataset({ nodeEnv: 'development', tekhData: 'demo' }), true);
  assert.equal(useDevelopmentDataset({ nodeEnv: 'production', tekhData: 'live' }), false);
  assert.equal(useDevelopmentDataset({ nodeEnv: 'development', useLiveJson: 'true' }), false);
});

test('production plus demo is a hard conflict', () => {
  const conflict = resolveDataProfile({ nodeEnv: 'production', tekhData: 'demo' });
  assert.equal(conflict.ok, false);
  assert.match(conflict.error, /cannot use the demo dataset/);
});

test('public demo stays on synthetic data and refuses live JSON', () => {
  const hosted = resolveDataProfile({
    nodeEnv: 'production',
    tekhData: 'demo',
    publicDemo: 'yes',
  });
  assert.equal(hosted.ok, true);
  assert.equal(hosted.profile, 'demo');
  assert.equal(hosted.publicDemo, true);
  assert.doesNotThrow(() => assertStartupDataProfile(hosted, {
    nodeEnv: 'production',
    tekhData: 'demo',
    publicDemo: 'yes',
  }));

  const live = resolveDataProfile({
    nodeEnv: 'production',
    tekhData: 'live',
    publicDemo: 'yes',
  });
  assert.equal(live.ok, false);
  assert.match(live.error, /cannot use live business data/);

  const escape = resolveDataProfile({
    nodeEnv: 'production',
    tekhData: 'demo',
    publicDemo: 'yes',
    useLiveJson: 'true',
  });
  assert.equal(escape.ok, false);
});

test('bare process without NODE_ENV or TEKH_DATA is ambiguous at startup', () => {
  const decision = resolveDataProfile({ nodeEnv: undefined, tekhData: undefined });
  assert.equal(decision.ok, true);
  assert.equal(decision.profile, 'demo');
  assert.throws(
    () => assertStartupDataProfile(decision, { nodeEnv: undefined, tekhData: undefined }),
    /ambiguous/,
  );
});

test('production start requires explicit TEKH_DATA=live', () => {
  const decision = resolveDataProfile({ nodeEnv: 'production' });
  assert.equal(decision.ok, true);
  assert.equal(decision.profile, 'live');
  assert.throws(
    () => assertStartupDataProfile(decision, { nodeEnv: 'production', tekhData: undefined }),
    /TEKH_DATA=live/,
  );
  assert.doesNotThrow(() => assertStartupDataProfile(decision, { nodeEnv: 'production', tekhData: 'live' }));
});

test('demo files resolve under server/data/demo not project root', () => {
  const live = resolveDataFiles({ demoMode: false, baseDir, serverDir });
  const demo = resolveDataFiles({ demoMode: true, baseDir, serverDir });
  assert.equal(live.products, path.join(baseDir, 'products.json'));
  assert.ok(demo.products.startsWith(demoDir(serverDir)));
  assert.match(demo.products.replace(/\\/g, '/'), /server\/data\/demo/);
  assert.notEqual(live.products, demo.products);
  assert.notEqual(live.finance, demo.finance);
  assert.match(demo.documents.replace(/\\/g, '/'), /server\/data\/demo\/documents\.json/);
  assert.match(demo.manufacturing.replace(/\\/g, '/'), /server\/data\/demo\/manufacturing\.json/);
  assert.match(live.documents.replace(/\\/g, '/'), /server\/data\/documents\.json/);
  assert.equal(isInsideDemoDir(demo.orders, serverDir), true);
  assert.equal(isProtectedLiveFile(live.orders, { baseDir, serverDir }), true);
  assert.equal(isProtectedLiveFile(demo.orders, { baseDir, serverDir }), false);
});

test('saveJson refuses live products.json while using the demo profile', { skip: !useDevelopmentData }, () => {
  const liveProducts = path.resolve(process.cwd(), '../products.json');
  assert.throws(() => saveJson(liveProducts, []), /refused to write live business file/);
});
