// Estado Global
let allProducts = [];
let allPacks = [];
let productInfoById = new Map();
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

// El fallback solo se usa cuando el producto no tiene una imagen accesible.
const IMAGE_FALLBACK =
  "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D'http%3A//www.w3.org/2000/svg'%20width%3D'320'%20height%3D'240'%3E%3Crect%20width%3D'100%25'%20height%3D'100%25'%20fill%3D'%23f2f2f2'/%3E%3Ctext%20x%3D'50%25'%20y%3D'55%25'%20dominant-baseline%3D'middle'%20text-anchor%3D'middle'%20fill%3D'%23999'%20font-size%3D'18'%3EImagen%20no%20disponible%3C/text%3E%3C/svg%3E";
function productImageUrl(filename) {
  return typeof filename === "string" && /^https?:\/\//i.test(filename)
    ? filename
    : IMAGE_FALLBACK;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}
function getMinimumQuantity(product) {
  const minimum = Math.floor(Number(product?.cantidad_minima ?? 1));
  return Number.isFinite(minimum) && minimum > 0 ? minimum : 1;
}
function isStockControlled(product) {
  return product?.aplicar_stock === true
    || (typeof product?.aplicar_stock === "string" && product.aplicar_stock.toLowerCase() === "true")
    || Number(product?.aplicar_stock) === 1;
}
function getCartQuantityForProduct(productId) {
  return cart.reduce((total, item) => total + (item.id === productId && !item.isPack ? Number(item.qty || 0) : 0), 0);
}
function getAvailableStock(product) {
  if (!isStockControlled(product)) return Number.POSITIVE_INFINITY;
  const stock = Number(product.stock ?? 0);
  return Number.isFinite(stock) ? Math.max(0, stock - getCartQuantityForProduct(product.id)) : 0;
}
function canAddProduct(product, quantity = getMinimumQuantity(product)) {
  return Boolean(product)
    && product.disponibilidad !== false
    && product.activo !== false
    && (!isStockControlled(product) || getAvailableStock(product) >= quantity);
}
function isProductAvailable(product) {
  return Boolean(product)
    && product.disponibilidad !== false
    && product.activo !== false
    && (!isStockControlled(product) || Number(product.stock ?? 0) >= getMinimumQuantity(product));
}
function hasProductStock(product, quantity) {
  return Boolean(product)
    && (!isStockControlled(product) || Number(product.stock ?? 0) >= quantity);
}
function getPackImages(pack) {
  if (Array.isArray(pack?.imagenes_url) && pack.imagenes_url.length) return pack.imagenes_url;
  if (Array.isArray(pack?.imagenes)) return pack.imagenes;
  return typeof pack?.imagenes === "string" && pack.imagenes ? [pack.imagenes] : [];
}
function getPackFeatures(pack) {
  if (Array.isArray(pack?.caracteristicas)) return pack.caracteristicas;
  return typeof pack?.caracteristicas === "string"
    ? pack.caracteristicas.split(/\r?\n/).map((feature) => feature.trim()).filter(Boolean)
    : [];
}
function isPackAvailable(pack) {
  return pack?.activo !== false && pack?.disponible !== false;
}
function getPackSalePrice(pack) {
  const price = Number(pack?.precio ?? 0);
  const discount = Number(pack?.descuento ?? 0);
  const percentage = discount > 0 ? discount : (pack?.oferta ? 10 : 0);
  return Number((price - price * percentage / 100).toFixed(2));
}
function getAvailabilityLabel(product) {
  if (product.disponibilidad === false || product.activo === false) return "No disponible";
  if (isStockControlled(product)) {
    const stock = Number(product.stock ?? 0);
    if (stock < getMinimumQuantity(product)) return "Agotado";
    if (stock > 0 && stock < 10) return `Stock bajo: ${stock}`;
    return `Disponibles: ${stock}`;
  }
  return "Disponible";
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
  await fetchPacks();
  loadCartFromStorage();

  // INICIALIZAR SLIDER
  initSlider();

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
      renderPacks();
      
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
    const data = await window.CASA_FRESCA_CONFIG.fetchJson("/api/products");
    if (!Array.isArray(data.products)) {
      throw new Error("El backend no devolvió una lista de productos válida.");
    }
    allProducts = data.products.map((product) => {
      if (!Array.isArray(product.imagenes_url)) {
        throw new Error(`El backend no devolvió las imágenes del producto ${product.id}.`);
      }
      return { ...product, imagenes: product.imagenes_url };
    });
    try {
      const infoData = await window.CASA_FRESCA_CONFIG.fetchJson("/api/info");
      productInfoById = new Map(
        (Array.isArray(infoData.info) ? infoData.info : [])
          .filter((entry) => entry?.id && entry?.info)
          .map((entry) => [String(entry.id), String(entry.info)])
      );
    } catch (infoError) {
      console.error("Error cargando las notas de productos:", infoError);
      productInfoById = new Map();
    }

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

async function fetchPacks() {
  const section = document.getElementById("packsSection");
  if (!section) return;
  try {
    const data = await window.CASA_FRESCA_CONFIG.fetchJson("/api/packs");
    if (!Array.isArray(data.packs)) {
      throw new Error("El backend no devolvió una lista de packs válida.");
    }
    allPacks = data.packs;
    renderPacks();
  } catch (error) {
    console.error("Error cargando packs:", error);
    section.classList.add("hidden");
  }
}

// 2. Renderizar Productos
function renderProducts(productsToRender) {
  productsGrid.innerHTML = "";

  // Filtrar productos: solo mostrar los que tienen disponibilidad=true
  const availableProducts = productsToRender.filter(prod => prod.disponibilidad !== false && prod.activo !== false);

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
            <div class="product-category">${escapeHtml(prod.categoria)}</div>
            <h3 class="product-title">${escapeHtml(prod.nombre)}</h3>
            ${isStockControlled(prod) ? `<div class="product-stock ${getAvailabilityLabel(prod).startsWith("Stock bajo") ? "low" : ""}">${escapeHtml(getAvailabilityLabel(prod))}</div>` : ""}
            <div class="product-price">${precioHtml}</div>
            <button class="btn-add-cart" data-product-add-id="${escapeHtml(prod.id)}" onclick="addToCart('${prod.id}', ${precioFinal})" ${!canAddProduct(prod) ? "disabled" : ""}>${prod.disponibilidad === false || prod.activo === false ? "NO DISPONIBLE" : (isStockControlled(prod) && getAvailableStock(prod) < getMinimumQuantity(prod) ? "AGOTADO" : `AÑADIR${getMinimumQuantity(prod) > 1 ? ` (MÍN. ${getMinimumQuantity(prod)})` : " AL CARRITO"}`)}</button>
        `;
    productsGrid.appendChild(card);
  });
}

function renderPacks() {
  const section = document.getElementById("packsSection");
  const grid = document.getElementById("packsGrid");
  if (!section || !grid) return;

  const packs = allPacks.filter(isPackAvailable);
  if (!packs.length) {
    section.classList.add("hidden");
    grid.innerHTML = "";
    return;
  }

  section.classList.remove("hidden");
  grid.innerHTML = packs.map((pack) => {
    const price = Number(pack.precio ?? 0);
    const salePrice = getPackSalePrice(pack);
    const images = getPackImages(pack);
    const image = images[0] || "";
    const discount = price > 0 ? Math.round((price - salePrice) / price * 100) : 0;
    const features = getPackFeatures(pack);
    return `
      <article class="product-card pack-card">
        <div class="pack-card-media">
          ${pack.top ? '<span class="pack-badge">Destacado</span>' : ""}
          ${pack.nuevo ? '<span class="pack-badge pack-badge--new">Nuevo</span>' : ""}
          ${discount > 0 ? `<div class="badge-oferta">-${discount}%</div>` : ""}
          <img src="${productImageUrl(image)}" alt="${escapeHtml(pack.nombre)}" class="pack-image" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
        </div>
        <div class="pack-card-content">
          <div class="product-category">PACK ESPECIAL</div>
          <h3 class="pack-title">${escapeHtml(pack.nombre)}</h3>
          ${pack.descripcion ? `<p class="pack-description">${escapeHtml(pack.descripcion)}</p>` : ""}
          ${features.length ? `<ul class="pack-features">${features.slice(0, 3).map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}</ul>` : ""}
          <div class="pack-card-bottom">
            <div class="product-price">${discount ? `<span class="old-price">${Currency.formatPrice(price)}</span> ` : ""}${Currency.formatPrice(salePrice)}</div>
            <div class="pack-card-actions">
              <button class="pack-details-button" type="button" data-pack-detail="${escapeHtml(pack.id)}">Ver detalles</button>
              <button class="btn-add-cart" type="button" data-pack-add="${escapeHtml(pack.id)}">Añadir pack</button>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join("");

  grid.querySelectorAll("[data-pack-detail]").forEach((button) => {
    button.addEventListener("click", () => showPackDetail(button.dataset.packDetail));
  });
  grid.querySelectorAll("[data-pack-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const pack = allPacks.find((entry) => entry.id === button.dataset.packAdd);
      if (pack) addPackToCart(pack.id, getPackSalePrice(pack));
    });
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
    (p) => p.mas_vendido && p.disponibilidad !== false && p.activo !== false,
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
          <button class="btn-add-cart" data-product-add-id="${escapeHtml(prod.id)}" onclick="addToCart('${prod.id}', ${precioFinal})" ${!canAddProduct(prod) ? "disabled" : ""}>${isStockControlled(prod) && getAvailableStock(prod) < getMinimumQuantity(prod) ? "AGOTADO" : `AÑADIR${getMinimumQuantity(prod) > 1 ? ` (MÍN. ${getMinimumQuantity(prod)})` : " AL CARRITO"}`}</button>
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
    (p) => (p.oferta || p.descuento > 0) && p.disponibilidad !== false && p.activo !== false,
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
          <button class="btn-add-cart" data-product-add-id="${escapeHtml(prod.id)}" onclick="addToCart('${prod.id}', ${precioFinal})" ${!canAddProduct(prod) ? "disabled" : ""}>${isStockControlled(prod) && getAvailableStock(prod) < getMinimumQuantity(prod) ? "AGOTADO" : `AÑADIR${getMinimumQuantity(prod) > 1 ? ` (MÍN. ${getMinimumQuantity(prod)})` : " AL CARRITO"}`}</button>
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
        .filter((prod) => prod.disponibilidad !== false && prod.activo !== false)
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
  if (!product) return false;
  const quantity = Math.max(getMinimumQuantity(product), Math.floor(Number(qty) || 1));
  if (!canAddProduct(product, quantity)) return false;

  const existingItem = cart.find((item) => item.id === id && !item.isPack);
  if (existingItem) {
    existingItem.qty += quantity;
  } else {
    cart.push({
      ...product,
      qty: quantity,
      precioVenta: precioFinal,
      disponible: true,
      precioAnterior: null,
      isPack: false,
    });
  }

  updateCart();

  // Efecto visual rápido para el usuario
  openCartBtn.style.transform = "scale(1.2)";
  setTimeout(() => (openCartBtn.style.transform = "scale(1)"), 200);
  return true;
}

