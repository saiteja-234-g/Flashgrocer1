/* ================================================================
   FlashGrocer – script.js
   Features: Products, Category Filter, Search, Cart, Checkout
   ================================================================ */

'use strict';

/* ----------------------------------------------------------------
   1. PRODUCT DATA  (sourced from products-data.js → ALL_PRODUCTS)
   ---------------------------------------------------------------- */
// Merge ANY old direct references to 'clothes'→'fashion', 'daily'→'wellness'
// ALL_PRODUCTS is loaded from products-data.js (must be included before this file)
const PRODUCTS = typeof ALL_PRODUCTS !== 'undefined' ? ALL_PRODUCTS : [];

/* ----------------------------------------------------------------
   2. STATE
   ---------------------------------------------------------------- */
let cart = [];
let activeCategory = 'all';
let activeSort     = 'default';
let promoApplied   = false;
let promoDiscount  = 0;
const PROMO_CODES  = { FLASH10:10, GROCER50:50, FIRST20:20, SALE50:50, FLAT100:10, FLAT150:12, FLASH200:15 };
const DELIVERY_FEE = 40;
const FREE_DELIVERY_THRESHOLD = 299;
const GST_RATE = 0.05;

/* ----------------------------------------------------------------
   3. UTILITY HELPERS
   ---------------------------------------------------------------- */
const $ = id => document.getElementById(id);

function showToast(msg, type = 'info') {
  const toast = $('toast');
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function formatINR(amount) {
  return '₹' + Number(amount).toFixed(2);
}

function generateOrderId() {
  return 'FG-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function getStars(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

// Polyfill for missing map helper API
// This prevents "mgt.clearmarks is not a function" runtime errors
window.mgt = window.mgt || {};
if (typeof window.mgt.clearmarks !== 'function') {
  window.mgt.clearmarks = function () {
    if (Array.isArray(this.markers)) {
      this.markers.forEach(marker => {
        if (marker && typeof marker.setMap === 'function') {
          marker.setMap(null);
        }
      });
      this.markers.length = 0;
    }
    // If additional cleanup is needed by the host app, call hook (optional)
    if (typeof this.onClearMarks === 'function') {
      this.onClearMarks();
    }
  };
}

/* ----------------------------------------------------------------
   4. RENDER PRODUCTS
   ---------------------------------------------------------------- */
function getFilteredSorted() {
  let list = activeCategory === 'all' ? [...PRODUCTS] : PRODUCTS.filter(p => p.category === activeCategory);
  if (activeSort === 'price-asc') list.sort((a, b) => a.price - b.price);
  if (activeSort === 'price-desc') list.sort((a, b) => b.price - a.price);
  if (activeSort === 'rating') list.sort((a, b) => b.rating - a.rating);
  return list;
}

function getCartQty(productId) {
  const entry = cart.find(c => c.product.id === productId);
  return entry ? entry.qty : 0;
}

function renderProducts() {
  const grid = $('productsGrid');
  const list = getFilteredSorted();
  $('productCount').textContent = `Showing ${list.length} product${list.length !== 1 ? 's' : ''}`;

  grid.innerHTML = '';
  if (list.length === 0) {
    grid.innerHTML = '<p style="color:var(--silver-dark);grid-column:1/-1;text-align:center;padding:60px 0;">No products found in this category.</p>';
    return;
  }

  list.forEach(p => {
    const qty = getCartQty(p.id);
    const disc = Math.round(100 - (p.price / p.originalPrice) * 100);

    const card = document.createElement('div');
    card.className = 'product-card';
    card.setAttribute('data-id', p.id);

    card.innerHTML = `
      <div class="product-img-wrap">
        <img src="${p.img}" alt="${p.name}" loading="lazy" />
        ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ''}
        <button class="product-wishlist-btn" id="wish-${p.id}" aria-label="Add to wishlist" data-id="${p.id}">♡</button>
      </div>
      <div class="product-info">
        <span class="product-category">${p.category}</span>
        <h3 class="product-name">${p.name}</h3>
        <div class="product-rating">
          <span class="stars">${getStars(p.rating)}</span>
          <span>${p.rating}</span>
          <span class="review-count">(${p.reviews})</span>
        </div>
        <div class="product-meta">
          <div class="product-price-wrap">
            <span class="product-price">${formatINR(p.price)}</span>
            <span class="product-original">${formatINR(p.originalPrice)}</span>
            <span class="product-badge" style="position:relative;top:0;left:0;">${disc}% OFF</span>
          </div>
          <span class="product-delivery">⚡ ${p.delivery}</span>
        </div>
        ${qty === 0
        ? `<button class="add-to-cart-btn" id="atc-${p.id}" data-id="${p.id}" aria-label="Add ${p.name} to cart">🛒 Add to Cart</button>`
        : `<div class="qty-control" id="qtyCtrl-${p.id}">
               <button class="qty-btn" data-action="dec" data-id="${p.id}" aria-label="Decrease quantity">−</button>
               <span class="qty-num" id="qtyNum-${p.id}">${qty}</span>
               <button class="qty-btn" data-action="inc" data-id="${p.id}" aria-label="Increase quantity">+</button>
             </div>`
      }
      </div>`;
    grid.appendChild(card);
  });

  // Attach events
  grid.querySelectorAll('.add-to-cart-btn').forEach(btn => {
    btn.addEventListener('click', () => addToCart(Number(btn.dataset.id)));
  });
  grid.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      if (btn.dataset.action === 'inc') incrementCart(id);
      else decrementCart(id);
    });
  });
  grid.querySelectorAll('.product-wishlist-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleWishlist(btn));
  });
}

