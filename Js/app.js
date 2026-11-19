// Estado Global
let allProducts = [];
let allPacks = [];
let productInfoById = new Map();
let cart = [];
let lastListScroll = 0; // Guardar scroll previo al entrar en detalle de producto
let scrollPositions = {}; // Guardar posiciones de scroll por categoría
let savedScrollPosition = 0; // Variable para restauración más robusta de scroll
let detailFloatingPanel = null;
let detailFloatingOnChange = null;

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

const navigationEntry = performance.getEntriesByType("navigation")[0];
if (navigationEntry?.type === "reload") {
  window.addEventListener(
    "pageshow",
    () => window.scrollTo({ top: 0, left: 0, behavior: "auto" }),
    { once: true },
  );
}

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
      renderSeasonalCarousel();
      
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
    renderCategoriesCircle(allProducts);
    renderProducts(allProducts);
    renderBestSellers();
    renderOffers();
    renderSeasonalCarousel();

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

function renderSeasonalCarousel() {
  const wrapper = document.getElementById("seasonalCarouselWrapper");
  if (!wrapper) return;

  const cards = [
    { category: "Viandas y Verduras", kicker: "Temporada fresca", title: "Verduras del día", subtitle: "Selección natural y lista para cocinar", icon: "fa-seedling", background: "linear-gradient(135deg,#eaf8ee 0%,#d9f1df 55%,#f8efd8 100%)", accent: "#3e7a50" },
    { category: "Confitura", kicker: "Para compartir", title: "Confituras y sabores", subtitle: "Dulce, variedad y momentos especiales", icon: "fa-cookie-bite", background: "linear-gradient(135deg,#fff6ec 0%,#f9e0c9 55%,#fdebd4 100%)", accent: "#b85f32" },
    { category: "Lácteos", kicker: "Nutrición diaria", title: "Lácteos esenciales", subtitle: "Sabor y frescura para cada mañana", icon: "fa-cheese", background: "linear-gradient(135deg,#eef4ff 0%,#ddeafa 55%,#eee6f8 100%)", accent: "#496eaa" },
    { category: "Despensa", kicker: "Lo esencial", title: "Despensa con sabor", subtitle: "Productos básicos para la cocina", icon: "fa-basket-shopping", background: "linear-gradient(135deg,#fff7ee 0%,#f5e4d2 55%,#f4dac8 100%)", accent: "#9a603b" },
    { category: "Bebidas no alcohólicas", kicker: "Para refrescar", title: "Bebidas frescas", subtitle: "Sabor y energía para cada momento", icon: "fa-wine-bottle", background: "linear-gradient(135deg,#fff8df 0%,#ffe8b8 55%,#fce3ce 100%)", accent: "#d17a24" },
    { category: "Cárnicos y Embutidos", kicker: "Especiales del día", title: "Cárnicos y embutidos", subtitle: "Calidad y tradición para cada mesa", icon: "fa-drumstick-bite", background: "linear-gradient(135deg,#fff5f1 0%,#f2ddd5 55%,#f7ecdf 100%)", accent: "#9a553d" },
    { category: "Aseo y Belleza", kicker: "Hogar cuidado", title: "Aseo y belleza", subtitle: "Bienestar para ti y tu familia", icon: "fa-pump-soap", background: "linear-gradient(135deg,#edf8f4 0%,#d7eee7 55%,#edf5e3 100%)", accent: "#477d69" },
  ];

  const available = cards.map((card) => {
    const products = allProducts
      .filter((product) => product.disponibilidad !== false
        && product.activo !== false
        && normalizeText(product.categoria) === normalizeText(card.category))
      .slice(0, 4);
    return { ...card, products };
  }).filter((card) => card.products.length);

  wrapper.innerHTML = available.map((card) => {
    const items = card.products.map((product) => {
      const price = getProductSalePrice(product);
      return `
        <button type="button" class="seasonal-item" data-seasonal-product="${escapeHtml(product.id)}">
          <span class="seasonal-item-image">
            ${product.oferta || Number(product.descuento || 0) > 0 ? '<span class="seasonal-item-badge">Oferta</span>' : ""}
            ${product.nuevo ? '<span class="seasonal-item-badge seasonal-item-badge-new">Nuevo</span>' : ""}
            <img src="${productImageUrl(product.imagenes?.[0] || "")}" alt="${escapeHtml(product.nombre)}" loading="lazy" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
          </span>
          <span class="seasonal-item-body">
            <span class="seasonal-item-title">${escapeHtml(product.nombre)}</span>
            <span class="seasonal-item-price">${Currency.formatPrice(price)}</span>
          </span>
        </button>
      `;
    }).join("");

    return `
      <article class="seasonal-slide" style="--seasonal-bg:${card.background};--seasonal-accent:${card.accent}">
        <div class="seasonal-card">
          <header class="seasonal-card-header">
            <p class="seasonal-card-kicker"><i class="fas ${card.icon}"></i> ${escapeHtml(card.kicker)}</p>
            <h2 class="seasonal-card-title">${escapeHtml(card.title)}</h2>
            <p class="seasonal-card-subtitle">${escapeHtml(card.subtitle)}</p>
          </header>
          <div class="seasonal-card-grid">${items}</div>
          <button type="button" class="seasonal-card-link" data-seasonal-category="${escapeHtml(card.category)}">Ver ${escapeHtml(card.title.toLowerCase())} <i class="fas fa-chevron-right"></i></button>
        </div>
      </article>
    `;
  }).join("");

  wrapper.querySelectorAll("[data-seasonal-product]").forEach((button) => {
    button.addEventListener("click", () => showProductDetail(button.dataset.seasonalProduct));
  });
  wrapper.querySelectorAll("[data-seasonal-category]").forEach((button) => {
    button.addEventListener("click", () => navigateToCategory(button.dataset.seasonalCategory));
  });

  const prev = document.getElementById("seasonalPrev");
  const next = document.getElementById("seasonalNext");
  if (prev) prev.onclick = () => wrapper.scrollBy({ left: -306, behavior: "smooth" });
  if (next) next.onclick = () => wrapper.scrollBy({ left: 306, behavior: "smooth" });
}

