# TekhCommerce local dataset (`server/data/demo`)

Local work uses the isolated synthetic files in `server/data/demo/`. You do **not** edit `.env` to choose this. Production cannot use this folder.

## How to start locally

```
npm run dev
```

or `start.bat`.

Those commands set `NODE_ENV=development` and `TEKH_DATA=demo`. No `.env` toggle is required.

- Store: http://localhost:5200
- API: http://127.0.0.1:5010

First boot seeds `server/data/demo/` if it is empty. Rebuild with `npm run data:seed --prefix server`.

## How production is selected

Production must set **both**:

```
NODE_ENV=production
TEKH_DATA=live
```

That is what `npm run start:prod` and Render (`render.yaml`) do. The process then uses repo-root JSON and `server/data/` overlays (finance, courier, vendor-license). It does not read or seed `server/data/demo/`.

Starting the API without these values fails:

- `NODE_ENV=production` without `TEKH_DATA=live` → refuse to start
- `NODE_ENV=production` with `TEKH_DATA=demo` → refuse to start
- bare `node src/index.js` / `npm start` with no dataset env → refuse to start (ambiguous)

Do not copy demo JSON into the original business files.

## Isolation

- `saveJson` throws if the demo profile would write a protected live filename.
- Vendor license stays at `server/data/vendor-license.json`.
- Leftover `server/data/development/` is not the active local folder.
