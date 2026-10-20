// server.js
// Entry point of the Nova Tech Store demo backend.
//
// Responsibilities:
//  - serve the static storefront (public/) and admin panel (public/admin/)
//  - serve uploaded product images (uploads/)
//  - expose the product + admin JSON API under /api
//  - manage the demo admin session cookie
'use strict';

const path = require('path');

// Load .env (if present) before anything reads process.env.
require('dotenv').config();

const express = require('express');
const session = require('express-session');

const adminRoutes = require('./server/routes/admin');
const productRoutes = require('./server/routes/products');
const { UPLOAD_DIR, MAX_IMAGE_BYTES } = require('./server/upload');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Random fallback secret so a missing .env still gives a working session.
// (In a real deployment this would always come from the environment.)
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  'dev-only-insecure-secret-' + Math.random().toString(36).slice(2);

// --- Middleware -------------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    name: 'shop.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true, // not readable from JavaScript
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
      // `secure` would break plain http on localhost, so it stays off here.
      secure: false,
    },
  })
);

// --- Static assets ----------------------------------------------------------
app.use('/uploads', express.static(UPLOAD_DIR, { fallthrough: false, index: false }));
app.use(express.static(path.join(__dirname, 'public')));

// --- API --------------------------------------------------------------------
// Public, harmless config so the admin UI can show the real upload limit
// instead of hardcoding one that might drift from the server setting.
app.get('/api/config', (request, response) => {
  response.json({ maxImageBytes: MAX_IMAGE_BYTES });
});

app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);

// Catch-all for unknown API routes -> JSON instead of HTML.
app.use('/api', (request, response) => {
  response.status(404).json({ error: 'API endpoint not found.' });
});

// Anything else that is not a static file falls back to the storefront SPA.
app.get('*', (request, response) => {
  response.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Error handling ---------------------------------------------------------
// Keep errors useful for the user but never leak stack traces to the browser.
// Errors that carry an explicit status (e.g. 404 from a missing file under
// /uploads) keep that status instead of being reported as a server error.
app.use((error, request, response, next) => {
  if (response.headersSent) return next(error);
  const status = Number(error.status || error.statusCode) || 500;
  if (status === 404) {
    return response.status(404).json({ error: 'Not found.' });
  }
  console.error('[server]', error.message);
  response.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(PORT, () => {
  console.log(`Nova Tech Store running at http://localhost:${PORT}`);
  console.log(`Storefront: http://localhost:${PORT}/`);
  console.log(`Admin panel: http://localhost:${PORT}/admin/`);
});
