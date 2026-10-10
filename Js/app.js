// Estado Global
let allProducts = [];
let cart = [];
let lastListScroll = 0; // Guardar scroll previo al entrar en detalle de producto
let scrollPositions = {}; // Guardar posiciones de scroll por categoría
let savedScrollPosition = 0; // Variable para restauración más robusta de scroll

// Bloqueo de scroll de fondo (pila de bloqueos para manejar modales anidados)
let bodyScrollLockCount = 0;
let bodyScrollTop = 0;

function lockBodyScroll() {
  if (bodyScrollLockCount === 0) {
    bodyScrollTop = window.scrollY || document.documentElement.scrollTop;
    document.body.style.position = "fixed";
    document.body.style.top = `-${bodyScrollTop}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.overflow = "hidden";
    document.body.style.width = "100%";
  }
  bodyScrollLockCount++;
}

function unlockBodyScroll(force = false) {
  if (force) {
    bodyScrollLockCount = 1;
  }
  if (bodyScrollLockCount > 0) {
    bodyScrollLockCount--;
  }
  if (bodyScrollLockCount === 0) {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.overflow = "";
    document.body.style.width = "";
    window.scrollTo(0, bodyScrollTop);
  }
}

// Elementos del DOM
const productsGrid = document.getElementById("productsGrid");
const searchInput = document.getElementById("searchInput");
const searchSuggestions = document.getElementById("searchSuggestions");
const cartCount = document.getElementById("cartCount");
const categoryList = document.getElementById("categoryList");

// Modales / Drawer
const cartModal = document.getElementById("cartModal");
const cartDrawer = document.getElementById("cartDrawer");
const openCartBtn = document.getElementById("openCartBtn");
const closeCartBtn = document.getElementById("closeCartBtn");
const cartItemsContainer = document.getElementById("cartItemsContainer");
const cartTotalPrice = document.getElementById("cartTotalPrice");

const productDrawerOverlay = document.getElementById("productDrawerOverlay");
const productDrawer = document.getElementById("productDrawer");
const closeProductBtn = document.getElementById("closeProductBtn");
const productDetailContainer = document.getElementById(
  "productDetailContainer",
);

const categoryDrawerOverlay = document.getElementById("categoryDrawerOverlay");
const categoryDrawer = document.getElementById("categoryDrawer");
const closeCategoryDrawerBtn = document.getElementById("closeCategoryDrawerBtn");
const categoryListDrawer = document.getElementById("categoryListDrawer");

// Rutas y fallback para imágenes de productos
const IMAGE_BASE_PATH = "/Img/products/";
const IMAGE_FALLBACK =
  "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D'http%3A//www.w3.org/2000/svg'%20width%3D'320'%20height%3D'240'%3E%3Crect%20width%3D'100%25'%20height%3D'100%25'%20fill%3D'%23f2f2f2'/%3E%3Ctext%20x%3D'50%25'%20y%3D'55%25'%20dominant-baseline%3D'middle'%20text-anchor%3D'middle'%20fill%3D'%23999'%20font-size%3D'18'%3EImagen%20no%20disponible%3C/text%3E%3C/svg%3E";
function productImageUrl(filename) {
  return filename ? `${IMAGE_BASE_PATH}${filename}` : IMAGE_FALLBACK;
}
function applyImageFallback(img) {
  if (img) {
    img.onerror = null;
    img.src = IMAGE_FALLBACK;
  }
}

// Inicialización
document.addEventListener("DOMContentLoaded", async () => {
  await fetchProducts();
  loadCartFromStorage();

  // INICIALIZAR SLIDER
  initSlider();

  // NUEVA LÓGICA: Leer el hash que envía el backend
  const hash = window.location.hash.substring(1);
  if (hash) {
    const productId = decodeURIComponent(hash);
    showProductDetail(productId); // Llama a tu función existente
  }

  initRouter();

  // Escuchar cambios de moneda para re-renderizar precios
  if (typeof Currency !== 'undefined' && Currency.onChange) {
    Currency.onChange(() => {
      // Re-renderizar productos visibles según la categoría actual
      const filtered = currentCategory === "all"
        ? allProducts
        : allProducts.filter((p) => p.categoria === currentCategory);
      const available = filtered.filter((p) => p.disponibilidad !== false);
      renderProducts(available);
      
      // Re-renderizar secciones especiales
      renderBestSellers();
      renderOffers();
      
      // Actualizar carrito
      updateCart();
      
      // Actualizar resumen de pago si está abierto
      const paymentSection = document.getElementById('payment-section');
      if (paymentSection && !paymentSection.classList.contains('hidden') && typeof updateOrderSummary === 'function') {
        updateOrderSummary();
      }
    });
  }
});

// 1. Obtener productos
async function fetchProducts() {
  try {
    const response = await fetch("./Json/products.json");
    if (!response.ok) throw new Error("Error en red");
    
    const data = await response.json();

    // ARREGLO PARA ESTRUCTURA DE JSON:
    // Si data es un Array, lo usa. Si es un objeto, busca la propiedad .products
    allProducts = Array.isArray(data) ? data : (data.products || []);

    renderCategories(allProducts);
    renderProducts(allProducts);
    renderBestSellers();
    renderOffers();

    // LÓGICA DE REDIRECCIÓN (Para que funcione el link del backend)
    // Al terminar de cargar, revisamos si hay un ID en el hash (ej: #prod_001)
    const hash = window.location.hash.substring(1);
    if (hash) {
      // Usamos un pequeño delay para asegurar que el DOM esté listo
      setTimeout(() => {
        showProductDetail(hash);
      }, 100);
    }

  } catch (error) {
    console.error("Error cargando productos:", error);
    productsGrid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color: red;">No se pudieron cargar los productos.</p>`;
  }
}

