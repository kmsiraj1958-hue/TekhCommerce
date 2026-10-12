import fs from 'fs';
import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import { config } from '../config.js';
import { authRequired } from '../middleware/auth.js';
import * as productService from '../services/productService.js';
import * as inventoryService from '../services/inventoryService.js';
import { isSellableProduct } from '../services/manufacturingService.js';
import { qtyDecimal } from '../services/qty.js';
import { ensureDir } from '../utils/storage.js';

const router = Router();
const upload = multer({ dest: path.join(config.files.uploads, 'tmp') });

router.get('/', (req, res) => {
  const products = productService.loadProducts();
  const categories = productService.getCategories();
  const summary = inventoryService.calculateInventory();
  const admin = Boolean(req.headers.authorization);
  const catalog = products.filter((p) => admin || isSellableProduct(p));
  const enriched = catalog.map((p) => {
    const code = (p.code || '').trim();
    const inv = summary[code] || {};
    return {
      ...p,
      live_stock: inv.balance != null ? inv.balance : qtyDecimal(p.opening_stock || 0),
    };
  });
  res.json({ products: enriched, categories });
});

router.get('/categories', (req, res) => {
  res.json({ categories: productService.getCategories() });
});

router.get('/:code', (req, res) => {
  const product = productService.getProductByCode(req.params.code);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const summary = inventoryService.calculateInventory();
  const inv = summary[product.code] || {};
  res.json({
    product: {
      ...product,
      live_stock: inv.balance != null ? inv.balance : qtyDecimal(product.opening_stock || 0),
    },
  });
});

router.post('/', authRequired, upload.single('image'), (req, res) => {
  const products = productService.loadProducts();
  const { name, code, price, cost, category, opening_stock, reorder_level, item_type, base_uom, hide_from_store } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Name and code are required' });

  let image = '';
  if (req.file) {
    ensureDir(config.files.images);
    const dest = path.join(config.files.images, req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'));
    fs.renameSync(req.file.path, dest);
    image = path.basename(dest);
  }

  const newProduct = {
    name,
    code,
    price: parseFloat(price) || 0,
    cost: parseFloat(cost) || 0,
    category: category || '',
    image,
    opening_stock: qtyDecimal(opening_stock || 0),
    reorder_level: qtyDecimal(reorder_level || 3),
    item_type: item_type || 'FINISHED_GOOD',
    base_uom: base_uom || 'pcs',
    hide_from_store: String(hide_from_store) === 'true' || item_type === 'RAW_MATERIAL' || item_type === 'PACKAGING_MATERIAL',
    active: true,
  };
  products.push(newProduct);
  productService.saveProducts(products);
  res.status(201).json({ product: newProduct });
});

router.put('/:code', authRequired, upload.single('image'), (req, res) => {
  const products = productService.loadProducts();
  const product = products.find((p) => p.code === req.params.code);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const { name, price, cost, category, opening_stock, reorder_level, item_type, base_uom, hide_from_store, active } = req.body;
  if (name) product.name = name;
  if (price != null) product.price = parseFloat(price) || 0;
  if (cost != null) product.cost = parseFloat(cost) || 0;
  if (category != null) product.category = category;
  if (opening_stock != null) product.opening_stock = qtyDecimal(opening_stock);
  if (reorder_level != null) product.reorder_level = qtyDecimal(reorder_level);
  if (item_type) product.item_type = item_type;
  if (base_uom) product.base_uom = base_uom;
  if (hide_from_store != null) product.hide_from_store = String(hide_from_store) === 'true';
  if (active != null) product.active = String(active) !== 'false';

  if (req.file) {
    ensureDir(config.files.images);
    const dest = path.join(config.files.images, req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'));
    fs.renameSync(req.file.path, dest);
    product.image = path.basename(dest);
  }

  productService.saveProducts(products);
  res.json({ product });
});

router.delete('/:code', authRequired, (req, res) => {
  const products = productService.loadProducts().filter((p) => p.code !== req.params.code);
  productService.saveProducts(products);
  res.json({ ok: true });
});

export default router;
