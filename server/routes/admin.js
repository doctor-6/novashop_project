// server/routes/admin.js
// Demo login / logout / session endpoints.
//
// WARNING: this is a classroom demo, not production authentication.
// A single hardcoded (but env-configurable) password guards the admin area.
'use strict';

const express = require('express');

const router = express.Router();

/** Demo password; overridable via the ADMIN_PASSWORD environment variable. */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';

/** POST /api/admin/login */
router.post('/login', (request, response) => {
  const { password } = request.body || {};

  if (typeof password !== 'string' || password === '') {
    return response.status(400).json({ error: 'Please enter the admin password.' });
  }

  // Store the login state on the server-side session. The client never holds
  // a token it could forge.
  if (password !== ADMIN_PASSWORD) {
    return response.status(401).json({ error: 'Incorrect password. Please try again.' });
  }

  request.session.isAdmin = true;
  return response.json({ ok: true, message: 'Logged in successfully.' });
});

/** POST /api/admin/logout */
router.post('/logout', (request, response) => {
  request.session.destroy(() => {
    response.clearCookie('shop.sid');
    response.json({ ok: true, message: 'Logged out.' });
  });
});

/** GET /api/admin/session - lets the UI check whether it is logged in. */
router.get('/session', (request, response) => {
  response.json({ isAdmin: Boolean(request.session && request.session.isAdmin) });
});

module.exports = router;