// 2. Renderizar Productos
function renderProducts(productsToRender) {
  productsGrid.innerHTML = "";

  // Filtrar productos: solo mostrar los que tienen disponibilidad=true
  const availableProducts = productsToRender.filter(prod => prod.disponibilidad !== false);

  if (availableProducts.length === 0) {
    productsGrid.innerHTML =
      '<p style="grid-column: 1/-1; text-align:center;">No hay productos disponibles en esta categoría.</p>';
    return;
  }

  availableProducts.forEach((prod) => {
    let precioFinal = prod.precio;
    let precioHtml = Currency.formatPrice(precioFinal);
    let badgeHtml = "";

    if (prod.oferta || prod.descuento > 0) {
      let descPorcentaje = prod.descuento > 0 ? prod.descuento : 10;
      precioFinal = prod.precio - prod.precio * (descPorcentaje / 100);
      precioHtml = `<span class="old-price">${Currency.formatPrice(prod.precio)}</span> ${Currency.formatPrice(precioFinal)}`;
      badgeHtml = `<div class="badge-oferta">-${descPorcentaje}%</div>`;
    }

    const imageSrc = prod.imagenes?.[0] || "";
    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
            ${badgeHtml}
            <img src="${productImageUrl(imageSrc)}" alt="${prod.nombre}" class="product-image" onclick="showProductDetail('${prod.id}')" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
            <div class="product-category">${prod.categoria}</div>
            <h3 class="product-title">${prod.nombre}</h3>
            <div class="product-price">${precioHtml}</div>
            <button class="btn-add-cart" onclick="addToCart('${prod.id}', ${precioFinal})">AÑADIR AL CARRITO</button>
        `;
    productsGrid.appendChild(card);
  });
}

function getProductSalePrice(product) {
  if (!product || typeof product.precio !== "number") {
    return 0;
  }

  let precioFinal = Number(product.precio) || 0;
  const descuento = Number(product.descuento || 0);

  if (product.oferta || descuento > 0) {
    const descPorcentaje = descuento > 0 ? descuento : 10;
    precioFinal = precioFinal - precioFinal * (descPorcentaje / 100);
  }

  return Number(precioFinal.toFixed(2));
}

// 2.b Panel "Los Más Vendidos" (estilo Amazon)
function renderBestSellers() {
  const section = document.getElementById("bestSellersSection");
  const grid = document.getElementById("bestSellersGrid");
  if (!section || !grid) return;

  const bestSellers = allProducts.filter(
    (p) => p.mas_vendido && p.disponibilidad !== false,
  );

  if (bestSellers.length === 0) {
    section.classList.add("hidden");
    grid.innerHTML = "";
    return;
  }

  section.classList.remove("hidden");
  grid.innerHTML = bestSellers
    .map((prod) => {
      const precioFinal = getProductSalePrice(prod);
      const tieneDescuento = prod.oferta || prod.descuento > 0;
      const precioHtml = tieneDescuento
        ? `<span class="old-price">${Currency.formatPrice(prod.precio)}</span> ${Currency.formatPrice(precioFinal)}`
        : Currency.formatPrice(precioFinal);
      const imageSrc = prod.imagenes?.[0] || "";
      return `
        <div class="product-card">
          <div class="badge-bestseller"><i class="fas fa-crown"></i> Más vendido</div>
          <img src="${productImageUrl(imageSrc)}" alt="${prod.nombre}" class="product-image" onclick="showProductDetail('${prod.id}')" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
          <div class="product-category">${prod.categoria}</div>
          <h3 class="product-title">${prod.nombre}</h3>
          <div class="product-price">${precioHtml}</div>
          <button class="btn-add-cart" onclick="addToCart('${prod.id}', ${precioFinal})">AÑADIR AL CARRITO</button>
        </div>
      `;
    })
    .join("");
}

// 2.c Panel "Ofertas por Tiempo Limitado" con cuenta regresiva
const OFFER_DEADLINE_KEY_PREFIX = "cf_offer_deadline_";
let offersCountdownInterval = null;

function getOfferDeadline(id) {
  const key = OFFER_DEADLINE_KEY_PREFIX + id;
  const now = Date.now();
  let deadline = Number(localStorage.getItem(key));

  if (!deadline || Number.isNaN(deadline) || deadline <= now) {
    // Genera una nueva ventana de oferta entre 3 y 24 horas para mantener la urgencia
    const hoursFromNow = 3 + Math.random() * 21;
    deadline = now + hoursFromNow * 60 * 60 * 1000;
    localStorage.setItem(key, String(deadline));
  }

  return deadline;
}

function formatCountdown(msRemaining) {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function startOffersCountdown() {
  if (offersCountdownInterval) clearInterval(offersCountdownInterval);

  offersCountdownInterval = setInterval(() => {
    document.querySelectorAll(".countdown-time").forEach((el) => {
      const id = el.dataset.productId;
      if (!id) return;
      const deadline = getOfferDeadline(id);
      const remaining = deadline - Date.now();
      el.textContent = formatCountdown(remaining);
    });
  }, 1000);
}

function renderOffers() {
  const section = document.getElementById("offersSection");
  const grid = document.getElementById("offersGrid");
  if (!section || !grid) return;

  const offers = allProducts.filter(
    (p) => (p.oferta || p.descuento > 0) && p.disponibilidad !== false,
  );

  if (offers.length === 0) {
    section.classList.add("hidden");
    grid.innerHTML = "";
    return;
  }

  section.classList.remove("hidden");
  grid.innerHTML = offers
    .map((prod) => {
      const descPorcentaje = prod.descuento > 0 ? prod.descuento : 10;
      const precioFinal = getProductSalePrice(prod);
      const imageSrc = prod.imagenes?.[0] || "";
      const deadline = getOfferDeadline(prod.id);
      return `
        <div class="product-card">
          <div class="badge-oferta">-${descPorcentaje}%</div>
          <img src="${productImageUrl(imageSrc)}" alt="${prod.nombre}" class="product-image" onclick="showProductDetail('${prod.id}')" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
          <div class="product-category">${prod.categoria}</div>
          <h3 class="product-title">${prod.nombre}</h3>
          <div class="deal-countdown"><i class="fas fa-clock"></i> Termina en: <span class="countdown-time" data-product-id="${prod.id}">${formatCountdown(deadline - Date.now())}</span></div>
          <div class="product-price"><span class="old-price">${Currency.formatPrice(prod.precio)}</span> ${Currency.formatPrice(precioFinal)}</div>
          <button class="btn-add-cart" onclick="addToCart('${prod.id}', ${precioFinal})">AÑADIR AL CARRITO</button>
        </div>
      `;
    })
    .join("");

  startOffersCountdown();
}

// 3. Filtrado por Categorías + Búsqueda inteligente
let currentCategory = "all";
let lastSearchQuery = "";

function normalizeText(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/gi, "n")
    .replace(/[^a-z0-9\s]/gi, "")
    .trim()
    .toLowerCase();
}

function getUniqueCategories(products) {
  return [
    ...new Set(
      products
        .filter((prod) => prod.disponibilidad !== false)
        .map((prod) => prod.categoria)
        .filter(Boolean),
    ),
  ];
}

// Mapa de iconos para categorías (estilo Amazon)
const CATEGORY_ICONS = {
  "Bebidas no alcohólicas": "fa-wine-bottle",
  "Bebidas alcohólicas": "fa-wine-glass-alt",
  "Cárnicos y Embutidos": "fa-drumstick-bite",
  "Despensa": "fa-boxes",
  "Viandas y Verduras": "fa-carrot",
  "Confitura": "fa-candy-cane",
  "Lácteos": "fa-cheese",
  "Utiles del Hogar": "fa-broom",
  "Aseo y Belleza": "fa-soap",
  "Aderezos": "fa-flask",
};

function getCategoryIcon(category) {
  return CATEGORY_ICONS[category] || "fa-tag";
}

function renderCategories(products) {
  const categories = getUniqueCategories(products);
  categoryList.innerHTML = "";
  if (categoryListDrawer) categoryListDrawer.innerHTML = "";

  // "Ver Todo" para sidebar normal
  const allItem = document.createElement("li");
  allItem.dataset.category = "all";
  allItem.className = "active";
  allItem.textContent = "Ver Todo";
  categoryList.appendChild(allItem);

  // "Ver Todo" para drawer - con icono
  const allItemDrawer = document.createElement("li");
  allItemDrawer.dataset.category = "all";
  allItemDrawer.className = "active";
  allItemDrawer.innerHTML = '<i class="fas fa-th-large"></i> Ver Todo';
  categoryListDrawer.appendChild(allItemDrawer);

  categories.forEach((category) => {
    // Sidebar normal (sin icono)
    const li = document.createElement("li");
    li.dataset.category = category;
    li.textContent = category;
    categoryList.appendChild(li);

    // Drawer con icono
    const liDrawer = document.createElement("li");
    liDrawer.dataset.category = category;
    const iconClass = getCategoryIcon(category);
    liDrawer.innerHTML = `<i class="fas ${iconClass}"></i> ${category}`;
    categoryListDrawer.appendChild(liDrawer);
  });
}

function levenshteinDistance(a, b, maxDistance = Infinity) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array.from({ length: b.length + 1 }, () => []);
  for (let i = 0; i <= b.length; i++) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
    if (
      matrix[i].reduce((min, value) => Math.min(min, value), Infinity) >
      maxDistance
    ) {
      return maxDistance + 1;
    }
  }

  return matrix[b.length][a.length];
}

function getMatchScore(query, text) {
  const q = normalizeText(query);
  const t = normalizeText(text);
  if (!q || !t) return 0;

  if (t.includes(q)) {
    const index = t.indexOf(q);
    return 200 - index; // matches earlier get higher score
  }

  const distance = levenshteinDistance(q, t, 3);
  return distance <= 2 ? Math.max(0, 90 - distance * 30) : 0;
}

// ============ ROTACIÓN DIARIA (orden consistente durante el día) ============
// Genera una semilla numérica a partir de un texto (fecha del día)
function hashStringToSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

// Generador pseudoaleatorio determinista (mulberry32)
function createSeededRandom(seed) {
  let state = seed;
  return function () {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Baraja un arreglo de forma determinista según una semilla de texto
function seededShuffle(array, seedText) {
  const result = array.slice();
  const random = createSeededRandom(hashStringToSeed(seedText));
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Aplica un orden que cambia cada día calendario, pero se mantiene fijo
// durante ese mismo día (no cambia al recargar la página).
function applyDailyOrder(products, salt = "") {
  const todaySeed = new Date().toDateString() + salt;
  return seededShuffle(products, todaySeed);
}

function getCategoryProducts() {
  const filtered = currentCategory === "all"
    ? allProducts
    : allProducts.filter((p) => p.categoria === currentCategory);
  // Filtrar solo productos disponibles
  const available = filtered.filter((p) => p.disponibilidad !== false);
  // Orden con rotación diaria (misma categoría = mismo orden todo el día)
  return applyDailyOrder(available, currentCategory);
}

function getSearchResults(query) {
  const normalizedQuery = normalizeText(query);
  const base = getCategoryProducts();

  if (!normalizedQuery) return base;

  const queryNumber = Number(normalizedQuery.replace(",", "."));

  return base
    .map((prod) => {
      const scoreName = getMatchScore(normalizedQuery, prod.nombre);
      const scoreCategory = getMatchScore(normalizedQuery, prod.categoria);
      const scorePrice = Number.isFinite(queryNumber)
        ? Math.max(0, 120 - Math.abs((prod.precio || 0) - queryNumber) * 20)
        : 0;
      const score = Math.max(scoreName, scoreCategory, scorePrice);
      return { prod, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ prod }) => prod);
}

function getDefaultSuggestions() {
  const base = getCategoryProducts();
  const score = (prod) =>
    (prod.mas_vendido ? 30 : 0) +
    (prod.nuevo ? 20 : 0) +
    (prod.oferta ? 10 : 0);

  return [...base]
    .sort((a, b) => {
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return (b.precio || 0) - (a.precio || 0);
    })
    .slice(0, 6);
}

function renderSearchSuggestions(suggestions, query) {
  if (!suggestions || !suggestions.length || !query || query.trim() === "") {
    hideSearchSuggestions();
    return;
  }

  searchSuggestions.innerHTML = suggestions
    .slice(0, 6)
    .map((prod) => {
      const image =
        prod.imagenes && prod.imagenes.length ? prod.imagenes[0] : "";
      return `
        <div class="suggestion-item" data-id="${prod.id}" role="option">
            <img class="suggestion-thumb" src="${productImageUrl(image)}" alt="${prod.nombre}" loading="lazy" decoding="async" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
            <div class="suggestion-text">
                <span class="suggestion-name">${prod.nombre}</span>
                <span class="suggestion-price">${Currency.formatPrice(prod.precio || 0)}</span>
            </div>
        </div>
    `;
    })
    .join("");

  searchSuggestions.classList.add("open");
}

function updateSearch(query) {
  const trimmed = String(query || "").trim();
  lastSearchQuery = trimmed;

  const base = getCategoryProducts();
  const results = trimmed ? getSearchResults(trimmed) : base;

  renderProducts(results);

  const suggestions = trimmed ? results : getDefaultSuggestions();
  renderSearchSuggestions(suggestions, trimmed);
}

function hideSearchSuggestions() {
  searchSuggestions.classList.remove("open");
  searchSuggestions.innerHTML = "";
}

categoryList.addEventListener("click", (e) => {
  if (e.target.tagName === "LI") {
    const selectedCategory = e.target.getAttribute("data-category");
    navigateToCategory(selectedCategory);
  }
});

// 3.b Drawer lateral de Categorías (menú hamburguesa)
function openCategoryDrawer() {
  categoryDrawerOverlay.classList.add("open");
  categoryDrawer.classList.add("open");
  categoryDrawerOverlay.setAttribute("aria-hidden", "false");
  lockBodyScroll();
}

function closeCategoryDrawer() {
  categoryDrawer.classList.remove("open");
  categoryDrawerOverlay.classList.remove("open");
  categoryDrawerOverlay.setAttribute("aria-hidden", "true");
  unlockBodyScroll();
}

if (categoryListDrawer) {
  categoryListDrawer.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (li) {
      const selectedCategory = li.getAttribute("data-category");
      if (selectedCategory) {
        navigateToCategory(selectedCategory);
        closeCategoryDrawer();
      }
    }
  });
}

if (closeCategoryDrawerBtn) {
  closeCategoryDrawerBtn.addEventListener("click", closeCategoryDrawer);
}

if (categoryDrawerOverlay) {
  categoryDrawerOverlay.addEventListener("click", (e) => {
    if (e.target === categoryDrawerOverlay) closeCategoryDrawer();
  });
}

searchInput.addEventListener("input", (e) => updateSearch(e.target.value));
searchInput.addEventListener("focus", (e) => {
  updateSearch(e.target.value);
});
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === "Escape") {
    hideSearchSuggestions();
    if (e.key === "Escape") {
      searchInput.blur();
    }
  }
});

searchSuggestions.addEventListener("click", (e) => {
  const item = e.target.closest(".suggestion-item");
  if (!item) return;

  const id = item.getAttribute("data-id");
  const prod = allProducts.find((p) => p.id === id);
  if (!prod) return;

  searchInput.value = prod.nombre;
  hideSearchSuggestions();
  showProductDetail(id);
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-bar")) {
    hideSearchSuggestions();
  }
});

document.addEventListener("touchstart", (e) => {
  if (!e.target.closest(".search-bar")) {
    hideSearchSuggestions();
  }
});

// 5. Lógica del Carrito
function addToCart(id, precioFinal, qty = 1) {
  const product = allProducts.find((p) => p.id === id);
  if (!product) return;

  const existingItem = cart.find((item) => item.id === id);
  if (existingItem) {
    // Si el producto ya está en el carrito, solo actualizar cantidad si está disponible
    if (existingItem.disponible !== false) {
      existingItem.qty += qty;
    }
  } else {
    // Nuevo item: incluir flags de disponibilidad y precio anterior
    cart.push({ 
      ...product, 
      qty, 
      precioVenta: precioFinal, 
      disponible: product.disponibilidad !== false, 
      precioAnterior: null 
    });
  }

  updateCart();

  // Efecto visual rápido para el usuario
  openCartBtn.style.transform = "scale(1.2)";
  setTimeout(() => (openCartBtn.style.transform = "scale(1)"), 200);
}

function changeQty(id, delta) {
  const item = cart.find((item) => item.id === id);
  // No permitir cambios de cantidad en productos no disponibles
  if (item && item.disponible !== false) {
    item.qty += delta;
    if (item.qty <= 0) {
      cart = cart.filter((i) => i.id !== id);
    }
    updateCart();
  }
}

function removeFromCart(id) {
  cart = cart.filter((item) => item.id !== id);
  updateCart();
}

function updateCart() {
  localStorage.setItem("cart_casa_fresca", JSON.stringify(cart));

  // Count only available items for badge
  const totalItems = cart.filter(item => item.disponible !== false).reduce((acc, item) => acc + item.qty, 0);
  cartCount.innerText = totalItems;

  cartItemsContainer.innerHTML = "";
  let total = 0;

  cart.forEach((item) => {
    const priceValue = Number(item.precioVenta ?? item.precio ?? 0);
    const qty = Number(item.qty || 0);
    const subtotal = priceValue * qty;
    const isAvailable = item.disponible !== false;
    const priceChanged = item.precioAnterior !== null && item.precioAnterior !== undefined;
    const oldPrice = priceChanged ? Number(item.precioAnterior) : null;
    total += isAvailable ? subtotal : 0;
    const imageSrc = item.imagenes?.[0] || "";

    const cartItem = document.createElement("div");
    cartItem.className = `cart-item ${!isAvailable ? 'unavailable' : ''} ${priceChanged ? 'price-changed' : ''}`;
    cartItem.innerHTML = `
            <img src="${productImageUrl(imageSrc)}" alt="${item.nombre}" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
            <div style="flex-grow: 1; margin: 0 10px;">
                <h4 style="font-size:0.9rem; color: var(--text-dark);">
                    ${item.nombre}
                    ${!isAvailable ? '<span class="unavailable-badge">⚠ No disponible</span>' : ''}
                    ${priceChanged ? '<span class="price-changed-badge">Precio actualizado</span>' : ''}
                </h4>
                <div class="cart-item-prices">
                    ${priceChanged && oldPrice !== null ? `<span class="price-old">${Currency.formatPrice(oldPrice)}</span>` : ''}
                    <span class="price-current ${!isAvailable ? 'unavailable-price' : ''}">${Currency.formatPrice(priceValue)}</span>
                </div>
            </div>
            <div class="qty-controls">
                ${!isAvailable ? `
                    <button class="btn-remove-unavailable" onclick="removeFromCart('${item.id}')" title="Eliminar producto no disponible">Eliminar</button>
                ` : `
                    <button onclick="changeQty('${item.id}', -1)" ${qty <= 1 ? 'disabled' : ''}>-</button>
                    <span>${qty}</span>
                    <button onclick="changeQty('${item.id}', 1)">+</button>
                `}
            </div>
        `;
    cartItemsContainer.appendChild(cartItem);
  });

  cartTotalPrice.innerText = Currency.formatPrice(total);
}

function validateCartItems(savedCart) {
  if (!Array.isArray(savedCart)) return [];

  let hasChanges = false;
  const cleaned = savedCart.reduce((acc, item) => {
    if (!item || typeof item !== "object") {
      hasChanges = true;
      return acc;
    }

    const product = allProducts.find((p) => p.id === item.id);
    const currentPrice = product ? getProductSalePrice(product) : Number(item.precioVenta ?? item.precio ?? 0);
    const quantity = Number(item.qty || 0);
    const isAvailable = product && product.disponibilidad !== false;
    const priceChanged = Number(item.precioVenta) !== currentPrice;

    if (quantity <= 0) {
      hasChanges = true;
      return acc;
    }

    // Keep item but mark availability and price changes
    const normalizedItem = {
      ...(product || item),
      qty: quantity,
      precioVenta: currentPrice,
      disponible: isAvailable,
      precioAnterior: priceChanged ? Number(item.precioVenta) : null
    };
    acc.push(normalizedItem);

    if (!isAvailable || priceChanged) {
      hasChanges = true;
    }

    return acc;
  }, []);

  if (hasChanges) {
    localStorage.setItem("cart_casa_fresca", JSON.stringify(cleaned));
  }

  return cleaned;
}

function loadCartFromStorage() {
  const savedCart = localStorage.getItem("cart_casa_fresca");
  if (savedCart) {
    try {
      const parsedCart = JSON.parse(savedCart);
      cart = validateCartItems(parsedCart);
    } catch (error) {
      console.warn("Carrito en localStorage inválido, se reestablece:", error);
      cart = [];
    }
    updateCart();
  }
}

// 5.b Drawer del carrito (panel lateral)
function openCartDrawer() {
  cartModal.classList.add("open");
  cartDrawer.classList.add("open");
  cartModal.setAttribute("aria-hidden", "false");
  lockBodyScroll();
}

function closeCartDrawer() {
  cartDrawer.classList.remove("open");
  cartModal.classList.remove("open");
  cartModal.setAttribute("aria-hidden", "true");
  unlockBodyScroll();
}

function openProductDrawer() {
  productDrawerOverlay.classList.add("open");
  productDrawer.classList.add("open");
  productDrawerOverlay.setAttribute("aria-hidden", "false");
}

function closeProductDrawer() {
  productDrawer.classList.remove("open");
  productDrawerOverlay.classList.remove("open");
  productDrawerOverlay.setAttribute("aria-hidden", "true");
}

function hideProductDetail({ fromPopState = false } = {}) {
  // Oculta el detalle tipo Amazon y restaura el layout
  const detailPage = document.getElementById("product-detail-page");
  
  // Ocultar el detalle
  detailPage.style.display = "none";
  detailPage.innerHTML = "";

  // Restaurar elementos principales
  document.querySelector("main").style.display = "";
  document.querySelector(".hero") &&
    (document.querySelector(".hero").style.display = "");
  document.querySelector("footer").style.display = "";
  document.getElementById("productDrawerOverlay").style.display = "";

  if (fromPopState) {
    // Forzar reflow para que el DOM recalcule alturas
    void document.body.offsetHeight;

    // Esperar a que el navegador procese los cambios de display
    // Usar requestAnimationFrame dos veces para asegurar múltiples ciclos
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Ahora restaurar el scroll al punto guardado
        const scrollTarget = savedScrollPosition || scrollPositions[currentCategory] || lastListScroll || 0;
        
        // Restaurar scroll múltiples veces para garantizar que se aplique
        window.scrollTo({ top: scrollTarget, behavior: "auto" });
        
        // Verificar y corregir si es necesario después de 100ms
        setTimeout(() => {
          if (window.scrollY !== scrollTarget) {
            window.scrollTo({ top: scrollTarget, behavior: "auto" });
          }
        }, 100);
      });
    });
  }

  if (!fromPopState && history.state && history.state.type === "product") {
    history.back();
  }
}

function findProductByIdOrName(term) {
  const normalized = normalizeText(term);
  return allProducts.find(
    (p) => p.id === term || normalizeText(p.nombre) === normalized,
  );
}

function setActiveCategoryUI(category) {
  document.querySelectorAll(".category-list li, .drawer-category-list li").forEach((li) => {
    li.classList.toggle(
      "active",
      li.getAttribute("data-category") === category,
    );
  });
}

function navigateToCategory(category, { replaceState = false } = {}) {
  // Guardar scroll actual de la categoría anterior
  if (currentCategory) {
    scrollPositions[currentCategory] = window.scrollY;
  }
  
  currentCategory = category || "all";
  setActiveCategoryUI(currentCategory);
  updateSearch(searchInput.value);

  const hash =
    currentCategory === "all"
      ? "#/"
      : `#/${encodeURIComponent(currentCategory)}`;
  const state = { type: "category", category: currentCategory };

  if (replaceState) {
    history.replaceState(state, "", hash);
  } else {
    history.pushState(state, "", hash);
  }
}

function handlePopState(event) {
  const state = event.state;

  if (state && state.type === "product") {
    showProductDetail(state.productId, { fromPopState: true });
    return;
  }

  // Cierra el drawer de producto si estaba abierto.
  hideProductDetail({ fromPopState: true });

  if (state && state.type === "category") {
    currentCategory = state.category || "all";
  } else {
    currentCategory = "all";
  }

  setActiveCategoryUI(currentCategory);
  updateSearch(searchInput.value);
}


function initRouter() {
  // Siempre manejamos cambios de navegación (atrás/adelante)
  window.addEventListener("popstate", handlePopState);

  // Si el usuario entra directamente en /p/:id
  const productMatch = window.location.pathname.match(/^\/p\/(.+)/);
  if (productMatch) {
    const productId = productMatch[1];

    // Asegura que exista un estado base para poder usar history.back()
    history.replaceState({ type: "home" }, "", "/");
    showProductDetail(productId, { replaceState: false });
    return;
  }

  // Si no hay un estado, ponemos home por defecto.
  if (!history.state) {
    history.replaceState(
      { type: "home" },
      "",
      window.location.pathname + window.location.search + window.location.hash,
    );
  }

  // Si hay un hash (por ejemplo #/Lácteos), restauramos la categoría
  const hashMatch = window.location.hash.match(/^#\/(.+)/);
  if (hashMatch) {
    const categoryFromHash = decodeURIComponent(hashMatch[1]);
    navigateToCategory(categoryFromHash, { replaceState: true });
  } else {
    navigateToCategory("all", { replaceState: true });
  }

  // Click en el logo siempre vuelve al home
  const logo = document.getElementById("siteLogo");
  if (logo) {
    logo.addEventListener("click", goToHome);
    logo.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        goToHome();
      }
    });
  }
}