function toggleWishlist(btn) {
  btn.classList.toggle('wished');
  btn.textContent = btn.classList.contains('wished') ? '♥' : '♡';
  const msg = btn.classList.contains('wished') ? '♥ Added to wishlist!' : '♡ Removed from wishlist';
  showToast(msg, btn.classList.contains('wished') ? 'success' : 'info');
}

/* ----------------------------------------------------------------
   5. CART LOGIC
   ---------------------------------------------------------------- */
function addToCart(productId) {
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;

  const existing = cart.find(c => c.product.id === productId);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ product, qty: 1 });
  }
  animateBadge();
  renderProducts();
  renderCart();
  showToast(`✅ "${product.name}" added to cart!`, 'success');
}

function incrementCart(productId) {
  const entry = cart.find(c => c.product.id === productId);
  if (entry) {
    entry.qty += 1;
    renderCart();
    renderProducts();
  }
}

function decrementCart(productId) {
  const idx = cart.findIndex(c => c.product.id === productId);
  if (idx === -1) return;
  cart[idx].qty -= 1;
  if (cart[idx].qty <= 0) {
    const name = cart[idx].product.name;
    cart.splice(idx, 1);
    showToast(`🗑️ "${name}" removed from cart`, 'info');
  }
  renderCart();
  renderProducts();
}

function removeFromCart(productId) {
  const idx = cart.findIndex(c => c.product.id === productId);
  if (idx === -1) return;
  const name = cart[idx].product.name;
  cart.splice(idx, 1);
  renderCart();
  renderProducts();
  showToast(`🗑️ "${name}" removed`, 'info');
}

function animateBadge() {
  const badge = $('cartBadge');
  badge.classList.remove('bump');
  void badge.offsetWidth; // reflow
  badge.classList.add('bump');
}

/* ----------------------------------------------------------------
   6. RENDER CART
   ---------------------------------------------------------------- */
function renderCart() {
  const list = $('cartItemsList');
  const empty = $('cartEmpty');
  const breakdown = $('cartBreakdown');
  const badge = $('cartBadge');

  // Total items count
  const totalQty = cart.reduce((s, c) => s + c.qty, 0);
  badge.textContent = totalQty;

  if (cart.length === 0) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.style.display = 'block';
    breakdown.style.display = 'none';
    promoApplied = false;
    promoDiscount = 0;
    return;
  }

  empty.style.display = 'none';
  breakdown.style.display = 'flex';

  // Cart items
  list.innerHTML = '';
  cart.forEach(({ product: p, qty }) => {
    const item = document.createElement('div');
    item.className = 'cart-item';
    item.innerHTML = `
      <img src="${p.img}" alt="${p.name}" class="cart-item-img" />
      <div class="cart-item-details">
        <div class="cart-item-name" title="${p.name}">${p.name}</div>
        <div class="cart-item-cat">${p.category}</div>
        <div class="cart-item-bottom">
          <span class="cart-item-price">${formatINR(p.price * qty)}</span>
          <div class="cart-item-controls">
            <button class="ci-qty-btn" data-action="dec" data-id="${p.id}" aria-label="Decrease">−</button>
            <span class="ci-qty">${qty}</span>
            <button class="ci-qty-btn" data-action="inc" data-id="${p.id}" aria-label="Increase">+</button>
            <button class="cart-item-remove" data-id="${p.id}" aria-label="Remove item">🗑️</button>
          </div>
        </div>
      </div>`;
    list.appendChild(item);
  });

  // Bind cart item buttons
  list.querySelectorAll('.ci-qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      if (btn.dataset.action === 'inc') incrementCart(id);
      else decrementCart(id);
    });
  });
  list.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(Number(btn.dataset.id)));
  });

  renderBreakdown();
}

