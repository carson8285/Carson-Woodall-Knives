let catalog;
let catalogUrl; // ABSOLUTE URL of catalog.json (used to resolve ../ paths)

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

// Loader
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

// Helps Three.js adjust to new container sizes
function kickViewerResize() {
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

// ---------- model URL resolver (relative to catalog.json) ----------
function resolveModelUrls() {
  const knifeData = catalog?.categories?.[state.category]?.knives?.[state.knife];
  const r = knifeData?.rendering;

  if (!knifeData || !r || !catalogUrl) return { primary: null, fallback: null };

  const knife = state.knife;
  const handle = state.options.handle;
  const filework = state.options.filework;
  const finish = state.options.finish;

  if (!knife || !handle || !filework || !finish) return { primary: null, fallback: null };

  const basePath = r.basePath || "./";
  const pattern = r.pattern || "{knife}.glb";
  const fallbackPattern = r.fallback || "{knife}.glb";

  const filename = pattern
    .replace("{knife}", knife)
    .replace("{handle}", handle)
    .replace("{filework}", filework)
    .replace("{finish}", finish);

  const fallbackName = fallbackPattern.replace("{knife}", knife);

  // Resolve basePath relative to catalog.json URL, then resolve file under it
  const base = new URL(basePath, catalogUrl);
  return {
    primary: new URL(filename, base).toString(),
    fallback: new URL(fallbackName, base).toString()
  };
}
// ---------------------------------------------------------------

// Start loading immediately
setPreviewLoading(true, 'Loading catalog…');

fetch('./data/catalog.json')
  .then(res => {
    catalogUrl = new URL(res.url); // <-- this makes ../assets/ work from /data/
    return res.json();
  })
  .then(data => {
    catalog = data;
    initCategories();
  })
  .catch(err => {
    console.error('Failed to load catalog:', err);
    setPreviewLoading(true, 'Catalog failed to load');
  });

function initCategories() {
  els.category.innerHTML = '';
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
    const { primary, fallback } = resolveModelUrls();

    console.log('Resolved model PRIMARY:', primary);
    console.log('Resolved model FALLBACK:', fallback);

    if (window.KnifeViewer && typeof window.KnifeViewer.applyState === 'function') {
      const result = window.KnifeViewer.applyState({
        ...state,
        modelUrl: primary,
        fallbackModelUrl: fallback
      });

      if (result && typeof result.then === 'function') {
        await result;
      }
    }

    kickViewerResize();
  } finally {
    if (token === loadToken) hideLoaderNow();
  }
}

els.addToCart.onclick = () => {
  const knifeData = catalog.categories[state.category].knives[state.knife];

  let total = knifeData.basePrice;
  for (const key in state.options) {
    total += knifeData.options[key][state.options[key]].price;
  }

  const { primary } = resolveModelUrls();

  const payload = {
    knife: state.knife,
    category: state.category,
    options: { ...state.options },
    price: total,
    modelUrl: primary
  };

  console.log('Add to cart payload:', payload);
};
