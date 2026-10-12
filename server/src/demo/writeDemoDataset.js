import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { demoDir, isInsideDemoDir } from './paths.js';
import { buildDemoDataset } from './buildDemoDataset.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, '../..');

function write(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf-8');
}

export function writeDemoDataset({ force = false, serverDir = SERVER_DIR } = {}) {
  const dir = demoDir(serverDir);
  if (!isInsideDemoDir(path.join(dir, 'orders.json'), serverDir)) {
    throw new Error('Refusing to write demo dataset outside server/data/demo');
  }
  fs.mkdirSync(path.join(dir, 'uploads', 'auto_reports'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'uploads', 'archive'), { recursive: true });
  const marker = path.join(dir, 'products.json');
  if (!force && fs.existsSync(marker)) {
    return { dir, wrote: false, reason: 'already exists' };
  }
  const data = buildDemoDataset();
  write(path.join(dir, 'products.json'), data.products);
  write(path.join(dir, 'orders.json'), data.orders);
  write(path.join(dir, 'inventory_movements.json'), data.inventory_movements);
  write(path.join(dir, 'ad_spend.json'), data.ad_spend);
  write(path.join(dir, 'mnp_daily_reports.json'), data.mnp_daily_reports);
  write(path.join(dir, 'mnp_payout_reports.json'), data.mnp_payout_reports);
  write(path.join(dir, 'weekly_reports.json'), data.weekly_reports);
  write(path.join(dir, 'finance.json'), data.finance);
  write(path.join(dir, 'invoices.json'), data.invoices);
  write(path.join(dir, 'courier-settings.json'), data.courier_settings);
  write(path.join(dir, 'courier-return-receipts.json'), data.courier_return_receipts);
  write(path.join(dir, 'courier-event-log.json'), data.courier_event_log);
  write(path.join(dir, 'courier-weekly-snapshots.json'), data.courier_weekly_snapshots);
  write(path.join(dir, 'documents.json'), { sequences: {}, idempotency: {}, documents: [], events: [] });
  write(path.join(dir, 'manufacturing.json'), {
    settings: { allow_negative_stock: false, costing_method: 'standard_product_cost' },
    boms: [],
    production_orders: [],
    posting_log: [],
  });
  write(path.join(dir, 'merchant-profile.json'), {
    legal_name: 'TekhCommerce',
    wordmark: 'TEKHCOMMERCE',
    address: '',
    phone: '',
    email: '',
    ntn: '',
    terms: 'Internal document. Not an FBR-submitted invoice.',
  });
  write(path.join(dir, 'README.md'), '# TekhCommerce local demo dataset\n\nSynthetic sample data for `npm run dev`. Never copy these files into the project-root live JSON files. Production uses NODE_ENV=production TEKH_DATA=live.\n');
  return { dir, wrote: true, orders: data.orders.length, products: data.products.length };
}

const isMain = process.argv[1] && path.normalize(fileURLToPath(import.meta.url)) === path.normalize(process.argv[1]);
if (isMain) {
  const result = writeDemoDataset({ force: true });
  console.log(JSON.stringify(result, null, 2));
}
