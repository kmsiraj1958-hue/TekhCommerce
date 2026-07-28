import { config } from '../config.js';
import { loadJson, saveJson } from '../utils/storage.js';
import { safeNumber, parseDatePrefix } from '../utils/helpers.js';
import * as orderService from './orderService.js';
import * as productService from './productService.js';
import { loadPayoutRows } from './mnpService.js';

export function loadAdSpend() {
  return loadJson(config.files.adSpend, {});
}

export function saveAdSpend(data) {
  saveJson(config.files.adSpend, data);
}

export function loadWeeklyReports() {
  return loadJson(config.files.weekly, []);
}

export function generateWeeklyReport() {
  const orders = orderService.loadOrders();
  const payouts = loadPayoutRows();
  const reports = loadWeeklyReports();

  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const start = new Date(today);
  start.setDate(today.getDate() - diff);
  const weekStart = start.toISOString().slice(0, 10);
  const weekEnd = today.toISOString().slice(0, 10);

  let totalOrders = 0;
  let deliveredOrders = 0;
  let returnedOrders = 0;
  let shippedOrders = 0;
  let totalSale = 0;
  let totalCod = 0;
  let payoutReceived = 0;

  for (const o of orders) {
    const created = parseDatePrefix(o.created_at || '');
    if (!created || created < weekStart || created > weekEnd) continue;
    totalOrders += 1;
    const status = (o.status || '').trim();
    if (status === 'Delivered') {
      deliveredOrders += 1;
      totalSale += safeNumber(o.price);
      totalCod += safeNumber(o.mnp_cod_amount);
    } else if (status === 'Returned') returnedOrders += 1;
    else if (status === 'Shipped') shippedOrders += 1;
  }

  for (const p of payouts) {
    const paidOn = parseDatePrefix(String(p['Paid On'] || ''));
    if (paidOn && paidOn >= weekStart && paidOn <= weekEnd) {
      payoutReceived += safeNumber(p['Net Payable']);
    }
  }

  const report = {
    week_start: weekStart,
    week_end: weekEnd,
    generated_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    total_orders: totalOrders,
    delivered_orders: deliveredOrders,
    returned_orders: returnedOrders,
    shipped_orders: shippedOrders,
    delivery_success_rate: totalOrders ? Math.round((deliveredOrders / totalOrders) * 10000) / 100 : 0,
    return_rate: totalOrders ? Math.round((returnedOrders / totalOrders) * 10000) / 100 : 0,
    total_sale: Math.round(totalSale * 100) / 100,
    total_cod: Math.round(totalCod * 100) / 100,
    payout_received: Math.round(payoutReceived * 100) / 100,
    balance_with_courier: Math.round((totalCod - payoutReceived) * 100) / 100,
  };

  const next = reports.filter((r) => !(r.week_start === weekStart && r.week_end === weekEnd));
  next.push(report);
  saveJson(config.files.weekly, next);
  return report;
}

export function getMasterReport({ start = '2026-02-01', end, store = '', status = '' } = {}) {
  const orders = orderService.loadOrders();
  const products = productService.loadProducts();
  const endDate = end || new Date().toISOString().slice(0, 10);

  const costMap = {};
  for (const p of products) {
    const code = (p.code || '').trim();
    if (code) costMap[code] = safeNumber(p.cost);
  }

  const rows = [];
  let totalSale = 0;
  let totalCost = 0;
  let deliveredCount = 0;
  let returnedCount = 0;
  let sNo = 0;

  for (const o of orders) {
    const created = parseDatePrefix(o.created_at || '');
    if (!created || created < start || created > endDate) continue;
    const storeName = (o.store || 'LOCAL').toUpperCase();
    const orderStatus = (o.status || '').trim();
    if (store && storeName !== store.toUpperCase()) continue;
    if (status && orderStatus !== status) continue;

    sNo += 1;
    const qty = parseInt(o.qty || 1, 10) || 1;
    const code = (o.product_code || '').trim();
    const sale = safeNumber(o.price);
    const cost = (costMap[code] || 0) * qty;

    if (orderStatus === 'Delivered') {
      totalSale += sale;
      totalCost += cost;
      deliveredCount += 1;
    } else if (orderStatus === 'Returned') {
      totalCost += cost;
      returnedCount += 1;
    }

    rows.push({
      sno: sNo,
      date: created,
      store: storeName,
      order_id: o.order_id,
      consignment: String(o.tracking_number || '').replace(/\D+/g, ''),
      customer: o.customer_name,
      phone: o.customer_phone,
      product: o.product_name,
      code,
      qty,
      status: orderStatus,
      delivered: orderStatus === 'Delivered' ? 'Yes' : '',
      returned: orderStatus === 'Returned' ? 'Yes' : '',
      sale: orderStatus === 'Delivered' ? sale : 0,
      cost,
      mnp_status: o.mnp_status || '',
      mnp_delivery_date: o.mnp_delivery_date || '',
      mnp_cod_amount: safeNumber(o.mnp_cod_amount),
      mnp_payment_id: o.mnp_payment_id || '',
    });
  }

  return {
    rows,
    summary: {
      start,
      end: endDate,
      store,
      status,
      count: rows.length,
      delivered_count: deliveredCount,
      returned_count: returnedCount,
      total_sale: Math.round(totalSale * 100) / 100,
      total_cost: Math.round(totalCost * 100) / 100,
    },
  };
}

export function getFinancialReport(selectedDate) {
  const orders = orderService.loadOrders();
  const products = productService.loadProducts();
  const adSpendData = loadAdSpend();
  const COURIER_AVG = 200;

  const costMap = {};
  for (const p of products) {
    const code = (p.code || '').trim();
    if (code) costMap[code] = safeNumber(p.cost);
  }

  let totalOrders = 0;
  let deliveredOrders = 0;
  let returnedOrders = 0;
  let revenue = 0;
  let productCostTotal = 0;
  let courierCostTotal = 0;

  for (const o of orders) {
    const created = String(o.created_at || '');
    if (!created.startsWith(selectedDate)) continue;
    totalOrders += 1;
    const status = (o.status || '').trim();
    const price = safeNumber(o.price);
    const qty = parseInt(o.qty || 1, 10) || 1;
    const code = (o.product_code || '').trim();

    if (status === 'Delivered') {
      deliveredOrders += 1;
      revenue += price;
      productCostTotal += (costMap[code] || 0) * qty;
      courierCostTotal += COURIER_AVG;
    } else if (status === 'Returned') {
      returnedOrders += 1;
      courierCostTotal += COURIER_AVG;
    }
  }

  const adSpend = safeNumber(adSpendData[selectedDate] || 0);
  const netProfit = revenue - productCostTotal - courierCostTotal - adSpend;
  const returnRate = totalOrders > 0 ? (returnedOrders / totalOrders) * 100 : 0;

  return {
    selected_date: selectedDate,
    total_orders: totalOrders,
    delivered_orders: deliveredOrders,
    returned_orders: returnedOrders,
    return_rate: Math.round(returnRate * 100) / 100,
    revenue: Math.round(revenue * 100) / 100,
    product_cost_total: Math.round(productCostTotal * 100) / 100,
    courier_cost_total: Math.round(courierCostTotal * 100) / 100,
    ad_spend: Math.round(adSpend * 100) / 100,
    net_profit: Math.round(netProfit * 100) / 100,
    courier_unit: COURIER_AVG,
  };
}
