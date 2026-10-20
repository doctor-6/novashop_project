// server/routes/products.js
// Product CRUD API. Reads and writes go through server/db.js so the
// storefront and the admin panel always share the same data source.
'use strict';

const express = require('express');
const db = require('../db');
const { validateProduct } = require('../validate');
const {
  upload,
  validateUploadedImage,
  deleteImageFile,
  discardUploadedFile,
  MAX_IMAGE_BYTES,
} = require('../upload');

const router = express.Router();

/** Middleware: protect every write operation behind the admin session. */
function requireAdmin(request, response, next) {
  if (request.session && request.session.isAdmin) return next();
  return response.status(401).json({
    error: 'You must be logged in as an admin to do that.',
  });
}

/** GET /api/products - public product list for storefront and admin. */
router.get('/', (request, response) => {
  response.json({ products: db.listProducts() });
});

/** GET /api/products/:id - public single product. */
router.get('/:id', (request, response) => {
  const product = db.getProduct(request.params.id);
  if (!product) {
    return response.status(404).json({ error: 'Product not found.' });
  }
  response.json({ product });
});

/**
 * Did the client explicitly ask to remove the current photo?
 * Reads the multipart text field "removeImage" (never a query string, so the
 * intent always travels with the authenticated update itself).
 */
function isRemoveImageRequested(body) {
  const raw = body ? body.removeImage : undefined;
  return raw === true || raw === 'true' || raw === '1';
}

/**
 * Shared handler for create (POST) and update (PUT).
 * Both accept multipart/form-data with an optional "image" file.
 */
function handleWrite(request, response, isNew) {
  // 1. Validate the text fields.
  const validation = validateProduct(request.body || {});
  if (!validation.ok) {
    // Multer already wrote any uploaded file to disk - do not leave it orphaned.
    discardUploadedFile(request.file);
    return response.status(400).json({
      error: 'Please fix the highlighted fields.',
      errors: validation.errors,
    });
  }

  const value = validation.value;
  const uploadedFile = request.file;

  // 2. Handle the optional image upload (type is sniffed, never trusted).
  let imageUrl;
  if (uploadedFile) {
    const imageCheck = validateUploadedImage(uploadedFile);
    if (!imageCheck.ok) {
      return response.status(400).json({
        error: imageCheck.error,
        errors: { image: imageCheck.error },
      });
    }
    imageUrl = imageCheck.value.url;
  }

  if (isNew) {
    const product = db.createProduct({ ...value, image: imageUrl || '' });
    return response.status(201).json({ ok: true, product });
  }

  // Update path.
  const existing = db.getProduct(request.params.id);
  if (!existing) {
    if (imageUrl) deleteImageFile(imageUrl); // do not leave orphan files
    return response.status(404).json({ error: 'Product not found.' });
  }

  // Decide the image for the updated product:
  //  - a newly uploaded file always replaces the current one,
  //  - otherwise an explicit removeImage request clears it,
  //  - otherwise the existing image is preserved.
  // (db.updateProduct() mutates the cached product in place, so remember the
  // previous image before writing.)
  const previousImage = existing.image;
  let nextImage = previousImage;
  if (imageUrl !== undefined) {
    nextImage = imageUrl;
  } else if (isRemoveImageRequested(request.body)) {
    nextImage = '';
  }

  const updated = db.updateProduct(request.params.id, {
    ...value,
    image: nextImage,
  });

  // Remove the previous image from disk once the new state is stored.
  // deleteImageFile() only ever touches files inside uploads/, so bundled
  // seed illustrations (public/img/products/*.svg) can never be deleted.
  if (previousImage && previousImage !== nextImage) {
    deleteImageFile(previousImage);
  }

  return response.json({ ok: true, product: updated });
}

/** POST /api/products - create (admin only). */
router.post('/', requireAdmin, upload.single('image'), (request, response) => {
  handleWrite(request, response, true);
});

/** PUT /api/products/:id - update (admin only). */
router.put('/:id', requireAdmin, upload.single('image'), (request, response) => {
  handleWrite(request, response, false);
});

/** DELETE /api/products/:id - delete (admin only). */
router.delete('/:id', requireAdmin, (request, response) => {
  const product = db.getProduct(request.params.id);
  if (!product) {
    return response.status(404).json({ error: 'Product not found.' });
  }
  db.deleteProduct(request.params.id);
  if (product.image) deleteImageFile(product.image);
  response.json({ ok: true, message: 'Product deleted.' });
});

/**
 * Multer errors (e.g. oversized files) are surfaced through this wrapper so
 * the API always answers with readable JSON instead of an HTML error page.
 */
function handleUploadErrors(error, request, response, next) {
  if (!error) return next();
  if (error.code === 'LIMIT_FILE_SIZE') {
    // Derive the displayed limit from the real configured byte limit.
    // Decimal MB (bytes / 1,000,000) with trailing zeros trimmed, so the
    // 5,000,000 byte limit reads "5 MB" instead of a misleading "4.77 MB".
    const limitMb = (MAX_IMAGE_BYTES / 1000000).toFixed(2).replace(/\.?0+$/, '');
    return response.status(400).json({
      error: `Image is too large. Maximum size is ${limitMb} MB.`,
      errors: { image: `Maximum size is ${limitMb} MB.` },
    });
  }
  console.error('[products] unexpected upload error:', error.message);
  return response.status(500).json({ error: 'Something went wrong handling the upload.' });
}

// Register the error handler on this router (runs after upload middleware).
router.use(handleUploadErrors);

module.exports = router;
