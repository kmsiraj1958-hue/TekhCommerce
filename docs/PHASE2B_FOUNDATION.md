# Phase 2B — Schema foundation, importer coverage, client onboarding

JSON remains the live source of truth. This phase does not authorize production cutover.

## Isolated rehearsal database

```bash
docker compose up -d db-rehearsal
cd server
set DATABASE_URL=postgresql://rehearsal:rehearsal@127.0.0.1:5434/tekhcommerce_rehearsal
npm run db:migrate:rehearse
npx prisma generate
set TEKH_IMPORT_SOURCE=demo
set TEKH_IMPORT_TARGET=rehearsal
set TEKH_IMPORT_ALLOW_LEGACY_UNTYPED=YES
set CONFIRM_JSON_IMPORT=YES
npm run json:import:rehearse
```

`db:migrate:rehearse` refuses to start Prisma unless the connected server is database `tekhcommerce_rehearsal`, port `5434`, and user `rehearsal` on host `127.0.0.1`. `json:import:rehearse` uses that same check and still requires `TEKH_IMPORT_SOURCE=demo` and `TEKH_IMPORT_TARGET=rehearsal`. Do not use `npx prisma migrate deploy` for this rehearsal database.

Rollback the disposable database with `docker compose rm -s -f db-rehearsal` and `docker volume rm tekhshopify_tekhcommerce_rehearsal_pg` (name may vary). Never point this URL at live JSON import.

Live `--apply` is refused.

## Excel onboarding

Admin → Onboarding. Map columns explicitly. Apply writes `server/data/onboarding/catalog.json` only.

## Start the existing development app

From the repo root: `npm run dev` (demo JSON on the API, Vite on port 5200).