function addPackToCart(id, precioFinal, qty = 1) {
  const pack = allPacks.find((entry) => entry.id === id);
  const quantity = Math.max(1, Math.floor(Number(qty) || 1));
  if (!pack || !isPackAvailable(pack)) return false;

  const existingItem = cart.find((item) => item.id === id && item.isPack);
  if (existingItem) {
    existingItem.qty += quantity;
  } else {
    cart.push({
      ...pack,
      imagenes: getPackImages(pack),
      qty: quantity,
      precioVenta: precioFinal,
      disponible: true,
      precioAnterior: null,
      isPack: true,
    });
  }
  updateCart();
  openCartBtn.style.transform = "scale(1.2)";
  setTimeout(() => (openCartBtn.style.transform = "scale(1)"), 200);
  return true;
}

function changeQty(id, delta) {
  const item = cart.find((entry) => entry.id === id && !entry.isPack);
  const product = allProducts.find((entry) => entry.id === id);
  if (!item || !product || (delta > 0 && getAvailableStock(product) < delta)) return;
  const nextQuantity = item.qty + delta;
  if (nextQuantity < getMinimumQuantity(product) || !hasProductStock(product, nextQuantity)) return;
  item.qty = nextQuantity;
  updateCart();
}

function changePackQty(id, delta) {
  const item = cart.find((entry) => entry.id === id && entry.isPack);
  const pack = allPacks.find((entry) => entry.id === id);
  if (!item || !pack || !isPackAvailable(pack) || item.qty + delta < 1) return;
  item.qty += delta;
  updateCart();
}

