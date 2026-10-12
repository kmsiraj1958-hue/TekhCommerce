# Phase 1 — Database foundation (JSON still source of truth)

## Decision

| Topic | Choice |
|-------|--------|
| Canonical app | React (`client/`) + Express (`server/`) |
| Live data | JSON files at the project root |
| Target database | **PostgreSQL 16** via Prisma |
| Why Postgres | Relational FKs, transactions, `DECIMAL` stock qty, unique Shopify ids, concurrent multi-user SaaS. Render and sibling Tekh apps already use SQL. Local SQLite would not match production types. |
| Used by live APIs yet? | **No.** Optional `DATABASE_URL` only for health + import dry-run/apply snapshot. |

## Duplicate data paths (do not run together)

| Writer | Files |
|--------|--------|
| Express `server/src` | `products.json`, `orders.json`, `inventory_movements.json`, report JSON |
| Flask `app.py` | Same files |

Flask is frozen. Start only Node.

## JSON → Postgres migration (not cutover)

1. Backup: copies already in `backups/2026-10-11-phase1/` (gitignored). Repeat with a folder copy before any `--apply`.
2. Dry run (safe, no DB writes, JSON untouched). Source and target are **required** (see `docs/PHASE2A_PRECUTOVER.md`):

```bash
set TEKH_IMPORT_SOURCE=live
set TEKH_IMPORT_TARGET=rehearsal
npm run json:import:dry
```

3. Start Postgres and apply schema:

```bash
docker compose up -d
# set DATABASE_URL in .env (see .env.example)
cd server
npx prisma migrate deploy
npx prisma generate
```

4. Optional **snapshot** into Postgres (JSON remains live SoT):

```bash
set CONFIRM_JSON_IMPORT=YES
npm run json:import:apply --prefix server
```

5. Reconcile: compare dry-run `counts` to `SELECT count(*)` on `Product`, `Order`, `StockMovement`.
6. Rollback DB snapshot: `docker compose down -v` (destroys local volume) or restore Postgres from dump. **JSON files are never deleted by these scripts.**
7. Application rollback: `git checkout main` and keep using JSON.

Cutover of product/order/inventory **services** is Phase 2+ and requires passing reconciliation plus dual-run tests.

## Schema (foundation)

Stores, users, suppliers, customers, products (`ItemType` includes RM/packaging for later), orders, order items, stock movements (`DECIMAL` qty), audit log. Empty `Bom` / `BomLine` / `ProductionOrder` tables exist so manufacturing can land without another rewrite. They are unused.

## Dry-run finding (do not auto-fix)

A dry run of the current `products.json` reported **4 duplicate SKUs** (`VIB-005`, `VIB-010`, `VIB-013`, `VIB-014`). Proposed VCK remaps are in `server/src/db/skuMapping.manifest.json` and remain **unapproved**. Phase 1/2A do **not** rewrite live product records. See `docs/PHASE2A_PRECUTOVER.md`.

## Rollback of this branch

```bash
git checkout main
```

JSON backups: `backups/2026-10-11-phase1/`.
