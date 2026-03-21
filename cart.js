// cart.js
// Render cwk_cart from localStorage into cart.html

const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:4242"
    : "https://carson-woodall-knives.onrender.com";

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

  function getMaxQty(item) {
    return Number(item.maxQty || 99);
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

      function formatOption(v) {
        if (!v) return "";
        return v
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }

      const metaParts = Object.values(selection)
        .filter(Boolean)
        .map(formatOption);

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
      const currentQty = Number(item.quantity || 1);
      const maxQty = getMaxQty(item);

      if (currentQty >= maxQty) {
        alert(`Only ${maxQty} of this knife is available.`);
        return;
      }

      item.quantity = currentQty + 1;
    }

    saveCart(cart);
    renderCart();
  });

  async function startStripeCheckout() {
    const cart = loadCart();

    if (!cart.length) {
      alert("Your cart is empty.");
      return;
    }

    if (typeof gtag === "function") {
      const value = cart.reduce((sum, item) => {
        return sum + (Number(item.unitPrice || 0) * Number(item.quantity || 1));
      }, 0);

      gtag("event", "begin_checkout", {
        currency: "USD",
        value,
        items: cart.map((item) => ({
          item_id: item.productId,
          item_name: item.title,
          price: Number(item.unitPrice || 0),
          quantity: Number(item.quantity || 1),
          item_variant: `${item.selection?.steel || ""} / ${item.selection?.finish || ""} / ${item.selection?.handle || ""}`
        }))
      });
    }

    checkoutBtn.disabled = true;
    checkoutBtn.textContent = "REDIRECTING...";

    try {
      const res = await fetch(`${API_BASE}/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cart }),
      });

      if (!res.ok) {
        let message = "Could not start checkout.";

        try {
          const errorData = await res.json();
          message = errorData.error || message;
        } catch {
          try {
            message = await res.text();
          } catch {
            // keep default
          }
        }

        throw new Error(message);
      }

      const data = await res.json();

      if (!data.url) {
        throw new Error("No checkout URL returned.");
      }

      window.location.href = data.url;
    } catch (err) {
      console.error("Stripe checkout error:", err);
      alert(err.message || "Could not start checkout.");
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = "PROCEED TO CHECKOUT";
    }
  }

  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", startStripeCheckout);
  }

  renderCart();
})();