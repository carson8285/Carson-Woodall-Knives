require("dotenv").config();
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 4242;
const FRONTEND_BASE = process.env.FRONTEND_BASE || "http://localhost:8000";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

function loadCatalogProducts() {
  const productsPath = path.join(__dirname, "..", "data", "products.json");
  const raw = fs.readFileSync(productsPath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed?.products) ? parsed.products : [];
}

function getCatalogProduct(productId) {
  return loadCatalogProducts().find((p) => p.id === productId) || null;
}

async function getProductState(productId) {
  const { data, error } = await supabase
    .from("product_state")
    .select("product_id, purchase_enabled, max_qty")
    .eq("product_id", productId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getCatalogStateMap() {
  const { data, error } = await supabase
    .from("product_state")
    .select("product_id, purchase_enabled, max_qty");

  if (error) throw error;

  const map = {};
  for (const row of data || []) {
    map[row.product_id] = row;
  }
  return map;
}

async function setProductPurchaseEnabled(productId, enabled) {
  const existing = await getProductState(productId);
  const catalogProduct = getCatalogProduct(productId);

  const maxQty =
    Number(existing?.max_qty) ||
    Number(catalogProduct?.maxQty) ||
    99;

  const { error } = await supabase
    .from("product_state")
    .upsert(
      {
        product_id: productId,
        purchase_enabled: enabled,
        max_qty: maxQty,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "product_id" }
    );

  if (error) throw error;
}

function parseCart(metadataCart) {
  try {
    return metadataCart ? JSON.parse(metadataCart) : [];
  } catch (err) {
    console.error("Failed to parse cart metadata:", err);
    return [];
  }
}

async function loadOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((order) => ({
    id: order.id,
    created: order.created,
    amount_total: order.amount_total,
    currency: order.currency,
    payment_status: order.payment_status,
    customerName: order.customer_name || "",
    email: order.email || "",
    phone: order.phone || "",
    shippingName: order.shipping_name || "",
    shippingAddress: order.shipping_address || {},
    cart: order.cart || [],
  }));
}

async function upsertOrder(order) {
  const payload = {
    id: order.id,
    created: order.created,
    amount_total: order.amount_total,
    currency: order.currency,
    payment_status: order.payment_status,
    customer_name: order.customerName || "",
    email: order.email || "",
    phone: order.phone || "",
    shipping_name: order.shippingName || "",
    shipping_address: order.shippingAddress || {},
    cart: order.cart || [],
  };

  const { error } = await supabase
    .from("orders")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    throw error;
  }
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Admin Area"');
    return res.status(401).send("Authentication required.");
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString("utf8");
  const [username, password] = credentials.split(":");

  const expectedUsername = process.env.ADMIN_USERNAME || "admin";
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedPassword) {
    console.error("Missing ADMIN_PASSWORD in environment.");
    return res.status(500).send("Admin auth not configured.");
  }

  if (username !== expectedUsername || password !== expectedPassword) {
    return res.status(403).send("Forbidden");
  }

  next();
}

// Webhook route must come before express.json()
app.post(
  "/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
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
      try {
        const session = event.data.object;

const cart = parseCart(session.metadata?.cart);

for (const item of cart) {
  if (item.productId === "custom-01") {
    await setProductPurchaseEnabled("custom-01", false);
  }
}

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

        await upsertOrder(order);
        console.log("✅ Saved paid order to Supabase:", order.id);
      } catch (err) {
        console.error("Failed to save webhook order to Supabase:", err);
        return res.status(500).send("Failed to save order.");
      }
    }

    res.json({ received: true });
  }
);

app.use(cors());
app.use(express.json());

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

const qtyByProduct = new Map();

for (const item of cart) {
  const currentQty = qtyByProduct.get(item.productId) || 0;
  qtyByProduct.set(item.productId, currentQty + (Number(item.quantity) || 0));
}

for (const [productId, qty] of qtyByProduct.entries()) {
  const catalogProduct = getCatalogProduct(productId);

  if (!catalogProduct) {
    return res.status(400).json({ error: `Product not found: ${productId}` });
  }

  const liveState = await getProductState(productId);

  const purchaseEnabled =
    liveState?.purchase_enabled ??
    catalogProduct.purchaseEnabled ??
    true;

  const maxQty = Number(
    liveState?.max_qty ??
    catalogProduct.maxQty ??
    99
  );

  if (!purchaseEnabled) {
    return res.status(400).json({
      error: `${catalogProduct.title} is sold out.`,
    });
  }

  if (qty > maxQty) {
    return res.status(400).json({
      error: `Only ${maxQty} of ${catalogProduct.title} can be purchased.`,
    });
  }
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
          shipping_rate: "shr_1T9CWo0WVv0kReKCbfJ8Hkyg",
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

app.get("/catalog-state", async (req, res) => {
  try {
    const map = await getCatalogStateMap();
    res.json(map);
  } catch (err) {
    console.error("Failed to load catalog state:", err);
    res.status(500).json({ error: "Failed to load catalog state." });
  }
});

app.get("/api/orders", requireAdmin, async (req, res) => {
  try {
    const orders = await loadOrders();
    res.json(orders);
  } catch (err) {
    console.error("Failed to load orders from Supabase:", err);
    res.status(500).json({ error: "Failed to load orders." });
  }
});

app.get("/admin", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.get("/admin.js", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "admin.js"));
});

app.get("/", (req, res) => {
  res.send("Backend is running. Admin UI: /admin");
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});