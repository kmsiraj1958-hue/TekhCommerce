import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import * as orderService from '../services/orderService.js';
import { safeNumber } from '../utils/helpers.js';
import * as productService from '../services/productService.js';

const router = Router();

router.get('/track/:orderId', (req, res) => {
  const order = orderService.getOrderByOrderId(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ order });
});

router.post('/checkout', (req, res) => {
  const { name, phone, address, items } = req.body || {};
  if (!name || !phone || !address || !items?.length) {
    return res.status(400).json({ error: 'Please fill all fields and add items to cart' });
  }

  let totalPrice = 0;
  let totalQty = 0;
  const lineItems = items.map((item) => {
    const qty = parseInt(item.qty || 1, 10) || 1;
    const price = safeNumber(item.price);
    totalPrice += price * qty;
    totalQty += qty;
    return {
      title: item.name,
      variant: '',
      display: item.name,
      sku: item.code,
      qty,
      price,
    };
  });

  const order = orderService.createOrder({
    store: 'LOCAL',
    source: 'website',
    items: lineItems,
    product_name: lineItems.map((i) => i.display).join(', '),
    product_code: lineItems.map((i) => i.sku).join(', '),
    qty: totalQty,
    price: totalPrice,
    customer_name: name,
    customer_phone: phone,
    customer_address: address,
  });

  const waUrl = orderService.buildWhatsappCheckoutUrl(order, { name, phone, address });
  res.status(201).json({ order, waUrl });
});

router.post('/single', (req, res) => {
  const { code, name, phone, address, qty = 1 } = req.body || {};
  const product = productService.getProductByCode(code);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (!name || !phone || !address) return res.status(400).json({ error: 'Please fill all fields' });

  const quantity = parseInt(qty, 10) || 1;
  const price = safeNumber(product.price) * quantity;
  const order = orderService.createOrder({
    store: 'LOCAL',
    source: 'website',
    items: [{
      title: product.name,
      variant: '',
      display: product.name,
      sku: product.code,
      qty: quantity,
      price: safeNumber(product.price),
    }],
    product_name: product.name,
    product_code: product.code,
    qty: quantity,
    price,
    customer_name: name,
    customer_phone: phone,
    customer_address: address,
  });

  const waUrl = orderService.buildWhatsappCheckoutUrl(order, { name, phone, address });
  res.status(201).json({ order, waUrl });
});

router.post('/tiktok', (req, res) => {
  const { code, customer_name, phone, address } = req.body || {};
  const product = productService.getProductByCode(code);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (!customer_name || !phone || !address) return res.status(400).json({ error: 'Please fill all fields' });

  const order = orderService.createOrder({
    store: 'LOCAL',
    source: 'tiktok',
    items: [{
      title: product.name,
      variant: '',
      display: product.name,
      sku: product.code,
      qty: 1,
      price: safeNumber(product.price),
    }],
    product_name: product.name,
    product_code: product.code,
    qty: 1,
    price: safeNumber(product.price),
    customer_name,
    customer_phone: phone,
    customer_address: address,
  });

  const waUrl = orderService.buildWhatsappCheckoutUrl(order, {
    name: customer_name,
    phone,
    address,
  });
  res.status(201).json({ order, waUrl });
});

router.get('/', authRequired, (req, res) => {
  let orders = orderService.loadOrders();
  const { status, store, search } = req.query;
  if (search) {
    const q = search.toLowerCase();
    orders = orders.filter((o) => JSON.stringify(o).toLowerCase().includes(q));
  }
  if (status) orders = orders.filter((o) => (o.status || '').toLowerCase() === status.toLowerCase());
  if (store) orders = orders.filter((o) => (o.store || '').toUpperCase() === store.toUpperCase());
  res.json({ orders: orders.reverse() });
});

router.get('/dashboard', authRequired, (req, res) => {
  res.json(orderService.getDashboardStats());
});

router.patch('/:orderId/status', authRequired, (req, res) => {
  try {
    const order = orderService.updateOrderStatus(req.params.orderId, req.body.status);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ order });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:orderId', authRequired, (req, res) => {
  const ok = orderService.deleteOrder(req.params.orderId);
  if (!ok) return res.status(404).json({ error: 'Order not found' });
  res.json({ ok: true });
});

export default router;
