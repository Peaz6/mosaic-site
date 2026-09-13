# Mosaic

Product distribution, rebuilt. Live demo: <https://peaz6.github.io/mosaic-site/>

## Two modes

The site runs in two modes and auto-detects which one it's in.

| Mode | How it runs | Accounts | Contact form |
|---|---|---|---|
| **Local** | `node server.js` → http://localhost:3000 | Real accounts stored in a local **SQLite** database (`mosaic.db`) with hashed passwords and session cookies | Messages saved to the database, viewable in the **Inbox** after logging in |
| **Static** | GitHub Pages (or any file server) | Demo only (browser `localStorage`) | Opens your email app (mailto) |

Local mode requires **Node 22+** (uses the built-in `node:sqlite` module — no installs).

## Local run (full database experience)

```bash
node server.js
# open http://localhost:3000
```

On first run this creates `mosaic.db` with three SQL tables:

```sql
users     -- accounts (scrypt-hashed passwords)
sessions  -- login sessions (cookies)
messages  -- contact form submissions (viewable in the Inbox after login)
```

The database file is git-ignored and never leaves your machine. Delete `mosaic.db` to reset everything.

## Static / GitHub Pages

The published site (https://peaz6.github.io/mosaic-site/) runs in static mode — a browser
cannot reach a database on your computer, so it falls back to a demo login and mailto form.

## Deployment

This repo is configured for **GitHub Pages**. Enable it in:

> Settings → Pages → Deploy from branch → `main` → `/ (root)` → Save