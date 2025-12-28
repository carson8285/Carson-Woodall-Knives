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
  loadCategory(els.category.value);
}

function loadCategory(catId) {
  state.category = catId;
  els.knife.innerHTML = '';
  const knives = catalog.categories[catId].knives;

  for (const id in knives) {
    els.knife.add(new Option(knives[id].label, id));
  }

  els.knife.onchange = () => loadKnife(els.knife.value);
  loadKnife(els.knife.value);
}

function loadKnife(knifeId) {
  state.knife = knifeId;
  const knife = catalog.categories[state.category].knives[knifeId];

  populateOptions(els.handle, knife.options.handle, 'handle');
  populateOptions(els.filework, knife.options.filework, 'filework');
  populateOptions(els.finish, knife.options.finish, 'finish');

  updatePrice();
}

function populateOptions(select, options, key) {
  select.innerHTML = '';
  for (const id in options) {
    select.add(new Option(options[id].label, id));
  }
  state.options[key] = select.value;
  select.onchange = () => {
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

function applyConfig() {
  console.log('Apply config to viewer:', state);
  // This is where Three.js hooks in later
}

els.addToCart.onclick = () => {
  const payload = {
    knife: state.knife,
    category: state.category,
    options: state.options
  };
  console.log('Add to cart payload:', payload);
};
