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

// Loader elements
const previewStage = document.getElementById('previewStage');
const previewLoader = document.getElementById('previewLoader');

let loadToken = 0;
let loaderTimer = null;

function setPreviewLoading(isLoading, text = 'Loading…') {
  if (!previewStage || !previewLoader) return;
  const t = previewLoader.querySelector('.loader-text');
  if (t) t.textContent = text;
  previewStage.classList.toggle('is-loading', isLoading);
}

function showLoaderSoon(text) {
  clearTimeout(loaderTimer);
  loaderTimer = setTimeout(() => setPreviewLoading(true, text), 120);
}

function hideLoaderNow() {
  clearTimeout(loaderTimer);
  setPreviewLoading(false);
}

// Listen to viewer loading events (authoritative)
window.addEventListener("knifeviewer:loading", (e) => {
  const { loading, text } = e.detail || {};
  if (loading) setPreviewLoading(true, text || "Loading…");
  else hideLoaderNow();
});

window.addEventListener("knifeviewer:error", (e) => {
  const msg = e.detail?.message || "Viewer error";
  console.warn(msg);
  setPreviewLoading(true, msg);
});

// Start loading immediately
setPreviewLoading(true, 'Loading catalog…');

fetch('./data/catalog.json')
  .then(res => res.json())
  .then(data => {
    catalog = data;
    initCategories();
  })
  .catch(err => {
    console.error('Failed to load catalog:', err);
    setPreviewLoading(true, 'Catalog failed to load');
  });

function initCategories() {
  for (const id in catalog.categories) {
    els.category.add(new Option(catalog.categories[id].label, id));
  }
  els.category.onchange = () => loadCategory(els.category.value);
  loadCategory(els.category.value);
}

function loadCategory(catId) {
  const token = ++loadToken;
  showLoaderSoon('Loading category…');

  state.category = catId;
  state.knife = null;
  state.options = {};

  els.knife.innerHTML = '';
  const knives = catalog.categories[catId].knives;

  for (const id in knives) {
    els.knife.add(new Option(knives[id].label, id));
  }

  els.knife.onchange = () => loadKnife(els.knife.value);
  loadKnife(els.knife.value, token);
}

function loadKnife(knifeId, inheritedToken = null) {
  const token = inheritedToken ?? ++loadToken;
  showLoaderSoon('Loading knife…');

  state.knife = knifeId;

  const knife = catalog.categories[state.category].knives[knifeId];

  populateOptions(els.handle, knife.options.handle, 'handle');
  populateOptions(els.filework, knife.options.filework, 'filework');
  populateOptions(els.finish, knife.options.finish, 'finish');

  updatePrice();
  applyConfig(token);
}

function populateOptions(select, options, key) {
  select.innerHTML = '';
  for (const id in options) {
    select.add(new Option(options[id].label, id));
  }

  state.options[key] = select.value;

  select.onchange = () => {
    const token = ++loadToken;
    showLoaderSoon('Updating…');

    state.options[key] = select.value;
    updatePrice();
    applyConfig(token);
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

async function applyConfig(token = ++loadToken) {
  try {
    // Wait for viewer to be ready (kills the “blank until refresh” race)
    if (window.KnifeViewer?.ready) await window.KnifeViewer.ready;

    if (window.KnifeViewer && typeof window.KnifeViewer.applyState === 'function') {
      await window.KnifeViewer.applyState(state);
    }
  } finally {
    // hide only if this is still the latest action
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
