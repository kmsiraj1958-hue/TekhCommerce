/** Deterministic TekhCommerce development dataset. Anchor date 2026-10-11 (last ~60 days). Synthetic only. */

export const DEMO_TODAY = '2026-10-11';
const SEED = 20261011;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n, w = 2) {
  return String(n).padStart(w, '0');
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function stamp(iso, hour, minute) {
  return `${iso} ${pad(hour)}:${pad(minute)}`;
}

const PRODUCTS = [
  { code: 'DEMO-TEE-01', name: 'Demo Cotton Tee', item_type: 'FINISHED_GOOD', category: 'Apparel', price: 2490, cost: 890, opening_stock: 48, reorder_level: 8 },
  { code: 'DEMO-TEE-02', name: 'Demo Linen Shirt', item_type: 'FINISHED_GOOD', category: 'Apparel', price: 3890, cost: 1400, opening_stock: 36, reorder_level: 6 },
  { code: 'DEMO-BAG-01', name: 'Demo Canvas Tote', item_type: 'FINISHED_GOOD', category: 'Bags', price: 1990, cost: 620, opening_stock: 24, reorder_level: 5 },
  { code: 'DEMO-BAG-02', name: 'Demo Crossbody', item_type: 'FINISHED_GOOD', category: 'Bags', price: 4590, cost: 1680, opening_stock: 18, reorder_level: 4 },
  { code: 'DEMO-WAL-01', name: 'Demo Card Wallet', item_type: 'FINISHED_GOOD', category: 'Accessories', price: 1290, cost: 380, opening_stock: 30, reorder_level: 6 },
  { code: 'DEMO-HAT-01', name: 'Demo Cap', item_type: 'FINISHED_GOOD', category: 'Accessories', price: 990, cost: 280, opening_stock: 22, reorder_level: 5 },
  { code: 'DEMO-BELT-01', name: 'Demo Belt', item_type: 'FINISHED_GOOD', category: 'Accessories', price: 1590, cost: 470, opening_stock: 16, reorder_level: 4 },
  { code: 'DEMO-SCN-01', name: 'Demo Scarf', item_type: 'FINISHED_GOOD', category: 'Apparel', price: 1790, cost: 510, opening_stock: 2, reorder_level: 4 },
  { code: 'DEMO-SOCK-01', name: 'Demo Socks 3pk', item_type: 'FINISHED_GOOD', category: 'Apparel', price: 690, cost: 180, opening_stock: 1, reorder_level: 6 },
  { code: 'DEMO-MUG-01', name: 'Demo Mug', item_type: 'FINISHED_GOOD', category: 'Home', price: 890, cost: 220, opening_stock: 20, reorder_level: 5 },
  { code: 'DEMO-NBK-01', name: 'Demo Notebook', item_type: 'FINISHED_GOOD', category: 'Home', price: 590, cost: 140, opening_stock: 28, reorder_level: 6 },
  { code: 'DEMO-BOX-01', name: 'Demo Gift Box', item_type: 'FINISHED_GOOD', category: 'Home', price: 2290, cost: 700, opening_stock: 12, reorder_level: 3 },
];

/** Manufacturing catalog. Kept out of the retail order picker so item roles stay distinct. */
const COMPONENT_PRODUCTS = [
  { code: 'RAW-CASHEW-G', name: 'Raw cashews', item_type: 'RAW_MATERIAL', category: 'Raw materials', price: 0, cost: 2, opening_stock: 1000, reorder_level: 200, base_uom: 'g', hide_from_store: true },
  { code: 'PKG-POUCH-150', name: 'Packaging pouch 150 g', item_type: 'PACKAGING_MATERIAL', category: 'Packaging', price: 0, cost: 5, opening_stock: 50, reorder_level: 12, base_uom: 'pcs', hide_from_store: true },
  { code: 'FG-CASHEW-150', name: 'Cashew Pack 150 g', item_type: 'FINISHED_GOOD', category: 'Nuts', price: 450, cost: 0, opening_stock: 0, reorder_level: 6, base_uom: 'pcs', hide_from_store: false },
];

const CUSTOMERS = [
  { name: 'Demo Buyer One', phone: '03000001001', address: 'Demo Street 11, Karachi' },
  { name: 'Demo Buyer Two', phone: '03000001002', address: 'Demo Avenue 22, Lahore' },
  { name: 'Demo Buyer Three', phone: '03000001003', address: 'Demo Lane 3, Islamabad' },
  { name: 'Demo Buyer Four', phone: '03000001004', address: 'Demo Block D, Faisalabad' },
  { name: 'Demo Buyer Five', phone: '03000001005', address: 'Demo Society, Multan' },
  { name: 'Demo Buyer Six', phone: '03000001006', address: 'Demo Town, Peshawar' },
  { name: 'Demo Buyer Seven', phone: '03000001007', address: 'Demo Colony, Quetta' },
  { name: 'Demo Buyer Eight', phone: '03000001008', address: 'Demo Road, Hyderabad' },
];

const STORES = ['VOGUE', 'SNS', 'LOCAL'];
const FINANCE_ACCOUNTS = [
  { id: 'acc-cash', code: '1000', name: 'Cash', type: 'asset' },
  { id: 'acc-bank', code: '1100', name: 'Bank Account', type: 'asset' },
  { id: 'acc-receivable', code: '1200', name: 'Accounts Receivable', type: 'asset' },
  { id: 'acc-payable', code: '2000', name: 'Accounts Payable', type: 'liability' },
  { id: 'acc-revenue', code: '4000', name: 'Revenue', type: 'income' },
  { id: 'acc-expense', code: '5000', name: 'Operating Expenses', type: 'expense' },
  { id: 'acc-salary', code: '5100', name: 'Salaries & Wages', type: 'expense' },
];

export function buildDemoDataset({ today = DEMO_TODAY } = {}) {
  const rand = rng(SEED);
  const start = addDays(today, -59);
  const products = [...PRODUCTS, ...COMPONENT_PRODUCTS].map((p) => ({
    ...p,
    price: String(p.price),
    cost: String(p.cost),
    opening_stock: String(p.opening_stock),
    reorder_level: String(p.reorder_level),
    image: '',
    demo: true,
  }));

  const orders = [];
  const movements = [];
  const events = [];
  const receipts = [];
  const invoices = [];
  let orderNum = 1;
  let track = 9000001001;
  let invoiceNum = 1;

  function pushDispatch(order, iso, hour) {
    const items = order.items || [];
    for (const item of items) {
      movements.push({
        date: stamp(iso, hour, 10),
        code: item.sku,
        qty: item.qty,
        type: 'dispatch',
        store: order.store,
        note: `DEMO dispatch: ${order.order_id}`,
      });
    }
    order.stock_reserved = true;
    order.stock_reserved_at = stamp(iso, hour, 10);
  }

  for (let day = 0; day < 60; day += 1) {
    const iso = addDays(start, day);
    const count = day % 7 === 5 ? 0 : 1 + Math.floor(rand() * 2);
    for (let n = 0; n < count; n += 1) {
      const product = PRODUCTS[Math.floor(rand() * (PRODUCTS.length - 2))];
      const customer = CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)];
      const qty = 1 + Math.floor(rand() * 3);
      const store = STORES[Math.floor(rand() * STORES.length)];
      const orderId = `DEM-${pad(orderNum, 4)}`;
      orderNum += 1;
      const hour = 10 + Math.floor(rand() * 8);
      const price = product.price * qty;
      const roll = rand();
      let status = 'Pending';
      if (roll < 0.46) status = 'Delivered';
      else if (roll < 0.58) status = 'Booked';
      else if (roll < 0.68) status = 'Shipped';
      else if (roll < 0.78) status = 'Confirmed';
      else if (roll < 0.90) status = 'Returned';
      else status = 'Pending';

      const tracking = store === 'LOCAL' ? '' : String(track++);
      const order = {
        id: `demo-ord-${orderId}`,
        order_id: orderId,
        store,
        source: store === 'LOCAL' ? 'website' : 'shopify',
        shopify_order_id: store === 'LOCAL' ? '' : `DEMO-${orderId}`,
        shopify_order_name: store === 'LOCAL' ? '' : `#D${orderNum}`,
        items: [{ title: product.name, variant: '', display: product.name, sku: product.code, qty, price: product.price }],
        product_name: product.name,
        product_code: product.code,
        qty,
        price: price.toFixed(2),
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_address: customer.address,
        status,
        courier: store === 'LOCAL' ? '' : 'M&P Courier',
        tracking_number: tracking,
        stock_reserved: false,
        stock_restocked: false,
        created_at: stamp(iso, hour, 5),
        demo: true,
      };

      if (['Confirmed', 'Booked', 'Shipped', 'Delivered', 'Returned'].includes(status)) {
        pushDispatch(order, iso, hour);
      }

      if (status === 'Shipped' || status === 'Delivered' || status === 'Returned' || status === 'Booked') {
        order.mnp_status = status === 'Booked' ? 'Booked' : status === 'Shipped' ? 'In Transit' : status === 'Delivered' ? 'Delivered' : 'Returned to Origin';
        order.status_updated_at = stamp(iso, hour, 40);
      }

      if (status === 'Delivered') {
        const deliverDay = addDays(iso, 1 + Math.floor(rand() * 3));
        if (deliverDay <= today) {
          order.delivered_at = stamp(deliverDay, 16, 20);
          order.mnp_delivery_date = deliverDay;
          order.mnp_cod_amount = price;
          order.mnp_status = 'Delivered';
          order.mnp_payment_id = rand() < 0.7 ? `PAY-DEMO-${pad(Math.floor(day / 7) + 1, 2)}` : '';
          events.push({ order_id: orderId, tracking, status: 'Delivered', at: order.delivered_at, location: 'Demo hub' });
          invoices.push({
            id: `INV-DEMO-${pad(invoiceNum, 4)}`,
            invoice_no: `INV-DEMO-${pad(invoiceNum, 4)}`,
            order_id: orderId,
            date: deliverDay,
            customer_name: customer.name,
            amount: price,
            status: order.mnp_payment_id ? 'paid' : 'unpaid',
            demo: true,
            notes: 'DEMO MODE — SAMPLE DATA. Not a tax invoice.',
          });
          invoiceNum += 1;
        }
      }

      if (status === 'Returned') {
        const rtoKind = rand();
        const rtoDay = addDays(iso, 2);
        order.returned_at = stamp(rtoDay, 14, 0);
        order.customer_return = rtoKind > 0.85;
        if (order.customer_return) {
          order.mnp_status = 'Delivered';
          order.delivered_at = stamp(addDays(iso, 1), 16, 0);
          order.mnp_cod_amount = price;
        } else if (rtoKind < 0.35) {
          order.mnp_status = 'Undelivered';
        } else if (rtoKind < 0.7) {
          order.mnp_status = 'Returning to origin';
        } else {
          order.mnp_status = 'Returned to Origin';
        }
        events.push({ order_id: orderId, tracking, status: order.mnp_status, at: order.returned_at, location: 'Demo return desk' });
        if (order.mnp_status === 'Returned to Origin' && rtoDay <= addDays(today, -3)) {
          movements.push({
            date: stamp(addDays(rtoDay, 2), 11, 0),
            code: product.code,
            qty,
            type: 'return_in',
            store,
            note: `DEMO warehouse restock: ${orderId}`,
          });
          order.stock_restocked = true;
          receipts.push({
            id: `rcpt-${orderId}`,
            order_id: orderId,
            tracking,
            received_at: stamp(addDays(rtoDay, 2), 11, 0),
            received_by: 'demo.operator',
            condition: rtoKind > 0.92 ? 'damaged' : 'ok',
            qty,
            notes: 'DEMO MODE — SAMPLE DATA warehouse receipt',
            created_at: stamp(addDays(rtoDay, 2), 11, 0),
          });
        }
      }

      orders.push(order);
    }
  }

  const delivered = orders.filter((o) => o.status === 'Delivered' && o.mnp_cod_amount);
  const payouts = [];
  for (let w = 0; w < 8; w += 1) {
    const weekStart = addDays(start, w * 7);
    const weekEnd = addDays(weekStart, 6);
    const slice = delivered.filter((o) => {
      const d = (o.delivered_at || '').slice(0, 10);
      return d >= weekStart && d <= weekEnd && o.mnp_payment_id;
    });
    for (const store of ['VOGUE', 'SNS']) {
      const group = slice.filter((o) => o.store === store);
      if (!group.length) continue;
      const rr = group.reduce((s, o) => s + Number(o.mnp_cod_amount), 0);
      const charges = Math.round(group.length * 150);
      const tax = Math.round(rr * 0.01);
      const ret = 0;
      const expected = rr - charges - ret - tax;
      const paid = expected - (w === 5 ? 250 : 0);
      payouts.push({
        import_id: `demo-payout-${w}-${store}`,
        store,
        filename: 'DEMO_PAYOUT.xlsx',
        imported_at: stamp(weekEnd, 18, 0),
        'Payment ID': `PAY-DEMO-${pad(w + 1, 2)}`,
        'Paid On': weekEnd,
        'RR Amount': rr,
        'Invoice Amount': charges,
        'IBFT Fee': 0,
        'Tax Amount': tax,
        'Net Payable': paid,
        'Instrument Mode': 'IBFT',
        'Instrument Number': `DEMO-IBFT-${w}-${store}`,
        'Return Charges': ret,
        demo: true,
      });
    }
  }

  const receiptEntries = [];
  let fin = 1;
  const deliveredSales = orders.filter((o) => o.status === 'Delivered').reduce((s, o) => s + Number(o.price), 0);
  receiptEntries.push({
    id: `fin-demo-${fin++}`,
    type: 'income',
    accountId: 'acc-bank',
    category: 'Courier remittance',
    description: 'DEMO recorded bank receipt (not equal to delivered sales)',
    amount: Math.round(deliveredSales * 0.35),
    reference: 'DEMO-RCPT-1',
    date: addDays(today, -10),
    createdAt: stamp(addDays(today, -10), 12, 0),
  });
  receiptEntries.push({
    id: `fin-demo-${fin++}`,
    type: 'income',
    accountId: 'acc-cash',
    category: 'Counter',
    description: 'DEMO cash counter sale receipt',
    amount: 4500,
    reference: 'DEMO-CASH-1',
    date: addDays(today, -20),
    createdAt: stamp(addDays(today, -20), 12, 0),
  });
  receiptEntries.push({
    id: `fin-demo-${fin++}`,
    type: 'expense',
    accountId: 'acc-expense',
    category: 'Packing',
    description: 'DEMO packing supplies',
    amount: 2200,
    reference: 'DEMO-EXP-1',
    date: addDays(today, -18),
    createdAt: stamp(addDays(today, -18), 9, 0),
  });
  receiptEntries.push({
    id: `fin-demo-${fin++}`,
    type: 'expense',
    accountId: 'acc-salary',
    category: 'Payroll',
    description: 'DEMO stipend',
    amount: 18000,
    reference: 'DEMO-PAY-1',
    date: addDays(today, -5),
    createdAt: stamp(addDays(today, -5), 9, 0),
  });
  const refundOrder = orders.find((o) => o.customer_return);
  if (refundOrder) {
    receiptEntries.push({
      id: `fin-demo-${fin++}`,
      type: 'expense',
      accountId: 'acc-expense',
      category: 'Refund',
      description: `DEMO customer refund for ${refundOrder.order_id} (cash, not stock)`,
      amount: Number(refundOrder.price),
      reference: refundOrder.order_id,
      date: (refundOrder.returned_at || today).slice(0, 10),
      createdAt: refundOrder.returned_at || stamp(today, 12, 0),
    });
  }

  const adSpend = {};
  for (let i = 0; i < 8; i += 1) {
    const d = addDays(start, i * 7);
    adSpend[d] = 1500 + i * 100;
  }

  const weekly = [];
  for (let w = 0; w < 8; w += 1) {
    const weekStart = addDays(start, w * 7);
    const weekEnd = addDays(weekStart, 6) > today ? today : addDays(weekStart, 6);
    const inWeek = orders.filter((o) => {
      const c = (o.created_at || '').slice(0, 10);
      return c >= weekStart && c <= weekEnd;
    });
    const deliveredW = inWeek.filter((o) => o.status === 'Delivered');
    const returnedW = inWeek.filter((o) => o.status === 'Returned');
    const shippedW = inWeek.filter((o) => o.status === 'Shipped');
    const sale = deliveredW.reduce((s, o) => s + Number(o.price), 0);
    const cod = deliveredW.reduce((s, o) => s + Number(o.mnp_cod_amount || 0), 0);
    const payout = payouts.filter((p) => p['Paid On'] >= weekStart && p['Paid On'] <= weekEnd)
      .reduce((s, p) => s + Number(p['Net Payable']), 0);
    weekly.push({
      week_start: weekStart,
      week_end: weekEnd,
      generated_at: stamp(weekEnd, 23, 0),
      total_orders: inWeek.length,
      delivered_orders: deliveredW.length,
      returned_orders: returnedW.length,
      shipped_orders: shippedW.length,
      delivery_success_rate: inWeek.length ? Math.round((deliveredW.length / inWeek.length) * 10000) / 100 : 0,
      return_rate: inWeek.length ? Math.round((returnedW.length / inWeek.length) * 10000) / 100 : 0,
      total_sale: Math.round(sale * 100) / 100,
      total_cod: Math.round(cod * 100) / 100,
      payout_received: Math.round(payout * 100) / 100,
      balance_with_courier: Math.round((cod - payout) * 100) / 100,
      demo: true,
      label: 'DEMO MODE — SAMPLE DATA',
    });
  }

  return {
    meta: { demo: true, banner: 'DEMO MODE — SAMPLE DATA', today, start, generated_from: 'server/src/demo/buildDemoDataset.js' },
    products,
    orders,
    inventory_movements: movements,
    finance: {
      accounts: FINANCE_ACCOUNTS,
      entries: receiptEntries,
      updatedAt: `${today}T00:00:00.000Z`,
    },
    mnp_payout_reports: payouts,
    mnp_daily_reports: [
      { id: 'demo-daily-1', type: 'daily', store: 'VOGUE', filename: 'DEMO_DAILY.xlsx', imported_at: stamp(addDays(today, -14), 20, 0), rows_count: 8, demo: true },
    ],
    weekly_reports: weekly,
    ad_spend: adSpend,
    invoices,
    courier_settings: { return_overdue_days: 7, stale_tracking_days: 5, settlement_overdue_days: 14 },
    courier_return_receipts: receipts,
    courier_event_log: events,
    courier_weekly_snapshots: weekly.map((row) => ({
      range: { start: row.week_start, end: row.week_end, store: 'ALL' },
      generated_at: row.generated_at,
      reconciliation_status: 'draft',
      demo: true,
      label: 'DEMO MODE — SAMPLE DATA',
      delivered: row.delivered_orders,
      new_bookings: row.total_orders,
      expected_cod: row.total_cod,
      actual_remittances: row.payout_received,
      settlement_difference: row.balance_with_courier,
    })),
  };
}

export function summarizeDemoDataset(data) {
  const delivered = data.orders.filter((o) => o.status === 'Delivered');
  const deliveredSales = delivered.reduce((s, o) => s + Number(o.price), 0);
  const receipts = data.finance.entries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const expenses = data.finance.entries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  const refunds = data.finance.entries.filter((e) => String(e.category).toLowerCase().includes('refund'));
  return {
    products: data.products.length,
    orders: data.orders.length,
    delivered: delivered.length,
    delivered_sales: Math.round(deliveredSales * 100) / 100,
    cash_receipts: receipts,
    cash_expenses: expenses,
    refund_count: refunds.length,
    invoices: data.invoices.length,
    payout_rows: data.mnp_payout_reports.length,
    warehouse_receipts: data.courier_return_receipts.length,
    returning: data.orders.filter((o) => (o.mnp_status || '').includes('Returning')).length,
  };
}
