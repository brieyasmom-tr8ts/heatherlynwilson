// POST /api/book-order — save a direct book order and notify Heather
// GET /api/book-order?key=ADMIN_KEY — list all orders (admin)

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const ENSURE = `CREATE TABLE IF NOT EXISTS book_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  zip TEXT DEFAULT '',
  items TEXT NOT NULL,
  total TEXT NOT NULL,
  pickup INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
)`;

export async function onRequestPost(context) {
  const body = await context.request.json();
  const name = (body.name || "").trim().slice(0, 100);
  const email = (body.email || "").trim().toLowerCase().slice(0, 200);
  const address = (body.address || "").trim().slice(0, 300);
  const city = (body.city || "").trim().slice(0, 100);
  const state = (body.state || "").trim().slice(0, 50);
  const zip = (body.zip || "").trim().slice(0, 20);
  const items = (body.items || "").trim().slice(0, 200);
  const total = (body.total || "").trim().slice(0, 20);
  const pickup = body.pickup ? 1 : 0;
  const paymentMethod = (body.payment_method || "").trim().slice(0, 20);

  if (!name || !email || !items || !total) {
    return json({ error: "Please fill in all required fields." }, 400);
  }
  if (!pickup && (!address || !city || !state || !zip)) {
    return json({ error: "Please enter your shipping address." }, 400);
  }

  await context.env.DB.prepare(ENSURE).run();

  try {
    await context.env.DB.prepare(
      "INSERT INTO book_orders (name, email, address, city, state, zip, items, total, pickup, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(name, email, address || "", city || "", state || "", zip || "", items, total, pickup, paymentMethod).run();
  } catch (e) {
    return json({ error: "Could not save order." }, 500);
  }

  // Email Heather
  if (context.env.BREVO_API_KEY) {
    const shippingLine = pickup
      ? "LOCAL PICKUP - Eastern Shore, MD"
      : address + ", " + city + ", " + state + " " + zip;
    try {
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": context.env.BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: "HeatherLynWilson.com", email: "heather@heatherlynwilson.com" },
          to: [{ email: "heather@givesendgo.com", name: "Heather" }],
          subject: "New book order: " + items + " from " + name,
          textContent: "New order!\n\nName: " + name + "\nEmail: " + email + "\nItems: " + items + "\nTotal: " + total + "\nPayment: " + paymentMethod + "\nShipping: " + shippingLine + "\n\nCheck your Venmo/Cash App for the payment, then ship it.",
        }),
      });
    } catch (e) {}
  }

  return json({ success: true });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }
  await context.env.DB.prepare(ENSURE).run();
  let orders = [];
  try {
    const q = await context.env.DB.prepare(
      "SELECT * FROM book_orders ORDER BY created_at DESC"
    ).all();
    orders = q.results || [];
  } catch (e) {}
  return json({ success: true, orders });
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