function removeFromCart(id, isPack = false) {
  cart = cart.filter((item) => item.id !== id || Boolean(item.isPack) !== Boolean(isPack));
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
    const catalogItem = item.isPack
      ? allPacks.find((pack) => pack.id === item.id)
      : allProducts.find((product) => product.id === item.id);
    const isAvailable = item.isPack
      ? Boolean(catalogItem && isPackAvailable(catalogItem))
      : Boolean(catalogItem && qty >= getMinimumQuantity(catalogItem) && hasProductStock(catalogItem, qty) && catalogItem.disponibilidad !== false && catalogItem.activo !== false);
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
                    ${item.isPack ? '<span class="cart-pack-badge">Pack</span>' : ''}
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
                    <button class="btn-remove-unavailable" onclick="removeFromCart('${escapeHtml(item.id)}', ${Boolean(item.isPack)})" title="Eliminar producto no disponible">Eliminar</button>
                ` : `
                    <button onclick="${item.isPack ? `changePackQty('${escapeHtml(item.id)}', -1)` : `changeQty('${escapeHtml(item.id)}', -1)`}" ${item.isPack ? (qty <= 1 ? 'disabled' : '') : (qty <= getMinimumQuantity(catalogItem) ? 'disabled' : '')}>-</button>
                    <span>${qty}</span>
                    <button onclick="${item.isPack ? `changePackQty('${escapeHtml(item.id)}', 1)` : `changeQty('${escapeHtml(item.id)}', 1)`}" ${!item.isPack && getAvailableStock(catalogItem) < 1 ? 'disabled' : ''}>+</button>
                `}
            </div>
            ${isAvailable ? `<button class="cart-remove-btn" onclick="removeFromCart('${escapeHtml(item.id)}', ${Boolean(item.isPack)})" aria-label="Eliminar ${escapeHtml(item.nombre)} del carrito">Eliminar</button>` : ""}
        `;
    cartItemsContainer.appendChild(cartItem);
  });

  cartTotalPrice.innerText = Currency.formatPrice(total);
  refreshProductAddButtons();
}

