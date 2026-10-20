/* public/admin/js/admin.js
   Admin panel logic: login/session, product CRUD with image upload,
   validation, confirmations and toasts.
   Product text is always rendered with textContent (no innerHTML) so the
   panel is safe against stored XSS. */
'use strict';

(function initAdmin() {
  // --- Element references ----------------------------------------------------
  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');

  const loginForm = document.getElementById('login-form');
  const loginPassword = document.getElementById('login-password');
  const loginPasswordToggle = document.getElementById('login-password-toggle');
  const loginError = document.getElementById('login-error');
  const loginButton = document.getElementById('login-button');
  const logoutButton = document.getElementById('logout-button');

  const themeToggle = document.getElementById('theme-toggle');
  const themeToggleIcon = document.getElementById('theme-toggle-icon');

  const productSummary = document.getElementById('product-summary');
  const tableWrap = document.getElementById('admin-table-wrap');
  const tableBody = document.getElementById('product-table-body');
  const adminLoading = document.getElementById('admin-loading-state');
  const adminError = document.getElementById('admin-error-state');
  const adminErrorMessage = document.getElementById('admin-error-message');
  const adminEmpty = document.getElementById('admin-empty-state');
  const adminRetry = document.getElementById('admin-retry-button');

  const addButton = document.getElementById('add-product-button');
  const emptyAddButton = document.getElementById('empty-add-button');

  const productModal = document.getElementById('product-modal');
  const productForm = document.getElementById('product-form');
  const modalTitle = document.getElementById('modal-title');
  const modalCloseButton = document.getElementById('modal-close-button');
  const cancelButton = document.getElementById('cancel-button');
  const saveButton = document.getElementById('save-button');
  const errorSummary = document.getElementById('form-error-summary');

  const fieldId = document.getElementById('product-id');
  const fieldName = document.getElementById('product-name');
  const fieldPrice = document.getElementById('product-price');
  const fieldCategory = document.getElementById('product-category');
  const fieldDescription = document.getElementById('product-description');
  const fieldImage = document.getElementById('product-image');
  const categoryList = document.getElementById('category-list');

  const imagePreview = document.getElementById('image-preview');
  const imagePreviewImg = document.getElementById('image-preview-img');
  const imagePreviewError = document.getElementById('image-preview-error');
  const removeImageButton = document.getElementById('remove-image-button');
  const undoRemoveImageButton = document.getElementById('undo-remove-image-button');
  const imageRemoveNotice = document.getElementById('image-remove-notice');
  const imageHint = document.getElementById('image-hint');
  const dropZone = document.getElementById('drop-zone');

  const deleteModal = document.getElementById('delete-modal');
  const deleteProductName = document.getElementById('delete-product-name');
  const deleteCancelButton = document.getElementById('delete-cancel-button');
  const deleteConfirmButton = document.getElementById('delete-confirm-button');

  const toastRegion = document.getElementById('toast-region');

  /** All products currently on the server. */
  let products = [];
  /** Product waiting for delete confirmation. */
  let pendingDelete = null;
  /** Object URL used for the local image preview. */
  let previewObjectUrl = null;
  /** Whether the currently-edited product already has an uploaded image. */
  let editingHasImage = false;
  /** Whether the user asked to remove the current photo (edit mode only). */
  let removeImageRequested = false;
  /** Element that opened the current dialog, so focus can be restored. */
  let lastFocusedElement = null;
  /** Upload size limit reported by the server; 5 MB (5,000,000 bytes) fallback until loaded. */
  let maxImageBytes = 5 * 1000 * 1000;

  // --- Small helpers ---------------------------------------------------------

  function formatPrice(price) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(price);
    } catch (error) {
      return `€${Number(price).toFixed(2)}`;
    }
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function showAdminState(state) {
    adminLoading.classList.toggle('is-hidden', state !== 'loading');
    adminError.classList.toggle('is-hidden', state !== 'error');
    adminEmpty.classList.toggle('is-hidden', state !== 'empty');
    tableWrap.classList.toggle('is-hidden', state !== 'table');
  }

  /** Render a byte count as a friendly "5 MB" string (decimal MB, trimmed). */
  function formatMegabytes(bytes) {
    return (bytes / 1000000).toFixed(2).replace(/\.?0+$/, '');
  }

  /** Keep the image hint in sync with the real server limit and edit mode. */
  function updateImageHint() {
    const limitText = `JPEG, PNG or WebP, up to ${formatMegabytes(maxImageBytes)} MB.`;
    const keepText = fieldId.value
      ? 'Leave empty to keep the current photo.'
      : 'A photo is optional.';
    imageHint.textContent = `${limitText} ${keepText}`;
  }

  /**
   * Ask the server for its real upload limit so the hint and the client-side
   * pre-check never drift from the configured backend value.
   */
  async function loadUploadConfig() {
    try {
      const response = await fetch('/api/config', { headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const data = await response.json();
      if (Number.isFinite(data.maxImageBytes) && data.maxImageBytes > 0) {
        maxImageBytes = data.maxImageBytes;
      }
    } catch (error) {
      // Keep the 5 MB fallback; the server re-validates everything anyway.
    }
  }

  // --- Theme (light / dark, shared with the storefront) ----------------------

  const THEME_KEY = 'novatech.theme';

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeToggleIcon.textContent = theme === 'light' ? '🌙' : '☀️';
    themeToggle.setAttribute(
      'aria-label',
      theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'
    );
  }

  function storedTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (error) {
      return null;
    }
  }

  const prefersLight = window.matchMedia('(prefers-color-scheme: light)');
  const savedTheme = storedTheme();
  applyTheme(
    savedTheme === 'light' || savedTheme === 'dark'
      ? savedTheme
      : prefersLight.matches
        ? 'light'
        : 'dark'
  );

  prefersLight.addEventListener('change', (event) => {
    if (!storedTheme()) applyTheme(event.matches ? 'light' : 'dark');
  });

  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (error) {
      // Persistence is a nicety; the toggle still works without it.
    }
  });

  // --- Login password show/hide ----------------------------------------------

  loginPasswordToggle.addEventListener('click', () => {
    const showing = loginPassword.type === 'text';
    loginPassword.type = showing ? 'password' : 'text';
    loginPasswordToggle.textContent = showing ? 'Show' : 'Hide';
    loginPasswordToggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    loginPasswordToggle.setAttribute('aria-pressed', String(!showing));
    loginPassword.focus();
  });

  // --- Toasts ----------------------------------------------------------------

  /** Show a short-lived notification. type: 'success' | 'error' */
  function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type === 'error' ? 'error' : 'success'}`;
    toast.setAttribute('role', 'status');

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = type === 'error' ? '⚠️' : '✅';

    const text = document.createElement('span');
    text.textContent = message;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.textContent = '✕';
    close.addEventListener('click', () => toast.remove());

    toast.append(icon, text, close);
    toastRegion.appendChild(toast);

    // Errors linger a bit longer so they can be read.
    setTimeout(() => toast.remove(), type === 'error' ? 6000 : 4000);
  }

  // --- API helpers -----------------------------------------------------------

  /** Parse a JSON response, tolerating non-JSON answers. */
  async function parseJson(response) {
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  }

  /** GET the current session state. */
  async function fetchSession() {
    const response = await fetch('/api/admin/session', { headers: { Accept: 'application/json' } });
    const { data } = await parseJson(response);
    return Boolean(data.isAdmin);
  }

  /** GET every product. */
  async function fetchProducts() {
    const response = await fetch('/api/products', { headers: { Accept: 'application/json' } });
    const { ok, data } = await parseJson(response);
    if (!ok) throw new Error(data.error || 'Could not load products.');
    return Array.isArray(data.products) ? data.products : [];
  }

  /**
   * Shared submit path for create/update.
   * Uses FormData so the optional image file travels with the same request.
   */
  async function submitProduct(productId, formData) {
    const url = productId ? `/api/products/${productId}` : '/api/products';
    const options = {
      method: productId ? 'PUT' : 'POST',
      body: formData,
      headers: { Accept: 'application/json' },
    };
    const response = await fetch(url, options);
    return parseJson(response);
  }

  // --- View switching --------------------------------------------------------

  function showLogin() {
    loginView.classList.remove('is-hidden');
    dashboardView.classList.add('is-hidden');
    loginPassword.value = '';
    loginError.textContent = '';
    setTimeout(() => loginPassword.focus(), 50);
  }

  function showDashboard() {
    loginView.classList.add('is-hidden');
    dashboardView.classList.remove('is-hidden');
  }

  // --- Login / logout --------------------------------------------------------

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginError.textContent = '';

    const password = loginPassword.value;
    if (!password) {
      loginError.textContent = 'Please enter the admin password.';
      loginPassword.focus();
      return;
    }

    loginButton.disabled = true;
    loginButton.textContent = 'Signing in…';
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ password }),
      });
      const { ok, data } = await parseJson(response);

      if (!ok) {
        loginError.textContent = data.error || 'Incorrect password. Please try again.';
        loginPassword.select();
        return;
      }

      showDashboard();
      await loadProducts();
    } catch (error) {
      loginError.textContent = 'Could not reach the server. Is it running?';
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = 'Sign in';
    }
  });

  logoutButton.addEventListener('click', async () => {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
    } catch (error) {
      // Even if the request fails, fall back to the login screen locally.
    }
    showToast('Logged out.', 'success');
    showLogin();
  });

  // --- Product list rendering ------------------------------------------------

  /** Build the thumbnail cell for one product row. */
  function buildRowThumb(product) {
    if (product.image) {
      const image = document.createElement('img');
      image.className = 'table-thumb';
      image.src = product.image;
      image.alt = `${product.name} photo`;
      image.addEventListener('error', () => {
        // Replace a broken image with the placeholder glyph.
        const placeholder = buildRowThumb({ image: '' });
        image.replaceWith(placeholder);
      });
      return image;
    }
    const placeholder = document.createElement('span');
    placeholder.className = 'table-thumb';
    placeholder.setAttribute('role', 'img');
    placeholder.setAttribute('aria-label', 'No photo');
    placeholder.textContent = '📦';
    return placeholder;
  }

  /** Build one table row. */
  function buildRow(product) {
    const row = document.createElement('tr');

    // Photo
    const photoCell = document.createElement('td');
    photoCell.appendChild(buildRowThumb(product));

    // Name + description snippet
    const nameCell = document.createElement('td');
    nameCell.className = 'cell-name';
    nameCell.textContent = product.name;

    // Category
    const categoryCell = document.createElement('td');
    categoryCell.className = 'cell-category';
    if (product.category) {
      categoryCell.textContent = product.category;
    } else {
      const none = document.createElement('span');
      none.className = 'no-category';
      none.textContent = 'No category';
      categoryCell.appendChild(none);
    }

    // Price
    const priceCell = document.createElement('td');
    priceCell.className = 'cell-price';
    priceCell.textContent = formatPrice(product.price);

    // Updated date
    const dateCell = document.createElement('td');
    dateCell.className = 'cell-date';
    dateCell.textContent = formatDate(product.updatedAt || product.createdAt);

    // Actions
    const actionsCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn-outline btn-sm';
    editButton.textContent = 'Edit';
    editButton.setAttribute('aria-label', `Edit ${product.name}`);
    editButton.addEventListener('click', () => openEditModal(product));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn-danger btn-sm';
    deleteButton.textContent = 'Delete';
    deleteButton.setAttribute('aria-label', `Delete ${product.name}`);
    deleteButton.addEventListener('click', () => openDeleteModal(product));

    actions.append(editButton, deleteButton);
    actionsCell.appendChild(actions);

    row.append(photoCell, nameCell, categoryCell, priceCell, dateCell, actionsCell);
    return row;
  }

  /** Re-render the table from the current `products` array. */
  function renderTable() {
    tableBody.replaceChildren(...products.map(buildRow));

    productSummary.textContent =
      products.length === 0
        ? 'No products yet.'
        : `${products.length} product${products.length === 1 ? '' : 's'} in the catalog.`;

    // Refresh the category suggestions in the modal.
    const categories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
    categoryList.replaceChildren();
    categories.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      categoryList.appendChild(option);
    });

    showAdminState(products.length === 0 ? 'empty' : 'table');
  }

  async function loadProducts() {
    showAdminState('loading');
    try {
      products = await fetchProducts();
      renderTable();
    } catch (error) {
      adminErrorMessage.textContent = error.message || 'Please check the server and try again.';
      showAdminState('error');
    }
  }

  adminRetry.addEventListener('click', loadProducts);

  // --- Validation ------------------------------------------------------------

  /** Reset all inline field errors in the product form. */
  function clearFormErrors() {
    ['name', 'price', 'category', 'description', 'image'].forEach((field) => {
      const error = document.getElementById(`${field}-error`);
      if (error) error.textContent = '';
      const wrapper = document.getElementById(`product-${field}`)?.closest('.form-field');
      if (wrapper) wrapper.classList.remove('is-invalid');
    });
    errorSummary.classList.add('is-hidden');
    errorSummary.textContent = '';
  }

  /** Display server- or client-side field errors. */
  function showFormErrors(errors, summaryMessage) {
    let firstInvalid = null;
    let count = 0;

    Object.entries(errors).forEach(([field, message]) => {
      if (!message) return;
      count += 1;
      const errorElement = document.getElementById(`${field}-error`);
      if (errorElement) errorElement.textContent = message;

      const input = document.getElementById(`product-${field}`);
      const wrapper = input ? input.closest('.form-field') : null;
      if (wrapper) wrapper.classList.add('is-invalid');
      if (!firstInvalid && input) firstInvalid = input;
    });

    if (count > 0) {
      errorSummary.textContent =
        summaryMessage || `Please fix ${count} problem${count === 1 ? '' : 's'} before saving.`;
      errorSummary.classList.remove('is-hidden');
    }
    if (firstInvalid) firstInvalid.focus();
  }

  /** Client-side pre-flight check; the server validates again regardless. */
  function validateForm() {
    const errors = {};
    if (!fieldName.value.trim()) errors.name = 'Product name is required.';
    if (!fieldDescription.value.trim()) errors.description = 'Description is required.';

    const rawPrice = fieldPrice.value.trim();
    const price = Number(rawPrice);
    if (rawPrice === '') {
      errors.price = 'Price is required.';
    } else if (!Number.isFinite(price)) {
      errors.price = 'Price must be a valid number.';
    } else if (price < 0) {
      errors.price = 'Price cannot be negative.';
    }
    return errors;
  }

  // --- Product modal ---------------------------------------------------------

  function updateImagePreview(file) {
    // Drop any previous object URL to avoid a memory leak.
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }

    // A new preview attempt resets the "broken preview" note.
    imagePreviewError.classList.add('is-hidden');
    imagePreviewImg.classList.remove('is-hidden');

    if (file) {
      previewObjectUrl = URL.createObjectURL(file);
      imagePreviewImg.src = previewObjectUrl;
      imagePreview.classList.remove('is-hidden');
      removeImageButton.textContent = 'Remove selection';
    } else if (editingHasImage && !removeImageRequested) {
      // Editing an existing product with an image: show the current photo.
      const product = products.find((item) => item.id === fieldId.value);
      imagePreviewImg.src = product ? product.image : '';
      imagePreview.classList.remove('is-hidden');
      removeImageButton.textContent = 'Remove photo';
    } else {
      imagePreviewImg.removeAttribute('src');
      imagePreview.classList.add('is-hidden');
    }

    // Make the pending removal visible (and reversible) before saving.
    imageRemoveNotice.classList.toggle(
      'is-hidden',
      !(editingHasImage && removeImageRequested)
    );
  }

  // --- Dialog helpers (shared by product + delete modals) -------------------

  const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), ' +
    'textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /** Hide the rest of the page from pointer/keyboard while a dialog is open. */
  function setBackgroundInert(isInert) {
    [loginView, dashboardView].forEach((view) => {
      if (isInert) {
        view.setAttribute('inert', '');
      } else {
        view.removeAttribute('inert');
      }
    });
  }

  function openDialog(dialog, trigger) {
    lastFocusedElement = trigger || document.activeElement;
    dialog.classList.remove('is-hidden');
    document.body.style.overflow = 'hidden';
    setBackgroundInert(true);
  }

  function closeDialog(dialog) {
    dialog.classList.add('is-hidden');
    document.body.style.overflow = '';
    setBackgroundInert(false);
    // Return keyboard focus to whatever opened the dialog.
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
    lastFocusedElement = null;
  }

  /** Keep Tab / Shift+Tab cycling inside the open dialog. */
  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    let dialog = null;
    if (!productModal.classList.contains('is-hidden')) dialog = productModal;
    else if (!deleteModal.classList.contains('is-hidden')) dialog = deleteModal;
    if (!dialog) return;

    const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
      (element) => element.offsetParent !== null
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  document.addEventListener('keydown', trapFocus);

  // --- Product modal ---------------------------------------------------------

  function openModal() {
    openDialog(productModal);
    setTimeout(() => fieldName.focus(), 50);
  }

  function closeModal() {
    productForm.reset();
    clearFormErrors();
    editingHasImage = false;
    removeImageRequested = false;
    removeImageButton.textContent = 'Remove photo';
    updateImagePreview(null);
    closeDialog(productModal);
  }

  function openAddModal() {
    productForm.reset();
    clearFormErrors();
    fieldId.value = '';
    modalTitle.textContent = 'Add product';
    saveButton.textContent = 'Create product';
    editingHasImage = false;
    removeImageRequested = false;
    removeImageButton.textContent = 'Remove photo';
    updateImageHint();
    updateImagePreview(null);
    openModal();
  }

  function openEditModal(product) {
    productForm.reset();
    clearFormErrors();
    fieldId.value = product.id;
    fieldName.value = product.name;
    fieldPrice.value = String(product.price);
    fieldCategory.value = product.category || '';
    fieldDescription.value = product.description || '';
    editingHasImage = Boolean(product.image);
    removeImageRequested = false;
    removeImageButton.textContent = 'Remove photo';
    modalTitle.textContent = 'Edit product';
    saveButton.textContent = 'Save changes';
    // Reset the file input: keep the current image unless a new one is chosen.
    fieldImage.value = '';
    updateImageHint();
    updateImagePreview(null);
    openModal();
  }

  addButton.addEventListener('click', openAddModal);
  emptyAddButton.addEventListener('click', openAddModal);
  modalCloseButton.addEventListener('click', closeModal);
  cancelButton.addEventListener('click', closeModal);

  // Close the modal when clicking the dark backdrop (but not inside the card).
  productModal.addEventListener('click', (event) => {
    if (event.target === productModal) closeModal();
  });

  /**
   * Shared client-side image check used by both the file input and the
   * drag & drop zone. Shows a friendly inline error and refreshes the
   * preview. The server re-validates everything on save regardless.
   */
  function acceptImageFile(file) {
    const imageError = document.getElementById('image-error');
    imageError.textContent = '';

    if (!file) {
      updateImagePreview(null);
      return false;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      imageError.textContent = 'Please choose a JPEG, PNG or WebP image.';
      updateImagePreview(null);
      return false;
    }
    if (file.size > maxImageBytes) {
      imageError.textContent = `Image is too large. Maximum size is ${formatMegabytes(maxImageBytes)} MB.`;
      updateImagePreview(null);
      return false;
    }
    updateImagePreview(file);
    return true;
  }

  /** Validate a dropped file and attach it to the real file input. */
  function acceptDroppedFile(file) {
    if (!acceptImageFile(file)) {
      fieldImage.value = '';
      return;
    }
    // DataTransfer lets a dropped file travel through the normal file input,
    // so the existing FormData upload path keeps working unchanged.
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fieldImage.files = transfer.files;
  }

  fieldImage.addEventListener('change', () => {
    const file = fieldImage.files && fieldImage.files[0];
    if (!acceptImageFile(file)) {
      fieldImage.value = '';
    }
  });

  // --- Drag & drop upload zone -----------------------------------------------

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add('is-dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove('is-dragover');
    });
  });

  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    acceptDroppedFile(file);
  });

  // If the preview image cannot load (e.g. the file was deleted on the
  // server), explain that instead of showing a broken-image box.
  imagePreviewImg.addEventListener('error', () => {
    imagePreviewImg.classList.add('is-hidden');
    imagePreviewError.classList.remove('is-hidden');
  });

  removeImageButton.addEventListener('click', () => {
    const file = fieldImage.files && fieldImage.files[0];

    if (file) {
      // Discard only the newly selected file; an existing photo stays.
      fieldImage.value = '';
      updateImagePreview(null);
      return;
    }

    // Editing an existing product: mark its photo for removal on save.
    // The notice below the preview makes this visible before saving.
    if (editingHasImage) {
      removeImageRequested = true;
      updateImagePreview(null);
    }
  });

  undoRemoveImageButton.addEventListener('click', () => {
    removeImageRequested = false;
    fieldImage.value = '';
    updateImagePreview(null);
  });

  // --- Save (create / update) ------------------------------------------------

  productForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors();

    const clientErrors = validateForm();
    if (Object.keys(clientErrors).length > 0) {
      showFormErrors(clientErrors);
      return;
    }

    const productId = fieldId.value;
    const formData = new FormData();
    formData.append('name', fieldName.value.trim());
    formData.append('price', fieldPrice.value.trim());
    formData.append('category', fieldCategory.value.trim());
    formData.append('description', fieldDescription.value.trim());

    const file = fieldImage.files && fieldImage.files[0];
    if (file) {
      formData.append('image', file);
    } else if (productId && removeImageRequested) {
      // Explicit removal signal for an existing photo. Without it (or a new
      // file) the server keeps the current image untouched.
      formData.append('removeImage', 'true');
    }

    saveButton.disabled = true;
    const originalLabel = saveButton.textContent;
    saveButton.textContent = 'Saving…';

    try {
      const { ok, status, data } = await submitProduct(productId, formData);

      if (ok) {
        closeModal();
        showToast(
          productId ? 'Product updated successfully.' : 'Product created successfully.',
          'success'
        );
        await loadProducts();
        return;
      }

      // Something went wrong - show what the server reported.
      if (status === 401) {
        closeModal();
        showToast('Your session expired. Please log in again.', 'error');
        showLogin();
        return;
      }
      showFormErrors(data.errors || {}, data.error);
      showToast(data.error || 'Could not save the product.', 'error');
    } catch (error) {
      showToast('Could not reach the server. Is it running?', 'error');
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = originalLabel;
    }
  });

  // --- Delete confirmation ---------------------------------------------------

  function openDeleteModal(product) {
    pendingDelete = product;
    deleteProductName.textContent = product.name;
    openDialog(deleteModal);
    setTimeout(() => deleteCancelButton.focus(), 50);
  }

  function closeDeleteModal() {
    pendingDelete = null;
    closeDialog(deleteModal);
  }

  deleteCancelButton.addEventListener('click', closeDeleteModal);
  deleteModal.addEventListener('click', (event) => {
    if (event.target === deleteModal) closeDeleteModal();
  });

  deleteConfirmButton.addEventListener('click', async () => {
    if (!pendingDelete) return;
    const product = pendingDelete;

    deleteConfirmButton.disabled = true;
    deleteConfirmButton.textContent = 'Deleting…';

    try {
      const response = await fetch(`/api/products/${product.id}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      const { ok, status, data } = await parseJson(response);

      if (ok) {
        closeDeleteModal();
        showToast(`“${product.name}” deleted.`, 'success');
        await loadProducts();
      } else if (status === 401) {
        closeDeleteModal();
        showToast('Your session expired. Please log in again.', 'error');
        showLogin();
      } else {
        showToast(data.error || 'Could not delete the product.', 'error');
      }
    } catch (error) {
      showToast('Could not reach the server. Is it running?', 'error');
    } finally {
      deleteConfirmButton.disabled = false;
      deleteConfirmButton.textContent = 'Delete';
    }
  });

  // --- Global keyboard handling ----------------------------------------------

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    // Close whichever dialog is open; Escape should never throw errors.
    if (!deleteModal.classList.contains('is-hidden')) {
      closeDeleteModal();
    } else if (!productModal.classList.contains('is-hidden')) {
      closeModal();
    }
  });

  // --- Boot ------------------------------------------------------------------

  (async function boot() {
    await loadUploadConfig();
    try {
      const isAdmin = await fetchSession();
      if (isAdmin) {
        showDashboard();
        await loadProducts();
      } else {
        showLogin();
      }
    } catch (error) {
      showLogin();
      showToast('Could not reach the server. Is it running?', 'error');
    }
  })();
})();
