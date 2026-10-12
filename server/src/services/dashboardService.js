import { config } from '../config.js';
import { loadJson } from '../utils/storage.js';
import { safeNumber, parseDatePrefix } from '../utils/helpers.js';
import * as inventoryService from './inventoryService.js';
import { computeCashbookOverview } from './cashbookService.js';
import { computeReturnsAnalytics } from './returnsAnalyticsService.js';

const STATUSES = ['Pending', 'Confirmed', 'Booked', 'Shipped', 'Delivered', 'Returned'];

function ymd(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function computeDashboardSummary({
  orders = [],
  products = [],
  inventory = {},
  start,
  end,
  finance = { accounts: [], entries: [] },
  movements = [],
} = {}) {
  const today = ymd(new Date());
  const dated = orders.map((order) => ({
    order,
    date: parseDatePrefix(order.created_at || ''),
  }));
  const knownDates = dated.map((row) => row.date).filter(Boolean).sort();
  let rangeStart = start || knownDates[0] || today;
  let rangeEnd = end || today;
  if (rangeStart > rangeEnd) {
    const tmp = rangeStart;
    rangeStart = rangeEnd;
    rangeEnd = tmp;
  }

  const inRange = dated.filter((row) => row.date && row.date >= rangeStart && row.date <= rangeEnd);
  const rangeOrders = inRange.map((row) => row.order);
  const delivered = rangeOrders.filter((order) => order.status === 'Delivered');
  const deliveredSales = delivered.reduce((sum, order) => sum + safeNumber(order.price), 0);
  const deliveredCount = delivered.length;
  const aov = deliveredCount ? Math.round((deliveredSales / deliveredCount) * 100) / 100 : 0;

  const statusCounts = {};
  for (const status of STATUSES) statusCounts[status] = 0;
  for (const order of rangeOrders) {
    const status = order.status || 'Pending';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }

  const byDay = new Map();
  for (const row of inRange) {
    if (!byDay.has(row.date)) {
      byDay.set(row.date, { date: row.date, orders: 0, delivered_sales: 0 });
    }
    const bucket = byDay.get(row.date);
    bucket.orders += 1;
    if (row.order.status === 'Delivered') bucket.delivered_sales += safeNumber(row.order.price);
  }
  const salesTrend = [...byDay.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((bucket) => ({
      date: bucket.date,
      orders: bucket.orders,
      delivered_sales: Math.round(bucket.delivered_sales * 100) / 100,
    }));

  const sold = {};
  for (const order of delivered) {
    const items = order.items?.length ? order.items : [{ sku: order.product_code, title: order.product_name, qty: order.qty, price: order.price }];
    for (const item of items) {
      const sku = String(item.sku || item.code || '').trim() || '(no SKU)';
      const qty = parseInt(item.qty || 0, 10) || 0;
      const line = safeNumber(item.price) * (qty || 1);
      if (!sold[sku]) sold[sku] = { sku, name: item.title || item.display || item.name || sku, qty: 0, revenue: 0 };
      sold[sku].qty += qty || 1;
      sold[sku].revenue += line;
    }
  }
  const topProducts = Object.values(sold)
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
    .slice(0, 8)
    .map((row) => ({ ...row, revenue: Math.round(row.revenue * 100) / 100 }));

  const inventoryRows = Object.entries(inventory).map(([sku, row]) => ({
    sku,
    name: row.name || sku,
    balance: Number(row.balance) || 0,
    reorder_level: Number(row.reorder_level) || 0,
  }));
  const lowStock = inventoryRows
    .filter((row) => row.balance <= row.reorder_level)
    .sort((a, b) => a.balance - b.balance)
    .slice(0, 12);

  const recentOrders = [...rangeOrders]
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 8)
    .map((order) => ({
      order_id: order.order_id,
      created_at: order.created_at || '',
      status: order.status || 'Pending',
      store: order.store || '',
      product_name: order.product_name || '',
      qty: order.qty,
      price: safeNumber(order.price),
    }));

  return {
    range: { start: rangeStart, end: rangeEnd },
    total_products: products.length,
    total_orders: rangeOrders.length,
    pending_orders: statusCounts.Pending || 0,
    confirmed_orders: statusCounts.Confirmed || 0,
    booked_orders: statusCounts.Booked || 0,
    shipped_orders: statusCounts.Shipped || 0,
    delivered_orders: deliveredCount,
    returned_orders: statusCounts.Returned || 0,
    total_sale: Math.round(deliveredSales * 100) / 100,
    average_order_value: aov,
    status_counts: statusCounts,
    sales_trend: salesTrend,
    top_products: topProducts,
    recent_orders: recentOrders,
    low_stock: lowStock,
    inventory_summary: {
      sku_count: inventoryRows.length,
      low_stock_count: inventoryRows.filter((row) => row.balance <= row.reorder_level).length,
      units_on_hand: inventoryRows.reduce((sum, row) => sum + row.balance, 0),
    },
    notes: {
      sales: 'Delivered order totals only (PKR). Other statuses are excluded from sales and AOV.',
      inventory: 'Current on-hand snapshot; not filtered by the date range.',
      products: 'Catalog size is current, not date-filtered.',
      unavailable: ['website traffic', 'conversion rate', 'ad ROAS', 'gross margin'],
    },
    finance: computeCashbookOverview({ finance, start: rangeStart, end: rangeEnd }),
    returns: computeReturnsAnalytics({
      orders,
      movements,
      financeEntries: finance.entries || [],
      start: rangeStart,
      end: rangeEnd,
    }),
  };
}

export function getDashboardSummary({ start, end } = {}) {
  return computeDashboardSummary({
    orders: loadJson(config.files.orders, []),
    products: loadJson(config.files.products, []),
    inventory: inventoryService.calculateInventory(),
    finance: loadJson(config.files.finance, { accounts: [], entries: [] }),
    movements: inventoryService.loadMovements(),
    start,
    end,
  });
}
