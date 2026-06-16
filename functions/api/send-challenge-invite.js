// One-off endpoint to email blog subscribers who have NOT signed up
// for the Bible challenge, inviting them to join.
// Auth: X-Notify-Secret header must match env.NOTIFY_SECRET

export async function onRequestPost(context) {
  const secret = context.env.NOTIFY_SECRET || "";
  const authHeader = context.request.headers.get("X-Notify-Secret") || "";

  if (!secret || authHeader !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
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

  // Get active subscribers whose email is NOT in challenge_signups
  const { results } = await context.env.DB.prepare(`
    SELECT s.email FROM subscribers s
    WHERE s.unsubscribed_at IS NULL
    AND LOWER(s.email) NOT IN (
      SELECT LOWER(c.email) FROM challenge_signups c
      WHERE c.challenge = 'july-2026'
    )
  `).all();

  if (!results || results.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: "No subscribers to invite" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let failed = 0;

  for (const row of results) {
    const unsub = await unsubscribeUrl(context.request.url, secret, row.email);
    const html = buildInviteEmail(unsub);

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
          subject: "Read the Bible with me this July",
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

function buildInviteEmail(unsubUrl) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

<tr><td style="background:#1f2937;padding:28px 32px;">
<span style="color:#ffffff;font-size:20px;font-family:Georgia,serif;letter-spacing:0.5px;">HeatherLynWilson.com</span>
</td></tr>

<tr><td style="padding:36px 32px 12px;">
<h1 style="margin:0 0 20px;font-size:26px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;">Read the Bible with me this July.</h1>
<p style="margin:0 0 18px;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">I am reading the entire Bible in 31 days this July, and I want you to do it with me.</p>
<p style="margin:0 0 18px;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">Every morning you will get a short email from me with that day's reading and a few words to keep you going. No guilt. No perfection required. Just keep showing up.</p>
<p style="margin:0 0 18px;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">You can choose the full Bible or just the New Testament. Either way, you are not doing it alone.</p>
<p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">People are already signing up. I would love for you to be one of them.</p>
</td></tr>

<tr><td style="padding:0 32px 32px;">
<a href="https://heatherlynwilson.com/challenge.html" style="display:inline-block;padding:16px 36px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Sign up for the challenge</a>
</td></tr>

<tr><td style="padding:8px 32px 28px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;font-style:italic;font-family:Georgia,serif;">Heather</p>
</td></tr>

<tr><td style="padding:12px 32px 24px;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you subscribed at heatherlynwilson.com.<br>
<a href="${unsubUrl}" style="color:#6b7280;">Unsubscribe</a>
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
