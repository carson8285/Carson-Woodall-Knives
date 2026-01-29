// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 4242;
const FRONTEND_BASE =
  process.env.FRONTEND_BASE || "http://localhost:8000";

// ====== simple file-based order storage ======

const ORDERS_FILE = path.join(__dirname, "orders.json");

function loadOrders() {
  try {
    const raw = fs.readFileSync(ORDERS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf8");
}

// ====== middleware ======

app.use(cors());
app.use(express.json());

// ====== create checkout session (used by checkout.js) ======

function buildLineItems(cart) {
  if (!Array.isArray(cart)) return [];
  return cart.map((item) => {
    const quantity = item.quantity || 1;
    const unitPrice = Number(item.unitPrice) || 0;
    const amount = Math.round(unitPrice * 100); // dollars -> cents

    return {
      price_data: {
        currency: "usd",
        product_data: {
          name: item.title || "Custom Knife",
        },
        unit_amount: amount,
      },
      quantity,
    };
  });
}

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { cart, shipping } = req.body;

    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Cart is empty or invalid." });
    }

    const line_items = buildLineItems(cart);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,
      // IMPORTANT: success URL includes the Stripe session_id token
      success_url:
        "http://localhost:8000/success.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "http://localhost:8000/checkout.html?status=cancel",
      success_url: `${FRONTEND_BASE}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_BASE}/checkout.html?status=cancel`,
      metadata: {
        cart: JSON.stringify(cart),
        shipping: JSON.stringify(shipping || {}),
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ error: "Failed to create Stripe session." });
  }
});

// ====== confirm order after redirect from Stripe ======

app.get("/confirm-order", async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    if (!sessionId) {
      return res.status(400).json({ error: "Missing session_id" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items"],
    });

    if (session.payment_status !== "paid") {
      return res
        .status(400)
        .json({ error: "Session is not paid yet.", status: session.payment_status });
    }

    // Pull cart + shipping from metadata
    let cart = [];
    let shipping = {};
    try {
      if (session.metadata?.cart) {
        cart = JSON.parse(session.metadata.cart);
      }
      if (session.metadata?.shipping) {
        shipping = JSON.parse(session.metadata.shipping);
      }
    } catch (err) {
      console.error("Failed to parse metadata JSON:", err);
    }

    const orders = loadOrders();

    // Avoid duplicating same session
    const existing = orders.find((o) => o.id === session.id);
    if (!existing) {
      const newOrder = {
        id: session.id,
        created: Date.now(),
        amount_total: session.amount_total,
        currency: session.currency,
        email: session.customer_details?.email || shipping.email || "",
        cart,
        shipping,
      };
      orders.push(newOrder);
      saveOrders(orders);
      console.log("✅ Saved order:", newOrder.id);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Confirm-order error:", err);
    res.status(500).json({ error: "Failed to confirm order." });
  }
});

// ====== admin API & UI ======

app.get("/api/orders", (req, res) => {
  const orders = loadOrders();
  res.json(orders);
});

// admin UI files
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.get("/admin.js", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.js"));
});

// root health check
app.get("/", (req, res) => {
  res.send("Backend is running. Admin UI: /admin");
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
