# Deploy TekhCommerce

**Canonical stack:** React (`client/`) + Node/Express (`server/`). Start with `npm run dev` or `start.bat`.  
`app.py` is **frozen legacy** — do not run it beside Express (shared JSON files). See `FLASK_LEGACY.md`.

Live persistence is still **JSON** until a later cutover. PostgreSQL is the Phase 1 foundation only (`docs/PHASE1_DATABASE.md`).

---

## Option A — Render (recommended, free tier available)

1. Push this folder to a **GitHub** repository.
2. Go to [render.com](https://render.com) → **New** → **Blueprint**.
3. Connect the repo — Render reads `render.yaml` automatically.
4. In the Render dashboard, set these **secret** environment variables:
   - `ADMIN_USER` — your admin username
   - `ADMIN_PASS` — strong password
   - `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
   - `SHOPIFY_SECRET_VOGUE`, `SHOPIFY_SECRET_SNS`
   - `MNP_USER_VOGUE`, `MNP_PASS_VOGUE`, `MNP_USER_SNS`, `MNP_PASS_SNS`
5. Deploy. Your live URL will look like: `https://tekhshopify.onrender.com`

### After deploy — update Shopify webhooks

Point webhooks to your live domain:

- `https://YOUR-DOMAIN/api/webhooks/shopify/vogue/orders-create`
- `https://YOUR-DOMAIN/api/webhooks/shopify/vogue/fulfillments-create`
- `https://YOUR-DOMAIN/api/webhooks/shopify/sns/orders-create`
- `https://YOUR-DOMAIN/api/webhooks/shopify/sns/fulfillments-create`

---

## Option B — VPS / Windows server (production on one port)

```bash
npm install
npm install --prefix server
npm install --prefix client
npm run start:prod
```

App serves **both** the React UI and API on `PORT` (default `5001`).

Open: `http://YOUR-SERVER-IP:5010`

Use **PM2** to keep it running:

```bash
npm install -g pm2
pm2 start npm --name tekhshopify -- run start:prod
pm2 save
```

---

Local `npm run dev` uses `server/data/demo/` (see `docs/DEVELOPMENT_DATA.md`). Production requires `NODE_ENV=production TEKH_DATA=live` and uses live JSON at the repo root. Do not copy demo files into live JSON.

## Option C — Local development

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| Store (React) | http://localhost:5200 |
| API | http://127.0.0.1:5010 |
| API | http://127.0.0.1:5010 |

---

## Data & uploads

**Production / `NODE_ENV=production`:** JSON data files (`products.json`, `orders.json`, etc.) and `uploads/` live in the project root; finance/courier/license overlays live in `server/data/`.

**Local development:** JSON is read and written only under `server/data/demo/`. See `docs/DEVELOPMENT_DATA.md`.

On Render, use a **persistent disk** mounted at the project root if you need data to survive redeploys.

---

## Admin login

Credentials are in `.env`:

- `ADMIN_USER`
- `ADMIN_PASS`

Never commit `.env` to Git.
