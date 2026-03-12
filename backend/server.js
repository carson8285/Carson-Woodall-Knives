require("dotenv").config();
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 4242;
const FRONTEND_BASE = process.env.FRONTEND_BASE || "http://localhost:8000";

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

function parseCart(metadataCart) {
  try {
    return metadataCart ? JSON.parse(metadataCart) : [];
  } catch (err) {
    console.error("Failed to parse cart metadata:", err);
    return [];
  }
}

function upsertOrder(order) {
  const orders = loadOrders();
  const existingIndex = orders.findIndex((o) => o.id === order.id);

  if (existingIndex >= 0) {
    orders[existingIndex] = order;
  } else {
    orders.push(order);
  }

  saveOrders(orders);
}

// ====== webhook MUST come before express.json() ======

app.post(
  "/stripe-webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("Missing STRIPE_WEBHOOK_SECRET in environment.");
      return res.status(500).send("Webhook secret not configured.");
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const cart = parseCart(session.metadata?.cart);

      const shippingDetails =
        session.collected_information?.shipping_details ||
        session.shipping_details ||
        {};

      const shippingAddress = shippingDetails.address || {};

      const order = {
        id: session.id,
        created: Date.now(),
        amount_total: session.amount_total,
        currency: session.currency,
        payment_status: session.payment_status,
        customerName:
          session.customer_details?.name ||
          shippingDetails.name ||
          "",
        email: session.customer_details?.email || "",
        phone: session.customer_details?.phone || "",
        shippingName: shippingDetails.name || "",
        shippingAddress: {
          line1: shippingAddress.line1 || "",
          line2: shippingAddress.line2 || "",
          city: shippingAddress.city || "",
          state: shippingAddress.state || "",
          postal_code: shippingAddress.postal_code || "",
          country: shippingAddress.country || "",
        },
        cart,
      };

      upsertOrder(order);
      console.log("✅ Saved paid order from webhook:", order.id);
    }

    res.json({ received: true });
  }
);

// ====== normal middleware ======

app.use(cors());
app.use(express.json());

// ====== create checkout session ======

function buildLineItems(cart) {
  if (!Array.isArray(cart)) return [];

  return cart.map((item) => {
    const quantity = item.quantity || 1;
    const unitPrice = Number(item.unitPrice) || 0;
    const amount = Math.round(unitPrice * 100);

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
    const { cart } = req.body;

    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Cart is empty or invalid." });
    }

    const line_items = buildLineItems(cart);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,

      shipping_address_collection: {
        allowed_countries: ["US"],
      },

      shipping_options: [
        {
          shipping_rate: "shr_1T9r581EZJjQUOOYO1olMazV",
        },
      ],

      success_url: `${FRONTEND_BASE}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_BASE}/cart.html?status=cancel`,

      metadata: {
        cart: JSON.stringify(cart),
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ error: "Failed to create Stripe session." });
  }
});

// ====== admin API & UI ======

app.get("/api/orders", (req, res) => {
  const orders = loadOrders();
  res.json(orders);
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.get("/admin.js", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.js"));
});

app.get("/", (req, res) => {
  res.send("Backend is running. Admin UI: /admin");
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});