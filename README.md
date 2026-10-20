# NovaTech Store — Digital Products Shop (University Demo)

A polished, responsive single-page storefront for a fictional digital-gear
shop, plus a separate admin panel that manages the products shown on the
storefront. Built with **HTML, CSS, vanilla JavaScript** and a small
**Node.js + Express** backend.

> ⚠️ **Classroom demonstration Only.** The admin password is a hardcoded
> demo credential (`1234`). This is intentionally *not* production-secure
> authentication. No real payments or customer data are involved.

---

## Features

**Storefront**

-   Dark charcoal/navy theme with an electric blue → violet accent, driven
    entirely by CSS custom properties.
-   Sticky navigation with smooth-scroll links and a mobile hamburger menu.
-   Hero section with headline, CTA and live shop statistics.
-   Responsive product grid: photo (with fallback placeholder), name,
    description, category badge and formatted price.
-   Live search box and category dropdown filter.
-   Polished loading, error (with retry) and empty states.
-   About/benefits section, FAQ accordion, CTA band and footer.
-   Accessible: semantic HTML, skip link, visible focus rings, alt text,
    `aria-live` regions, and safe `textContent`-only rendering.

**Admin panel** (`/admin/`)

-   Server-validated login (demo password `1234`), session cookie, logout.
-   Product table with thumbnails, category, price and last-updated date.
-   Add / edit / delete products with a confirmation step for deletes.
-   Local image upload (JPEG, PNG, WebP) with live preview. The size limit
    is read from the server (`GET /api/config`), so the hint, client check
    and server error always agree.
-   "Remove photo" marks an existing photo for removal, shows that clearly
    before saving (with an Undo action), and deletes the file on save.
    Bundled seed illustrations are never deleted.
-   Inline validation errors plus success/error toast notifications.
-   Write operations are protected **on the server**; logged-out API calls
    receive `401`.
-   Accessible dialogs: Escape closes, focus moves in, Tab is trapped,
    focus returns to the trigger on close.

---

## Tech choices (why?)

-   **Express + JSON file** instead of SQLite: no native modules to compile,
    the "database" is a human-readable `products.json`, and resetting the
    demo is a single command. Perfect for a small classroom project.
-   **express-session** for a real server-managed login state (the browser
    only holds an opaque, `httpOnly` cookie — it never stores a token).
-   **multer** for multipart uploads, with server-side **magic-byte file
    sniffing** so the client-provided MIME type is never trusted.
-   No frontend framework — AGENTS.md asks for vanilla JS, and the app is
    small enough that one well-organised script per page is plenty.

---

## Prerequisites