// 2. Renderizar Productos
function getProductCardCartControlHTML(product) {
  const quantity = getCartQuantityForProduct(product.id);
  const minimum = getMinimumQuantity(product);

  if (quantity <= 0) {
    const available = canAddProduct(product, minimum);
    const label = available
      ? (minimum > 1 ? `Añadir (${minimum} mín.)` : "Añadir al carrito")
      : "No disponible";

    return `
      <button class="add-to-cart" type="button" data-product-add-id="${escapeHtml(product.id)}" ${available ? "" : "disabled"}>
        <i class="fas fa-cart-plus" aria-hidden="true"></i>
        <span>${label}</span>
      </button>
    `;
  }

  const canIncrease = canAddProduct(product, 1);
  const removeAtMinimum = quantity <= minimum;
  return `
    <div class="quantity-counter" role="group" aria-label="Cantidad en el carrito">
      <button class="quantity-btn decrease-btn ${removeAtMinimum ? "trash-icon" : ""}" type="button" data-product-quantity-decrease aria-label="${removeAtMinimum ? "Eliminar del carrito" : "Reducir cantidad"}">
        <i class="fas fa-${removeAtMinimum ? "trash-alt" : "minus"}" aria-hidden="true"></i>
      </button>
      <span class="quantity-display" aria-live="polite">${quantity}</span>
      <button class="quantity-btn increase-btn" type="button" data-product-quantity-increase aria-label="Aumentar cantidad" ${canIncrease ? "" : "disabled"}>
        <i class="fas fa-plus" aria-hidden="true"></i>
      </button>
    </div>
  `;
}

function bindProductCardCartControl(card, product) {
  const control = card.querySelector(".product-card-cart-control");
  if (!control) return;

  const addButton = control.querySelector("[data-product-add-id]");
  if (addButton) {
    addButton.addEventListener("click", (event) => {
      event.stopPropagation();
      addToCart(product.id, getProductSalePrice(product), getMinimumQuantity(product));
    });
  }

  const decreaseButton = control.querySelector("[data-product-quantity-decrease]");
  if (decreaseButton) {
    decreaseButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (getCartQuantityForProduct(product.id) <= getMinimumQuantity(product)) {
        removeFromCart(product.id);
      } else {
        changeQty(product.id, -1);
      }
    });
  }

  const increaseButton = control.querySelector("[data-product-quantity-increase]");
  if (increaseButton) {
    increaseButton.addEventListener("click", (event) => {
      event.stopPropagation();
      changeQty(product.id, 1);
    });
  }
}