function goToHome() {
  // Cerrar modales/drawers abiertos
  if (typeof closeCartDrawer === "function") closeCartDrawer();
  if (typeof closeCategoryDrawer === "function") closeCategoryDrawer();
  if (typeof hideProductDetail === "function") hideProductDetail({ fromPopState: true });
  if (typeof hidePaymentSection === "function") hidePaymentSection();

  // Garantizar que el scroll vuelva al inicio
  if (typeof unlockBodyScroll === "function") unlockBodyScroll(true);
  window.scrollTo({ top: 0, behavior: "smooth" });

  // Forzar navegación a la categoría "all" y limpiar el hash
  navigateToCategory("all", { replaceState: true });
  history.replaceState({ type: "home" }, "", "/");
}

// 6. Detalles del Producto
function showProductDetail(
  id,
  { replaceState = false, fromPopState = false } = {},
) {
  const prod = allProducts.find((p) => p.id === id);
  if (!prod) return;

  // Guarda scroll actual ANTES de ocultar cualquier elemento
  if (!fromPopState) {
    savedScrollPosition = window.scrollY;
    lastListScroll = window.scrollY;
    scrollPositions[currentCategory] = window.scrollY;
  }

  // Oculta todo excepto el header
  document.querySelector("main").style.display = "none";
  document.querySelector(".hero") &&
    (document.querySelector(".hero").style.display = "none");
  document.querySelector("footer").style.display = "none";
  document.getElementById("productDrawerOverlay").style.display = "none";

  // Muestra el contenedor de detalle
  const detailPage = document.getElementById("product-detail-page");
  detailPage.style.display = "flex";

  // Hacer scroll arriba DESPUÉS de cambiar el display
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Layout tipo Amazon con margen superior fijo
  let precioFinal = prod.precio;
  let descPorcentaje = prod.descuento > 0 ? prod.descuento : prod.oferta ? 10 : 0;
  if (descPorcentaje > 0) {
    precioFinal = prod.precio - prod.precio * (descPorcentaje / 100);
  }

  // Miniaturas
  const thumbs = (prod.imagenes || [])
    .map(
      (img) =>
        `<img src="${productImageUrl(img)}" alt="${prod.nombre}" class="product-detail-thumb" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">`,
    )
    .join("");

  // Breadcrumbs
  const breadcrumbs = `<nav class="product-detail-breadcrumbs">Inicio / ${prod.categoria} / ${prod.nombre}</nav>`;

  // Selector de cantidad funcional y estilizado
  const qtySelector = `<div class="product-detail-qty">
      <span>Cantidad:</span>
      <button id="qtyMinus" class="product-detail-qty-btn">-</button>
      <span id="detailQty">1</span>
      <button id="qtyPlus" class="product-detail-qty-btn">+</button>
    </div>`;

  // Variantes (si existen)
  const variantes = prod.variantes
    ? `<div class="product-detail-variantes">Variante: <select>${prod.variantes.map((v) => `<option>${v}</option>`).join("")}</select></div>`
    : "";

  // Disponibilidad
  const disponibilidad = prod.disponibilidad
    ? `<span class="product-detail-stock available">Disponible</span>`
    : `<span class="product-detail-stock soldout">Agotado</span>`;

  // Etiquetas
  const etiquetas = [
    prod.mas_vendido ? '<span class="product-detail-tag best-seller">Más vendido</span>' : '',
    prod.nuevo ? '<span class="product-detail-tag nuevo">Nuevo</span>' : '',
    prod.oferta ? '<span class="product-detail-tag oferta">Oferta</span>' : ''
  ].join('');

  // Obtener productos relacionados (misma categoría, excluyendo el actual)
  // con rotación diaria para variar las recomendaciones cada día
  const relatedPool = allProducts.filter(
    (p) => p.categoria === prod.categoria && p.id !== prod.id && p.disponibilidad !== false,
  );
  const relatedProducts = applyDailyOrder(relatedPool, `related_${prod.id}`).slice(0, 6);
  
  const relatedProductsHTML = relatedProducts
    .map(p => {
      let precioRelated = p.precio;
      if (p.oferta || p.descuento > 0) {
        let descRelated = p.descuento > 0 ? p.descuento : 10;
        precioRelated = p.precio - p.precio * (descRelated / 100);
      }
      return `
        <div class="related-product-card">
          <img src="${productImageUrl(p.imagenes[0])}" alt="${p.nombre}" class="related-product-image" onclick="showProductDetail('${p.id}')" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
          <h4 class="related-product-name">${p.nombre}</h4>
          <div class="related-product-price">${Currency.formatPrice(precioRelated)}</div>
          <button class="btn-add-cart" onclick="addToCart('${p.id}', ${precioRelated})">Agregar</button>
        </div>
      `;
    })
    .join('');

  detailPage.innerHTML = `
    <div class="product-detail-wrapper">
      <div class="amazon-detail-layout">
        <div class="left-column">
          <img src="${productImageUrl(prod.imagenes[0])}" alt="${prod.nombre}" class="product-detail-image" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
          <div class="product-detail-thumbs">${thumbs}</div>
        </div>
        <div class="right-column">
          ${breadcrumbs}
          <h2 class="product-detail-title">${prod.nombre}</h2>
          <div class="product-detail-meta">${prod.categoria} ${disponibilidad}</div>
          <div class="product-detail-tags">${etiquetas}</div>
          <div class="product-detail-price">${Currency.formatPrice(precioFinal)}${descPorcentaje>0?` <span class='product-detail-old-price'>${Currency.formatPrice(prod.precio)}</span> <span class='product-detail-discount'>-${descPorcentaje}%</span>`:''}</div>
          ${qtySelector}
          ${variantes}
          <button class="btn-add-cart btn-add-cart--primary" id="addToCartBtn">AÑADIR AL CARRITO</button>
          <div class="product-detail-description">${prod.descripcion}</div>
          <div class="product-detail-dates">Creado: ${new Date(prod.created_at).toLocaleDateString()} | Modificado: ${new Date(prod.modified_at).toLocaleDateString()}</div>
        </div>
      </div>
      
      ${relatedProducts.length > 0 ? `
        <section class="related-products-section">
          <h3 class="related-products-title">Productos Relacionados</h3>
          <div class="related-products-grid">
            ${relatedProductsHTML}
          </div>
        </section>
      ` : ''}
      
      <div class="product-detail-footer">
        <button class="btn-back" onclick="history.back()">← Volver</button>
      </div>
    </div>
  `;

  // Lógica del selector de cantidad en el detalle
  const detailQtySpan = detailPage.querySelector("#detailQty");
  const qtyMinusBtn = detailPage.querySelector("#qtyMinus");
  const qtyPlusBtn = detailPage.querySelector("#qtyPlus");
  const addToCartBtn = detailPage.querySelector("#addToCartBtn");

  let detailQty = 1;
  const syncQtyUI = () => {
    if (detailQtySpan) detailQtySpan.textContent = detailQty;
  };

  if (qtyMinusBtn) {
    qtyMinusBtn.addEventListener("click", () => {
      if (detailQty > 1) {
        detailQty--;
        syncQtyUI();
      }
    });
  }
  if (qtyPlusBtn) {
    qtyPlusBtn.addEventListener("click", () => {
      detailQty++;
      syncQtyUI();
    });
  }
  if (addToCartBtn) {
    addToCartBtn.addEventListener("click", () => addToCart(prod.id, precioFinal, detailQty));
  }

  // Navegación con pushState
  if (!fromPopState) {
    const productState = { type: "product", productId: id, scrollPos: savedScrollPosition };
    if (replaceState) {
      history.replaceState(productState, "", `/p/${id}`);
    } else if (history.state && history.state.type === "product") {
      history.replaceState(productState, "", `/p/${id}`);
    } else {
      history.pushState(productState, "", `/p/${id}`);
    }
  } else {
    // Cuando navegamos usando adelante/atrás, aseguramos que el detalle quede arriba
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }
}

