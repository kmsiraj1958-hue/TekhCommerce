import fs from 'fs';
import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import { config } from '../config.js';
import { authRequired } from '../middleware/auth.js';
import * as productService from '../services/productService.js';
import * as inventoryService from '../services/inventoryService.js';
import { ensureDir } from '../utils/storage.js';

const router = Router();
const upload = multer({ dest: path.join(config.files.uploads, 'tmp') });

router.get('/', (req, res) => {
  const products = productService.loadProducts();
  const categories = productService.getCategories();
  const summary = inventoryService.calculateInventory();
  const enriched = products.map((p) => {
    const code = (p.code || '').trim();
    const inv = summary[code] || {};
    return {
      ...p,
      live_stock: inv.balance != null ? inv.balance : (parseInt(p.opening_stock || 0, 10) || 0),
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
      live_stock: inv.balance != null ? inv.balance : (parseInt(product.opening_stock || 0, 10) || 0),
    },
  });
});

router.post('/', authRequired, upload.single('image'), (req, res) => {
  const products = productService.loadProducts();
  const { name, code, price, cost, category, opening_stock, reorder_level } = req.body;
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
    opening_stock: parseInt(opening_stock || 0, 10) || 0,
    reorder_level: parseInt(reorder_level || 3, 10) || 3,
  };
  products.push(newProduct);
  productService.saveProducts(products);
  res.status(201).json({ product: newProduct });
});

router.put('/:code', authRequired, upload.single('image'), (req, res) => {
  const products = productService.loadProducts();
  const product = products.find((p) => p.code === req.params.code);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const { name, price, cost, category, opening_stock, reorder_level } = req.body;
  if (name) product.name = name;
  if (price != null) product.price = parseFloat(price) || 0;
  if (cost != null) product.cost = parseFloat(cost) || 0;
  if (category != null) product.category = category;
  if (opening_stock != null) product.opening_stock = parseInt(opening_stock, 10) || 0;
  if (reorder_level != null) product.reorder_level = parseInt(reorder_level, 10) || 3;

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
