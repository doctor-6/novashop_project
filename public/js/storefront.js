/* public/js/storefront.js
   Loads products from the API and renders them with search + category filter,
   sorting, search-match highlighting, a product quick-view dialog and a
   clearly-labelled demo cart. Also manages the light/dark theme toggle.
   All product-provided text is inserted with textContent (or split into text
   nodes) so the shop can never be used to inject HTML/scripts. */
'use strict';

(function initStorefront() {
  // --- Element references ---
  const grid = document.getElementById('product-grid');
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const categorySelect = document.getElementById('category-select');
  const sortSelect = document.getElementById('sort-select');
  const resultCount = document.getElementById('result-count');

  const errorState = document.getElementById('error-state');
  const errorMessage = document.getElementById('error-message');
  const emptyState = document.getElementById('empty-state');
  const emptyMessage = document.getElementById('empty-message');

  const retryButton = document.getElementById('retry-button');
  const clearFiltersButton = document.getElementById('clear-filters-button');
  const statProducts = document.getElementById('stat-products');

  // Quick-view dialog
  const productDialog = document.getElementById('product-dialog');
  const quickviewClose = document.getElementById('quickview-close');
  const quickviewMedia = document.getElementById('quickview-media');
  const quickviewCategory = document.getElementById('quickview-category');
  const quickviewTitle = document.getElementById('quickview-title');
  const quickviewDesc = document.getElementById('quickview-desc');
  const quickviewPrice = document.getElementById('quickview-price');
  const quickviewAdd = document.getElementById('quickview-add');

  // Demo cart drawer
  const cartButton = document.getElementById('cart-button');
  const cartCount = document.getElementById('cart-count');
  const cartDrawer = document.getElementById('cart-drawer');
  const cartBackdrop = document.getElementById('cart-backdrop');
  const cartClose = document.getElementById('cart-close');
  const cartItems = document.getElementById('cart-items');
  const cartEmpty = document.getElementById('cart-empty');
  const cartTotal = document.getElementById('cart-total');
  const cartClear = document.getElementById('cart-clear');

  // Theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  const themeToggleIcon = document.getElementById('theme-toggle-icon');
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');

  /** All products loaded from the API. */
  let products = [];
  /** Product currently shown in the quick-view dialog. */
  let quickviewProduct = null;
  /** Element that opened the quick-view dialog (focus restore). */
  let quickviewTrigger = null;
  /** Element that opened the cart drawer (focus restore). */
  let cartReturnFocus = null;
  /** Pending timeout that reverts the "Added ✓" quick-view feedback. */
  let quickviewAddTimer = null;

  const THEME_KEY = 'novatech.theme';
  const CART_KEY = 'novatech.cart';
  /** A product is flagged "New" if created within this many days. */
  const NEW_PRODUCT_DAYS = 7;

  // --- Helpers ---------------------------------------------------------------

  /** Format a number as a local currency string (e.g. €129.99). */
  function formatPrice(price) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'EUR',
      }).format(price);
    } catch (error) {
      return `€${Number(price).toFixed(2)}`;
    }
  }

  /** Whether a product was created within the last NEW_PRODUCT_DAYS days. */
  function isNew(product) {
    const created = new Date(product.createdAt || '');
    if (Number.isNaN(created.getTime())) return false;
    return Date.now() - created.getTime() < NEW_PRODUCT_DAYS * 24 * 60 * 60 * 1000;
  }

  /** Show exactly one state and toggle the grid. */
  function showState(state) {
    errorState.classList.toggle('is-hidden', state !== 'error');
    emptyState.classList.toggle('is-hidden', state !== 'empty');
    grid.classList.toggle('is-hidden', state === 'error' || state === 'empty');
    grid.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
    if (state === 'loading') renderSkeletons();
  }

  /** Build the fallback placeholder used when a product has no image. */
  function buildPlaceholder() {
    const wrapper = document.createElement('div');
    wrapper.className = 'product-placeholder';

    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '📦';

    const label = document.createElement('p');
    label.textContent = 'No photo yet';

    wrapper.append(icon, label);
    return wrapper;
  }

  /**
   * Fill an element with `text`, wrapping every case-insensitive occurrence of
   * `term` in a <mark>. Built from text nodes only — never innerHTML — so
   * product-provided text can never inject markup.
   */
  function appendHighlighted(element, text, term) {
    const value = text || '';
    if (!term) {
      element.textContent = value;
      return;
    }
    const haystack = value.toLowerCase();
    let cursor = 0;
    let match = haystack.indexOf(term, cursor);
    while (match !== -1) {
      if (match > cursor) {
        element.appendChild(document.createTextNode(value.slice(cursor, match)));
      }
      const mark = document.createElement('mark');
      mark.textContent = value.slice(match, match + term.length);
      element.appendChild(mark);
      cursor = match + term.length;
      match = haystack.indexOf(term, cursor);
    }
    if (cursor < value.length) {
      element.appendChild(document.createTextNode(value.slice(cursor)));
    }
    if (!element.textContent && value) {
      element.textContent = value;
    }
  }

  // --- Skeleton loading ------------------------------------------------------

  /** One shimmering placeholder card shown while products load. */
  function buildSkeletonCard() {
    const card = document.createElement('div');
    card.className = 'skeleton-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-hidden', 'true');

    const media = document.createElement('div');
    media.className = 'skeleton-media';

    const body = document.createElement('div');
    body.className = 'skeleton-body';
    ['wide', 'wide', 'short', 'price'].forEach((kind) => {
      const line = document.createElement('div');
      line.className = `skeleton-line ${kind}`;
      body.appendChild(line);
    });

    card.append(media, body);
    return card;
  }

  function renderSkeletons(count) {
    const cards = Array.from({ length: count || 8 }, buildSkeletonCard);
    grid.replaceChildren(...cards);
  }

  // --- Reveal-on-scroll ------------------------------------------------------

  const revealObserver =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries, observer) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.08 }
        )
      : null;

  /** Staggered fade-in for freshly rendered cards. */
  function revealCards(cards) {
    cards.forEach((card, index) => {
      card.classList.add('reveal');
      card.style.setProperty('--reveal-delay', `${Math.min(index, 10) * 55}ms`);
      if (revealObserver) {
        revealObserver.observe(card);
      } else {
        card.classList.add('is-visible');
      }
    });
  }

  // --- Product cards ---------------------------------------------------------

  /** Render one product card. Returns the card element. */
  function buildProductCard(product, term) {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.setAttribute('role', 'listitem');

    // --- media ---
    const media = document.createElement('div');
    media.className = 'product-media';
    // Clicking the photo is a mouse shortcut for the Quick view button.
    media.addEventListener('click', () => openQuickView(product, media));

    if (product.image) {
      const image = document.createElement('img');
      image.src = product.image;
      image.alt = `${product.name} product photo`;
      image.loading = 'lazy';
      // Swap to the placeholder if the image fails to load (e.g. deleted file).
      image.addEventListener('error', () => {
        media.replaceChildren(buildPlaceholder());
      });
      media.appendChild(image);
    } else {
      media.appendChild(buildPlaceholder());
    }

    if (product.category) {
      const badge = document.createElement('span');
      badge.className = 'product-badge';
      badge.textContent = product.category;
      media.appendChild(badge);
    }

    if (isNew(product)) {
      const badge = document.createElement('span');
      badge.className = 'product-badge product-badge-new';
      badge.textContent = 'New';
      media.appendChild(badge);
    }

    // --- body ---
    const body = document.createElement('div');
    body.className = 'product-body';

    const name = document.createElement('h3');
    name.className = 'product-name';
    appendHighlighted(name, product.name, term);

    const description = document.createElement('p');
    description.className = 'product-desc';
    if (product.description) {
      appendHighlighted(description, product.description, term);
    } else {
      description.textContent = 'No description available.';
    }

    const footer = document.createElement('div');
    footer.className = 'product-footer';

    const price = document.createElement('span');
    price.className = 'product-price';
    price.textContent = formatPrice(product.price);

    const quickviewButton = document.createElement('button');
    quickviewButton.type = 'button';
    quickviewButton.className = 'quickview-button';
    quickviewButton.textContent = 'Quick view';
    quickviewButton.setAttribute('aria-label', `Quick view: ${product.name}`);
    quickviewButton.addEventListener('click', () => openQuickView(product, quickviewButton));

    footer.append(price, quickviewButton);
    body.append(name, description, footer);
    card.append(media, body);
    return card;
  }

  /** Case-insensitive match of a product against the search term. */
  function matchesSearch(product, term) {
    if (!term) return true;
    const haystack = [product.name, product.description, product.category]
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  }

  /** Comparators for the sort dropdown. */
  const comparators = {
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    name: (a, b) => String(a.name).localeCompare(String(b.name)),
    newest: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
  };

  /** Re-render the grid from the current search + category + sort settings. */
  function render() {
    const term = searchInput.value.trim().toLowerCase();
    const category = categorySelect.value;
    const sort = sortSelect.value;

    let visible = products.filter(
      (product) => matchesSearch(product, term) && (!category || product.category === category)
    );

    const comparator = comparators[sort];
    if (comparator) {
      visible = [...visible].sort(comparator);
    }

    const cards = visible.map((product) => buildProductCard(product, term));
    grid.replaceChildren(...cards);
    revealCards(cards);

    if (visible.length === 0) {
      const filtering = Boolean(term || category);
      emptyMessage.textContent = filtering
        ? 'No products match your search. Try different words or clear the filters.'
        : 'No products have been added yet. Add some from the admin panel!';
      showState('empty');
    } else {
      showState('grid');
    }

    resultCount.textContent =
      visible.length === products.length
        ? `${visible.length} product${visible.length === 1 ? '' : 's'}`
        : `${visible.length} of ${products.length} products`;
  }

  /** Fill the category dropdown with the categories present in the data. */
  function populateCategories() {
    const current = categorySelect.value;
    const categories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();

    // Replace everything except the first "All categories" option.
    categorySelect.replaceChildren();
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All categories';
    categorySelect.appendChild(allOption);

    categories.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      categorySelect.appendChild(option);
    });

    // Keep the previous selection if it still exists.
    if (categories.includes(current)) {
      categorySelect.value = current;
    }
  }

  // --- Quick view dialog -----------------------------------------------------

  function openQuickView(product, trigger) {
    quickviewProduct = product;
    quickviewTrigger = trigger || document.activeElement;
    // Cancel a pending "Added ✓" revert from a previously viewed product.
    clearTimeout(quickviewAddTimer);
    quickviewAddTimer = null;

    // Media: the photo, or the shared placeholder.
    quickviewMedia.replaceChildren();
    if (product.image) {
      const image = document.createElement('img');
      image.src = product.image;
      image.alt = `${product.name} product photo`;
      image.addEventListener('error', () => {
        quickviewMedia.replaceChildren(buildPlaceholder());
      });
      quickviewMedia.appendChild(image);
    } else {
      quickviewMedia.appendChild(buildPlaceholder());
    }

    quickviewCategory.textContent = product.category || '';
    quickviewCategory.classList.toggle('is-hidden', !product.category);
    quickviewTitle.textContent = product.name;
    quickviewDesc.textContent = product.description || 'No description available.';
    quickviewPrice.textContent = formatPrice(product.price);

    quickviewAdd.textContent = 'Add to demo cart';
    quickviewAdd.disabled = false;

    productDialog.showModal();
    document.body.style.overflow = 'hidden';
  }

  function closeQuickView() {
    if (productDialog.open) productDialog.close();
  }

  // The <dialog> element handles Esc and the focus trap natively.
  productDialog.addEventListener('close', () => {
    document.body.style.overflow = '';
    clearTimeout(quickviewAddTimer);
    quickviewAddTimer = null;
    if (quickviewTrigger && typeof quickviewTrigger.focus === 'function') {
      quickviewTrigger.focus();
    }
    quickviewTrigger = null;
    quickviewProduct = null;
  });

  // Click on the backdrop (the transparent dialog area) closes the dialog.
  productDialog.addEventListener('click', (event) => {
    if (event.target === productDialog) closeQuickView();
  });

  quickviewClose.addEventListener('click', closeQuickView);

  quickviewAdd.addEventListener('click', () => {
    if (!quickviewProduct) return;
    addToCart(quickviewProduct);
    quickviewAdd.textContent = 'Added ✓';
    // Clear any pending revert so rapid re-opens can't reset the wrong label.
    clearTimeout(quickviewAddTimer);
    quickviewAddTimer = setTimeout(() => {
      if (quickviewAdd.isConnected) quickviewAdd.textContent = 'Add to demo cart';
      quickviewAddTimer = null;
    }, 1200);
  });

  // --- Demo cart (session-only, clearly labelled as a demo) ------------------

  function loadCart() {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY));
      if (!Array.isArray(raw)) return [];
      return raw.filter(
        (item) =>
          item &&
          typeof item.name === 'string' &&
          Number.isFinite(item.price) &&
          Number.isFinite(item.qty) &&
          item.qty > 0
      );
    } catch (error) {
      return [];
    }
  }

  let cart = loadCart();

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (error) {
      // Private browsing or a full quota: the cart simply stays in memory.
    }
  }

  function cartQuantity() {
    return cart.reduce((total, item) => total + item.qty, 0);
  }

  function addToCart(product) {
    const existing = cart.find((item) => item.id === product.id);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        price: Number(product.price) || 0,
        qty: 1,
      });
    }
    saveCart();
    renderCart();
  }

  function removeFromCart(id) {
    cart = cart.filter((item) => item.id !== id);
    saveCart();
    renderCart();
  }

  function buildCartItem(item) {
    const row = document.createElement('li');
    row.className = 'cart-item';

    const info = document.createElement('div');
    info.className = 'cart-item-info';

    const name = document.createElement('div');
    name.className = 'cart-item-name';
    name.textContent = item.name;

    const price = document.createElement('div');
    price.className = 'cart-item-price';
    price.textContent = `${item.qty} × ${formatPrice(item.price)}`;

    info.append(name, price);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'cart-item-remove';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', `Remove ${item.name} from demo cart`);
    remove.addEventListener('click', () => removeFromCart(item.id));

    row.append(info, remove);
    return row;
  }

  function renderCart() {
    const count = cartQuantity();
    cartCount.textContent = String(count);
    cartCount.classList.toggle('is-hidden', count === 0);
    cartButton.setAttribute(
      'aria-label',
      `Open demo cart (${count} item${count === 1 ? '' : 's'})`
    );

    cartItems.replaceChildren(...cart.map(buildCartItem));
    cartEmpty.classList.toggle('is-hidden', cart.length > 0);
    cartClear.disabled = cart.length === 0;

    const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    cartTotal.textContent = formatPrice(total);
  }

  function setBackgroundInert(isInert) {
    document.querySelectorAll('.site-header, main, .site-footer').forEach((region) => {
      if (isInert) {
        region.setAttribute('inert', '');
      } else {
        region.removeAttribute('inert');
      }
    });
  }

  function openCart() {
    cartReturnFocus = cartButton;
    cartDrawer.classList.add('is-open');
    cartDrawer.setAttribute('aria-hidden', 'false');
    cartBackdrop.classList.remove('is-hidden');
    cartButton.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    setBackgroundInert(true);
    setTimeout(() => cartClose.focus(), 50);
  }

  function closeCart() {
    cartDrawer.classList.remove('is-open');
    cartDrawer.setAttribute('aria-hidden', 'true');
    cartBackdrop.classList.add('is-hidden');
    cartButton.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    setBackgroundInert(false);
    if (cartReturnFocus && typeof cartReturnFocus.focus === 'function') {
      cartReturnFocus.focus();
    }
    cartReturnFocus = null;
  }

  cartButton.addEventListener('click', openCart);
  cartClose.addEventListener('click', closeCart);
  cartBackdrop.addEventListener('click', closeCart);
  cartClear.addEventListener('click', () => {
    cart = [];
    saveCart();
    renderCart();
  });

  // --- Theme (light / dark) --------------------------------------------------

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeToggleIcon.textContent = theme === 'light' ? '🌙' : '☀️';
    themeToggle.setAttribute(
      'aria-label',
      theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'
    );
    if (themeColorMeta) {
      themeColorMeta.content = theme === 'light' ? '#f5f7fc' : '#0b0f1a';
    }
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

  // Follow the OS theme until the user makes an explicit choice.
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

  // --- Data loading ----------------------------------------------------------

  async function loadProducts() {
    showState('loading');
    try {
      const response = await fetch('/api/products', { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      const data = await response.json();
      products = Array.isArray(data.products) ? data.products : [];

      populateCategories();
      render();

      if (statProducts) {
        statProducts.textContent = String(products.length);
      }
    } catch (error) {
      console.error('Failed to load products:', error);
      errorMessage.textContent =
        'We could not reach the products API. Make sure the server is running, then try again.';
      showState('error');
    }
  }

  // --- Events ----------------------------------------------------------------

  function updateSearchClear() {
    searchClear.classList.toggle('is-hidden', searchInput.value === '');
  }

  // Live search with a small debounce to avoid re-rendering per keystroke.
  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    updateSearchClear();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 150);
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    updateSearchClear();
    render();
    searchInput.focus();
  });

  categorySelect.addEventListener('change', render);
  sortSelect.addEventListener('change', render);
  retryButton.addEventListener('click', loadProducts);

  clearFiltersButton.addEventListener('click', () => {
    searchInput.value = '';
    categorySelect.value = '';
    updateSearchClear();
    render();
    searchInput.focus();
  });

  // "/" focuses the search field, unless the user is typing somewhere else.
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (!typing && !productDialog.open) {
        event.preventDefault();
        searchInput.focus();
        searchInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      return;
    }
    if (event.key === 'Escape' && cartDrawer.classList.contains('is-open')) {
      closeCart();
    }
  });

  // Mobile navigation toggle.
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.getElementById('nav-menu');
  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      const open = navMenu.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
    // Close the menu after choosing a link (mobile).
    navMenu.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        navMenu.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Footer year.
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  // --- Go ---
  renderCart();
  updateSearchClear();
  loadProducts();
})();