// 7. Control de Modales
openCartBtn.addEventListener("click", openCartDrawer);
closeCartBtn.addEventListener("click", closeCartDrawer);
closeProductBtn.addEventListener("click", () => hideProductDetail());

window.addEventListener("click", (e) => {
  if (e.target === cartModal) closeCartDrawer();
  if (e.target === productDrawerOverlay) hideProductDetail();
});

// Flechas de los carruseles de "Ofertas" y "Más vendidos"
document.querySelectorAll(".carousel-arrow").forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetId = btn.getAttribute("data-target");
    const grid = document.getElementById(targetId);
    if (!grid) return;
    const scrollAmount = grid.clientWidth * 0.85;
    grid.scrollBy({
      left: btn.classList.contains("carousel-arrow--next")
        ? scrollAmount
        : -scrollAmount,
      behavior: "smooth",
    });
  });
});

// Botón de menú (móvil): abre el panel lateral de categorías
const menuIcon = document.querySelector(".menu-icon");
if (menuIcon) {
  menuIcon.setAttribute("role", "button");
  menuIcon.setAttribute("tabindex", "0");
  menuIcon.setAttribute("aria-label", "Abrir categorías");
  menuIcon.addEventListener("click", () => openCategoryDrawer());
  menuIcon.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openCategoryDrawer();
    }
  });
}

