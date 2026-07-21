// Two-step unsubscribe: GET shows a confirmation page, POST does the actual
// removal. This stops email security scanners (Microsoft Defender Safe Links,
// Mimecast, etc) from auto-unsubscribing people by pre-crawling the link.

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = url.searchParams.get("token") || "";

  if (!email || !token) {
    return Response.redirect(url.origin + "/unsubscribed.html?status=invalid", 302);
  }

  const secret = context.env.NOTIFY_SECRET || "";
  const expected = await hmacHex(secret, email);
  if (token !== expected) {
    return Response.redirect(url.origin + "/unsubscribed.html?status=invalid", 302);
  }

  // Show a confirmation page. Only a real human clicking the button will POST.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Unsubscribe - Heather Lyn Wilson</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
body { margin: 0; padding: 60px 24px; background: #faf6ef; font-family: 'Inter', system-ui, sans-serif; color: #1f2937; min-height: 100vh; box-sizing: border-box; }
.card { max-width: 480px; margin: 60px auto 0; background: #fff; padding: 44px 36px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); text-align: center; }
h1 { font-family: 'Lora', serif; font-size: 28px; font-weight: 600; margin: 0 0 16px; color: #1f2937; }
p { color: #4b5563; line-height: 1.65; margin: 0 0 14px; font-weight: 300; }
.email { font-weight: 500; color: #1f2937; }
form { margin-top: 28px; }
button { background: #b85638; color: #fff; border: none; padding: 14px 32px; font-size: 14px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; border-radius: 4px; font-family: inherit; }
button:hover { background: #8d3e26; }
.cancel { display: inline-block; margin-top: 14px; color: #6b7280; font-size: 13px; text-decoration: none; }
.cancel:hover { color: #1f2937; }
</style>
</head>
<body>
<div class="card">
<h1>Unsubscribe?</h1>
<p>You're about to unsubscribe <span class="email">${escapeHtml(email)}</span> from new blog posts.</p>
<p>If you change your mind, you can resubscribe anytime at heatherlynwilson.com.</p>
<form method="POST" action="/api/unsubscribe">
<input type="hidden" name="email" value="${escapeHtml(email)}">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<button type="submit">Confirm Unsubscribe</button>
</form>
<a class="cancel" href="https://heatherlynwilson.com">Never mind, keep me subscribed</a>
</div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  let email = "";
  let token = "";

  const ct = context.request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const body = await context.request.json();
    email = (body.email || "").trim().toLowerCase();
    token = body.token || "";
  } else {
    const form = await context.request.formData();
    email = ((form.get("email") || "") + "").trim().toLowerCase();
    token = (form.get("token") || "") + "";
  }

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
    // already unsubscribed is fine
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

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
