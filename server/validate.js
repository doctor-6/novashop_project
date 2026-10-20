// server/validate.js
// Server-side validation & normalisation for incoming product data.
// The browser validates too, but the server never trusts the client.
'use strict';

const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_CATEGORY_LENGTH = 60;

/**
 * Validate a product payload.
 * @returns {{ ok: true, value: object } | { ok: false, errors: object }}
 */
function validateProduct(body) {
  const errors = {};

  // --- name (required) ---
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    errors.name = 'Product name is required.';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Product name must be at most ${MAX_NAME_LENGTH} characters.`;
  }

  // --- description (required for a nice storefront, kept short) ---
  const description =
    typeof body.description === 'string' ? body.description.trim() : '';
  if (!description) {
    errors.description = 'Description is required.';
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`;
  }

  // --- price (required, non-negative number) ---
  let price = null;
  if (body.price === undefined || body.price === null || body.price === '') {
    errors.price = 'Price is required.';
  } else {
    price = Number(body.price);
    if (!Number.isFinite(price)) {
      errors.price = 'Price must be a valid number.';
    } else if (price < 0) {
      errors.price = 'Price cannot be negative.';
    } else if (price > 1_000_000) {
      errors.price = 'Price looks unreasonably high.';
    } else {
      // Round to 2 decimals to avoid floating point noise in the store.
      price = Math.round(price * 100) / 100;
    }
  }

  // --- category (optional) ---
  const category =
    typeof body.category === 'string' ? body.category.trim() : '';
  if (category.length > MAX_CATEGORY_LENGTH) {
    errors.category = `Category must be at most ${MAX_CATEGORY_LENGTH} characters.`;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: { name, description, price, category },
  };
}

module.exports = { validateProduct };
