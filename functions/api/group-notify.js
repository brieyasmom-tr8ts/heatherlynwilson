// GET /api/group-notify?email=...&token=...&group=...&mode=digest
// Switches the group creator to daily digest mode for join notifications.
// mode=digest -> daily digest, mode=instant -> back to instant

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
  const groupId = url.searchParams.get("group") || "";
  const mode = url.searchParams.get("mode") || "digest";

  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const expected = await hmacHex(secret, email + ":challenge:2026-10-01");
  if (!email || token !== expected) {
    return new Response("Invalid link.", { status: 403, headers: { "Content-Type": "text/html" } });
  }

  const digest = mode === "digest" ? 1 : 0;
  await context.env.DB.prepare(
    "UPDATE group_members SET notify_digest = ? WHERE group_id = ? AND email = ?"
  ).bind(digest, groupId, email).run();

  const label = digest ? "daily digest" : "instant notifications";
  return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Notification Preference</title></head>
<body style="margin:0;padding:60px 20px;background:#f7f4ee;font-family:Georgia,serif;text-align:center;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:40px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
<h1 style="font-size:22px;color:#1f2937;margin-bottom:12px;">Done.</h1>
<p style="font-size:16px;color:#4b5563;line-height:1.6;">You are now set to <strong>${label}</strong> for group join notifications.</p>
<p style="margin-top:20px;font-size:14px;"><a href="https://heatherlynwilson.com/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${token}" style="color:#b85638;">Back to your dashboard</a></p>
</div></body></html>`, { status: 200, headers: { "Content-Type": "text/html" } });
}
