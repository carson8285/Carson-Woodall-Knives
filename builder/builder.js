let catalog;
let state = { category: null, knife: null, options: {} };

const els = {
  category: document.getElementById('categorySelect'),
  knife: document.getElementById('knifeSelect'),
  handle: document.getElementById('handleSelect'),
  filework: document.getElementById('fileworkSelect'),
  finish: document.getElementById('finishSelect'),
  price: document.getElementById('price'),
  addToCart: document.getElementById('addToCartBtn')
};

const previewStage = document.getElementById('previewStage');
const previewLoader = document.getElementById('previewLoader');

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

// Viewer events are authoritative
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

// Start
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
  showLoaderSoon('Loading category…');

  state.category = catId;
  state.knife = null;
  state.options = {};

  els.knife.innerHTML = '';
  const knives = catalog.categories[catId].knives;
  for (const id in knives) els.knife.add(new Option(knives[id].label, id));

  els.knife.onchange = () => loadKnife(els.knife.value);
  loadKnife(els.knife.value);
}

function loadKnife(knifeId) {
  showLoaderSoon('Loading knife…');

  state.knife = knifeId;
  const knife = catalog.categories[state.category].knives[knifeId];

  populateOptions(els.handle, knife.options.handle, 'handle');
  populateOptions(els.filework, knife.options.filework, 'filework');
  populateOptions(els.finish, knife.options.finish, 'finish');

  updatePrice();
  applyConfig();
}

function populateOptions(select, options, key) {
  select.innerHTML = '';
  for (const id in options) select.add(new Option(options[id].label, id));
  state.options[key] = select.value;

  select.onchange = () => {
    showLoaderSoon('Updating…');
    state.options[key] = select.value;
    updatePrice();
    applyConfig();
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

async function applyConfig() {
  try {
    // Ensure viewer is initialized, but don't hang forever.
    // If it can't init, it'll emit an error event.
    if (window.KnifeViewer?.ready) {
      const readyOk = await window.KnifeViewer.ready();
      if (!readyOk) {
        setPreviewLoading(true, "Viewer not ready. Refresh if needed.");
        return;
      }
    }

    if (window.KnifeViewer?.applyState) {
      await window.KnifeViewer.applyState(state);
    }
  } finally {
    // If viewer didn't emit a stop-loading for some reason, fail-safe hide
    setTimeout(() => {
      // only hide if we're still in generic "Loading…" state
      if (previewStage?.classList.contains('is-loading')) hideLoaderNow();
    }, 3000);
  }
}

els.addToCart.onclick = () => {
  const payload = { knife: state.knife, category: state.category, options: state.options };
  console.log('Add to cart payload:', payload);
};
