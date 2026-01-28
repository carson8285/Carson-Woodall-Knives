// cart.js
// Render cwk_cart from localStorage into cart.html

(function () {
  const CART_KEY = "cwk_cart";

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function money(n) {
    const v = Number(n) || 0;
    return `$${v.toFixed(2)}`;
  }

  const itemsContainer = document.querySelector(".cart-items");
  const summaryRows = document.querySelectorAll(".cart-summary-row");
  const subtotalEl =
    summaryRows.length > 0
      ? summaryRows[0].querySelector("span:last-child")
      : null;
  const totalEl = document.querySelector(
    ".cart-summary-total span:last-child"
  );
  const checkoutBtn = document.querySelector(".cart-checkout-btn");
  const emptyState = itemsContainer?.querySelector(".cart-empty");

  if (!itemsContainer) return;

  function renderCart() {
    const cart = loadCart();

    // Clear any previously rendered items
    itemsContainer.querySelectorAll(".cart-item").forEach((el) => el.remove());

    if (!cart.length) {
      if (emptyState) emptyState.style.display = "block";
      if (subtotalEl) subtotalEl.textContent = "$0.00";
      if (totalEl) totalEl.textContent = "$0.00";
      if (checkoutBtn) checkoutBtn.disabled = true;
      return;
    }

    if (emptyState) emptyState.style.display = "none";

    let subtotal = 0;

    cart.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "cart-item";

      const selection = item.selection || {};
      const metaParts = Object.values(selection).filter(Boolean);

      const qty = item.quantity || 1;
      const lineTotal = (item.unitPrice || 0) * qty;
      subtotal += lineTotal;

      row.innerHTML = `
        <div class="cart-item-main">
          <div class="cart-item-image-wrap">
            ${
              item.image
                ? `<img src="${item.image}" alt="${item.title || ""}" />`
                : ""
            }
          </div>
          <div class="cart-item-info">
            <h2 class="cart-item-name">${item.title || ""}</h2>
            <p class="cart-item-meta">${metaParts.join(" • ")}</p>
          </div>
        </div>
        <div class="cart-item-side">
          <div class="cart-item-qty">
            <button type="button" class="cart-qty-btn cart-qty-decrease" data-index="${index}">-</button>
            <span>${qty}</span>
            <button type="button" class="cart-qty-btn cart-qty-increase" data-index="${index}">+</button>
          </div>
          <div class="cart-item-price">${money(lineTotal)}</div>
        </div>
      `;

      itemsContainer.appendChild(row);
    });

    if (subtotalEl) subtotalEl.textContent = money(subtotal);
    if (totalEl) totalEl.textContent = money(subtotal);
    if (checkoutBtn) checkoutBtn.disabled = false;
  }

  // Quantity +/- logic
  itemsContainer.addEventListener("click", (e) => {
    const decBtn = e.target.closest(".cart-qty-decrease");
    const incBtn = e.target.closest(".cart-qty-increase");
    if (!decBtn && !incBtn) return;

    const idx = Number((decBtn || incBtn).dataset.index);
    const cart = loadCart();
    const item = cart[idx];
    if (!item) return;

    if (decBtn) {
      item.quantity = (item.quantity || 1) - 1;
      if (item.quantity <= 0) {
        cart.splice(idx, 1);
      }
    } else if (incBtn) {
      item.quantity = (item.quantity || 1) + 1;
    }

    saveCart(cart);
    renderCart();
  });

  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", () => {
      alert("Checkout not wired yet, but your cart data is live.");
      console.log("cwk_cart:", loadCart());
    });
  }

  renderCart();
})();
