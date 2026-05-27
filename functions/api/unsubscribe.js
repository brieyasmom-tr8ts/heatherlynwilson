export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = url.searchParams.get("token") || "";

  // Token is a simple HMAC of the email using the notify secret
  if (!email || !token) {
    return Response.redirect(url.origin + "/unsubscribed.html?status=invalid", 302);
  }

  const secret = context.env.NOTIFY_SECRET || "";
  const expected = await hmacHex(secret, email);

  if (token !== expected) {
    return Response.redirect(url.origin + "/unsubscribed.html?status=invalid", 302);
  }

  try {
    await context.env.DB.prepare(
      "UPDATE subscribers SET unsubscribed_at = datetime('now') WHERE email = ? AND unsubscribed_at IS NULL"
    ).bind(email).run();
  } catch (e) {
    // fine if already unsubscribed
  }

  return Response.redirect(url.origin + "/unsubscribed.html?status=ok", 302);
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}