function renderBreakdown() {
  const rows = $('breakdownRows');
  rows.innerHTML = '';

  let subtotal = 0;
  cart.forEach(({ product: p, qty }) => {
    subtotal += p.price * qty;
    const row = document.createElement('div');
    row.className = 'breakdown-row';
    row.innerHTML = `<span>${p.name} ×${qty}</span><span>${formatINR(p.price * qty)}</span>`;
    rows.appendChild(row);
  });

  const discountAmt = promoApplied ? (subtotal * promoDiscount / 100) : 0;
  const delivery = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
  const afterDisc = subtotal - discountAmt;
  const gst = afterDisc * GST_RATE;
  const total = afterDisc + delivery + gst;

  $('priceSubtotal').textContent = formatINR(subtotal);
  $('priceDiscount').textContent = promoApplied ? `-${formatINR(discountAmt)} (${promoDiscount}%)` : '-₹0.00';
  $('priceDelivery').textContent = delivery === 0 ? '🎉 FREE' : formatINR(delivery);
  $('priceGst').textContent = formatINR(gst);
  $('priceTotal').textContent = formatINR(total);
}

/* ----------------------------------------------------------------
   7. SEARCH
   ---------------------------------------------------------------- */
function setupSearch() {
  const input = $('searchInput');
  const results = $('searchResults');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { results.classList.remove('active'); return; }

    const matches = PRODUCTS.filter(p => p.name.toLowerCase().includes(q) || p.category.includes(q)).slice(0, 6);

    if (matches.length === 0) {
      results.innerHTML = '<div class="search-result-item"><span>No products found</span></div>';
    } else {
      results.innerHTML = matches.map(p => `
        <div class="search-result-item" data-id="${p.id}">
          <img src="${p.img}" alt="${p.name}" />
          <span>${p.name}</span>
          <span style="margin-left:auto;color:var(--silver);font-weight:700">${formatINR(p.price)}</span>
        </div>`).join('');

      results.querySelectorAll('.search-result-item[data-id]').forEach(item => {
        item.addEventListener('click', () => {
          addToCart(Number(item.dataset.id));
          input.value = '';
          results.classList.remove('active');
        });
      });
    }
    results.classList.add('active');
  });

  document.addEventListener('click', e => {
    if (!$('searchWrapper').contains(e.target)) results.classList.remove('active');
  });

  $('searchBtn').addEventListener('click', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) return;
    const match = PRODUCTS.find(p => p.name.toLowerCase().includes(q));
    if (match) {
      const cat = match.category;
      activeCategory = cat;
      highlightCategory(cat);
      renderProducts();
      document.querySelector('#products').scrollIntoView({ behavior: 'smooth' });
    } else {
      showToast('🔍 No products found for your search.', 'error');
    }
    results.classList.remove('active');
  });
}

/* ----------------------------------------------------------------
   8. CATEGORY FILTER
   ---------------------------------------------------------------- */
function highlightCategory(cat) {
  document.querySelectorAll('.category-card').forEach(c => c.classList.toggle('active', c.dataset.category === cat));
}

function setupCategories() {
  document.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      activeCategory = card.dataset.category;
      highlightCategory(activeCategory);
      renderProducts();

      // Update title
      const map = {
        all:'Featured', grocery:'Groceries', food:'Food & Restaurants',
        icecream:'Ice Creams & Frozen', drinks:'Cold Drinks & Juices',
        snacks:'Snacks & Biscuits'
      };
      $('productsTitle').innerHTML = `${map[activeCategory] || 'Products'} <span class="silver-shine">Collection</span>`;

      document.querySelector('#products').scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Nav links data-filter
  document.querySelectorAll('.nav-link[data-filter]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      activeCategory = link.dataset.filter;
      highlightCategory(activeCategory);
      renderProducts();
      document.querySelector('#products').scrollIntoView({ behavior: 'smooth' });
    });
  });
}

/* ----------------------------------------------------------------
   9. SORT CHIPS
   ---------------------------------------------------------------- */
function setupSortChips() {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeSort = chip.dataset.sort;
      renderProducts();
    });
  });
}

/* ----------------------------------------------------------------
   10. CART SIDEBAR TOGGLE
   ---------------------------------------------------------------- */
