async function fetchOrders() {
  const root = document.getElementById("ordersRoot");
  root.innerHTML = '<p class="no-orders">Loading orders…</p>';

  try {
    const res = await fetch("/api/orders");
    if (!res.ok) throw new Error("Failed to fetch orders");
    const orders = await res.json();

    if (!orders.length) {
      root.innerHTML =
        '<p class="no-orders">No paid orders yet. Once a checkout completes, it will show up here.</p>';
      return;
    }

    const rows = orders
      .slice()
      .sort((a, b) => b.created - a.created)
      .map((order) => {
        const date = new Date(order.created);
        const when = date.toLocaleString();
        const amount =
          order.amount_total != null
            ? `$${(order.amount_total / 100).toFixed(2)}`
            : "";
        const email = order.email || order.shipping?.email || "";

        const shipping = order.shipping || {};
        const shippingText = [
          shipping.fullName,
          shipping.address1,
          shipping.city,
          shipping.state,
          shipping.postalCode,
          shipping.country,
        ]
          .filter(Boolean)
          .join(", ");

        const cartLines = (order.cart || [])
          .map((item) => {
            const qty = item.quantity || 1;
            const title = item.title || "Knife";
            const sel = item.selection || {};
            const options = Object.values(sel).filter(Boolean).join(" • ");
            const linePrice =
              item.unitPrice != null
                ? `$${Number(item.unitPrice).toFixed(2)}`
                : "";
            return `<div class="small">
              <span class="mono">x${qty}</span> ${title}
              ${options ? `<span class="muted">(${options})</span>` : ""}
              ${linePrice ? `<span class="muted"> · ${linePrice}</span>` : ""}
            </div>`;
          })
          .join("");

        return `
          <tr>
            <td>
              <div class="mono">${order.id}</div>
              <div class="small muted">${when}</div>
            </td>
            <td>
              <div class="small">${email || "<span class='muted'>n/a</span>"}</div>
              <div class="small muted">${shippingText}</div>
            </td>
            <td>${cartLines}</td>
            <td>
              <div class="pill">${amount}</div>
              <div class="small muted">${order.currency || "usd"}</div>
            </td>
          </tr>
        `;
      })
      .join("");

    root.innerHTML = `
      <table class="orders-table">
        <thead>
          <tr>
            <th>Order / Time</th>
            <th>Customer</th>
            <th>Items</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error(err);
    root.innerHTML =
      '<p class="no-orders">Failed to load orders. Check the backend logs.</p>';
  }
}

document.getElementById("refreshBtn").addEventListener("click", fetchOrders);

fetchOrders();
