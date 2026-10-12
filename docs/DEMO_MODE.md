# Demo dataset (no UI switch)

TekhCommerce does not use a Demo Mode toggle in the interface or a `.env` flag you flip each session.

`npm run dev` always uses `server/data/demo/`. Production always uses live JSON when started with `NODE_ENV=production TEKH_DATA=live`.

See [DEVELOPMENT_DATA.md](./DEVELOPMENT_DATA.md).
