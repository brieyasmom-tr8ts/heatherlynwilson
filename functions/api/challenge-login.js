// Magic link login for Bible Challenge
// POST /api/challenge-login — sends a magic link email
// GET /api/challenge-login?email=...&token=... — verifies and returns a session token

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// POST: send magic link
export async function onRequestPost(context) {
  const body = await context.request.json();
  const email = (body.email || "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return json({ error: "Please enter a valid email address." }, 400);
  }

  // Check they're signed up for any challenge
  const user = await context.env.DB.prepare(
    "SELECT name, email FROM challenge_signups WHERE email = ? ORDER BY created_at ASC LIMIT 1"
  ).bind(email).first();

  if (!user) {
    return json({ error: "That email is not signed up for any challenge. Sign up first at heatherlynwilson.com/challenge" }, 404);
  }

  // Generate magic link token: HMAC of email + date (valid for 90 days)
  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const validUntil = "2026-10-01"; // valid through the challenge period
  const token = await hmacHex(secret, email + ":challenge:" + validUntil);

  const origin = new URL(context.request.url).origin;
  const loginUrl = `${origin}/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${token}`;

  // Send magic link email
  if (context.env.BREVO_API_KEY) {
    const name = user.name || "friend";
    try {
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": context.env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "Heather Lyn Wilson", email: "heather@heatherlynwilson.com" },
          to: [{ email: email, name: name }],
          subject: "Your Bible Challenge Dashboard Link",
          htmlContent: buildMagicLinkEmail(name, loginUrl),
        }),
      });
    } catch (e) {}
  }

  return json({ success: true });
}

// GET: verify token
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = url.searchParams.get("token") || "";

  if (!email || !token) {
    return json({ error: "Invalid link." }, 400);
  }

  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const validUntil = "2026-10-01";
  const expected = await hmacHex(secret, email + ":challenge:" + validUntil);

  if (token !== expected) {
    return json({ error: "Invalid or expired link. Request a new one." }, 403);
  }

  // Get all challenges for this user
  const { results } = await context.env.DB.prepare(
    "SELECT name, email, track, prayer, personal_start_date, challenge FROM challenge_signups WHERE email = ? ORDER BY created_at ASC"
  ).bind(email).all();

  if (!results || !results.length) {
    return json({ error: "No signup found for this email." }, 404);
  }

  const defaultStarts = { "july-2026": "2026-07-01", "august-james-2026": "2026-08-01", "september-beatitudes-2026": "2026-09-01" };

  return json({
    success: true,
    user: {
      name: results[0].name,
      email: results[0].email,
      challenges: results.map(function(r) {
        return {
          challenge: r.challenge,
          track: r.track,
          prayer: r.prayer,
          personal_start_date: r.personal_start_date || defaultStarts[r.challenge] || "2026-07-01"
        };
      })
    }
  });
}

function buildMagicLinkEmail(name, loginUrl) {
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
<h1 style="margin:0 0 16px;font-size:24px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;">Hey ${name}!</h1>
<p style="margin:0 0 20px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Here is your link to the Bible Challenge dashboard. Bookmark it. It works on any device and does not expire.</p>
</td></tr>

<tr><td style="padding:0 32px 28px;" align="center">
<a href="${loginUrl}" style="display:inline-block;padding:16px 36px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Open My Dashboard</a>
</td></tr>

<tr><td style="padding:0 32px 28px;">
<p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;font-family:-apple-system,sans-serif;">If the button does not work, copy and paste this link into your browser:</p>
<p style="margin:8px 0 0;font-size:13px;color:#b85638;word-break:break-all;font-family:-apple-system,sans-serif;">${loginUrl}</p>
</td></tr>

<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for the July Bible Challenge at heatherlynwilson.com.
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
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