// Enlace "Mi carrito" en el footer
const openCartFooterLink = document.getElementById("openCartFooterLink");
if (openCartFooterLink) {
  openCartFooterLink.addEventListener("click", () => openCartDrawer());
}

function openWhatsapp() {
  const phoneNumber = "+5363001537";
  const message = encodeURIComponent("Hola, estoy interesado en sus productos. ¿Podrían brindarme más información?");
  const url = `https://wa.me/${phoneNumber}?text=${message}`;
  window.open(url, "_blank");
}

// ============ SLIDER HERO ============
let sliderInterval = null;
const SLIDER_INTERVAL_MS = 5000; // 5 segundos entre slides

function initSlider() {
  const slides = document.querySelectorAll(".slider-slide");
  const dots = document.querySelectorAll(".dot");
  if (!slides.length || !dots.length) return;

  let currentSlide = 0;
  const totalSlides = slides.length;

  function goToSlide(index) {
    // Quitar active de todos
    slides.forEach((s) => s.classList.remove("active"));
    dots.forEach((d) => d.classList.remove("active"));

    // Poner active en el índice deseado
    currentSlide = (index + totalSlides) % totalSlides;
    slides[currentSlide].classList.add("active");
    dots[currentSlide].classList.add("active");
  }

  function nextSlide() {
    goToSlide(currentSlide + 1);
  }

  function startAutoPlay() {
    stopAutoPlay();
    sliderInterval = setInterval(nextSlide, SLIDER_INTERVAL_MS);
  }

  function stopAutoPlay() {
    if (sliderInterval) {
      clearInterval(sliderInterval);
      sliderInterval = null;
    }
  }

  // Click en dots
  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const slideIndex = parseInt(dot.getAttribute("data-slide"), 10);
      goToSlide(slideIndex);
      startAutoPlay();
    });
  });

  // Flechas de navegación
  const prevBtn = document.getElementById("sliderPrev");
  const nextBtn = document.getElementById("sliderNext");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      goToSlide(currentSlide - 1);
      startAutoPlay();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      goToSlide(currentSlide + 1);
      startAutoPlay();
    });
  }

  // Pausar al hacer hover sobre el slider
  const slider = document.getElementById("heroSlider");
  if (slider) {
    slider.addEventListener("mouseenter", stopAutoPlay);
    slider.addEventListener("mouseleave", startAutoPlay);
    // Para móviles: pausar al tocar
    slider.addEventListener("touchstart", stopAutoPlay, { passive: true });
    slider.addEventListener("touchend", startAutoPlay);
  }

  // Iniciar autoplay
  startAutoPlay();
}

// ============ FUNCIONES DE DESCARGA DE APP ============
// Eliminadas porque la app móvil ya no se va a usar.