function openCart() {
  $('cartSidebar').classList.add('open');
  $('cartOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  $('cartSidebar').classList.remove('open');
  $('cartOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

function setupCartToggle() {
  $('cartToggleBtn').addEventListener('click', openCart);
  $('cartCloseBtn').addEventListener('click', closeCart);
  $('cartOverlay').addEventListener('click', closeCart);
}

/* ----------------------------------------------------------------
   11. PROMO CODE   ---------------------------------------------------------------- */

function setupPromo() {
  $('promoApplyBtn').addEventListener('click', () => {
    const code = $('promoInput').value.trim().toUpperCase();
    const msg = $('promoMsg');
    if (!code) { msg.textContent = '⚠️ Please enter a promo code.'; msg.className = 'promo-msg error'; return; }

    if (PROMO_CODES[code]) {
      if (promoApplied) { msg.textContent = '⚠️ A promo code is already applied.'; msg.className = 'promo-msg error'; return; }
      promoDiscount = PROMO_CODES[code];
      promoApplied = true;
      msg.textContent = `🎉 ${promoDiscount}% discount applied!`;
      msg.className = 'promo-msg success';
      renderBreakdown();
      showToast(`🎉 Promo code "${code}" applied – ${promoDiscount}% off!`, 'success');
    } else {
      msg.textContent = '❌ Invalid promo code. Try FLASH10 or GROCER50';
      msg.className = 'promo-msg error';
    }
  });
}

/* ----------------------------------------------------------------
   12. CHECKOUT
   ---------------------------------------------------------------- */
function setupCheckout() {
  $('checkoutBtn').addEventListener('click', () => {
    if (cart.length === 0) { showToast('🛒 Your cart is empty!', 'error'); return; }
    // Show modal
    $('modalOrderId').textContent = 'Order ID: ' + generateOrderId();
    $('checkoutModal').classList.add('active');
    // Clear cart
    cart = [];
    promoApplied = false;
    promoDiscount = 0;
    closeCart();
    renderCart();
  });

  $('modalClose').addEventListener('click', () => $('checkoutModal').classList.remove('active'));
  $('modalOkBtn').addEventListener('click', () => {
    $('checkoutModal').classList.remove('active');
    showToast('📦 Tracking your order…', 'success');
  });
  $('checkoutModal').addEventListener('click', e => {
    if (e.target === $('checkoutModal')) $('checkoutModal').classList.remove('active');
  });
}

/* ----------------------------------------------------------------
   13. HEADER SCROLL & HAMBURGER
   ---------------------------------------------------------------- */
function setupHeader() {
  const header = $('siteHeader');
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });

  // Hamburger
  $('hamburgerBtn').addEventListener('click', () => {
    $('mainNav').classList.toggle('open');
  });

  // Notification bar close
  $('notifClose').addEventListener('click', () => {
    $('notificationBar').style.display = 'none';
  });
}

/* ----------------------------------------------------------------
   14. LOAD MORE (visual demo)
   ---------------------------------------------------------------- */
function setupLoadMore() {
  $('loadMoreBtn').addEventListener('click', () => {
    showToast('📦 All products are already shown!', 'info');
  });
}

/* ----------------------------------------------------------------
   14b. SALE STRIP DISMISS
   ---------------------------------------------------------------- */
function setupSaleStrip() {
  const strip = $('saleStripClose');
  if (strip) strip.addEventListener('click', () => {
    $('saleStrip').classList.add('hidden');
  });
  // If redirected from sale page with ?added=
  const params = new URLSearchParams(location.search);
  const added = params.get('added');
  if (added) {
    const product = PRODUCTS.find(p => p.name.includes(added.slice(0, 20)));
    if (product) {
      addToCart(product.id);
    } else {
      setTimeout(() => showToast(`🛒 "${decodeURIComponent(added)}" — find it in our store!`, 'info'), 800);
    }
    history.replaceState({}, '', '/');
  }
}

/* ----------------------------------------------------------------
   15. OFFER BUTTONS
   ---------------------------------------------------------------- */
function setupOffers() {
  $('offerBtn1').addEventListener('click', () => {
    $('promoInput').value = 'GROCER50';
    openCart();
    showToast('🎁 Deal applied! Check cart.', 'success');
  });
  $('offerBtn2').addEventListener('click', () => {
    $('promoInput').value = 'FLASH10';
    openCart();
    showToast('⚡ FLASH10 ready in cart!', 'success');
  });
  $('offerBtn3').addEventListener('click', () => {
    activeCategory = 'grocery';
    highlightCategory('grocery');
    renderProducts();
    document.querySelector('#products').scrollIntoView({ behavior: 'smooth' });
  });
}

/* ----------------------------------------------------------------
   16. HERO BUTTONS
   ---------------------------------------------------------------- */
function setupHeroButtons() {
  $('heroShopBtn').addEventListener('click', e => {
    e.preventDefault();
    document.querySelector('#products').scrollIntoView({ behavior: 'smooth' });
  });
  $('heroExploreBtn').addEventListener('click', e => {
    e.preventDefault();
    document.querySelector('#categories').scrollIntoView({ behavior: 'smooth' });
  });
}

/* ----------------------------------------------------------------
   17. ACTIVE NAV LINK ON SCROLL
   ---------------------------------------------------------------- */
function setupScrollSpy() {
  const sections = ['hero', 'categories', 'products', 'offers', 'about'];
  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(id => {
      const el = document.getElementById(id);
      if (el && window.scrollY >= el.offsetTop - 120) current = id;
    });
    document.querySelectorAll('.nav-link').forEach(link => {
      const href = link.getAttribute('href').replace('#', '');
      link.classList.toggle('active', href === current);
    });
  }, { passive: true });
}

/* ================================================================
   18. BACKEND API CLIENT
   ================================================================ */
