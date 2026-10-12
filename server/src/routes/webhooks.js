import { Router } from 'express';
import { config } from '../config.js';
import * as shopifyService from '../services/shopifyService.js';

const router = Router();

router.use((req, res, next) => {
  if (config.publicDemo) return res.status(403).send('Shopify webhooks are disabled on the public demo');
  next();
});

router.post('/shopify/:store/orders-create', (req, res) => {
  const store = (req.params.store || '').toLowerCase();
  if (!['vogue', 'sns'].includes(store)) return res.status(400).send('Invalid store');

  const secret = shopifyService.getSecret(store);
  const hmac = req.headers['x-shopify-hmac-sha256'] || '';
  if (!shopifyService.verifyWebhook(secret, req.rawBody || Buffer.from(''), hmac)) {
    return res.status(401).send('Unauthorized');
  }

  shopifyService.createOrderFromShopify(store, req.body);
  res.send('OK');
});

router.post('/shopify/:store/fulfillments-create', handleFulfillment);
router.post('/shopify/:store/fulfillments-update', handleFulfillment);

function handleFulfillment(req, res) {
  const store = (req.params.store || '').toLowerCase();
  if (!['vogue', 'sns'].includes(store)) return res.status(400).send('Invalid store');

  const secret = shopifyService.getSecret(store);
  const hmac = req.headers['x-shopify-hmac-sha256'] || '';
  if (!shopifyService.verifyWebhook(secret, req.rawBody || Buffer.from(''), hmac)) {
    return res.status(401).send('Unauthorized');
  }

  shopifyService.updateFromFulfillment(store, req.body);
  res.send('OK');
}

export default router;
