// scripts/reset-data.js
// Restores the demo product list to its original seed state.
// Run with:  npm run reset
'use strict';

const path = require('path');
const { resetProducts, createProduct, listProducts } = require(path.join(
  __dirname,
  '..',
  'server',
  'db'
));
const { seedProducts } = require(path.join(__dirname, '..', 'server', 'seed'));

resetProducts();
seedProducts.forEach((product) => createProduct(product));

const restored = listProducts();
console.log(`Reset complete. ${restored.length} demo products restored.`);
console.log('Start the server with:  npm start');
