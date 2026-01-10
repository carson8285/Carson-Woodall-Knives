/* products.js - drop-in, markup-tolerant
   - Loads /data/products.json
   - Renders thumbs
   - Ensures Prev/Next buttons exist + work
   - Ensures mini price breakdown exists + updates
   - Dropdown change jumps carousel to mapped index (variantToIndex)
*/

(() => {
  const PRODUCTS_JSON_URL = "./data/products.json"; // root-safe

  const els = {
    root: document.getElementById("productRoot"),
    mainImg: document.getElementById("productMainImage"),
    thumbs: document.getElementById("productThumbs"),
    title: document.getElementById("productTitle"),
    desc: document.getElementById("productDesc"),
    price: document.getElementById("productPrice"),
    steel: document.getElementById("steelSelect"),
    finish: document.getElementById("finishSelect"),
    handle: document.getElementById("handleSelect"),
    addToCart: document.getElementById("addToCartBtn"),
  };

  // If this script is loaded on a page without the product DOM, do nothing.
  if (!els.root || !els.mainImg || !els.thumbs || !els.steel || !els.finish || !els.handle) return;

  let products = [];
  let product = null;

  const state = {
    imgIndex: 0,
    sel: { steel: null, finish: null, handle: null },
  };

  // -------------------------
  // Helpers
  // -------------------------
  function qsParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function safeArr(x) {
    return Array.isArray(x) ? x : [];
  }

  function money(n) {
    const v = Number(n) || 0;
    return `$${Math.round(v)}`;
  }

  function setPageTitle(t) {
    document.title = `${t} | Carson Woodall Knives`;
  }

  function buildOptions(selectEl, optionList, currentId) {
    selectEl.innerHTML = "";
    optionList.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = o.label;
      if (o.id === currentId) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  function optionObj(group, id) {
    const list = safeArr(product?.options?.[group]);
    return list.find((o) => o.id === id) || null;
  }

  function optionPrice(group, id) {
    const o = optionObj(group, id);
    return o ? (Number(o.price) || 0) : 0;
  }

  function calcTotal() {
    const base = Number(product?.basePrice) || 0;
    return (
      base +
      optionPrice("steel", state.sel.steel) +
      optionPrice("finish", state.sel.finish) +
      optionPrice("handle", state.sel.handle)
    );
  }

  function variantKey(sel) {
    // Must match products.json keys: "steel__finish__handle"
    return `${sel.steel}__${sel.finish}__${sel.handle}`;
  }

  function indexForSelection(sel) {
    const map = product?.variantToIndex || {};
    const key = variantKey(sel);
    const idx = map[key];

    if (Number.isInteger(idx) && idx >= 0) return idx;
    const parsed = Number(idx);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;

    return null;
  }

  function setImageIndex(i) {
    const images = safeArr(product?.images);
    const len = images.length || 1;
    state.imgIndex = (i + len) % len;
    renderImageOnly();
    markActiveThumb();
    scrollThumbIntoView();
  }

  // -------------------------
  // Ensure markup exists
  // -------------------------
  function ensureCarouselButtons() {
    // We want a wrapper like:
    // <div class="gallery-main">
    //   <button class="gallery-nav prev">‹</button>
    //   <img id="productMainImage">
    //   <button class="gallery-nav next">›</button>
    // </div>

    const img = els.mainImg;

    // If already inside .gallery-main with buttons, just wire later.
    let galleryMain = img.closest(".gallery-main");
    if (!galleryMain) {
      // Create wrapper and move img into it
      galleryMain = document.createElement("div");
      galleryMain.className = "gallery-main";

      const parent = img.parentElement;
      parent.insertBefore(galleryMain, img);
      galleryMain.appendChild(img);
    }

    // Prev button
    let prevBtn = galleryMain.querySelector(".gallery-nav.prev");
    if (!prevBtn) {
      prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "gallery-nav prev";
      prevBtn.setAttribute("aria-label", "Previous image");
      prevBtn.textContent = "‹";
      galleryMain.insertBefore(prevBtn, galleryMain.firstChild);
    }

    // Next button
    let nextBtn = galleryMain.querySelector(".gallery-nav.next");
    if (!nextBtn) {
      nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "gallery-nav next";
      nextBtn.setAttribute("aria-label", "Next image");
      nextBtn.textContent = "›";
      galleryMain.appendChild(nextBtn);
    }

    return { prevBtn, nextBtn };
  }

  function ensureBreakdownBox() {
    // Insert a mini breakdown box under the dropdowns inside .product-options
    const optionsCol = els.root.querySelector(".product-options");
    if (!optionsCol) return null;

    let box = optionsCol.querySelector("#priceBreakdown");
    if (!box) {
      box = document.createElement("div");
      box.id = "priceBreakdown";
      box.className = "mini-specs";
      optionsCol.appendChild(box);
    }
    return box;
  }

  // -------------------------
  // Render
  // -------------------------
  function renderThumbs(images) {
    els.thumbs.innerHTML = "";

    images.forEach((src, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `thumb${i === state.imgIndex ? " is-active" : ""}`;
      btn.dataset.idx = String(i);
      btn.setAttribute("aria-label", `View image ${i + 1}`);

      const img = document.createElement("img");
      img.src = src;
      img.alt = `${product?.title || "Product"} thumbnail ${i + 1}`;
      btn.appendChild(img);

      btn.addEventListener("click", () => setImageIndex(i));

      els.thumbs.appendChild(btn);
    });
  }

  function markActiveThumb() {
    const buttons = els.thumbs.querySelectorAll(".thumb");
    buttons.forEach((b) => b.classList.remove("is-active"));
    const active = els.thumbs.querySelector(`.thumb[data-idx="${state.imgIndex}"]`);
    if (active) active.classList.add("is-active");
  }

  function scrollThumbIntoView() {
    const active = els.thumbs.querySelector(`.thumb[data-idx="${state.imgIndex}"]`);
    if (!active) return;
    active.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }

  function renderImageOnly() {
    const images = safeArr(product?.images);
    const src = images[state.imgIndex] || "/productimages/miniedc.jpg";
    els.mainImg.src = src;
    els.mainImg.alt = product?.title || "Product";
  }

  function renderPriceAndBreakdown() {
    // Main price
    if (els.price) els.price.textContent = money(calcTotal());

    // Breakdown box
    const box = ensureBreakdownBox();
    if (!box) return;

    const base = Number(product?.basePrice) || 0;
    const steelP = optionPrice("steel", state.sel.steel);
    const finishP = optionPrice("finish", state.sel.finish);
    const handleP = optionPrice("handle", state.sel.handle);

    const steelLabel = optionObj("steel", state.sel.steel)?.label || "Steel";
    const finishLabel = optionObj("finish", state.sel.finish)?.label || "Finish";
    const handleLabel = optionObj("handle", state.sel.handle)?.label || "Handle";

    box.innerHTML = `
      <div class="mini-row"><span>Base</span><span>${money(base)}</span></div>
      <div class="mini-row"><span>${steelLabel}</span><span>${money(steelP)}</span></div>
      <div class="mini-row"><span>${finishLabel}</span><span>${money(finishP)}</span></div>
      <div class="mini-row"><span>${handleLabel}</span><span>${money(handleP)}</span></div>
      <div class="mini-row" style="opacity:.95;"><span>Total</span><span>${money(calcTotal())}</span></div>
    `;
  }

  function render() {
    if (!product) return;

    // Text content
    if (els.title) els.title.textContent = product.title || "";
    if (els.desc) els.desc.textContent = product.description || "";

    // Images
    const images = safeArr(product.images).length ? safeArr(product.images) : ["/productimages/miniedc.jpg"];
    if (state.imgIndex >= images.length) state.imgIndex = 0;

    renderImageOnly();
    renderThumbs(images);
    renderPriceAndBreakdown();

    // Dropdowns
    buildOptions(els.steel, safeArr(product.options?.steel), state.sel.steel);
    buildOptions(els.finish, safeArr(product.options?.finish), state.sel.finish);
    buildOptions(els.handle, safeArr(product.options?.handle), state.sel.handle);
  }

  // -------------------------
  // Events
  // -------------------------
  function wireEvents() {
    // Ensure buttons exist and wire them
    const { prevBtn, nextBtn } = ensureCarouselButtons();

    prevBtn.addEventListener("click", () => setImageIndex(state.imgIndex - 1));
    nextBtn.addEventListener("click", () => setImageIndex(state.imgIndex + 1));

    // Dropdown changes: jump carousel to mapped index if available
    els.steel.addEventListener("change", (e) => {
      state.sel.steel = e.target.value;
      const mapped = indexForSelection(state.sel);
      if (mapped !== null) setImageIndex(mapped);
      renderPriceAndBreakdown();
    });

    els.finish.addEventListener("change", (e) => {
      state.sel.finish = e.target.value;
      const mapped = indexForSelection(state.sel);
      if (mapped !== null) setImageIndex(mapped);
      renderPriceAndBreakdown();
    });

    els.handle.addEventListener("change", (e) => {
      state.sel.handle = e.target.value;
      const mapped = indexForSelection(state.sel);
      if (mapped !== null) setImageIndex(mapped);
      renderPriceAndBreakdown();
    });

    // Add to cart (placeholder)
    els.addToCart?.addEventListener("click", () => {
      const payload = {
        id: product.id,
        title: product.title,
        basePrice: Number(product.basePrice) || 0,
        selections: { ...state.sel },
        total: calcTotal(),
        imgIndex: state.imgIndex,
        image: safeArr(product.images)[state.imgIndex],
      };
      console.log("ADD TO CART:", payload);
    });

    // Keyboard nav
    window.addEventListener("keydown", (e) => {
      const images = safeArr(product?.images);
      if (!images.length) return;
      if (e.key === "ArrowLeft") setImageIndex(state.imgIndex - 1);
      if (e.key === "ArrowRight") setImageIndex(state.imgIndex + 1);
    });
  }

  // -------------------------
  // Boot
  // -------------------------
  async function boot() {
    try {
      const res = await fetch(PRODUCTS_JSON_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load ${PRODUCTS_JSON_URL} (${res.status})`);
      const data = await res.json();

      products = safeArr(data.products);

      const id = qsParam("id");
      product = products.find((p) => p.id === id) || products[0];

      if (!product) throw new Error("No products found in products.json");

      // Defaults
      const defSteel = product?.defaults?.steel || safeArr(product?.options?.steel)[0]?.id;
      const defFinish = product?.defaults?.finish || safeArr(product?.options?.finish)[0]?.id;
      const defHandle = product?.defaults?.handle || safeArr(product?.options?.handle)[0]?.id;

      state.sel.steel = defSteel || null;
      state.sel.finish = defFinish || null;
      state.sel.handle = defHandle || null;

      // Start on mapped image for defaults if possible
      const mapped = indexForSelection(state.sel);
      if (mapped !== null) state.imgIndex = mapped;

      setPageTitle(product.title || "Product");

      // Ensure required UI blocks exist before first render
      ensureCarouselButtons();
      ensureBreakdownBox();

      render();
      wireEvents();
    } catch (err) {
      console.error(err);
      els.root.innerHTML = `
        <div style="max-width:900px;margin:0 auto;padding:24px;border:1px solid rgba(255,255,255,0.12);border-radius:12px;background:rgba(0,0,0,0.35);">
          <div style="font-size:14px;letter-spacing:.14em;text-transform:uppercase;opacity:.85;margin-bottom:10px;">Product page error</div>
          <div style="opacity:.9;line-height:1.6;">${String(err.message || err)}</div>
          <div style="opacity:.65;margin-top:10px;font-size:12px;">
            Check that <code>${PRODUCTS_JSON_URL}</code> exists and contains <code>{ "products": [...] }</code>.
          </div>
        </div>
      `;
    }
  }

  boot();
})();