function refreshProductCardCartControls() {
  document.querySelectorAll(".product-card[data-product-card-id]").forEach((card) => {
    const product = allProducts.find((entry) => entry.id === card.dataset.productCardId);
    const control = card.querySelector(".product-card-cart-control");
    if (!product || !control) return;

    control.innerHTML = getProductCardCartControlHTML(product);
    bindProductCardCartControl(card, product);
  });
}

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
    let precioFinal = getProductSalePrice(prod);
    const tieneDescuento = prod.oferta || Number(prod.descuento || 0) > 0;
    const descPorcentaje = Number(prod.descuento || 0) > 0
      ? Number(prod.descuento)
      : (prod.oferta ? 10 : 0);
    const stockLow = isStockControlled(prod)
      && Number(prod.stock || 0) > 0
      && Number(prod.stock || 0) < 10;
    const minimum = getMinimumQuantity(prod);
    const available = canAddProduct(prod);
    const productNote = productInfoById.get(String(prod.id));

    const imageSrc = prod.imagenes?.[0] || "";
    const card = document.createElement("div");
    card.className = "product-card";
    card.dataset.productCardId = prod.id;
    card.innerHTML = `
            <div class="product-badges">
              ${tieneDescuento ? `<span class="badge oferta"><i class="fas fa-tag"></i> Oferta</span>` : ""}
              ${stockLow ? '<span class="badge stock-bajo">Stock bajo</span>' : ""}
              ${prod.mas_vendido ? '<span class="badge mas-vendido">Más vendido</span>' : ""}
              ${prod.nuevo ? '<span class="badge nuevo">Nuevo</span>' : ""}
              ${!available ? '<span class="badge agotado">Agotado</span>' : ""}
            </div>
            <div class="product-image-container ${!available ? "unavailable" : ""}">
              <img src="${productImageUrl(imageSrc)}" alt="${escapeHtml(prod.nombre)}" class="product-image" width="320" height="240" loading="lazy" data-product-detail="${escapeHtml(prod.id)}" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
            </div>
            <div class="product-info">
              <div class="product-category">${escapeHtml(prod.categoria)}</div>
              <h3 class="product-title" data-product-detail="${escapeHtml(prod.id)}">${escapeHtml(prod.nombre)}</h3>
              ${isStockControlled(prod) ? `<div class="product-stock ${stockLow ? "low" : ""}">${escapeHtml(getAvailabilityLabel(prod))}</div>` : '<div class="shipping-info"><i class="fas fa-check-circle"></i> Disponible</div>'}
              <div class="price-container">
                ${tieneDescuento ? `<span class="discount-percent">${descPorcentaje}%</span><span class="original-price">${Currency.formatPrice(prod.precio)}</span>` : ""}
                <span class="current-price">${Currency.formatPrice(precioFinal)}</span>
              </div>
              ${minimum > 1 ? `<div class="minimum-purchase">Compra mínima: ${minimum}</div>` : ""}
              <div class="product-card-cart-control">${getProductCardCartControlHTML(prod)}</div>
              ${productNote ? `<div class="product-info-banner" role="note"><i class="fas fa-info-circle" aria-hidden="true"></i><span>${escapeHtml(productNote)}</span></div>` : ""}
            </div>
        `;
    card.querySelectorAll("[data-product-detail]").forEach((element) => {
      element.addEventListener("click", () => showProductDetail(prod.id));
    });
    bindProductCardCartControl(card, prod);
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
  const count = document.getElementById("packsCount");
  if (count) count.textContent = `${packs.length} pack${packs.length === 1 ? "" : "s"}`;
  grid.innerHTML = packs.map((pack) => {
    const images = getPackImages(pack);
    const features = getPackFeatures(pack).slice(0, 3);
    const salePrice = getPackSalePrice(pack);
    const discount = Number(pack.descuento) > 0 ? Number(pack.descuento) : (pack.oferta ? 10 : 0);
    const isBestSeller = Boolean(pack.top || pack.mas_vendido || pack["más_vendido"]);
    const packId = escapeHtml(pack.id);
    const packName = escapeHtml(pack.nombre || "Pack Casa Fresca");
    const originalPrice = Number(pack.precio) || 0;
    return `
      <article class="product-card pack-card" role="listitem">
        <div class="pack-card-media">
          ${isBestSeller ? '<span class="pack-badge pack-badge--top">Más vendido</span>' : ""}
          ${pack.nuevo ? '<span class="pack-badge pack-badge--new">Nuevo</span>' : ""}
          ${discount ? `<span class="badge-oferta">-${discount}%</span>` : ""}
          <img src="${productImageUrl(images[0] || "")}" alt="${packName}" class="pack-image" width="320" height="200" loading="lazy" decoding="async" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
        </div>
        <div class="pack-card-content">
          <div class="product-category">Casa Fresca · Pack</div>
          <h3 class="pack-title">${packName}</h3>
          ${pack.descripcion ? `<p class="pack-description">${escapeHtml(pack.descripcion)}</p>` : ""}
          ${features.length ? `<ul class="pack-features">${features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}</ul>` : ""}
          <div class="pack-card-bottom">
            <div class="product-price">
              ${discount ? `<span class="old-price">${Currency.formatPrice(originalPrice)}</span>` : ""}
              <span class="current-price">${Currency.formatPrice(salePrice)}</span>
            </div>
            <div class="pack-card-actions">
              <button type="button" class="pack-details-button" data-pack-detail="${packId}" aria-label="Ver detalles de ${packName}">Detalles</button>
              <button type="button" class="btn-add-cart" data-pack-add="${packId}" aria-label="Añadir ${packName} al carrito">
                <i class="fas fa-cart-plus" aria-hidden="true"></i> Añadir
              </button>
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
      const pack = packs.find((item) => String(item.id) === button.dataset.packAdd);
      if (pack) addPackToCart(pack.id, getPackSalePrice(pack));
    });
  });

  const previous = document.getElementById("packsPrev");
  const next = document.getElementById("packsNext");
  const scrollPackRail = (direction) => {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    grid.scrollBy({ left: direction * Math.max(grid.clientWidth * 0.85, 240), behavior });
  };
  grid.onscroll = updatePackRailControls;
  if (previous) {
    previous.onclick = () => scrollPackRail(-1);
  }
  if (next) {
    next.onclick = () => scrollPackRail(1);
  }
  updatePackRailControls();
}

function updatePackRailControls() {
  const grid = document.getElementById("packsGrid");
  const previous = document.getElementById("packsPrev");
  const next = document.getElementById("packsNext");
  if (!grid || !previous || !next) return;

  const maxScroll = Math.max(0, grid.scrollWidth - grid.clientWidth);
  const hasOverflow = maxScroll > 1;
  previous.classList.toggle("hidden", !hasOverflow);
  next.classList.toggle("hidden", !hasOverflow);
  previous.disabled = !hasOverflow || grid.scrollLeft <= 1;
  next.disabled = !hasOverflow || grid.scrollLeft >= maxScroll - 1;
}

window.addEventListener("resize", updatePackRailControls);

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

  const productBestSellers = allProducts.filter(
    (p) => p.mas_vendido && p.disponibilidad !== false && p.activo !== false,
  );
  const packBestSellers = allPacks.filter(
    (pack) => (pack.top || pack.mas_vendido || pack["más_vendido"]) && isPackAvailable(pack),
  );
  const bestSellers = [
    ...productBestSellers.map((item) => ({ type: "product", item })),
    ...packBestSellers.map((item) => ({ type: "pack", item })),
  ];

  if (bestSellers.length === 0) {
    section.classList.add("hidden");
    grid.innerHTML = "";
    return;
  }

  section.classList.remove("hidden");
  grid.innerHTML = bestSellers
    .map((entry, index) => {
      const isPack = entry.type === "pack";
      const prod = entry.item;
      const precioFinal = isPack ? getPackSalePrice(prod) : getProductSalePrice(prod);
      const tieneDescuento = prod.oferta || Number(prod.descuento || 0) > 0;
      const priceValue = isPack ? prod.precio : prod.precio;
      const imageSrc = isPack ? (getPackImages(prod)[0] || "") : (prod.imagenes?.[0] || "");
      return `
        <article class="best-seller-card" style="animation-delay:${index * 0.05}s" data-best-${isPack ? "pack" : "product"}="${escapeHtml(prod.id)}">
          <div class="best-seller-image-container">
            <span class="best-seller-badge"><i class="fas fa-fire"></i> ${isPack ? "PACK TOP" : "TOP"}</span>
            <img src="${productImageUrl(imageSrc)}" alt="${escapeHtml(prod.nombre)}" class="best-seller-image" loading="lazy" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
          </div>
          <div class="best-seller-info">
            <div class="best-seller-category">${escapeHtml(isPack ? (prod.categoria || "Pack") : prod.categoria)}</div>
            <h3 class="best-seller-title">${escapeHtml(prod.nombre)}</h3>
            <div class="best-seller-price">
              <span class="best-seller-price-current">${Currency.formatPrice(precioFinal)}</span>
              ${tieneDescuento ? `<span class="best-seller-price-original">${Currency.formatPrice(priceValue)}</span>` : ""}
            </div>
            ${isPack ? "" : `<button class="best-seller-cta" type="button" data-best-add="${escapeHtml(prod.id)}">${isStockControlled(prod) && getAvailableStock(prod) < getMinimumQuantity(prod) ? "Agotado" : "Añadir"}</button>`}
          </div>
        </article>
      `;
    })
    .join("");

  grid.querySelectorAll("[data-best-product]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (!event.target.closest("[data-best-add]")) showProductDetail(card.dataset.bestProduct);
    });
  });
  grid.querySelectorAll("[data-best-pack]").forEach((card) => {
    card.addEventListener("click", () => showPackDetail(card.dataset.bestPack));
  });
  grid.querySelectorAll("[data-best-add]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const prod = allProducts.find((item) => item.id === button.dataset.bestAdd);
      if (prod) addToCart(prod.id, getProductSalePrice(prod), getMinimumQuantity(prod));
    });
  });
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
    const timer = document.getElementById("offersTimer");
    if (!timer) return;
    const firstOffer = allProducts.find((product) => product.oferta || Number(product.descuento || 0) > 0);
    if (!firstOffer) return;
    timer.textContent = `Termina en ${formatCountdown(getOfferDeadline(firstOffer.id) - Date.now())}`;
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
      return `
        <article class="flash-deal-card" data-flash-product="${escapeHtml(prod.id)}">
          <div class="flash-deal-image-container">
            <span class="flash-deal-badge">Flash</span>
            <img src="${productImageUrl(imageSrc)}" alt="${escapeHtml(prod.nombre)}" class="flash-deal-image" loading="lazy" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
          </div>
          <div class="flash-deal-info">
            <h3 class="flash-deal-title">${escapeHtml(prod.nombre)}</h3>
            <div class="flash-deal-price">
              <span class="flash-deal-price-current">${Currency.formatPrice(precioFinal)}</span>
              <span class="flash-deal-price-original">${Currency.formatPrice(prod.precio)}</span>
              <span class="flash-deal-discount">-${descPorcentaje}%</span>
            </div>
            <button class="flash-deal-cta" type="button" data-flash-add="${escapeHtml(prod.id)}" ${!canAddProduct(prod) ? "disabled" : ""}>Añadir rápido</button>
          </div>
        </article>
      `;
    })
    .join("");

  grid.querySelectorAll("[data-flash-product]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (!event.target.closest("[data-flash-add]")) showProductDetail(card.dataset.flashProduct);
    });
  });
  grid.querySelectorAll("[data-flash-add]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const prod = allProducts.find((item) => item.id === button.dataset.flashAdd);
      if (prod) addToCart(prod.id, getProductSalePrice(prod), getMinimumQuantity(prod));
    });
  });
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
  const categoriesNav = document.getElementById("categoriesList");
  if (categoriesNav) categoriesNav.innerHTML = "";

  // "Ver Todo" para sidebar normal
  const allItem = document.createElement("li");
  allItem.dataset.category = "all";
  allItem.className = "active";
  allItem.tabIndex = 0;
  allItem.setAttribute("role", "button");
  allItem.textContent = "Ver Todo";
  categoryList.appendChild(allItem);
  if (categoriesNav) {
    const navAll = document.createElement("li");
    navAll.dataset.category = "all";
    navAll.tabIndex = 0;
    navAll.setAttribute("role", "button");
    navAll.textContent = "Ver todo";
    categoriesNav.appendChild(navAll);
  }

  // "Ver Todo" para drawer - con icono
  const allItemDrawer = document.createElement("li");
  allItemDrawer.dataset.category = "all";
  allItemDrawer.tabIndex = 0;
  allItemDrawer.setAttribute("role", "button");
  allItemDrawer.className = "active";
  allItemDrawer.innerHTML = '<i class="fas fa-th-large" aria-hidden="true"></i> Ver Todo';
  categoryListDrawer.appendChild(allItemDrawer);

  categories.forEach((category) => {
    // Sidebar normal (sin icono)
    const li = document.createElement("li");
    li.dataset.category = category;
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.textContent = category;
    categoryList.appendChild(li);
    if (categoriesNav) {
      const navLi = document.createElement("li");
      navLi.dataset.category = category;
      navLi.tabIndex = 0;
      navLi.setAttribute("role", "button");
      navLi.textContent = category;
      categoriesNav.appendChild(navLi);
    }

    // Drawer con icono
    const liDrawer = document.createElement("li");
    liDrawer.dataset.category = category;
    liDrawer.tabIndex = 0;
    liDrawer.setAttribute("role", "button");
    const iconClass = getCategoryIcon(category);
    liDrawer.innerHTML = `<i class="fas ${iconClass}" aria-hidden="true"></i> ${escapeHtml(category)}`;
    categoryListDrawer.appendChild(liDrawer);
  });
}

function renderCategoriesCircle(products) {
  const scroll = document.getElementById("categoriesCircleScroll");
  if (!scroll) return;
  const categories = getUniqueCategories(products);
  scroll.innerHTML = categories.map((category) => `
    <button type="button" class="category-circle-item" data-circle-category="${escapeHtml(category)}">
      <span class="category-circle-image"><i class="fas ${getCategoryIcon(category)}" aria-hidden="true"></i></span>
      <span class="category-circle-label">${escapeHtml(category)}</span>
    </button>
  `).join("");
  scroll.querySelectorAll("[data-circle-category]").forEach((button) => {
    button.addEventListener("click", () => navigateToCategory(button.dataset.circleCategory));
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
  const startingSearch = Boolean(trimmed) && !lastSearchQuery;
  lastSearchQuery = trimmed;

  setHomepageChromeVisible(!trimmed && currentCategory === "all");

  const base = getCategoryProducts();
  const results = trimmed ? getSearchResults(trimmed) : base;

  renderProducts(results);

  const suggestions = trimmed ? results : getDefaultSuggestions();
  renderSearchSuggestions(suggestions, trimmed);
  if (startingSearch) scrollToProductsArea();
}

function hideSearchSuggestions() {
  searchSuggestions.classList.remove("open");
  searchSuggestions.innerHTML = "";
}

function setHomepageChromeVisible(visible) {
  document.body.classList.toggle("catalog-view", !visible);
  const ids = ["seasonalCarousel", "bestSellersSection", "offersSection", "packsSection", "categoriesCircleSection"];
  ids.forEach((id) => {
    const element = id === "seasonalCarousel"
      ? document.getElementById(id)
      : document.getElementById(id);
    if (element) element.style.display = visible ? "" : "none";
  });
}

categoryList.addEventListener("click", (e) => {
  if (e.target.tagName === "LI") {
    const selectedCategory = e.target.getAttribute("data-category");
    navigateToCategory(selectedCategory);
  }
});

const categoriesNav = document.getElementById("categoriesList");
function activateCategoryWithKeyboard(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  const item = event.target.closest('li[role="button"][data-category]');
  if (!item) return;
  event.preventDefault();
  item.click();
}

[categoryList, categoryListDrawer, categoriesNav].forEach((list) => {
  if (list) list.addEventListener("keydown", activateCategoryWithKeyboard);
});

if (categoriesNav) {
  categoriesNav.addEventListener("click", (event) => {
    const item = event.target.closest("li[data-category]");
    if (!item) return;
    navigateToCategory(item.dataset.category);
  });
}

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
  const minimumOrderTotal = Number(window.CASA_FRESCA_CONFIG.minimumOrderTotal);
  const minimumOrderNotice = document.getElementById("minimumOrderNotice");
  const checkoutButton = document.getElementById("checkoutButton");
  if (minimumOrderNotice) {
    if (total >= minimumOrderTotal) {
      minimumOrderNotice.textContent = "";
    } else if (cart.length === 0) {
      minimumOrderNotice.textContent = `Pedido mínimo: ${Currency.formatPrice(minimumOrderTotal)}.`;
    } else {
      minimumOrderNotice.textContent = `Pedido mínimo: ${Currency.formatPrice(minimumOrderTotal)}. Añade ${Currency.formatPrice(minimumOrderTotal - total)} para continuar.`;
    }
  }
  if (checkoutButton) checkoutButton.disabled = total < minimumOrderTotal;
  refreshProductCardCartControls();
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
  openCartBtn.setAttribute("aria-expanded", "true");
  lockBodyScroll();
}

function closeCartDrawer() {
  cartDrawer.classList.remove("open");
  cartModal.classList.remove("open");
  cartModal.setAttribute("aria-hidden", "true");
  openCartBtn.setAttribute("aria-expanded", "false");
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

function getBundleAdditionQuantity(product) {
  const existingItem = cart.find(
    (item) => item.id === product.id && !item.isPack,
  );
  return existingItem ? 1 : getMinimumQuantity(product);
}

function generateFrequentlyBoughtTogetherHTML(products) {
  if (!Array.isArray(products) || products.length < 2) return "";

  const total = products.reduce(
    (sum, product) =>
      sum +
      getProductSalePrice(product) * getBundleAdditionQuantity(product),
    0,
  );
  const canAdd = products.every((product) =>
    canAddProduct(product, getBundleAdditionQuantity(product)),
  );

  return `
    <section class="frequently-bought-together" aria-labelledby="frequentlyBoughtTitle">
      <div class="fbt-heading">
        <h3 id="frequentlyBoughtTitle">Comprados juntos habitualmente</h3>
        <p>Completa tu compra con productos que combinan bien.</p>
      </div>
      <div class="fbt-items">
        ${products.map((product) => {
          const quantity = getBundleAdditionQuantity(product);
          const minimum = getMinimumQuantity(product);
          return `
            <article class="fbt-item">
              <img src="${productImageUrl(product.imagenes?.[0] || "")}" alt="${escapeHtml(product.nombre)}" loading="lazy" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
              <div class="fbt-item-details">
                <h4>${escapeHtml(product.nombre)}</h4>
                <strong>${Currency.formatPrice(getProductSalePrice(product))}</strong>
                <span>${quantity > 1 ? `Añade ${quantity} unidades` : "Añade 1 unidad"}${minimum > 1 && quantity === minimum ? ` · mínimo ${minimum}` : ""}</span>
              </div>
            </article>
          `;
        }).join("")}
      </div>
      <div class="fbt-footer">
        <div class="fbt-total">
          <span>Total del combo</span>
          <strong>${Currency.formatPrice(total)}</strong>
        </div>
        <button type="button" class="fbt-add-button" id="addFrequentlyBoughtTogetherBtn" aria-describedby="fbtStatus" ${canAdd ? "" : "disabled"}>
          Añadir combo al carrito
        </button>
      </div>
      <p class="fbt-status" id="fbtStatus" aria-live="polite"></p>
    </section>
  `;
}

function addFrequentlyBoughtTogetherToCart(products) {
  const status = document.getElementById("fbtStatus");
  const additions = products.map((product) => ({
    product,
    quantity: getBundleAdditionQuantity(product),
  }));
  const unavailable = additions.find(
    ({ product, quantity }) => !canAddProduct(product, quantity),
  );

  if (unavailable) {
    if (status) {
      status.textContent = `No hay unidades suficientes de ${unavailable.product.nombre}.`;
    }
    return false;
  }

  additions.forEach(({ product, quantity }) => {
    const existingItem = cart.find(
      (item) => item.id === product.id && !item.isPack,
    );
    if (existingItem) {
      existingItem.qty += quantity;
    } else {
      cart.push({
        ...product,
        qty: quantity,
        precioVenta: getProductSalePrice(product),
        disponible: true,
        precioAnterior: null,
        isPack: false,
      });
    }
  });

  updateCart();
  if (status) status.textContent = "Combo añadido al carrito.";
  return true;
}

function removeProductDetailFloatingPanel() {
  document.body.classList.remove("detail-floating-active");
  if (detailFloatingOnChange) {
    window.removeEventListener("scroll", detailFloatingOnChange);
    window.removeEventListener("resize", detailFloatingOnChange);
    detailFloatingOnChange = null;
  }
  if (detailFloatingPanel) {
    detailFloatingPanel.remove();
    detailFloatingPanel = null;
  }
}

function initProductDetailFloatingPanel(product, mainAddButton) {
  removeProductDetailFloatingPanel();
  if (!product || !mainAddButton) return null;

  const panel = document.createElement("aside");
  panel.className = "detail-floating-panel";
  panel.setAttribute("aria-label", "Acceso rápido para añadir al carrito");
  panel.setAttribute("aria-hidden", "true");
  panel.innerHTML = `
    <div class="detail-floating-product">
      <img class="detail-floating-image" src="${productImageUrl(product.imagenes?.[0] || "")}" alt="" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
      <div class="detail-floating-copy">
        <strong class="detail-floating-title">${escapeHtml(product.nombre)}</strong>
        <span class="detail-floating-price">${Currency.formatPrice(getProductSalePrice(product))}</span>
      </div>
    </div>
    <button type="button" class="detail-floating-add" tabindex="-1">Añadir</button>
  `;
  document.body.appendChild(panel);
  detailFloatingPanel = panel;

  const floatingAddButton = panel.querySelector(".detail-floating-add");
  floatingAddButton.addEventListener("click", () => mainAddButton.click());
  floatingAddButton.setAttribute(
    "aria-label",
    `Añadir ${product.nombre} al carrito`,
  );

  const updateVisibility = () => {
    const image = document.getElementById("productDetailMainImage");
    const imageRect = image?.getBoundingClientRect();
    const buttonRect = mainAddButton.getBoundingClientRect();
    const headerHeight =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--header-height"),
      ) || 0;
    const imageVisible = Boolean(
      imageRect &&
        imageRect.bottom > headerHeight &&
        imageRect.top < window.innerHeight,
    );
    const buttonVisible =
      buttonRect.bottom > headerHeight && buttonRect.top < window.innerHeight;
    const visible =
      window.innerWidth <= 900 && !imageVisible && !buttonVisible;

    panel.classList.toggle("is-visible", visible);
    panel.setAttribute("aria-hidden", String(!visible));
    document.body.classList.toggle("detail-floating-active", visible);
    floatingAddButton.tabIndex = visible ? 0 : -1;
    floatingAddButton.disabled = mainAddButton.disabled;
    floatingAddButton.textContent = mainAddButton.disabled
      ? "No disponible"
      : "Añadir";
    if (!visible && document.activeElement === floatingAddButton) {
      mainAddButton.focus({ preventScroll: true });
    }
  };

  detailFloatingOnChange = updateVisibility;
  window.addEventListener("scroll", updateVisibility, { passive: true });
  window.addEventListener("resize", updateVisibility);
  requestAnimationFrame(updateVisibility);
  return floatingAddButton;
}

function hideProductDetail({ fromPopState = false } = {}) {
  // Oculta el detalle tipo Amazon y restaura el layout
  const detailPage = document.getElementById("product-detail-page");
  removeProductDetailFloatingPanel();
  
  // Ocultar el detalle
  detailPage.style.display = "none";
  detailPage.innerHTML = "";

  // Restaurar elementos principales
  document.querySelector("main").style.display = "";
  document.querySelector(".hero") &&
    (document.querySelector(".hero").style.display = "");
  document.querySelector("footer").style.display = "";
  document.getElementById("productDrawerOverlay").style.display = "";
  setHomepageChromeVisible(currentCategory === "all" && !String(searchInput?.value || "").trim());

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
  document.querySelectorAll(".categories-list li").forEach((li) => {
    li.classList.toggle("active", li.dataset.category === category);
  });
}

function scrollToProductsArea(behavior = "smooth") {
  const productsArea = document.querySelector(".products-area");
  if (!productsArea) return;

  requestAnimationFrame(() => {
    const headerHeight =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--header-height"),
      ) || 0;
    const target = Math.max(
      0,
      window.scrollY + productsArea.getBoundingClientRect().top - headerHeight - 12,
    );
    scrollPositions[currentCategory] = target;
    window.scrollTo({ top: target, behavior });
  });
}

function navigateToCategory(
  category,
  { replaceState = false, scrollToCatalog = true } = {},
) {
  // Guardar scroll actual de la categoría anterior
  if (currentCategory) {
    scrollPositions[currentCategory] = window.scrollY;
  }
  
  currentCategory = category || "all";
  setActiveCategoryUI(currentCategory);
  setHomepageChromeVisible(currentCategory === "all" && !String(searchInput?.value || "").trim());
  const productsTitle = document.querySelector(".products-area .section-title");
  if (productsTitle) {
    productsTitle.textContent =
      currentCategory === "all" ? "Nuestros Productos" : currentCategory;
  }
  updateSearch(searchInput.value);
  if (scrollToCatalog) scrollToProductsArea();

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
  const scrollTarget = scrollPositions[currentCategory] || 0;
  requestAnimationFrame(() => {
    window.scrollTo({ top: scrollTarget, behavior: "auto" });
  });
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
    navigateToCategory("all", { replaceState: true, scrollToCatalog: false });
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
  navigateToCategory("all", { replaceState: true, scrollToCatalog: false });
  history.replaceState({ type: "home" }, "", "/");
}

// 6. Detalles del Producto
function showProductDetail(
  id,
  { replaceState = false, fromPopState = false } = {},
) {
  const prod = allProducts.find((p) => p.id === id);
  if (!prod) return;
  removeProductDetailFloatingPanel();

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
  setHomepageChromeVisible(false);

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
    (p) =>
      p.categoria === prod.categoria &&
      p.id !== prod.id &&
      p.disponibilidad !== false &&
      p.activo !== false,
  );
  const relatedProducts = applyDailyOrder(relatedPool, `related_${prod.id}`)
    .filter((product) => canAddProduct(product))
    .slice(0, 6);
  const featuredBundleProducts = applyDailyOrder(
    allProducts.filter(
      (product) =>
        product.id !== prod.id &&
        product.categoria !== prod.categoria &&
        (product.mas_vendido || product.nuevo || product.oferta),
    ),
    `frequently_bought_${prod.id}`,
  );
  const bundleSuggestions = [
    ...new Map(
      [...relatedProducts, ...featuredBundleProducts]
        .filter((product) => canAddProduct(product))
        .map((product) => [String(product.id), product]),
    ).values(),
  ].slice(0, 2);
  const bundleProducts = [prod, ...bundleSuggestions];
  const frequentlyBoughtTogetherHTML =
    generateFrequentlyBoughtTogetherHTML(bundleProducts);
  
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
        </div>
      </div>
      
      ${frequentlyBoughtTogetherHTML}

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
  let floatingAddButton = null;

  let detailQty = getMinimumQuantity(prod);
  const syncQtyUI = () => {
    if (detailQtySpan) detailQtySpan.textContent = detailQty;
    if (qtyMinusBtn) qtyMinusBtn.disabled = detailQty <= getMinimumQuantity(prod);
    if (qtyPlusBtn) qtyPlusBtn.disabled = getAvailableStock(prod) < detailQty + 1;
    if (addToCartBtn) addToCartBtn.disabled = !canAddProduct(prod, detailQty);
    if (floatingAddButton && addToCartBtn) {
      floatingAddButton.disabled = addToCartBtn.disabled;
      floatingAddButton.textContent = addToCartBtn.disabled
        ? "No disponible"
        : "Añadir";
    }
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
  const addBundleButton = detailPage.querySelector(
    "#addFrequentlyBoughtTogetherBtn",
  );
  if (addBundleButton) {
    addBundleButton.addEventListener("click", () =>
      addFrequentlyBoughtTogetherToCart(bundleProducts),
    );
  }
  floatingAddButton = initProductDetailFloatingPanel(prod, addToCartBtn);
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
  removeProductDetailFloatingPanel();

  if (!fromPopState) {
    savedScrollPosition = window.scrollY;
    lastListScroll = window.scrollY;
    scrollPositions[currentCategory] = window.scrollY;
  }

  document.querySelector("main").style.display = "none";
  document.querySelector(".hero") && (document.querySelector(".hero").style.display = "none");
  document.querySelector("footer").style.display = "none";
  document.getElementById("productDrawerOverlay").style.display = "none";
  setHomepageChromeVisible(false);
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
