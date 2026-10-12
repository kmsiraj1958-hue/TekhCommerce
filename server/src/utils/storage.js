import fs from 'fs';
import path from 'path';
import { BASE_DIR, SERVER_DIR, demoMode } from '../config.js';
import { isProtectedLiveFile } from '../demo/paths.js';

export function loadJson(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

export function saveJson(filePath, data) {
  if (demoMode && isProtectedLiveFile(filePath, { baseDir: BASE_DIR, serverDir: SERVER_DIR })) {
    throw new Error(`Development data profile refused to write live business file: ${path.basename(filePath)}`);
  }
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf-8');
}

export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}
