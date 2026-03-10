// checkout.js
// 1) Read cwk_cart and render a simple order summary
// 2) Collect shipping/contact info
// 3) Package everything into cwk_pending_checkout for the backend / Stripe step
const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:4242"
    : "https://carson-woodall-knives.onrender.com";

(function () {
  const CART_KEY = "cwk_cart";
  const CHECKOUT_KEY = "cwk_pending_checkout";

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function money(n) {
    const v = Number(n) || 0;
    return `$${v.toFixed(2)}`;
  }

  const summaryContainer = document.querySelector(".checkout-summary-items");
  const totalEl = document.getElementById("checkoutTotal");
  const form = document.getElementById("checkoutForm");

  function renderSummary() {
    if (!summaryContainer || !totalEl) return;

    const cart = loadCart();
    summaryContainer.innerHTML = "";

    if (!cart.length) {
      summaryContainer.innerHTML = `
        <p>Your cart is empty. <a href="./knives.html">Return to shop</a>.</p>
      `;
      totalEl.textContent = "$0.00";
      // Optional: send them back if there's no cart
      return;
    }

    let subtotal = 0;

    cart.forEach((item) => {
      const selection = item.selection || {};

      function formatOption(v) {
        if (!v) return "";
        return v
          .replace(/_/g, " ")
          .replace(/\b\w/g, c => c.toUpperCase());
      }

      const metaParts = Object.values(selection)
        .filter(Boolean)
        .map(formatOption);

      const qty = item.quantity || 1;
      const lineTotal = (item.unitPrice || 0) * qty;
      subtotal += lineTotal;

      const row = document.createElement("div");
      row.className = "checkout-summary-item";
      row.innerHTML = `
        <div class="checkout-summary-item-main">
          <div class="checkout-summary-item-title">${item.title || ""}</div>
          <div class="checkout-summary-item-meta">${metaParts.join(" • ")}</div>
        </div>
        <div class="checkout-summary-item-side">
          <span class="checkout-summary-qty">x${qty}</span>
          <span class="checkout-summary-price">${money(lineTotal)}</span>
        </div>
      `;
      summaryContainer.appendChild(row);
    });

    totalEl.textContent = money(subtotal);
  }

  function gatherFormData() {
    if (!form) return null;
    const data = new FormData(form);
    return {
      fullName: data.get("fullName")?.toString().trim() || "",
      email: data.get("email")?.toString().trim() || "",
      phone: data.get("phone")?.toString().trim() || "",
      address1: data.get("address1")?.toString().trim() || "",
      address2: data.get("address2")?.toString().trim() || "",
      city: data.get("city")?.toString().trim() || "",
      state: data.get("state")?.toString().trim() || "",
      postalCode: data.get("postalCode")?.toString().trim() || "",
      country: data.get("country")?.toString().trim() || "",
      notes: data.get("notes")?.toString().trim() || "",
    };
  }

async function startStripeCheckout(payload) {
  console.log("Checkout payload (sending to backend):", payload);

const res = await fetch(`${API_BASE}/create-checkout-session`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

  if (!res.ok) {
    console.error("Stripe backend error", await res.text());
    throw new Error("Failed to create checkout session.");
  }

  const data = await res.json();
  if (!data.url) {
    throw new Error("No checkout URL returned from backend.");
  }

  // Redirect to Stripe Checkout
  window.location.href = data.url;
}


  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const cart = loadCart();
      if (!cart.length) {
        alert("Your cart is empty. Please add a knife before checking out.");
        window.location.href = "./knives.html";
        return;
      }

      const shipping = gatherFormData();
      if (!shipping) return;

      const payload = {
        cart,
        shipping,
        createdAt: new Date().toISOString(),
      };

      // Persist so you or your backend can inspect it
      localStorage.setItem(CHECKOUT_KEY, JSON.stringify(payload));

      try {
        await startStripeCheckout(payload);
      } catch (err) {
        console.error("Stripe checkout error:", err);
        alert("Could not start payment. Please try again or contact me directly.");
      }
    });
  }

  renderSummary();
})();