const API_BASE = '/api';
let authToken  = localStorage.getItem('fg_token') || null;
let currentUser = JSON.parse(localStorage.getItem('fg_user') || 'null');

async function apiRequest(method, endpoint, body = null, retry = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const opts = { method, headers, credentials: 'include' };
  if (body) opts.body = JSON.stringify(body);

  let res = await fetch(API_BASE + endpoint, opts);

  // Auto-refresh token on 401
  if (res.status === 401 && retry) {
    const refreshed = await refreshAuthToken();
    if (refreshed) return apiRequest(method, endpoint, body, false);
    logoutUser(false);
    return null;
  }

  return res.json();
}

async function refreshAuthToken() {
  try {
    const res = await fetch(API_BASE + '/auth/refresh', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (data.success && data.accessToken) {
      authToken = data.accessToken;
      localStorage.setItem('fg_token', authToken);
      return true;
    }
  } catch (_) {}
  return false;
}

/* ================================================================
   19. AUTH STATE MANAGEMENT
   ================================================================ */
function setAuthState(user, token) {
  currentUser = user;
  authToken   = token;
  if (user) {
    localStorage.setItem('fg_user',  JSON.stringify(user));
    localStorage.setItem('fg_token', token);
  } else {
    localStorage.removeItem('fg_user');
    localStorage.removeItem('fg_token');
  }
  updateAuthUI();
}

function updateAuthUI() {
  const authBtns = $('authBtns');
  const userMenu = $('userMenu');

  if (currentUser) {
    authBtns.style.display  = 'none';
    userMenu.style.display  = 'block';
    $('userNameDisplay').textContent = currentUser.name.split(' ')[0];
    $('dUserName').textContent  = currentUser.name;
    $('dUserEmail').textContent = currentUser.email;
    $('dUserRole').textContent  = currentUser.role;
  } else {
    authBtns.style.display  = 'flex';
    userMenu.style.display  = 'none';
  }
}

async function logoutUser(callApi = true) {
  if (callApi && authToken) {
    try { await apiRequest('POST', '/auth/logout'); } catch (_) {}
  }
  setAuthState(null, null);
  showToast('👋 Logged out successfully.', 'info');
}

/* ================================================================
   20. AUTH MODAL
   ================================================================ */
function openAuthModal(tab = 'login') {
  switchAuthTab(tab);
  $('authModal').classList.add('active');
  $('authError').classList.remove('show');
  $('authError').textContent = '';
}
function closeAuthModal() {
  $('authModal').classList.remove('active');
  $('loginFormEl').reset();
  $('registerFormEl').reset();
  $('authError').classList.remove('show');
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  $('loginForm').style.display    = tab === 'login'    ? 'block' : 'none';
  $('registerForm').style.display = tab === 'register' ? 'block' : 'none';
}

function showAuthError(msg) {
  const el = $('authError');
  el.textContent = msg;
  el.classList.add('show');
}

function setupAuthModal() {
  // Open modal / navigate to login page
  $('loginBtn').addEventListener('click', () => { window.location.href = '/login.html'; });
  // registerBtn is now an <a> tag – no JS needed

  // Close modal
  $('authModalClose').addEventListener('click', closeAuthModal);
  $('authModal').addEventListener('click', e => { if (e.target === $('authModal')) closeAuthModal(); });

  // Tab switching
  document.querySelectorAll('.auth-tab, .switch-tab-link').forEach(el => {
    el.addEventListener('click', () => switchAuthTab(el.dataset.tab));
  });

  // Toggle password visibility
  $('toggleLoginPwd').addEventListener('click', () => {
    const inp = $('loginPassword');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });
  $('toggleRegPwd').addEventListener('click', () => {
    const inp = $('regPassword');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  // Password strength indicator
  $('regPassword').addEventListener('input', () => {
    const val = $('regPassword').value;
    const bar = $('strengthBar');
    const lbl = $('strengthLabel');
    bar.className = 'strength-bar';
    if (!val) { lbl.textContent = ''; return; }
    const score = [/.{8,}/, /[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(val)).length;
    if (score <= 2)      { bar.classList.add('weak');   lbl.textContent = '⚠️ Weak'; }
    else if (score <= 3) { bar.classList.add('fair');   lbl.textContent = '⚡ Fair'; }
    else                 { bar.classList.add('strong'); lbl.textContent = '✅ Strong'; }
  });

  // LOGIN FORM SUBMIT
  $('loginFormEl').addEventListener('submit', async e => {
    e.preventDefault();
    clearAuthErrors();
    const email    = $('loginEmail').value.trim();
    const password = $('loginPassword').value;

    if (!email)    { setFieldError('loginEmailErr', 'Email is required'); return; }
    if (!password) { setFieldError('loginPwdErr', 'Password is required'); return; }

    const btn = $('loginSubmitBtn');
    btn.classList.add('btn-loading');

    const data = await apiRequest('POST', '/auth/login', { email, password });
    btn.classList.remove('btn-loading');

    if (!data) { showAuthError('⚠️ Server not reachable. Please start the backend server.'); return; }
    if (!data.success) { showAuthError(data.message || 'Login failed.'); return; }

    setAuthState(data.user, data.accessToken);
    closeAuthModal();
    showToast(`✅ ${data.message}`, 'success');

    // Sync cart from server
    await syncCartFromServer();
  });

  // REGISTER FORM SUBMIT
  $('registerFormEl').addEventListener('submit', async e => {
    e.preventDefault();
    clearAuthErrors();
    const name     = $('regName').value.trim();
    const email    = $('regEmail').value.trim();
    const phone    = $('regPhone').value.trim();
    const password = $('regPassword').value;

    if (!name)     { setFieldError('regNameErr', 'Name is required'); return; }
    if (!email)    { setFieldError('regEmailErr', 'Email is required'); return; }
    if (!password) { setFieldError('regPwdErr',  'Password is required'); return; }
    if (password.length < 6) { setFieldError('regPwdErr', 'Min 6 characters'); return; }
    if (!/[A-Z]/.test(password)) { setFieldError('regPwdErr', 'Must include an uppercase letter'); return; }
    if (!/[0-9]/.test(password)) { setFieldError('regPwdErr', 'Must include a digit'); return; }

    const btn = $('registerSubmitBtn');
    btn.classList.add('btn-loading');

    const data = await apiRequest('POST', '/auth/register', { name, email, phone: phone || undefined, password });
    btn.classList.remove('btn-loading');

    if (!data) { showAuthError('⚠️ Server not reachable. Please start the backend server.'); return; }
    if (!data.success) {
      if (data.errors) {
        const e0 = data.errors[0];
        showAuthError(`${e0.field}: ${e0.message}`);
      } else {
        showAuthError(data.message || 'Registration failed.');
      }
      return;
    }

    setAuthState(data.user, data.accessToken);
    closeAuthModal();
    showToast(`🚀 ${data.message}`, 'success');
  });
}

function setFieldError(id, msg) {
  const el = $(id);
  if (el) el.textContent = msg;
}
function clearAuthErrors() {
  ['loginEmailErr','loginPwdErr','regNameErr','regEmailErr','regPwdErr']
    .forEach(id => { const el = $(id); if (el) el.textContent = ''; });
  $('authError').classList.remove('show');
}

/* ================================================================
   21. USER DROPDOWN
   ================================================================ */
function setupUserDropdown() {
  $('userDropdownBtn').addEventListener('click', () => {
    const dropdown = $('userDropdown');
    const btn      = $('userDropdownBtn');
    const isOpen   = dropdown.classList.contains('open');
    dropdown.classList.toggle('open', !isOpen);
    btn.setAttribute('aria-expanded', String(!isOpen));
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!$('userMenu').contains(e.target)) {
      $('userDropdown').classList.remove('open');
      $('userDropdownBtn').setAttribute('aria-expanded', 'false');
    }
  });

  $('logoutBtn').addEventListener('click', () => {
    $('userDropdown').classList.remove('open');
    logoutUser(true);
  });

  $('viewProfileBtn').addEventListener('click', () => {
    $('userDropdown').classList.remove('open');
    openProfileModal();
  });

  $('viewOrdersBtn').addEventListener('click', () => {
    $('userDropdown').classList.remove('open');
    openOrdersModal();
  });

  $('viewWishlistPageBtn').addEventListener('click', () => {
    $('userDropdown').classList.remove('open');
    showToast('♥ Wishlist synced to your account!', 'success');
  });
}

/* ================================================================
   22. PROFILE MODAL
   ================================================================ */
function openProfileModal() {
  if (!currentUser) { openAuthModal('login'); return; }
  // Pre-fill
  $('profileName').value    = currentUser.name || '';
  $('profileEmail').value   = currentUser.email || '';
  $('profilePhone').value   = currentUser.phone || '';
  $('profileAddress').value = currentUser.address || '';
  $('profileModal').classList.add('active');
}

function setupProfileModal() {
  $('profileModalClose').addEventListener('click', () => $('profileModal').classList.remove('active'));
  $('profileModal').addEventListener('click', e => { if (e.target === $('profileModal')) $('profileModal').classList.remove('active'); });

  // Update profile
  $('profileFormEl').addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUser) return;
    const name    = $('profileName').value.trim();
    const phone   = $('profilePhone').value.trim();
    const address = $('profileAddress').value.trim();

    const data = await apiRequest('PUT', '/auth/profile', { name, phone, address });
    if (data && data.success) {
      setAuthState({ ...currentUser, ...data.user }, authToken);
      showToast('✅ Profile updated!', 'success');
      $('profileModal').classList.remove('active');
    } else if (data) {
      showToast(data.message || 'Failed to update profile.', 'error');
    } else {
      showToast('⚠️ Not connected to server.', 'error');
    }
  });

  // Change password
  $('changePwdFormEl').addEventListener('submit', async e => {
    e.preventDefault();
    const currentPassword = $('currentPwd').value;
    const newPassword     = $('newPwd').value;
    if (!currentPassword || !newPassword) { showToast('⚠️ Fill all password fields.', 'error'); return; }

    const data = await apiRequest('PUT', '/auth/change-password', { currentPassword, newPassword });
    if (data && data.success) {
      showToast('🔑 Password changed. Please log in again.', 'success');
      $('profileModal').classList.remove('active');
      $('changePwdFormEl').reset();
      setAuthState(null, null);
    } else if (data) {
      showToast(data.message || 'Failed to change password.', 'error');
    } else {
      showToast('⚠️ Not connected to server.', 'error');
    }
  });
}

