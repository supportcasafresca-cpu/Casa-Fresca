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

  // ANIMACIÓN: mostrar hero-overlay con efecto al cargar
  const heroOverlay = document.querySelector(".hero-overlay");
  if (heroOverlay) {
    requestAnimationFrame(() => {
      heroOverlay.classList.add("animate-in");
    });
  }

  // NUEVA LÓGICA: Leer el hash que envía el backend
  const hash = window.location.hash.substring(1);
  if (hash) {
    const productId = decodeURIComponent(hash);
    showProductDetail(productId); // Llama a tu función existente
  }

  initRouter();
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
    let precioHtml = `$${precioFinal.toFixed(2)}`;
    let badgeHtml = "";

    if (prod.oferta || prod.descuento > 0) {
      let descPorcentaje = prod.descuento > 0 ? prod.descuento : 10;
      precioFinal = prod.precio - prod.precio * (descPorcentaje / 100);
      precioHtml = `<span class="old-price">$${prod.precio.toFixed(2)}</span> $${precioFinal.toFixed(2)}`;
      badgeHtml = `<div class="badge-oferta">-${descPorcentaje}%</div>`;
    }

    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
            ${badgeHtml}
            <img src="${productImageUrl(prod.imagenes[0])}" alt="${prod.nombre}" class="product-image" onclick="showProductDetail('${prod.id}')" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
            <div class="product-category">${prod.categoria}</div>
            <h3 class="product-title">${prod.nombre}</h3>
            <div class="product-price">${precioHtml}</div>
            <button class="btn-add-cart" onclick="addToCart('${prod.id}', ${precioFinal})">AÑADIR AL CARRITO</button>
        `;
    productsGrid.appendChild(card);
  });
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

function renderCategories(products) {
  const categories = getUniqueCategories(products);
  categoryList.innerHTML = "";

  const allItem = document.createElement("li");
  allItem.dataset.category = "all";
  allItem.className = "active";
  allItem.textContent = "Ver Todo";
  categoryList.appendChild(allItem);

  categories.forEach((category) => {
    const li = document.createElement("li");
    li.dataset.category = category;
    li.textContent = category;
    categoryList.appendChild(li);
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

function getCategoryProducts() {
  const filtered = currentCategory === "all"
    ? allProducts
    : allProducts.filter((p) => p.categoria === currentCategory);
  // Filtrar solo productos disponibles
  return filtered.filter((p) => p.disponibilidad !== false);
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
                <span class="suggestion-price">$${(prod.precio || 0).toFixed(2)}</span>
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

searchInput.addEventListener("input", (e) => updateSearch(e.target.value));
searchInput.addEventListener("focus", (e) => {
  updateSearch(e.target.value);
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

// 5. Lógica del Carrito
function addToCart(id, precioFinal, qty = 1) {
  const product = allProducts.find((p) => p.id === id);
  if (!product) return;

  const existingItem = cart.find((item) => item.id === id);
  if (existingItem) {
    existingItem.qty += qty;
  } else {
    cart.push({ ...product, qty, precioVenta: precioFinal });
  }

  updateCart();

  // Efecto visual rápido para el usuario
  openCartBtn.style.transform = "scale(1.2)";
  setTimeout(() => (openCartBtn.style.transform = "scale(1)"), 200);
}

function changeQty(id, delta) {
  const item = cart.find((item) => item.id === id);
  if (item) {
    item.qty += delta;
    if (item.qty <= 0) {
      cart = cart.filter((i) => i.id !== id);
    }
  }
  updateCart();
}

function updateCart() {
  localStorage.setItem("cart", JSON.stringify(cart));

  const totalItems = cart.reduce((acc, item) => acc + item.qty, 0);
  cartCount.innerText = totalItems;

  cartItemsContainer.innerHTML = "";
  let total = 0;

  cart.forEach((item) => {
    const subtotal = item.precioVenta * item.qty;
    total += subtotal;

    const cartItem = document.createElement("div");
    cartItem.className = "cart-item";
    cartItem.innerHTML = `
            <img src="${productImageUrl(item.imagenes[0])}" alt="${item.nombre}" onerror="this.onerror=null; this.src='${IMAGE_FALLBACK}';">
            <div style="flex-grow: 1; margin: 0 10px;">
                <h4 style="font-size:0.9rem; color: var(--text-dark);">${item.nombre}</h4>
                <p style="color: var(--primary-red); font-weight: bold;">$${item.precioVenta.toFixed(2)}</p>
            </div>
            <div class="qty-controls">
                <button onclick="changeQty('${item.id}', -1)">-</button>
                <span>${item.qty}</span>
                <button onclick="changeQty('${item.id}', 1)">+</button>
            </div>
        `;
    cartItemsContainer.appendChild(cartItem);
  });

  cartTotalPrice.innerText = total.toFixed(2);
}

function loadCartFromStorage() {
  const savedCart = localStorage.getItem("cart");
  if (savedCart) {
    cart = JSON.parse(savedCart);
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
  document.querySelectorAll(".category-list li").forEach((li) => {
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
  const relatedProducts = allProducts
    .filter(p => p.categoria === prod.categoria && p.id !== prod.id)
    .slice(0, 6);
  
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
          <div class="related-product-price">$${precioRelated.toFixed(2)}</div>
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
          <div class="product-detail-price">$${precioFinal.toFixed(2)}${descPorcentaje>0?` <span class='product-detail-old-price'>$${prod.precio.toFixed(2)}</span> <span class='product-detail-discount'>-${descPorcentaje}%</span>`:''}</div>
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

function openWhatsapp() {
  const phoneNumber = "+5363001537";
  const message = encodeURIComponent("Hola, estoy interesado en sus productos. ¿Podrían brindarme más información?");
  const url = `https://wa.me/${phoneNumber}?text=${message}`;
  window.open(url, "_blank");
}