-   [Node.js](https://nodejs.org/) **18 or newer** (tested on Node 24).
-   npm (bundled with Node).

## Getting the code

```powershell
git clone https://github.com/doctor-6/novashop_project.git
cd novashop_project
```

> 📝 The GitHub repository is named `novashop_project`; the folder you
> clone it into is up to you (this copy of the project lives in a
> folder called `novatech-store`). The only external request the pages
> make is Google Fonts — offline, the site still works with system
> fallback fonts.

## Installation

```powershell
# from the project folder (reproducible install from package-lock.json)
npm ci
```

`npm install` works too and is the right choice if you ever intend to
add or change dependencies.

Optionally copy the example environment file (all values have safe
defaults, so this step is not required):

```powershell
Copy-Item .env.example .env
```

## Running the app

```powershell
npm start
```

Then open:

| Page        | URL                             |
| ----------- | ------------------------------- |
| Storefront  | <http://localhost:3000/>        |
| Admin panel | <http://localhost:3000/admin/>  |
| Products API| <http://localhost:3000/api/products> |

**Demo admin password: `1234`** — change it via the `ADMIN_PASSWORD`
environment variable in `.env` if you like. Again: this is a demo, not
real security.

### Verify a fresh clone (complete checklist)

```powershell
git clone https://github.com/doctor-6/novashop_project.git
cd novashop_project
npm ci        # install exactly what package-lock.json pins
npm test      # 48 API tests on an isolated server — no setup needed
npm start     # then open the two URLs from the table above
```

If `npm test` reports `48 passed, 0 failed` and the storefront loads,
the clone is working. No database setup or environment file is required:
the JSON "database" and the `uploads/` folder are created automatically
on first run.

---

## Where data lives

| What                     | Location                                |
| ------------------------ | --------------------------------------- |
| Product database         | `server/data/products.json`             |
| Uploaded product photos  | `uploads/` (served at `/uploads/…`)     |
| Seed/demo product images | `public/img/products/*.svg`             |
| Environment settings     | `.env` (see `.env.example`)             |

`server/data/products.json` and `uploads/` are git-ignored so local demo
data never gets committed.

## Resetting the demo data

Stop the server, then:

```powershell
npm run reset
```

This restores the original six demo products (with their SVG illustrations)
and leaves `uploads/` untouched. Simply deleting
`server/data/products.json` also works — the server re-seeds on the next
start.

---

## Running the tests

One command, no server start-up required:

```powershell
npm test
```

`scripts/run-api-tests.js` then:

1.  creates throwaway `data/` and `uploads/` folders in the OS temp
    directory (your real `server/data/products.json` and `uploads/` are
    never touched),
2.  boots an isolated server on port **3947** (override with `TEST_PORT`),
3.  runs the full API smoke/regression suite (`scripts/test-api.js`),
4.  restarts the server once to verify products **persist across a
    restart**,
5.  stops the server and deletes the temp folders — on success *and*
    failure.

There are no extra test dependencies; the suite uses Node's built-in
`fetch`.

To run the suite against an already-running server instead (for example
during development):

```powershell
npm start           # terminal 1
npm run test:api    # terminal 2
```

> ⚠️ `npm run test:api` writes to the **running server's** data: it
> creates and deletes its own test products, and the bundled-image test
> clears the photo reference of one seed product (the illustration file
> itself is never deleted). Use `npm test` for a completely isolated run.

### What the automated tests cover

-   Public product reads, single-product 404, unknown API route → JSON 404.
-   Auth: wrong/empty password, correct login, session state, logout, and
    rejection of unauthenticated create/update/delete.
-   Create/update/delete round-trip, field validation errors.
-   Image upload: magic-byte sniffing rejects fake images, oversized
    uploads rejected with a message that matches the configured limit.
-   Image lifecycle: preserve on plain update, replace (old file deleted),
    explicit `removeImage` (reference cleared + file deleted), no-op
    removal on an imageless product, bundled seed illustration never
    deleted.
-   HTML-like product text is stored and returned verbatim as JSON (both
    frontends render with `textContent`; that part is a manual browser
    check — see below).
-   Missing `/uploads/...` file → 404 (not 500).
-   Product persistence across a server restart.

### Manual QA checklist (browser checks, not automated)

No browser automation is configured in this project, so the following
need a quick manual pass in a real browser:

-   Viewports ~1440 px (desktop), ~768 px (tablet), ~375–390 px (mobile):
    nav, product grid, search/category filters, admin table horizontal
    scroll, modal height on short screens.
-   Keyboard: tab through nav, filters, admin table actions and both
    dialogs; check focus traps, Escape-to-close, and visible focus rings.
-   Admin: "Remove photo" shows the removal notice + Undo before saving;
    after saving the storefront card shows the placeholder.
-   Product cards with long names/descriptions and missing images render
    sensibly; empty catalog and no-search-results states appear.
-   Save/delete buttons stay disabled while a request is pending
    (double-submit check); delete dialog names the product.
-   A product named `<img src=x onerror=alert(1)>` displays as plain text
    on the storefront and in the admin table.

---

## Project structure

```
├─ server.js                  # Express entry point (static files + API)
├─ server/
│  ├─ db.js                   # JSON file "database"
│  ├─ seed.js                 # demo products used on first run / reset
│  ├─ validate.js             # server-side product validation
│  ├─ upload.js               # multer config + magic-byte image sniffing
│  ├─ routes/
│  │   ├─ products.js         # GET/POST/PUT/DELETE /api/products
│  │   └─ admin.js            # /api/admin/login|logout|session
│  └─ data/products.json      # created automatically (git-ignored)
├─ public/
│  ├─ index.html              # storefront
│  ├─ css/styles.css
│  ├─ js/storefront.js
│  ├─ img/products/*.svg      # seed illustrations
│  └─ admin/
│      ├─ index.html          # admin login + dashboard
│      ├─ css/admin.css
│      └─ js/admin.js
├─ scripts/reset-data.js      # npm run reset
├─ scripts/test-api.js        # API smoke/regression tests (against a running server)
├─ scripts/run-api-tests.js   # npm test: isolated server + temp data + cleanup
├─ uploads/                   # uploaded photos (git-ignored)
├─ .env.example
└─ README.md
```

## API overview

| Method   | Endpoint                | Auth    | Description                    |
| -------- | ----------------------- | ------- | ------------------------------ |
| `GET`    | `/api/products`         | public  | List all products              |
| `GET`    | `/api/products/:id`     | public  | Get one product                |
| `GET`    | `/api/config`           | public  | `{ "maxImageBytes": 5000000 }` |
| `POST`   | `/api/products`         | admin   | Create (multipart form-data)   |
| `PUT`    | `/api/products/:id`     | admin   | Update (multipart form-data)   |
| `DELETE` | `/api/products/:id`     | admin   | Delete product + its photo     |
| `POST`   | `/api/admin/login`      | —       | `{ "password": "1234" }`       |
| `POST`   | `/api/admin/logout`     | —       | End the session                |
| `GET`    | `/api/admin/session`    | —       | `{ "isAdmin": true/false }`    |

Update (`PUT`) image rules:

-   No image field and no removal flag → the current photo is **kept**.
-   A new `image` file → replaces the photo; the previous upload file is
    deleted from disk.
-   Text field `removeImage=true` (without a new file) → clears the photo
    and deletes the previous upload. Files outside `uploads/` (e.g. the
    bundled `public/img/products/*.svg` illustrations) are never deleted.

Product shape:

```json
{
  "id": "uuid",
  "name": "Aurora RGB Mechanical Keyboard",
  "description": "Hot-swappable 75% keyboard…",
  "price": 129.99,
  "category": "Keyboards",
  "image": "/uploads/2f9c….jpg",
  "createdAt": "2026-01-01T12:00:00.000Z",
  "updatedAt": "2026-01-01T12:00:00.000Z"
}
```

---

## Security notes (demo scope)

-   All write endpoints check the server-side session; hiding UI is not
    relied upon.
-   Upload filenames are server-generated UUIDs (no path traversal), file
    **content** is sniffed (JPEG/PNG/WebP only), 5 MB (5,000,000 bytes) limit enforced.
-   Product text is rendered with `textContent`, never `innerHTML`.
-   Errors returned to the browser never include stack traces.
-   Uploaded files are never executed — the app only serves images.

## Known limitations

-   Single admin account; no role management, no password hashing (demo
    password compared in plain text via environment variable).
-   No HTTPS on localhost, so session cookies run over plain `http`.
-   The JSON file store is fine for a demo but not for concurrent writes.
-   No real checkout/payment flow (intentionally out of scope).
-   Uploaded images are size-limited (`MAX_IMAGE_BYTES`, default 5 MB =
    5,000,000 bytes) and
    checked by **magic-byte signatures**, but they are not decoded or
    re-encoded, so a crafted file with valid image headers could still be
    malformed. Hardening this properly would mean adding an image library
    such as `sharp` (a native dependency) — deliberately skipped to keep
    the demo install simple.

## Troubleshooting

-   **`EADDRINUSE`** — another process is using port 3000. Change `PORT`
    in `.env`.
-   **Admin says "Could not reach the server"** — make sure `npm start`
    is running and you are visiting `http://localhost:3000/admin/`.
-   **Want a clean slate** — `npm run reset`, and optionally delete the
    files inside `uploads/`.
