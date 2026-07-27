// GET /api/blog-pref?email=...&token=...&mode=daily|weekly
// One-click toggle between daily blog posts and weekly digest.

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = url.searchParams.get("token") || "";
  const mode = url.searchParams.get("mode") || "weekly";

  const secret = context.env.NOTIFY_SECRET || "";
  const expected = await hmacHex(secret, email);
  if (!email || token !== expected) {
    return new Response("Invalid link.", { status: 403, headers: { "Content-Type": "text/html" } });
  }

  const daily = mode === "daily" ? 1 : 0;

  try {
    await context.env.DB.prepare(
      "INSERT INTO email_prefs (email, blog_daily) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET blog_daily = ?, updated_at = datetime('now')"
    ).bind(email, daily, daily).run();
  } catch (e) {}

  const label = daily ? "each post the day it publishes" : "a weekly digest on Mondays";
  return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blog Preference</title></head>
<body style="margin:0;padding:60px 20px;background:#f7f4ee;font-family:Georgia,serif;text-align:center;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:40px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
<h1 style="font-size:22px;color:#1f2937;margin-bottom:12px;">Done.</h1>
<p style="font-size:16px;color:#4b5563;line-height:1.6;">You will now receive blog posts as <strong>${label}</strong>.</p>
<p style="margin-top:20px;font-size:14px;"><a href="https://heatherlynwilson.com/blog" style="color:#b85638;">Back to the blog</a></p>
</div></body></html>`, { status: 200, headers: { "Content-Type": "text/html" } });
}