// ============ FUNCIONES DE DESCARGA DE APP ============

/**
 * Detecta el sistema operativo del usuario
 */
function detectOS() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  
  if (/android/i.test(userAgent)) {
    return 'Android';
  }
  if (/iPad|iPhone|iPod/.test(userAgent)) {
    return 'iOS';
  }
  if (/Windows NT|Win32/.test(userAgent)) {
    return 'Windows';
  }
  if (/Macintosh|MacIntel|MacPPC|Mac68K/.test(userAgent)) {
    return 'Mac';
  }
  if (/Linux|X11/.test(userAgent)) {
    return 'Linux';
  }
  return 'Unknown';
}

/**
 * Oculta/muestra elementos según el SO
 */
function initializeOSDetection() {
  const os = detectOS();
  const downloadHeaderBtn = document.getElementById("downloadAppHeaderBtn");
  const downloadBanner = document.querySelector(".app-download-banner");
  
  // Solo mostrar en Android
  if (os !== 'Android') {
    if (downloadHeaderBtn) downloadHeaderBtn.style.display = "none";
    if (downloadBanner) downloadBanner.style.display = "none";
  }
}

/**
 * Abre el modal de descarga de app
 */
function openAppDownloadModal() {
  const os = detectOS();
  
  // Si no es Android, mostrar mensaje
  if (os !== 'Android') {
    alert('Esta aplicación solo está disponible para Android.\n\nPuedes seguir usando nuestra tienda web desde cualquier dispositivo.');
    return;
  }
  
  const modal = document.getElementById("appDownloadModal");
  if (modal) {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    lockBodyScroll();
  }
}

/**
 * Cierra el modal de descarga de app
 */
function closeAppDownloadModal() {
  const modal = document.getElementById("appDownloadModal");
  if (modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    unlockBodyScroll();
  }
}

/**
 * Dispara la descarga del APK
 */
function triggerAppDownload() {
  const os = detectOS();
  
  // Validar que sea Android
  if (os !== 'Android') {
    alert('La descarga de APK solo está disponible en dispositivos Android.');
    return;
  }
  
  // Crear un elemento anchor temporal para descargar
  const link = document.createElement("a");
  link.href = "/app/app-debug.apk";
  link.download = "CasaFresca.apk";
  link.style.display = "none";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Cerrar modal después de iniciar descarga
  setTimeout(() => {
    closeAppDownloadModal();
  }, 500);
  
  // Registrar descargas (opcional - para analytics)
  console.log("📱 Descarga de app iniciada:", new Date().toLocaleString(), "OS:", os);
}

/**
 * Alias para triggerAppDownload (llamada desde el botón)
 */
function downloadApp() {
  triggerAppDownload();
}

// Inicializar event listeners para botones de descarga
document.addEventListener("DOMContentLoaded", () => {
  // Inicializar detección de SO
  initializeOSDetection();
  
  // Botón de descarga en el header
  const downloadAppHeaderBtn = document.getElementById("downloadAppHeaderBtn");
  if (downloadAppHeaderBtn) {
    downloadAppHeaderBtn.addEventListener("click", openAppDownloadModal);
  }
  
  // Botón de descarga del banner
  const downloadBannerBtn = document.querySelector(".btn-download-app");
  if (downloadBannerBtn) {
    downloadBannerBtn.addEventListener("click", openAppDownloadModal);
  }
  
  // Cerrar modal cuando se clickea fuera
  const appDownloadModal = document.getElementById("appDownloadModal");
  if (appDownloadModal) {
    appDownloadModal.addEventListener("click", (e) => {
      if (e.target === appDownloadModal) {
        closeAppDownloadModal();
      }
    });
  }
  
  // Cerrar modal cuando se presiona Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modal = document.getElementById("appDownloadModal");
      if (modal && modal.classList.contains("open")) {
        closeAppDownloadModal();
      }
    }
  });
});
