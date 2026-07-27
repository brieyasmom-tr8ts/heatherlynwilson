export async function onRequestPost(context) {
  const secret = context.env.NOTIFY_SECRET || "";
  const authHeader = context.request.headers.get("X-Notify-Secret") || "";

  if (!secret || authHeader !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await context.request.json();
  const postTitle = body.title || "New Blog Post";
  const postExcerpt = body.excerpt || "";
  const postUrl = body.url || "https://heatherlynwilson.com/blog.html";

  // Get all active subscribers, one row per address even if the table holds
  // case variants of the same email
  const q = await context.env.DB.prepare(
    "SELECT email FROM subscribers WHERE unsubscribed_at IS NULL"
  ).all();
  const seen = new Set();
  const results = (q.results || []).filter(r => {
    const key = String(r.email || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!results || results.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const brevoKey = context.env.BREVO_API_KEY;
  if (!brevoKey) {
    return new Response(JSON.stringify({ error: "No email service configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Brevo free plan: 300 emails/day. Send individually so each gets a unique unsubscribe link.
  let sent = 0;
  let failed = 0;

  for (const row of results) {
    const unsub = await unsubscribeUrl(context.request.url, secret, row.email);
    const html = buildEmail(postTitle, postExcerpt, postUrl, unsub);

    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "Heather Lyn Wilson", email: "heather@heatherlynwilson.com" },
          to: [{ email: row.email }],
          subject: postTitle,
          htmlContent: html,
        }),
      });
      if (res.ok) {
        sent++;
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
    }
  }

  return new Response(JSON.stringify({ sent, failed, total: results.length }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function unsubscribeUrl(requestUrl, secret, email) {
  const origin = new URL(requestUrl).origin;
  const token = await hmacHex(secret, email);
  return `${origin}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function buildEmail(title, excerpt, postUrl, unsubUrl) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0">
<tr><td style="padding:0 8px 10px;" align="center">
<p style="margin:0;font-size:12px;color:#9ca3af;font-family:-apple-system,sans-serif;">Getting more email than you want? <a href="${unsubUrl}" style="color:#9ca3af;">Choose exactly what you receive</a>, and keep only what you love.</p>
</td></tr>
<tr><td>
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

<tr><td style="background:#1f2937;padding:28px 32px;">
<span style="color:#ffffff;font-size:20px;font-family:Georgia,serif;letter-spacing:0.5px;">HeatherLynWilson.com</span>
</td></tr>

<tr><td style="padding:36px 32px 24px;">
<h1 style="margin:0 0 16px;font-size:24px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;">${escapeHtml(title)}</h1>
<p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">${escapeHtml(excerpt)}</p>
<a href="${postUrl}" style="display:inline-block;padding:12px 28px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;">Read the full post</a>
</td></tr>

<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you subscribed at heatherlynwilson.com.<br>
<a href="${unsubUrl}" style="color:#6b7280;">Choose which emails you get, or unsubscribe</a>
</p>
</td></tr>

</table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
