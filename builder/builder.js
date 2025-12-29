let catalog;
let state = {
  category: null,
  knife: null,
  options: {}
};

const els = {
  category: document.getElementById('categorySelect'),
  knife: document.getElementById('knifeSelect'),
  handle: document.getElementById('handleSelect'),
  filework: document.getElementById('fileworkSelect'),
  finish: document.getElementById('finishSelect'),
  price: document.getElementById('price'),
  addToCart: document.getElementById('addToCartBtn')
};

// Loader helpers
const previewStage = document.getElementById('previewStage');
const loaderEl = document.getElementById('previewLoader');
let loadToken = 0;

function setPreviewLoading(isLoading, text = 'Loading…') {
  if (!previewStage || !loaderEl) return;
  const textEl = loaderEl.querySelector('.loader-text');
  if (textEl) textEl.textContent = text;
  previewStage.classList.toggle('is-loading', isLoading);
}

// Optional: avoid flashing loader for super fast updates
let loaderTimer = null;
function showLoaderSoon(text) {
  clearTimeout(loaderTimer);
  loaderTimer = setTimeout(() => setPreviewLoading(true, text), 120);
}
function hideLoaderNow() {
  clearTimeout(loaderTimer);
  setPreviewLoading(false);
}

// Preload preview image so we can keep loader up until it's ready
function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = reject;
    img.src = src;
  });
}

fetch('./data/catalog.json')
  .then(res => res.json())
  .then(data => {
    catalog = data;
    initCategories();
  });

function initCategories() {
  for (const id in catalog.categories) {
    els.category.add(new Option(catalog.categories[id].label, id));
  }
  els.category.onchange = () => loadCategory(els.category.value);

  // initial load
  loadCategory(els.category.value);
}

function loadCategory(catId) {
  // loader for category switch
  showLoaderSoon('Loading category…');
  const token = ++loadToken;

  state.category = catId;
  state.knife = null;
  state.options = {};

  els.knife.innerHTML = '';
  const knives = catalog.categories[catId].knives;

  for (const id in knives) {
    els.knife.add(new Option(knives[id].label, id));
  }

  els.knife.onchange = () => loadKnife(els.knife.value);

  // choose first knife by default (select.value updates after options are added)
  loadKnife(els.knife.value, token);
}

function loadKnife(knifeId, inheritedToken = null) {
  const token = inheritedToken ?? ++loadToken;
  showLoaderSoon('Loading knife…');

  state.knife = knifeId;

  const knife = catalog.categories[state.category].knives[knifeId];

  populateOptions(els.handle, knife.options.handle, 'handle', token);
  populateOptions(els.filework, knife.options.filework, 'filework', token);
  populateOptions(els.finish, knife.options.finish, 'finish', token);

  updatePrice();
  applyConfig(token);
}

function populateOptions(select, options, key, token) {
  select.innerHTML = '';
  for (const id in options) {
    select.add(new Option(options[id].label, id));
  }
  state.options[key] = select.value;

  select.onchange = () => {
    const nextToken = ++loadToken;
    showLoaderSoon('Updating…');

    state.options[key] = select.value;
    updatePrice();
    applyConfig(nextToken);
  };
}

function updatePrice() {
  const knife = catalog.categories[state.category].knives[state.knife];
  let total = knife.basePrice;

  for (const key in state.options) {
    total += knife.options[key][state.options[key]].price;
  }

  els.price.textContent = `$${total}`;
}

// Core: applyConfig now supports async image/3D readiness + token
async function applyConfig(token = ++loadToken) {
  console.log('Apply config to viewer:', state);

  const img = document.getElementById('knifePreview');
  const src = getPreviewImage();

  try {
    // preload the preview image; keep loader until ready
    if (img) {
      await preloadImage(src).catch(() => null); // tolerate missing images
      if (token !== loadToken) return; // stale update, ignore
      img.src = src;
    }

    // call the Three.js viewer if it exists (if it has async loading, prefer a Promise)
    if (window.KnifeViewer && typeof window.KnifeViewer.applyState === 'function') {
      const result = window.KnifeViewer.applyState(state);

      // If your viewer returns a Promise when it loads models/materials, await it
      if (result && typeof result.then === 'function') {
        await result;
        if (token !== loadToken) return;
      }
    }
  } finally {
    // Only hide if we’re still current
    if (token === loadToken) hideLoaderNow();
  }
}

els.addToCart.onclick = () => {
  const payload = {
    knife: state.knife,
    category: state.category,
    options: state.options
  };
  console.log('Add to cart payload:', payload);
};

function getPreviewImage() {
  const { knife, options } = state;
  return `./assets/images/${knife}_${options.handle}_${options.filework}.webp`;
}
