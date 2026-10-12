# Flask is frozen legacy

The canonical TekhCommerce application is:

- UI: `client/` (React + Vite)
- API: `server/` (Node.js + Express)
- Start: `npm run dev` or `start.bat`

`app.py` and `templates/` are **kept on disk** so nothing is lost. They are **not** the live application.

Do **not**:

- Add new features to Flask
- Run Flask at the same time as Express (both write `products.json`, `orders.json`, and `inventory_movements.json`)

If you need a Flask screen that is not yet in React, copy the behaviour into the Node/React app in a later phase. Do not extend Flask.
