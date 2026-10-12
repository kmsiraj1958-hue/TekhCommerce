# Phase 2A — Pre-cutover blocker remediation

JSON remains the application source of truth. This phase does **not** import live business data into PostgreSQL and does **not** switch services.

## Working-tree layers (do not migrate from an undocumented mix)

| Layer | Examples |
|-------|----------|
| Phase 1 foundation (often staged) | `server/prisma/*`, `server/src/db/jsonMap.js` (now extended), `docker-compose.yml`, `docs/PHASE1_DATABASE.md` |
| Later manufacturing / documents / courier (often unstaged or untracked) | `server/src/services/manufacturingService.js`, `documents.js`, `courier*`, `client/src/pages/admin/AdminManufacturing.jsx` |
| Local-only data | `server/data/demo/`, `server/data/development/`, live JSON at repo root, `server/data/vendor-license.json` |

## Backup

`backups/2026-10-11-1825-phase2a-precutover/` (gitignored). Contains HEAD, staged/unstaged diffs, untracked list, live JSON copies, and `server/data` overlays (not demo). `.env` was not copied.

## Dataset source (required)

Dry-run is the default. The importer fails closed without both variables.

| Variable | Values |
|----------|--------|
| `TEKH_IMPORT_SOURCE` | `live` or `demo` |
| `TEKH_IMPORT_TARGET` | `rehearsal` or `production-snapshot` |

Demo cannot use `production-snapshot`. Demo cannot use a hosted `DATABASE_URL`. Live JSON and `server/data/demo/` are never merged.

### Rehearsal (demo)

```bash
set TEKH_IMPORT_SOURCE=demo
set TEKH_IMPORT_TARGET=rehearsal
npm run json:import:dry --prefix server
```

### Production snapshot dry-run (live files, no DB write, no SoT change)

```bash
set TEKH_IMPORT_SOURCE=live
set TEKH_IMPORT_TARGET=rehearsal
npm run json:import:dry --prefix server
```

`--apply` additionally requires `CONFIRM_JSON_IMPORT=YES`, an approved SKU manifest for `production-snapshot`, zero blocking mapping errors, and `DATABASE_URL`. **Do not run `--apply` until those blockers are cleared.** Application `sourceOfTruth` stays `json` even after a snapshot apply.

## SKU mapping

`server/src/db/skuMapping.manifest.json` is **pending_review**. Live `products.json` is not rewritten. Approved mappings would apply only to a transformed import snapshot.

## Stock re-import

Importer upserts by `sourceKey`. It must not `deleteMany` stock movements. Fingerprint conflicts fail the import.

## Production posting (schema only)

Prisma models support one-transaction posting and reversing movements. Live manufacturing still uses JSON files and is **not** atomic.