/* ================================================================
   23. ORDERS MODAL
   ================================================================ */
async function openOrdersModal() {
  if (!currentUser) { openAuthModal('login'); return; }
  $('ordersModal').classList.add('active');
  $('ordersList').innerHTML = '<div class="orders-loading">Loading your orders⚡</div>';

  const data = await apiRequest('GET', '/orders');
  if (!data || !data.success) {
    $('ordersList').innerHTML = '<div class="orders-loading">⚠️ Could not load orders. Is the server running?</div>';
    return;
  }

  const orders = data.data;
  if (orders.length === 0) {
    $('ordersList').innerHTML = `
      <div class="no-orders">
        <div class="no-orders-icon">📦</div>
        <p>No orders yet!</p>
        <span>Start shopping to see your orders here.</span>
      </div>`;
    return;
  }

  $('ordersList').innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="order-card-top">
        <span class="order-code">#${o.order_code}</span>
        <span class="order-status status-${o.status}">${o.status}</span>
      </div>
      <div class="order-meta">
        <span>📅 ${new Date(o.created_at).toLocaleDateString('en-IN')}</span>
        <span>📦 ${o.item_count} item${o.item_count !== 1 ? 's' : ''}</span>
        <span>💳 ${o.payment_method.toUpperCase()}</span>
      </div>
      <div class="order-total">Total: ₹${Number(o.total).toFixed(2)}</div>
    </div>`).join('');
}

function setupOrdersModal() {
  $('ordersModalClose').addEventListener('click', () => $('ordersModal').classList.remove('active'));
  $('ordersModal').addEventListener('click', e => { if (e.target === $('ordersModal')) $('ordersModal').classList.remove('active'); });
}

/* ================================================================
   24. BACKEND CHECKOUT INTEGRATION
   ================================================================ */
async function checkoutWithBackend() {
  if (!currentUser) {
    openAuthModal('login');
    showToast('🔑 Please log in to place an order!', 'info');
    return;
  }

  if (cart.length === 0) { showToast('🛒 Your cart is empty!', 'error'); return; }

  // Get promo code
  const promoCode = promoApplied ? $('promoInput').value.trim().toUpperCase() : null;

  // Try backend checkout first
  const data = await apiRequest('POST', '/orders', {
    payment_method: 'cod',
    promo_code: promoCode || undefined,
    delivery_address: currentUser.address || undefined,
  });

  if (data && data.success) {
    $('modalOrderId').textContent = 'Order ID: ' + data.data.order_code;
    $('checkoutModal').classList.add('active');
    cart = [];
    promoApplied = false;
    promoDiscount = 0;
    closeCart();
    renderCart();
    showToast('🎉 Order placed via server!', 'success');
  } else if (data) {
    showToast(data.message || 'Order failed.', 'error');
  } else {
    // Fallback to local checkout
    localCheckout();
  }
}

function localCheckout() {
  $('modalOrderId').textContent = 'Order ID: ' + generateOrderId();
  $('checkoutModal').classList.add('active');
  cart = [];
  promoApplied = false;
  promoDiscount = 0;
  closeCart();
  renderCart();
}

/* ================================================================
   25. BACKEND PROMO CODE VALIDATION
   ================================================================ */
async function validatePromoWithBackend(code) {
  const data = await apiRequest('POST', '/orders/validate-promo', { code });
  return data;
}

/* ================================================================
   26. SYNC CART FROM SERVER
   ================================================================ */
async function syncCartFromServer() {
  if (!currentUser) return;
  const data = await apiRequest('GET', '/cart');
  if (data && data.success && data.data.length > 0) {
    // Merge server cart with local cart
    data.data.forEach(item => {
      const localEntry = cart.find(c => c.product.id === item.product_id);
      const product = PRODUCTS.find(p => p.id === item.product_id) || {
        id: item.product_id, name: item.name, category: item.category,
        price: item.price, originalPrice: item.original_price,
        rating: item.rating, img: item.img, delivery: item.delivery,
        badge: item.badge, reviews: 0
      };
      if (localEntry) {
        localEntry.qty = Math.max(localEntry.qty, item.qty);
      } else {
        cart.push({ product, qty: item.qty });
      }
    });
    renderCart();
    renderProducts();
    showToast(`🛒 Cart synced from account (${data.data.length} items)`, 'success');
  }
}

/* ================================================================
   27. ADD TO CART - Backend Sync Override
   ================================================================ */
const _originalAddToCart = addToCart;
async function addToCartWithSync(productId) {
  _originalAddToCart(productId);
  if (currentUser) {
    await apiRequest('POST', '/cart', { product_id: productId, qty: 1 });
  }
}

/* ================================================================
   18. INIT
   ---------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  // Init auth state from localStorage
  updateAuthUI();

  renderProducts();
  renderCart();
  setupSearch();
  setupCategories();
  setupSortChips();
  setupCartToggle();
  setupPromo();
  setupHeader();
  setupLoadMore();
  setupOffers();
  setupHeroButtons();
  setupScrollSpy();
  setupSaleStrip();

  // Auth setup
  setupAuthModal();
  setupUserDropdown();
  setupProfileModal();
  setupOrdersModal();

  // Backend checkout – replace default checkout behavior
  $('checkoutBtn').addEventListener('click', () => {
    if (currentUser) {
      checkoutWithBackend();
    } else {
      // Fallback: local checkout if not logged in (offline mode)
      if (cart.length === 0) { showToast('🛒 Your cart is empty!', 'error'); return; }
      openAuthModal('login');
      showToast('🔑 Please log in to checkout!', 'info');
    }
  });

  $('modalClose').addEventListener('click', () => $('checkoutModal').classList.remove('active'));
  $('modalOkBtn').addEventListener('click', () => {
    $('checkoutModal').classList.remove('active');
    if (currentUser) openOrdersModal();
    else showToast('📦 Order tracking available after login!', 'info');
  });
  $('checkoutModal').addEventListener('click', e => {
    if (e.target === $('checkoutModal')) $('checkoutModal').classList.remove('active');
  });

  // Override promo apply with backend validation
  $('promoApplyBtn').addEventListener('click', async () => {
    const code = $('promoInput').value.trim().toUpperCase();
    const msg  = $('promoMsg');
    if (!code) { msg.textContent = '⚠️ Please enter a promo code.'; msg.className = 'promo-msg error'; return; }

    if (promoApplied) { msg.textContent = '⚠️ A promo code is already applied.'; msg.className = 'promo-msg error'; return; }

    // Try backend first
    if (currentUser) {
      const data = await validatePromoWithBackend(code);
      if (data && data.success) {
        promoDiscount = data.promo.discount_pct;
        promoApplied  = true;
        msg.textContent = `🎉 ${promoDiscount}% discount applied!`;
        msg.className = 'promo-msg success';
        renderBreakdown();
        showToast(`🎉 Promo "${code}" applied – ${promoDiscount}% off!`, 'success');
        return;
      } else if (data) {
        msg.textContent = data.message || '❌ Invalid promo code.';
        msg.className = 'promo-msg error';
        return;
      }
    }

    // Fallback to local promo codes
    const PROMO_CODES = { FLASH10: 10, GROCER50: 50, FIRST20: 20 };
    if (PROMO_CODES[code]) {
      promoDiscount = PROMO_CODES[code];
      promoApplied  = true;
      msg.textContent = `🎉 ${promoDiscount}% discount applied!`;
      msg.className = 'promo-msg success';
      renderBreakdown();
      showToast(`🎉 Promo code "${code}" applied – ${promoDiscount}% off!`, 'success');
    } else {
      msg.textContent = '❌ Invalid promo code. Try FLASH10 or GROCER50';
      msg.className = 'promo-msg error';
    }
  });

  // Check server health
  try {
    const health = await fetch(API_BASE + '/health').then(r => r.json()).catch(() => null);
    if (health && health.success) {
      console.log('✅ FlashGrocer Backend connected:', health);
      if (currentUser) {
        // Verify token is still valid
        const me = await apiRequest('GET', '/auth/me');
        if (me && me.success) {
          setAuthState(me.user, authToken);
          await syncCartFromServer();
        } else {
          setAuthState(null, null);
        }
      }
    } else {
      console.warn('⚠️ FlashGrocer Backend not reachable – running in offline mode');
    }
  } catch (_) {
    console.warn('⚠️ FlashGrocer Backend not reachable – running in offline mode');
  }

  // Animate category cards on scroll
  const observer = new IntersectionObserver(entries => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        entry.target.style.animation = `fadeInUp .5s ease ${i * 0.08}s both`;
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.product-card, .category-card, .feature-item, .about-stat-card').forEach(el => observer.observe(el));
});

