// GET /api/admin-dashboard-link?key=ADMIN_KEY&email=...&challenge=...
// Admin only. Returns a reader's own signed dashboard link, so Heather can
// copy it from the admin Signups table and send it to someone who cannot get
// in. Same token the emails use (email + ":challenge:2027-07-01").

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (!key || key !== context.env.ADMIN_KEY) return json({ error: "Unauthorized" }, 401);

  const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
  const challenge = String(url.searchParams.get("challenge") || "").replace(/[^a-z0-9-]/g, "");
  if (!email || !email.includes("@")) return json({ error: "Missing email" }, 400);

  // Only for people who are actually signed up, so a typo does not produce a
  // link to an empty dashboard.
  try {
    const row = await context.env.DB.prepare(
      "SELECT 1 FROM challenge_signups WHERE LOWER(email) = ? LIMIT 1"
    ).bind(email).first();
    if (!row) return json({ error: "No challenge signup for that email" }, 404);
  } catch (e) {
    return json({ error: "Could not check signups" }, 500);
  }

  const token = await hmacHex(context.env.NOTIFY_SECRET || "challenge-secret", email + ":challenge:2027-07-01");
  const link = "https://heatherlynwilson.com/challenge/dashboard.html?email=" +
    encodeURIComponent(email) + "&token=" + token + (challenge ? "#" + challenge : "");
  return json({ success: true, url: link });
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
