// server/db.js
// Tiny JSON-file "database". Chosen over SQLite because it needs no native
// modules, is trivial to inspect/reset for a classroom demo, and is more than
// fast enough for a handful of products.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { seedProducts } = require('./seed');

// Overridable so the automated tests can point at a throwaway data file
// instead of the developer's real product database.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'products.json');

/** In-memory cache of the product list. */
let cache = null;

/** Ensure the data directory and file exist, then load them. */
function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]\n', 'utf8');
  }
}

/** Load products from disk (cached after first read). */
function load() {
  if (cache) return cache;
  // Check existence BEFORE ensureStore() creates the file: a missing file is
  // what marks a genuine first run.
  const isFirstRun = !fs.existsSync(DATA_FILE);
  ensureStore();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    cache = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    // A corrupted file should not crash the whole server; start empty.
    console.warn('[db] products.json could not be parsed, starting with empty list.');
    cache = [];
  }

  // Seed demo products only on the very first run, so an admin who deletes
  // everything does not get the seed data back after a restart.
  if (isFirstRun && cache.length === 0) {
    const now = new Date().toISOString();
    cache = seedProducts.map((product) => ({
      id: crypto.randomUUID(),
      ...product,
      createdAt: now,
      updatedAt: now,
    }));
    save();
    console.log(`[db] seeded ${cache.length} demo products.`);
  }
  return cache;
}

/** Persist the in-memory list back to disk (atomic-ish write via temp file). */
function save() {
  ensureStore();
  const tempFile = DATA_FILE + '.tmp';
  fs.writeFileSync(tempFile, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  fs.renameSync(tempFile, DATA_FILE);
}

function listProducts() {
  return load().slice();
}

function getProduct(id) {
  return load().find((product) => product.id === id) || null;
}

function createProduct(data) {
  const now = new Date().toISOString();
  const product = {
    id: crypto.randomUUID(),
    name: data.name,
    description: data.description,
    price: data.price,
    category: data.category || '',
    image: data.image || '',
    createdAt: now,
    updatedAt: now,
  };
  load().push(product);
  save();
  return product;
}

function updateProduct(id, data) {
  const product = getProduct(id);
  if (!product) return null;

  product.name = data.name;
  product.description = data.description;
  product.price = data.price;
  if (data.category !== undefined) product.category = data.category;
  if (data.image !== undefined) product.image = data.image;
  product.updatedAt = new Date().toISOString();
  save();
  return product;
}

function deleteProduct(id) {
  const products = load();
  const index = products.findIndex((product) => product.id === id);
  if (index === -1) return false;
  products.splice(index, 1);
  save();
  return true;
}

/** Remove every product (used by the reset script). */
function resetProducts() {
  cache = [];
  save();
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  resetProducts,
};
