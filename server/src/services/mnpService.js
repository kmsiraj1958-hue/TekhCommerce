import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { loadJson, saveJson, ensureDir } from '../utils/storage.js';
import {
  cleanConsignment, safeNumber, mnpStatusToOrderStatus, pick, toYyyyMmDd, nowStamp, parseDatePrefix,
} from '../utils/helpers.js';
import * as orderService from './orderService.js';

export function readXlsxFirstSheet(filepath) {
  const wb = XLSX.readFile(filepath, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows;
}

function mnpCredentials(store) {
  const s = (store || '').toLowerCase();
  if (s === 'sns') return { user: config.mnpUserSns, pass: config.mnpPassSns };
  return { user: config.mnpUserVogue, pass: config.mnpPassVogue };
}

export async function fetchFinalStatus(store, trackingNumber) {
  if (config.demoMode) {
    return { isSuccess: 'false', message: 'Development data: external courier requests are disabled' };
  }
  const { user, pass } = mnpCredentials(store);
  const consignment = cleanConsignment(trackingNumber);
  if (!user || !pass || !consignment) return { isSuccess: 'false', message: 'Missing credentials or tracking number' };

  const url = new URL(`${config.mnpBase}/api/Tracking/Consignment_Tracking_Status_Final`);
  url.searchParams.set('Username', user);
  url.searchParams.set('password', pass);
  url.searchParams.set('consignment', consignment);

  const res = await fetch(url);
  return res.json();
}

function isDelivered(status) {
  return (status || '').toLowerCase().includes('deliver');
}

function isReturned(status) {
  const t = (status || '').toLowerCase();
  return t.includes('return') || t.includes('rts') || t.includes('undeliver');
}

export async function syncOrdersWithMnp() {
  const orders = orderService.loadOrders();
  let updated = 0;

  for (const o of orders) {
    const store = (o.store || '').toLowerCase();
    if (!['sns', 'vogue'].includes(store)) continue;
    const tracking = cleanConsignment(o.tracking_number || '');
    if (!tracking || ['Delivered', 'Returned'].includes(o.status)) continue;

    const resp = await fetchFinalStatus(store, tracking);
    if (String(resp.isSuccess || '').toLowerCase() !== 'true') continue;

    const status = resp.Status || '';
    const dt = resp.DateTime || nowStamp();
    o.mnp_status = status;
    if (isDelivered(status)) {
      const result = orderService.applyStatusToOrder(o, 'Delivered', {
        sendWhatsapp: true,
        stamps: { delivered_at: dt },
      });
      if (result.statusChanged) updated += 1;
    } else if (isReturned(status)) {
      const result = orderService.applyStatusToOrder(o, 'Returned', {
        sendWhatsapp: true,
        stamps: { returned_at: dt },
      });
      if (result.statusChanged) updated += 1;
    }
  }

  if (updated) orderService.saveOrders(orders);
  return updated;
}

const CONSIGNMENT_KEYS = ['Consignment Number', 'Consignment (Tracking No)', 'Consignment', 'Consignment (Tracking No.)'];
const STATUS_KEYS = ['Status'];
const COD_KEYS = ['COD Amount', 'COD'];
const DELIVERY_KEYS = ['Delivery Date', 'Delivery date', 'Delivery Date '];
const PAYMENT_KEYS = ['Payment Id', 'Payment ID', 'Payment Id '];
const ATTEMPTS_KEYS = ['Attempts'];
const CONSIGNEE_KEYS = ['Consignee'];
const PHONE_KEYS = ['Consignee Phone No', 'Consignee Phone. No.', 'Consignee Phone No.', 'Consignee Phone'];

export function importDailyXlsx(store, filepath, filename) {
  const rows = readXlsxFirstSheet(filepath);
  const logs = loadJson(config.files.mnpDaily, []);
  const importId = uuidv4();
  const savedName = `${store}_DAILY_${importId}_${filename}`;

  ensureDir(config.files.uploads);
  fs.copyFileSync(filepath, path.join(config.files.uploads, savedName));

  logs.push({
    id: importId,
    type: 'daily',
    store,
    filename,
    saved_name: savedName,
    imported_at: nowStamp(),
    rows_count: rows.length,
  });
  saveJson(config.files.mnpDaily, logs);

  const orders = orderService.loadOrders();
  let updated = 0;

  for (const r of rows) {
    const consignment = cleanConsignment(String(pick(r, CONSIGNMENT_KEYS) || ''));
    if (!consignment) continue;

    const mnpStatus = String(pick(r, STATUS_KEYS) || '').trim();
    const mapped = mnpStatusToOrderStatus(mnpStatus);
    const codAmount = safeNumber(pick(r, COD_KEYS));
    const deliveryDate = pick(r, DELIVERY_KEYS);
    const paymentId = pick(r, PAYMENT_KEYS);
    const attempts = pick(r, ATTEMPTS_KEYS);
    const consignee = pick(r, CONSIGNEE_KEYS);
    const consigneePhone = pick(r, PHONE_KEYS);

    for (const o of orders) {
      if ((o.store || '').toUpperCase() !== store) continue;
      if (cleanConsignment(o.tracking_number || '') !== consignment) continue;

      o.mnp_status = mnpStatus;
      o.mnp_cod_amount = codAmount;
      o.mnp_delivery_date = deliveryDate ? String(deliveryDate) : '';
      o.mnp_payment_id = paymentId ? String(paymentId) : '';
      o.mnp_attempts = attempts != null ? String(attempts) : '';
      if (consignee && !(o.customer_name || '').trim()) o.customer_name = String(consignee);
      if (consigneePhone && !(o.customer_phone || '').trim()) o.customer_phone = String(consigneePhone);

      if (['Delivered', 'Returned'].includes(mapped)) {
        const stamp = deliveryDate ? String(deliveryDate) : nowStamp();
        orderService.applyStatusToOrder(o, mapped, {
          sendWhatsapp: true,
          stamps: mapped === 'Delivered' ? { delivered_at: stamp } : { returned_at: stamp },
        });
      }
      updated += 1;
      break;
    }
  }

  orderService.saveOrders(orders);
  return { updated, rows: rows.length, importId };
}

export function importPayoutXlsx(store, filepath, filename) {
  const rows = readXlsxFirstSheet(filepath);
  const payouts = loadJson(config.files.mnpPayout, []);
  const importId = uuidv4();

  for (const r of rows) {
    payouts.push({
      import_id: importId,
      store,
      filename,
      imported_at: nowStamp(),
      'Payment ID': String(r['Payment ID'] || ''),
      'Paid On': String(r['Paid On'] || r['Paid on.'] || ''),
      'RR Amount': safeNumber(r['RR Amount']),
      'Invoice Amount': safeNumber(r['Invoice Amount'] || r['Ivoice Amount']),
      'IBFT Fee': safeNumber(r['IBFT Fee']),
      'Tax Amount': safeNumber(r['Tax Amount']),
      'Net Payable': safeNumber(r['Net Payable']),
      'Instrument Mode': String(r['Instrument Mode'] || ''),
      'Instrument Number': String(r['Instrument Number'] || ''),
    });
  }

  saveJson(config.files.mnpPayout, payouts);
  return { rows: rows.length, importId };
}

export function loadPayoutRows() {
  return loadJson(config.files.mnpPayout, []);
}

export function cleanupPayouts() {
  const payouts = loadPayoutRows();
  const cleaned = [];
  const seen = new Set();
  let removed = 0;

  for (const p of payouts) {
    const store = String(p.store || '').toUpperCase().trim();
    const paidOn = String(p['Paid On'] || '').trim();
    const paymentId = String(p['Payment ID'] || '').trim();
    const instrumentNo = String(p['Instrument Number'] || '').trim();
    const rr = safeNumber(p['RR Amount']);
    const tax = safeNumber(p['Tax Amount']);
    const net = safeNumber(p['Net Payable']);

    if (!paymentId && !paidOn && rr === 0 && tax === 0 && net === 0) {
      removed += 1;
      continue;
    }
    const key = `${store}|${paidOn}|${paymentId}|${instrumentNo}`;
    if (seen.has(key)) {
      removed += 1;
      continue;
    }
    seen.add(key);
    cleaned.push(p);
  }

  saveJson(config.files.mnpPayout, cleaned);
  return removed;
}

export function autoImportReports() {
  ensureDir(config.files.autoReports);
  ensureDir(config.files.archive);

  let importedPayoutRows = 0;
  let movedFiles = 0;
  const files = fs.readdirSync(config.files.autoReports);

  for (const f of files) {
    if (!f.toLowerCase().endsWith('.xlsx')) continue;
    const filePath = path.join(config.files.autoReports, f);
    const name = f.toLowerCase();
    let handled = false;

    if (name.includes('payout') || name.includes('settlement') || name.includes('weekly') || name.includes('paymentinstrument')) {
      const store = name.includes('sns') ? 'SNS' : 'VOGUE';
      const result = importPayoutXlsx(store, filePath, f);
      importedPayoutRows += result.rows;
      handled = true;
    }

    if (handled) {
      const archiveName = `${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}_${f}`;
      fs.renameSync(filePath, path.join(config.files.archive, archiveName));
      movedFiles += 1;
    }
  }

  return { imported_payout_rows: importedPayoutRows, moved_files: movedFiles };
}

export function getCourierBalance({ storeFilter = '', fromDate = '', toDate = '' } = {}) {
  const payouts = loadPayoutRows();
  const filtered = [];
  let totalCod = 0;
  let courierCharges = 0;
  let returnCharges = 0;
  let withholdingTax = 0;
  let bankPaid = 0;

  for (const p of payouts) {
    const store = (p.store || '').toUpperCase();
    const paidOn = parseDatePrefix(String(p['Paid On'] || ''));
    if (storeFilter && store !== storeFilter) continue;
    if (fromDate && paidOn && paidOn < fromDate) continue;
    if (toDate && paidOn && paidOn > toDate) continue;

    const codAmount = safeNumber(p['RR Amount']);
    const charges = safeNumber(p['Invoice Amount']);
    const tax = safeNumber(p['Tax Amount']);
    const paid = safeNumber(p['Net Payable']);
    const retCharge = safeNumber(p['Return Charges'] || 0);
    const expectedNet = codAmount - charges - retCharge - tax;

    filtered.push({
      store,
      paid_on: p['Paid On'] || '',
      payment_id: p['Payment ID'] || '',
      cod_amount: Math.round(codAmount * 100) / 100,
      courier_charges: Math.round(charges * 100) / 100,
      return_charges: Math.round(retCharge * 100) / 100,
      withholding_tax: Math.round(tax * 100) / 100,
      expected_net: Math.round(expectedNet * 100) / 100,
      bank_paid: Math.round(paid * 100) / 100,
      difference: Math.round((expectedNet - paid) * 100) / 100,
      instrument_number: p['Instrument Number'] || '',
    });

    totalCod += codAmount;
    courierCharges += charges;
    returnCharges += retCharge;
    withholdingTax += tax;
    bankPaid += paid;
  }

  const expectedTotal = totalCod - courierCharges - returnCharges - withholdingTax;
  return {
    rows: filtered.reverse(),
    summary: {
      total_cod: Math.round(totalCod * 100) / 100,
      courier_charges: Math.round(courierCharges * 100) / 100,
      return_charges: Math.round(returnCharges * 100) / 100,
      withholding_tax: Math.round(withholdingTax * 100) / 100,
      expected_net: Math.round(expectedTotal * 100) / 100,
      bank_paid: Math.round(bankPaid * 100) / 100,
      difference: Math.round((expectedTotal - bankPaid) * 100) / 100,
    },
  };
}
