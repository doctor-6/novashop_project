// scripts/test-api.js
// End-to-end smoke test for the demo API (verification checklist from AGENTS.md).
// Run with the server already started:  node scripts/test-api.js
'use strict';

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;

function report(name, ok, extra) {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${extra ? ' -> ' + extra : ''}`);
  }
}

/** Keep cookies across requests so we can simulate the admin session. */
function makeClient() {
  let cookie = '';
  return async function request(path, options = {}) {
    const headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
    if (cookie) headers.Cookie = cookie;
    if (options.body && !headers['Content-Type'] && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(BASE + path, { ...options, headers });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      cookie = setCookie.split(';')[0];
    }
    let data = null;
    const type = response.headers.get('content-type') || '';
    if (type.includes('application/json')) {
      data = await response.json();
    }
    return { status: response.status, data, raw: response };
  };
}

// Minimal valid 1x1 PNG for upload tests.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function main() {
  const guest = makeClient(); // no session
  const admin = makeClient(); // will log in

  console.log('\n== 1. Public product list ==');
  const list = await guest('/api/products');
  report('GET /api/products returns 200 + seeded products',
    list.status === 200 && Array.isArray(list.data.products) && list.data.products.length > 0,
    `status=${list.status}`);
  const seedId = list.data && list.data.products[0] ? list.data.products[0].id : null;

  const config = await guest('/api/config');
  report('GET /api/config exposes the upload limit',
    config.status === 200 && Number.isFinite(config.data.maxImageBytes) && config.data.maxImageBytes > 0,
    `status=${config.status}`);
  const maxImageBytes =
    config.data && Number.isFinite(config.data.maxImageBytes) && config.data.maxImageBytes > 0
      ? config.data.maxImageBytes
      : 5 * 1000 * 1000;
  // Same formatting rule as the server: decimal MB with trailing zeros trimmed.
  const limitMbText = (maxImageBytes / 1000000).toFixed(2).replace(/\.?0+$/, '');
  const expectedLimitText = `Maximum size is ${limitMbText} MB.`;

  const single = await guest(`/api/products/${seedId}`);
  report('GET /api/products/:id returns one product',
    single.status === 200 && single.data.product && single.data.product.id === seedId);

  const missing = await guest('/api/products/does-not-exist');
  report('GET /api/products/:id 404 for unknown id', missing.status === 404);

  console.log('\n== 2. Auth protection (logged-out writes rejected) ==');
  const guestPost = await guest('/api/products', {
    method: 'POST',
    body: JSON.stringify({ name: 'Hacker', description: 'x', price: 1 }),
  });
  report('POST without session -> 401', guestPost.status === 401, `status=${guestPost.status}`);

  const guestPut = await guest(`/api/products/${seedId}`, {
    method: 'PUT',
    body: JSON.stringify({ name: 'Hacked', description: 'x', price: 1 }),
  });
  report('PUT without session -> 401', guestPut.status === 401, `status=${guestPut.status}`);

  const guestDelete = await guest(`/api/products/${seedId}`, { method: 'DELETE' });
  report('DELETE without session -> 401', guestDelete.status === 401, `status=${guestDelete.status}`);

  console.log('\n== 3. Admin login ==');
  const badLogin = await admin('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password: 'wrong-password' }),
  });
  report('Login with wrong password -> 401', badLogin.status === 401, `status=${badLogin.status}`);

  const emptyLogin = await admin('/api/admin/login', { method: 'POST', body: JSON.stringify({}) });
  report('Login with empty password -> 400', emptyLogin.status === 400, `status=${emptyLogin.status}`);

  const goodLogin = await admin('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password: '1234' }),
  });
  report('Login with demo password -> 200', goodLogin.status === 200 && goodLogin.data.ok === true,
    `status=${goodLogin.status}`);

  const session = await admin('/api/admin/session');
  report('GET /api/admin/session reports isAdmin=true',
    session.status === 200 && session.data.isAdmin === true);

  const guestSession = await guest('/api/admin/session');
  report('Session for logged-out client reports isAdmin=false',
    guestSession.status === 200 && guestSession.data.isAdmin === false);

  console.log('\n== 4. Create / update / delete round-trip ==');
  const created = await admin('/api/products', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test Widget X1',
      description: 'A temporary product created by the smoke test.',
      price: 12.34,
      category: 'Testing',
    }),
  });
  report('POST creates product (201)',
    created.status === 201 && created.data.product && created.data.product.id,
    `status=${created.status}`);
  const testId = created.data && created.data.product ? created.data.product.id : null;

  const invalidPrice = await admin('/api/products', {
    method: 'POST',
    body: JSON.stringify({ name: 'Bad price', description: 'x', price: -5 }),
  });
  report('POST with negative price -> 400 + field error',
    invalidPrice.status === 400 && invalidPrice.data.errors && invalidPrice.data.errors.price,
    `status=${invalidPrice.status}`);

  const missingFields = await admin('/api/products', {
    method: 'POST',
    body: JSON.stringify({ name: '', description: '', price: '' }),
  });
  report('POST with empty fields -> 400 + errors for name/description/price',
    missingFields.status === 400 &&
      missingFields.data.errors.name &&
      missingFields.data.errors.description &&
      missingFields.data.errors.price,
    `status=${missingFields.status}`);

  const updated = await admin(`/api/products/${testId}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: 'Test Widget X2 (renamed)',
      description: 'Updated by smoke test.',
      price: 99.5,
      category: 'Testing',
    }),
  });
  report('PUT updates name and price',
    updated.status === 200 &&
      updated.data.product.name === 'Test Widget X2 (renamed)' &&
      updated.data.product.price === 99.5,
    `status=${updated.status}`);

  const listedAfterUpdate = await guest('/api/products');
  const updatedVisible = listedAfterUpdate.data.products.find((p) => p.id === testId);
  report('Updated product visible in public list with new values',
    updatedVisible && updatedVisible.name === 'Test Widget X2 (renamed)' && updatedVisible.price === 99.5);

  console.log('\n== 5. Image upload handling ==');
  const formWithImage = new FormData();
  formWithImage.append('name', 'Uploaded Image Product');
  formWithImage.append('description', 'Has a real uploaded PNG.');
  formWithImage.append('price', '7.25');
  formWithImage.append('category', 'Testing');
  formWithImage.append('image', new Blob([PNG_1PX], { type: 'image/png' }), 'test.png');

  const withImage = await admin('/api/products', { method: 'POST', body: formWithImage });
  const imageUrl =
    withImage.data && withImage.data.product ? withImage.data.product.image : '';
  report('POST with PNG upload -> 201 and stores /uploads/ path',
    withImage.status === 201 && /^\/uploads\/.+\.png$/.test(imageUrl),
    `status=${withImage.status} image=${imageUrl}`);

  if (imageUrl) {
    const imageResponse = await guest(imageUrl);
    report('Uploaded image is served with image content-type',
      imageResponse.status === 200 &&
        (imageResponse.raw.headers.get('content-type') || '').startsWith('image/'),
      `status=${imageResponse.status}`);
  }

  // A text file pretending to be an image must be rejected by magic-byte check.
  const fakeImage = new FormData();
  fakeImage.append('name', 'Fake Image');
  fakeImage.append('description', 'This is actually a text file.');
  fakeImage.append('price', '1');
  fakeImage.append('image', new Blob(['not really an image at all'], { type: 'image/png' }), 'evil.png');
  const rejected = await admin('/api/products', { method: 'POST', body: fakeImage });
  report('Text file with image MIME -> 400 (magic-byte sniffing)',
    rejected.status === 400 && rejected.data.error && /type|JPEG/i.test(rejected.data.error),
    `status=${rejected.status} msg=${rejected.data && rejected.data.error}`);

  // Upload size boundary: below, exactly at and above the configured limit.
  // The payload is a valid PNG header padded with zeroes to an exact size, so
  // it passes the magic-byte check and only the size limit can reject it.
  function pngOfSize(totalBytes) {
    if (totalBytes <= PNG_1PX.length) return PNG_1PX.subarray(0, totalBytes);
    return Buffer.concat([PNG_1PX, Buffer.alloc(totalBytes - PNG_1PX.length)]);
  }

  async function uploadPngOfSize(size, name) {
    const form = new FormData();
    form.append('name', name);
    form.append('description', `PNG payload of exactly ${size} bytes.`);
    form.append('price', '3.5');
    form.append('category', 'Testing');
    form.append('image', new Blob([pngOfSize(size)], { type: 'image/png' }), 'size-test.png');
    const result = await admin('/api/products', { method: 'POST', body: form });
    if (result.status === 201 && result.data && result.data.product) {
      await admin(`/api/products/${result.data.product.id}`, { method: 'DELETE' });
    }
    return result;
  }

  const justBelow = await uploadPngOfSize(maxImageBytes - 1, 'Size Test Just Below');
  report(`Image one byte under the limit (${maxImageBytes - 1} B) -> 201`,
    justBelow.status === 201, `status=${justBelow.status}`);

  const atLimit = await uploadPngOfSize(maxImageBytes, 'Size Test At Limit');
  report(`Image exactly at the limit (${maxImageBytes} B) -> 201`,
    atLimit.status === 201, `status=${atLimit.status}`);

  // One byte over the limit must be rejected by multer's size limit.
  const bigForm = new FormData();
  bigForm.append('name', 'Huge Image');
  bigForm.append('description', 'Too big.');
  bigForm.append('price', '1');
  bigForm.append('image', new Blob([pngOfSize(maxImageBytes + 1)], { type: 'image/png' }), 'big.png');
  const tooBig = await admin('/api/products', { method: 'POST', body: bigForm });
  report(`Oversized image (limit + 1 B = ${maxImageBytes + 1} B) -> 400`,
    tooBig.status === 400 && tooBig.data.error && /large|size/i.test(tooBig.data.error),
    `status=${tooBig.status} msg=${tooBig.data && tooBig.data.error}`);
  report('Oversized message states the real configured limit',
    tooBig.status === 400 && tooBig.data.error && tooBig.data.error.includes(expectedLimitText),
    `expected "${expectedLimitText}" got "${tooBig.data && tooBig.data.error}"`);

  console.log('\n== 5b. Image lifecycle: preserve / replace / remove ==');
  // Uses the product created in section 5, which has a real uploaded PNG.
  const withImageId = withImage.data && withImage.data.product ? withImage.data.product.id : null;

  if (withImageId && imageUrl) {
    // (1) A plain update with no image-related change must keep the photo.
    const plainForm = new FormData();
    plainForm.append('name', 'Uploaded Image Product');
    plainForm.append('description', 'Has a real uploaded PNG. (edited)');
    plainForm.append('price', '8.00');
    plainForm.append('category', 'Testing');
    const preserved = await admin(`/api/products/${withImageId}`, { method: 'PUT', body: plainForm });
    report('PUT without image change preserves the uploaded photo',
      preserved.status === 200 && preserved.data.product.image === imageUrl,
      `status=${preserved.status} image=${preserved.data && preserved.data.product && preserved.data.product.image}`);
    const stillServed = await guest(imageUrl);
    report('Preserved photo file still served after plain PUT',
      stillServed.status === 200, `status=${stillServed.status}`);

    // (2) Uploading a new image replaces the reference and removes the old file.
    const replacementForm = new FormData();
    replacementForm.append('name', 'Uploaded Image Product');
    replacementForm.append('description', 'Now with a replacement photo.');
    replacementForm.append('price', '8.00');
    replacementForm.append('category', 'Testing');
    replacementForm.append('image', new Blob([PNG_1PX], { type: 'image/png' }), 'replacement.png');
    const replaced = await admin(`/api/products/${withImageId}`, { method: 'PUT', body: replacementForm });
    const newImageUrl = replaced.data && replaced.data.product ? replaced.data.product.image : '';
    report('PUT with new upload replaces the image reference',
      replaced.status === 200 && /^\/uploads\/.+\.png$/.test(newImageUrl) && newImageUrl !== imageUrl,
      `status=${replaced.status} image=${newImageUrl}`);
    const oldGone = await guest(imageUrl);
    report('Previous upload file deleted after replacement (404)',
      oldGone.status === 404, `status=${oldGone.status}`);
    const newServed = await guest(newImageUrl);
    report('Replacement upload served', newServed.status === 200, `status=${newServed.status}`);

    // (3) An explicit removeImage request clears the reference and the file.
    const removeForm = new FormData();
    removeForm.append('name', 'Uploaded Image Product');
    removeForm.append('description', 'Photo removed again.');
    removeForm.append('price', '8.00');
    removeForm.append('category', 'Testing');
    removeForm.append('removeImage', 'true');
    const removed = await admin(`/api/products/${withImageId}`, { method: 'PUT', body: removeForm });
    report('PUT with removeImage=true clears the image reference',
      removed.status === 200 && removed.data.product.image === '',
      `status=${removed.status} image=${removed.data && removed.data.product && removed.data.product.image}`);
    const removedGone = await guest(newImageUrl);
    report('Removed upload file deleted from disk (404)',
      removedGone.status === 404, `status=${removedGone.status}`);

    // (4) A second removeImage request on a product without an image is a no-op.
    const removeAgain = await admin(`/api/products/${withImageId}`, { method: 'PUT', body: removeForm });
    report('removeImage on an imageless product is a safe no-op',
      removeAgain.status === 200 && removeAgain.data.product.image === '');
  } else {
    report('Setup for image lifecycle tests (upload product with PNG)', false,
      'product or image URL missing');
  }

  // (5) Bundled seed illustrations must never be deleted from disk.
  const seedProduct = (list.data.products || []).find(
    (product) => product.image && product.image.startsWith('/img/')
  );
  if (seedProduct) {
    const seedImageUrl = seedProduct.image;
    const seedRemoveForm = new FormData();
    seedRemoveForm.append('name', seedProduct.name);
    seedRemoveForm.append('description', seedProduct.description);
    seedRemoveForm.append('price', String(seedProduct.price));
    seedRemoveForm.append('category', seedProduct.category || '');
    seedRemoveForm.append('removeImage', 'true');
    const seedRemoved = await admin(`/api/products/${seedProduct.id}`, { method: 'PUT', body: seedRemoveForm });
    report('removeImage clears a bundled image reference',
      seedRemoved.status === 200 && seedRemoved.data.product.image === '',
      `status=${seedRemoved.status}`);
    const bundledStillThere = await guest(seedImageUrl);
    report('Bundled seed illustration is NOT deleted from disk',
      bundledStillThere.status === 200, `status=${seedRemoved.status} file=${seedImageUrl}`);
    // Restore the seed product's text fields (the cleared image reference
    // cannot be restored through the API; harmless in isolated test runs).
    await admin(`/api/products/${seedProduct.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: seedProduct.name,
        description: seedProduct.description,
        price: seedProduct.price,
        category: seedProduct.category || '',
      }),
    });
  } else {
    report('Setup for bundled-image test (seed product with /img/ image)', false, 'none found');
  }

  console.log('\n== 5c. Safe rendering + upload 404 ==');
  // HTML-like product text must round-trip verbatim so the frontends can show
  // it with textContent as plain text (browser rendering is a manual QA item).
  const xssName = '<img src=x onerror="alert(1)">';
  const xssDescription = '<script>alert("xss")</script> & "quotes"';
  const xssCreated = await admin('/api/products', {
    method: 'POST',
    body: JSON.stringify({ name: xssName, description: xssDescription, price: 1 }),
  });
  report('HTML-like strings stored and returned verbatim as JSON',
    xssCreated.status === 201 &&
      xssCreated.data.product.name === xssName &&
      xssCreated.data.product.description === xssDescription,
    `status=${xssCreated.status}`);
  if (xssCreated.status === 201) {
    const xssFetched = await guest(`/api/products/${xssCreated.data.product.id}`);
    report('Fetched product keeps HTML-like text as plain data',
      xssFetched.status === 200 &&
        (xssFetched.raw.headers.get('content-type') || '').includes('application/json') &&
        xssFetched.data.product.name === xssName);
    await admin(`/api/products/${xssCreated.data.product.id}`, { method: 'DELETE' });
  }

  const missingUpload = await guest('/uploads/definitely-not-a-real-file.png');
  report('Missing file under /uploads -> 404 (not 500)',
    missingUpload.status === 404, `status=${missingUpload.status}`);

  console.log('\n== 6. Delete round-trip ==');
  const deleted = await admin(`/api/products/${testId}`, { method: 'DELETE' });
  report('DELETE removes the product', deleted.status === 200 && deleted.data.ok === true);

  const afterDelete = await guest('/api/products');
  report('Deleted product no longer in public list',
    !afterDelete.data.products.some((p) => p.id === testId));

  const deleteAgain = await admin(`/api/products/${testId}`, { method: 'DELETE' });
  report('DELETE unknown id -> 404', deleteAgain.status === 404);

  // Clean up the uploaded-image product too.
  if (withImage.status === 201 && withImage.data.product) {
    await admin(`/api/products/${withImage.data.product.id}`, { method: 'DELETE' });
  }

  console.log('\n== 7. Static pages ==');
  const home = await guest('/');
  report('Storefront HTML served at /', home.status === 200 &&
    (home.raw.headers.get('content-type') || '').includes('text/html'));

  const adminPage = await guest('/admin/');
  report('Admin HTML served at /admin/', adminPage.status === 200);

  const storefrontJs = await guest('/js/storefront.js');
  report('Storefront JS served', storefrontJs.status === 200);
  const adminJs = await guest('/admin/js/admin.js');
  report('Admin JS served', adminJs.status === 200);
  const css = await guest('/css/styles.css');
  report('Storefront CSS served', css.status === 200);

  const unknownApi = await guest('/api/definitely-not-a-route');
  report('Unknown /api route -> JSON 404 (not HTML)', unknownApi.status === 404 && unknownApi.data);

  console.log('\n== 8. Logout ==');
  const logout = await admin('/api/admin/logout', { method: 'POST' });
  report('POST /api/admin/logout -> 200', logout.status === 200);

  const postLogoutWrite = await admin('/api/products', {
    method: 'POST',
    body: JSON.stringify({ name: 'After logout', description: 'x', price: 1 }),
  });
  report('Write after logout -> 401', postLogoutWrite.status === 401, `status=${postLogoutWrite.status}`);

  console.log(`\n================ RESULT: ${passed} passed, ${failed} failed ================\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Test runner crashed:', error);
  process.exit(1);
});