function refreshProductAddButtons() {
  document.querySelectorAll("[data-product-add-id]").forEach((button) => {
    const product = allProducts.find((entry) => entry.id === button.dataset.productAddId);
    if (!product) {
      button.disabled = true;
      return;
    }
    const available = canAddProduct(product);
    button.disabled = !available;
    button.textContent = available
      ? `AÑADIR${getMinimumQuantity(product) > 1 ? ` (MÍN. ${getMinimumQuantity(product)})` : " AL CARRITO"}`
      : (isStockControlled(product) && getAvailableStock(product) < getMinimumQuantity(product) ? "AGOTADO" : "NO DISPONIBLE");
  });
}

function validateCartItems(savedCart) {
  if (!Array.isArray(savedCart)) return [];

  let hasChanges = false;
  const groupedItems = new Map();
  savedCart.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const isPack = Boolean(item.isPack || item.type === "pack");
    const key = `${isPack ? "pack" : "product"}:${item.id}`;
    const existing = groupedItems.get(key);
    if (existing) {
      existing.qty = Number(existing.qty || 0) + Number(item.qty || 0);
      hasChanges = true;
    } else {
      groupedItems.set(key, { ...item, isPack });
    }
  });
  if (groupedItems.size !== savedCart.length) hasChanges = true;

  const cleaned = Array.from(groupedItems.values()).reduce((acc, item) => {
    if (!item || typeof item !== "object") {
      hasChanges = true;
      return acc;
    }

    const isPack = Boolean(item.isPack || item.type === "pack");
    const catalogItem = isPack
      ? allPacks.find((pack) => pack.id === item.id)
      : allProducts.find((p) => p.id === item.id);
    const currentPrice = catalogItem
      ? (isPack ? getPackSalePrice(catalogItem) : getProductSalePrice(catalogItem))
      : Number(item.precioVenta ?? item.precio ?? 0);
    const quantity = Number(item.qty || 0);
    const isAvailable = isPack
      ? Boolean(catalogItem && isPackAvailable(catalogItem))
      : Boolean(catalogItem && quantity >= getMinimumQuantity(catalogItem) && hasProductStock(catalogItem, quantity) && catalogItem.disponibilidad !== false && catalogItem.activo !== false);
    const priceChanged = Number(item.precioVenta) !== currentPrice;

    if (!Number.isInteger(quantity) || quantity <= 0) {
      hasChanges = true;
      return acc;
    }

    // Keep item but mark availability and price changes
    const normalizedItem = {
      ...(catalogItem || item),
      ...(isPack ? { imagenes: getPackImages(catalogItem), type: "pack" } : {}),
      qty: quantity,
      precioVenta: currentPrice,
      disponible: isAvailable,
      precioAnterior: priceChanged ? Number(item.precioVenta) : null,
      isPack,
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

  if (!fromPopState && history.state && ["product", "pack"].includes(history.state.type)) {
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
  if (state && state.type === "pack") {
    showPackDetail(state.packId, { fromPopState: true });
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

  const packMatch = window.location.pathname.match(/^\/packs?\/(.+)/);
  if (packMatch) {
    history.replaceState({ type: "home" }, "", "/");
    showPackDetail(decodeURIComponent(packMatch[1]));
    return;
  }

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
  const initialHash = window.location.hash;
  const hashMatch = initialHash.match(/^#\/(.+)/);
  if (hashMatch) {
    const categoryFromHash = decodeURIComponent(hashMatch[1]);
    navigateToCategory(categoryFromHash, { replaceState: true });
  } else {
    navigateToCategory("all", { replaceState: true });
    const directId = initialHash.substring(1);
    if (directId) {
      const pack = allPacks.find((entry) => entry.id === decodeURIComponent(directId));
      if (pack) showPackDetail(pack.id);
      else showProductDetail(decodeURIComponent(directId), { replaceState: true });
    }
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
  const productImages = Array.isArray(prod.imagenes) ? prod.imagenes : [];
  const thumbs = productImages.map((img, index) =>
    `<button type="button" class="product-detail-thumb-button ${index === 0 ? "active" : ""}" data-product-image-index="${index}" aria-label="Ver imagen ${index + 1} de ${escapeHtml(prod.nombre)}"><img src="${productImageUrl(img)}" alt="" class="product-detail-thumb" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';"></button>`,
  ).join("");

  // Breadcrumbs
  const breadcrumbs = `<nav class="product-detail-breadcrumbs">Inicio / ${escapeHtml(prod.categoria)} / ${escapeHtml(prod.nombre)}</nav>`;

  // Selector de cantidad funcional y estilizado
  const qtySelector = `<div class="product-detail-qty">
      <span>Cantidad:</span>
      <button id="qtyMinus" class="product-detail-qty-btn" aria-label="Reducir cantidad">-</button>
      <span id="detailQty">${getMinimumQuantity(prod)}</span>
      <button id="qtyPlus" class="product-detail-qty-btn" aria-label="Aumentar cantidad">+</button>
    </div>`;

  // Variantes (si existen)
  const variantes = prod.variantes
    ? `<div class="product-detail-variantes">Variante: <select>${prod.variantes.map((v) => `<option>${v}</option>`).join("")}</select></div>`
    : "";

  // Disponibilidad
  const available = isProductAvailable(prod);
  const disponibilidad = `<span class="product-detail-stock ${available ? "available" : "soldout"}">${escapeHtml(getAvailabilityLabel(prod))}</span>`;
  const notes = productInfoById.get(String(prod.id));
  const productNotesHTML = notes
    ? `<section class="product-detail-notes"><h3>Notas del producto</h3><p>${escapeHtml(notes)}</p></section>`
    : "";

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
            <img id="productDetailMainImage" src="${productImageUrl(productImages[0] || "")}" alt="${escapeHtml(prod.nombre)}" class="product-detail-image" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
          <div class="product-detail-thumbs">${thumbs}</div>
        </div>
        <div class="right-column">
          ${breadcrumbs}
            <h2 class="product-detail-title">${escapeHtml(prod.nombre)}</h2>
          <div class="product-detail-meta">${escapeHtml(prod.categoria)} ${disponibilidad}${getMinimumQuantity(prod) > 1 ? `<span class="product-detail-minimum">Compra mínima: ${getMinimumQuantity(prod)}</span>` : ""}</div>
          <div class="product-detail-tags">${etiquetas}</div>
          <div class="product-detail-price">${Currency.formatPrice(precioFinal)}${descPorcentaje>0?` <span class='product-detail-old-price'>${Currency.formatPrice(prod.precio)}</span> <span class='product-detail-discount'>-${descPorcentaje}%</span>`:''}</div>
          ${qtySelector}
          ${variantes}
            <button class="btn-add-cart btn-add-cart--primary" id="addToCartBtn" ${!canAddProduct(prod, getMinimumQuantity(prod)) ? "disabled" : ""}>${available ? `AÑADIR${getMinimumQuantity(prod) > 1 ? ` (MÍN. ${getMinimumQuantity(prod)})` : " AL CARRITO"}` : (isStockControlled(prod) && getAvailabilityLabel(prod) === "Agotado" ? "AGOTADO" : "NO DISPONIBLE")}</button>
            <div class="product-detail-description">${escapeHtml(prod.descripcion || "")}</div>
            ${productNotesHTML}
            <div class="product-detail-dates">${(prod.created_at || prod.fecha_creacion) ? `Creado: ${new Date(prod.created_at || prod.fecha_creacion).toLocaleDateString()}` : ""}${(prod.modified_at || prod.fecha_actualizacion) ? ` | Modificado: ${new Date(prod.modified_at || prod.fecha_actualizacion).toLocaleDateString()}` : ""}</div>
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

  let detailQty = getMinimumQuantity(prod);
  const syncQtyUI = () => {
    if (detailQtySpan) detailQtySpan.textContent = detailQty;
    if (qtyMinusBtn) qtyMinusBtn.disabled = detailQty <= getMinimumQuantity(prod);
    if (qtyPlusBtn) qtyPlusBtn.disabled = getAvailableStock(prod) < detailQty + 1;
    if (addToCartBtn) addToCartBtn.disabled = !canAddProduct(prod, detailQty);
  };

  if (qtyMinusBtn) {
    qtyMinusBtn.addEventListener("click", () => {
      if (detailQty > getMinimumQuantity(prod)) {
        detailQty--;
        syncQtyUI();
      }
    });
  }
  if (qtyPlusBtn) {
    qtyPlusBtn.addEventListener("click", () => {
      if (getAvailableStock(prod) >= detailQty + 1) {
        detailQty++;
        syncQtyUI();
      }
    });
  }
  if (addToCartBtn) {
    addToCartBtn.addEventListener("click", () => {
      addToCart(prod.id, precioFinal, detailQty);
      syncQtyUI();
    });
  }
  detailPage.querySelectorAll("[data-product-image-index]").forEach((thumb) => {
    thumb.addEventListener("click", () => {
      const selectedImage = productImages[Number(thumb.dataset.productImageIndex)];
      const mainImage = detailPage.querySelector("#productDetailMainImage");
      if (!selectedImage || !mainImage) return;
      mainImage.src = productImageUrl(selectedImage);
      detailPage.querySelectorAll(".product-detail-thumb-button").forEach((button) => {
        button.classList.toggle("active", button === thumb);
      });
    });
  });
  syncQtyUI();

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

function showPackDetail(id, { replaceState = false, fromPopState = false } = {}) {
  const pack = allPacks.find((entry) => entry.id === id);
  if (!pack) return;

  if (!fromPopState) {
    savedScrollPosition = window.scrollY;
    lastListScroll = window.scrollY;
    scrollPositions[currentCategory] = window.scrollY;
  }

  document.querySelector("main").style.display = "none";
  document.querySelector(".hero") && (document.querySelector(".hero").style.display = "none");
  document.querySelector("footer").style.display = "none";
  document.getElementById("productDrawerOverlay").style.display = "none";
  const detailPage = document.getElementById("product-detail-page");
  detailPage.style.display = "flex";
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: fromPopState ? "auto" : "smooth" }));

  const images = getPackImages(pack);
  const salePrice = getPackSalePrice(pack);
  const originalPrice = Number(pack.precio ?? 0);
  const discount = originalPrice > salePrice && originalPrice > 0
    ? Math.round((originalPrice - salePrice) / originalPrice * 100)
    : 0;
  const thumbs = images.map((image, index) =>
    `<button type="button" class="product-detail-thumb-button ${index === 0 ? "active" : ""}" data-pack-image-index="${index}" aria-label="Ver imagen ${index + 1} de ${escapeHtml(pack.nombre)}"><img src="${productImageUrl(image)}" alt="" class="product-detail-thumb" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';"></button>`,
  ).join("");
  const features = getPackFeatures(pack);
  const includedProducts = Array.isArray(pack.productos) ? pack.productos : [];
  const includedItems = includedProducts.map((item) => {
    const itemId = typeof item === "string" ? item : (item?.id || item?.productId);
    const product = allProducts.find((entry) => entry.id === itemId);
    const name = typeof item === "object" ? (item.nombre || product?.nombre || itemId) : (product?.nombre || item);
    const quantity = typeof item === "object" && item.cantidad ? ` × ${item.cantidad}` : "";
    return `<li>${escapeHtml(name)}${quantity}</li>`;
  }).join("");

  detailPage.innerHTML = `
    <div class="product-detail-wrapper">
      <div class="amazon-detail-layout">
        <div class="left-column">
          <img id="packDetailMainImage" src="${productImageUrl(images[0] || "")}" alt="${escapeHtml(pack.nombre)}" class="product-detail-image" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
          <div class="product-detail-thumbs">${thumbs}</div>
        </div>
        <div class="right-column">
          <nav class="product-detail-breadcrumbs">Inicio / Packs / ${escapeHtml(pack.nombre)}</nav>
          <h2 class="product-detail-title">${escapeHtml(pack.nombre)}</h2>
          <div class="product-detail-tags">${pack.top ? '<span class="product-detail-tag best-seller">Destacado</span>' : ""}${pack.nuevo ? '<span class="product-detail-tag nuevo">Nuevo</span>' : ""}${discount ? `<span class="product-detail-tag oferta">-${discount}%</span>` : ""}</div>
          <div class="product-detail-price">${Currency.formatPrice(salePrice)}${discount ? ` <span class="product-detail-old-price">${Currency.formatPrice(originalPrice)}</span>` : ""}</div>
          <div class="product-detail-qty">
            <span>Cantidad:</span>
            <button type="button" id="packQtyMinus" class="product-detail-qty-btn" aria-label="Reducir cantidad" disabled>-</button>
            <span id="packDetailQty">1</span>
            <button type="button" id="packQtyPlus" class="product-detail-qty-btn" aria-label="Aumentar cantidad">+</button>
          </div>
          <button type="button" class="btn-add-cart btn-add-cart--primary" id="addPackToCartBtn" ${isPackAvailable(pack) ? "" : "disabled"}>AÑADIR PACK AL CARRITO</button>
          <div class="product-detail-description">${escapeHtml(pack.descripcion || "")}</div>
          ${features.length ? `<section class="pack-detail-features"><h3>Características</h3><ul>${features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}</ul></section>` : ""}
          ${includedItems ? `<section class="pack-detail-features"><h3>Incluye</h3><ul>${includedItems}</ul></section>` : ""}
        </div>
      </div>
      <div class="product-detail-footer"><button class="btn-back" onclick="history.back()">← Volver</button></div>
    </div>
  `;

  let quantity = 1;
  const quantityLabel = detailPage.querySelector("#packDetailQty");
  const minusButton = detailPage.querySelector("#packQtyMinus");
  const plusButton = detailPage.querySelector("#packQtyPlus");
  const syncQuantity = () => {
    quantityLabel.textContent = String(quantity);
    minusButton.disabled = quantity <= 1;
  };
  minusButton.addEventListener("click", () => {
    if (quantity > 1) quantity--;
    syncQuantity();
  });
  plusButton.addEventListener("click", () => {
    quantity++;
    syncQuantity();
  });
  detailPage.querySelector("#addPackToCartBtn").addEventListener("click", () => {
    addPackToCart(pack.id, salePrice, quantity);
  });
  detailPage.querySelectorAll("[data-pack-image-index]").forEach((thumb) => {
    thumb.addEventListener("click", () => {
      const selectedImage = images[Number(thumb.dataset.packImageIndex)];
      const mainImage = detailPage.querySelector("#packDetailMainImage");
      if (!selectedImage || !mainImage) return;
      mainImage.src = productImageUrl(selectedImage);
      detailPage.querySelectorAll(".product-detail-thumb-button").forEach((button) => {
        button.classList.toggle("active", button === thumb);
      });
    });
  });

  if (!fromPopState) {
    const packState = { type: "pack", packId: id, scrollPos: savedScrollPosition };
    if (replaceState || history.state?.type === "pack") {
      history.replaceState(packState, "", `/packs/${encodeURIComponent(id)}`);
    } else {
      history.pushState(packState, "", `/packs/${encodeURIComponent(id)}`);
    }
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
