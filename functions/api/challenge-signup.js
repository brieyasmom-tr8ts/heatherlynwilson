async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  const name = (body.name || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const track = body.track === "new-testament" ? "new-testament" : "full-bible";
  const prayer = body.prayer ? 1 : 0;

  if (!name || !email || !email.includes("@")) {
    return json({ error: "Please fill in your name and email." }, 400);
  }

  // Verify Turnstile
  const token = body["cf-turnstile-response"] || "";
  if (context.env.TURNSTILE_SECRET) {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(context.env.TURNSTILE_SECRET)}&response=${encodeURIComponent(token)}`,
    });
    const result = await res.json();
    if (!result.success) {
      return json({ error: "Captcha verification failed. Please refresh and try again." }, 403);
    }
  }

  // Create table if not exists
  await context.env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS challenge_signups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      track TEXT NOT NULL DEFAULT 'full-bible',
      prayer INTEGER NOT NULL DEFAULT 0,
      challenge TEXT NOT NULL DEFAULT 'july-2026',
      bookmark TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Check for existing signup
  const existing = await context.env.DB.prepare(
    "SELECT id FROM challenge_signups WHERE email = ? AND challenge = 'july-2026'"
  ).bind(email).first();

  if (existing) {
    // Update their info
    await context.env.DB.prepare(
      "UPDATE challenge_signups SET name = ?, track = ?, prayer = ? WHERE email = ? AND challenge = 'july-2026'"
    ).bind(name, track, prayer, email).run();
  } else {
    await context.env.DB.prepare(
      "INSERT INTO challenge_signups (name, email, track, prayer, challenge) VALUES (?, ?, ?, ?, 'july-2026')"
    ).bind(name, email, track, prayer).run();
  }

  // Also add to subscribers list so they stay on the email list after the challenge
  try {
    await context.env.DB.prepare(
      "INSERT OR IGNORE INTO subscribers (email) VALUES (?)"
    ).bind(email).run();
  } catch (e) {}

  // Get updated count
  const countRow = await context.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM challenge_signups WHERE challenge = 'july-2026'"
  ).first();
  const count = countRow ? countRow.cnt : 0;

  // Send welcome email
  if (context.env.BREVO_API_KEY) {
    const origin = new URL(context.request.url).origin;
    const notifySecret = context.env.NOTIFY_SECRET || "";
    const unsubToken = notifySecret ? await hmacHex(notifySecret, email) : "";
    const unsubUrl = unsubToken
      ? `${origin}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubToken}`
      : "";

    // Generate dashboard magic link
    const validUntil = "2026-10-01";
    const dashToken = await hmacHex(notifySecret || "challenge-secret", email + ":challenge:" + validUntil);
    const dashboardUrl = `${origin}/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${dashToken}`;

    const dayNum = getCurrentDay();
    let subject, htmlContent;

    if (dayNum === 0) {
      subject = "You're in! See you July 1st.";
      htmlContent = buildWelcomeEmail(name, track, dashboardUrl, unsubUrl);
    } else {
      // Challenge is running — send catch-up with missed readings
      let missedReadings = [];
      try {
        const jsonFile = track === "new-testament" ? "emails-new-testament" : "emails-full-bible";
        const r = await fetch(`${origin}/challenge/${jsonFile}.json`);
        const all = await r.json();
        missedReadings = all.slice(0, dayNum);
      } catch (e) {}
      subject = "You are in! Here is what the group has covered so far.";
      htmlContent = buildCatchupEmail(name, track, dashboardUrl, unsubUrl, missedReadings, dayNum);
    }

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
          subject,
          htmlContent,
        }),
      });
    } catch (e) {}

    // Notify Heather
    if (!existing) {
      try {
        const trackLabel = track === "full-bible" ? "Full Bible" : "New Testament";
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": context.env.BREVO_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: { name: "Heather Wilson", email: "heather@heatherlynwilson.com" },
            to: [{ email: "heather@givesendgo.com", name: "Heather Wilson" }],
            subject: "Bible Challenge Signup #" + count + ": " + name,
            textContent: "New challenge signup!\n\nName: " + name + "\nEmail: " + email + "\nTrack: " + trackLabel + "\nPrayer: " + (prayer ? "Yes" : "No") + "\nTotal signups: " + count + "\nDate: " + new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
          }),
        });
      } catch (e) {}
    }
  }

  return json({ success: true, count: count });
}

function getCurrentDay() {
  const now = new Date();
  const eastern = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const today = new Date(eastern + "T00:00:00");
  const start = new Date("2026-07-01T00:00:00");
  const diffMs = today - start;
  if (diffMs < 0) return 0;
  return Math.min(31, Math.floor(diffMs / 86400000) + 1);
}

function buildCatchupEmail(name, track, dashboardUrl, unsubUrl, missedReadings, dayNum) {
  const greeting = name || "friend";
  const trackLabel = track === "new-testament" ? "New Testament" : "Full Bible";

  const readingRows = missedReadings.map(e =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #e5e0d5;">
      <span style="font-size:13px;font-weight:700;color:#b85638;font-family:-apple-system,sans-serif;min-width:50px;display:inline-block;">Day ${e.day}</span>
      <span style="font-size:15px;color:#1f2937;font-family:-apple-system,sans-serif;">${e.reading}</span>
    </td></tr>`
  ).join("\n");

  const tomorrowNote = dayNum < 31
    ? `<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Starting tomorrow morning at 6am Eastern, you will get Day ${dayNum + 1}'s email just like everyone else. You are fully in the rhythm from here.</p>`
    : "";

  return `<!DOCTYPE html><html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

<tr><td style="background:#1f2937;padding:28px 32px;">
<span style="color:#ffffff;font-size:20px;font-family:Georgia,serif;letter-spacing:0.5px;">HeatherLynWilson.com</span>
<span style="float:right;color:#c8a365;font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;padding-top:4px;">JULY BIBLE CHALLENGE</span>
</td></tr>

<tr><td style="padding:36px 32px 12px;">
<h1 style="margin:0 0 16px;font-size:24px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;">You are in, ${greeting}.</h1>
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">The challenge started July 1st and the group is already ${dayNum} day${dayNum === 1 ? "" : "s"} in. Glad you are joining. Here is what has been covered on the ${trackLabel} track so far:</p>
</td></tr>

<tr><td style="padding:0 32px 24px;">
<table width="100%" cellpadding="0" cellspacing="0">
${readingRows}
</table>
</td></tr>

<tr><td style="padding:0 32px 24px;">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Read what you can to catch up, or just start fresh with tomorrow. Either way, you are not behind. You are here.</p>
${tomorrowNote}
</td></tr>

<tr><td style="padding:0 32px 28px;" align="center">
<a href="${dashboardUrl}" style="display:inline-block;padding:14px 32px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Go to My Dashboard</a>
</td></tr>

<tr><td style="padding:0 32px 28px;">
<p style="margin:0 0 8px;font-size:14px;color:#6b7280;font-family:-apple-system,sans-serif;">Your dashboard is where you track your reading, share a reflection for the day, and post a prayer request for the group.</p>
</td></tr>

<tr><td style="padding:0 32px 28px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.6;font-style:italic;font-family:Georgia,serif;">Heather</p>
</td></tr>

<tr><td style="padding:12px 32px 24px;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for the July Bible Challenge at heatherlynwilson.com.${unsubUrl ? `<br><a href="${unsubUrl}" style="color:#6b7280;">Unsubscribe</a>` : ""}
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildWelcomeEmail(name, track, dashboardUrl, unsubUrl) {
  const trackLabel = track === "full-bible" ? "The Full Bible in 31 Days" : "The New Testament in 31 Days";
  const greeting = name || "friend";

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
<h1 style="margin:0 0 16px;font-size:24px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;">You are in, ${greeting}!</h1>
<p style="margin:0 0 20px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">I am so glad you are joining me this July. Here is what to expect:</p>
</td></tr>

<tr><td style="padding:0 32px 24px;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ef;border-radius:6px;">
<tr><td style="padding:24px;">
<p style="margin:0 0 6px;font-size:12px;color:#b85638;font-family:-apple-system,sans-serif;font-weight:600;letter-spacing:1px;text-transform:uppercase;">YOUR TRACK</p>
<p style="margin:0 0 16px;font-size:18px;color:#1f2937;font-family:Georgia,serif;font-weight:600;">${trackLabel}</p>
<p style="margin:0 0 6px;font-size:12px;color:#b85638;font-family:-apple-system,sans-serif;font-weight:600;letter-spacing:1px;text-transform:uppercase;">STARTS</p>
<p style="margin:0;font-size:18px;color:#1f2937;font-family:Georgia,serif;font-weight:600;">July 1, 2026</p>
</td></tr>
</table>
</td></tr>

<tr><td style="padding:0 32px 28px;">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Starting July 1st, you will get an email from me every morning at 6am Eastern with:</p>
<p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; That day's reading assignment</p>
<p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; A short encouragement from me</p>
<p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; A link to check off your reading for the day</p>
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; How many people are reading alongside you</p>
<p style="margin:0 0 0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">If you miss a day, that is okay. Just read today. No guilt. No catching up required. Just keep showing up.</p>
</td></tr>

<tr><td style="padding:0 32px 28px;">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Before you start, here is my free guide with the tips and lessons I learned reading the Bible in a month. It will help.</p>
</td></tr>

<tr><td style="padding:0 32px 28px;" align="center">
<a href="https://heatherlynwilson.com/downloads/31-days-in-the-word.pdf" style="display:inline-block;padding:14px 32px;background:#1f2937;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Download the Free Guide</a>
</td></tr>

<tr><td style="padding:0 32px 28px;" align="center">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Bookmark your personal dashboard. This is where you will track your reading and see who is reading alongside you:</p>
<a href="${dashboardUrl}" style="display:inline-block;padding:16px 36px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Open My Dashboard</a>
</td></tr>

<tr><td style="padding:0 32px 28px;">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Know someone who would want to read along? Send them:</p>
<p style="margin:0;"><a href="https://heatherlynwilson.com/challenge" style="color:#b85638;font-size:16px;font-family:-apple-system,sans-serif;font-weight:600;">heatherlynwilson.com/challenge</a></p>
</td></tr>

<tr><td style="padding:0 32px 28px;">
<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">See you July 1st.</p>
<p style="margin:12px 0 0;font-size:18px;color:#1f2937;font-style:italic;font-family:Georgia,serif;">Heather</p>
</td></tr>

<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for the July Bible Challenge at heatherlynwilson.com.${unsubUrl ? `<br><a href="${unsubUrl}" style="color:#6b7280;">Unsubscribe</a>` : ""}
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
