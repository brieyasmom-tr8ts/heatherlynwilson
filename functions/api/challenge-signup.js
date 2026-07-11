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
  const challenge = body.challenge || "july-2026";
  const track = challenge === "august-james-2026" ? "james" : (body.track === "new-testament" ? "new-testament" : "full-bible");
  const prayer = body.prayer ? 1 : 0;

  // Personal start date for evergreen challenge (default: tomorrow)
  let personalStartDate = null;
  if (challenge === "july-2026" && body.start_date) {
    const match = /^\d{4}-\d{2}-\d{2}$/.test(body.start_date);
    if (match) personalStartDate = body.start_date;
  }
  if (!personalStartDate && challenge === "july-2026") {
    const now = new Date();
    const eastern = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const tomorrow = new Date(eastern + "T00:00:00");
    tomorrow.setDate(tomorrow.getDate() + 1);
    personalStartDate = tomorrow.toISOString().slice(0, 10);
  }

  if (!name || !email || !email.includes("@")) {
    return json({ error: "Please fill in your name and email." }, 400);
  }

  // One-tap join from the dashboard: a valid dashboard token proves this is
  // an already-authenticated user, so the captcha is skipped (the dashboard
  // has no Turnstile widget).
  let dashAuthed = false;
  if (body.dash_token) {
    const dashSecret = context.env.NOTIFY_SECRET || "challenge-secret";
    const expectedDash = await hmacHex(dashSecret, email + ":challenge:" + "2026-10-01");
    dashAuthed = body.dash_token === expectedDash;
  }

  // Verify Turnstile
  const token = body["cf-turnstile-response"] || "";
  if (context.env.TURNSTILE_SECRET && !dashAuthed) {
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
      email TEXT NOT NULL,
      track TEXT NOT NULL DEFAULT 'full-bible',
      prayer INTEGER NOT NULL DEFAULT 0,
      challenge TEXT NOT NULL DEFAULT 'july-2026',
      bookmark TEXT DEFAULT '',
      personal_start_date TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(email, challenge)
    )
  `).run();
  // Migration: add column if it doesn't exist yet
  try {
    await context.env.DB.prepare("ALTER TABLE challenge_signups ADD COLUMN personal_start_date TEXT DEFAULT NULL").run();
  } catch (e) {}

  // Check for existing signup
  const existing = await context.env.DB.prepare(
    "SELECT id FROM challenge_signups WHERE email = ? AND challenge = ?"
  ).bind(email, challenge).first();

  if (existing) {
    // Update their info (only update personal_start_date if provided)
    if (personalStartDate) {
      await context.env.DB.prepare(
        "UPDATE challenge_signups SET name = ?, track = ?, prayer = ?, personal_start_date = ? WHERE email = ? AND challenge = ?"
      ).bind(name, track, prayer, personalStartDate, email, challenge).run();
    } else {
      await context.env.DB.prepare(
        "UPDATE challenge_signups SET name = ?, track = ?, prayer = ? WHERE email = ? AND challenge = ?"
      ).bind(name, track, prayer, email, challenge).run();
    }
  } else {
    await context.env.DB.prepare(
      "INSERT INTO challenge_signups (name, email, track, prayer, challenge, personal_start_date) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(name, email, track, prayer, challenge, personalStartDate).run();
  }

  // Also add to subscribers list so they stay on the email list after the challenge
  try {
    await context.env.DB.prepare(
      "INSERT OR IGNORE INTO subscribers (email) VALUES (?)"
    ).bind(email).run();
  } catch (e) {}

  // Get updated count
  const countRow = await context.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM challenge_signups WHERE challenge = ?"
  ).bind(challenge).first();
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

    let subject, htmlContent;

    if (challenge === "august-james-2026") {
      // August James challenge
      const jamesDashUrl = `${origin}/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${dashToken}#august-james-2026`;
      const dayNum = getChallengeDayFor("2026-08-01");
      if (dayNum === 0) {
        subject = "You're in! One Book Deep starts August 1st.";
        htmlContent = buildJamesWelcomeEmail(name, jamesDashUrl, unsubUrl);
      } else {
        subject = "You're in! One Book Deep is underway.";
        htmlContent = buildJamesCatchupEmail(name, jamesDashUrl, unsubUrl, dayNum);
      }
    } else {
      // July challenge (evergreen: each user has their own start date)
      const userStartDate = personalStartDate || "2026-07-01";
      const startDayNum = getChallengeDayFor(userStartDate);
      if (startDayNum <= 0) {
        // Start date is in the future
        subject = "You are in! See you on " + formatDateShort(userStartDate) + ".";
        htmlContent = buildWelcomeEmail(name, track, dashboardUrl, unsubUrl, userStartDate);
      } else {
        // Start date is today or in the past — treat as just-started (Day 1 begins today for them)
        subject = "You are in! Your reading starts today.";
        htmlContent = buildWelcomeEmail(name, track, dashboardUrl, unsubUrl, userStartDate);
      }
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
        const trackLabel = challenge === "august-james-2026" ? "James + Prayer" : (track === "full-bible" ? "Full Bible" : "New Testament");
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": context.env.BREVO_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: { name: "Heather Wilson", email: "heather@heatherlynwilson.com" },
            to: [{ email: "heather@givesendgo.com", name: "Heather Wilson" }],
            subject: (challenge === "august-james-2026" ? "James Challenge" : "Bible Challenge") + " Signup #" + count + ": " + name,
            textContent: "New challenge signup!\n\nName: " + name + "\nEmail: " + email + "\nTrack: " + trackLabel + "\nPrayer: " + (prayer ? "Yes" : "No") + "\nTotal signups: " + count + "\nDate: " + new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
          }),
        });
      } catch (e) {}
    }
  }

  return json({ success: true, count: count });
}

function getCurrentDay() {
  return getChallengeDayFor("2026-07-01");
}

function getChallengeDayFor(startDate) {
  const now = new Date();
  const eastern = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const today = new Date(eastern + "T00:00:00");
  const start = new Date(startDate + "T00:00:00");
  const diffMs = today - start;
  if (diffMs < 0) return 0;
  return Math.min(31, Math.floor(diffMs / 86400000) + 1);
}

function buildJamesWelcomeEmail(name, dashboardUrl, unsubUrl) {
  const greeting = name || "friend";
  return `<!DOCTYPE html><html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

<tr><td style="background:#1f2937;padding:28px 32px;">
<span style="color:#ffffff;font-size:20px;font-family:Georgia,serif;letter-spacing:0.5px;">HeatherLynWilson.com</span>
<span style="float:right;color:#c8a365;font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;padding-top:4px;">ONE BOOK DEEP</span>
</td></tr>

<tr><td style="padding:36px 32px 12px;">
<h1 style="margin:0 0 16px;font-size:24px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;">You are in, ${greeting}!</h1>
<p style="margin:0 0 20px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">I am so glad you are joining me for this one. Here is what to expect:</p>
</td></tr>

<tr><td style="padding:0 32px 24px;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ef;border-radius:6px;">
<tr><td style="padding:24px;">
<p style="margin:0 0 6px;font-size:12px;color:#b85638;font-family:-apple-system,sans-serif;font-weight:600;letter-spacing:1px;text-transform:uppercase;">THE CHALLENGE</p>
<p style="margin:0 0 16px;font-size:18px;color:#1f2937;font-family:Georgia,serif;font-weight:600;">One Book Deep: 31 Days in James + Prayer</p>
<p style="margin:0 0 6px;font-size:12px;color:#b85638;font-family:-apple-system,sans-serif;font-weight:600;letter-spacing:1px;text-transform:uppercase;">STARTS</p>
<p style="margin:0;font-size:18px;color:#1f2937;font-family:Georgia,serif;font-weight:600;">August 1, 2026</p>
</td></tr>
</table>
</td></tr>

<tr><td style="padding:0 32px 28px;">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Starting August 1st, you will get an email from me every morning at 6am Eastern with:</p>
<p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; A prayer focus for the day tied to James</p>
<p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; A short encouragement from me</p>
<p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; A journal on your dashboard to write what stood out, what God is saying, and your prayer</p>
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; By Day 31, you will have a personal record of everything God spoke to you through James</p>
<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Every day you will read all five chapters of James. The same book, 31 times. Repetition is how the Word gets from your head to your heart.</p>
</td></tr>

<tr><td style="padding:0 32px 28px;" align="center">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Bookmark your personal dashboard:</p>
<a href="${dashboardUrl}" style="display:inline-block;padding:16px 36px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Open My Dashboard</a>
</td></tr>

<tr><td style="padding:0 32px 28px;">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Know someone who should do this?</p>
<p style="margin:0;"><a href="https://heatherlynwilson.com/challenge-james" style="color:#b85638;font-size:16px;font-family:-apple-system,sans-serif;font-weight:600;">heatherlynwilson.com/challenge-james</a></p>
</td></tr>

<tr><td style="padding:0 32px 28px;">
<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">See you August 1st.</p>
<p style="margin:12px 0 0;font-size:18px;color:#1f2937;font-style:italic;font-family:Georgia,serif;">Heather</p>
</td></tr>

<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for the One Book Deep challenge at heatherlynwilson.com.${unsubUrl ? `<br><a href="${unsubUrl}" style="color:#6b7280;">Unsubscribe</a>` : ""}
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildJamesCatchupEmail(name, dashboardUrl, unsubUrl, dayNum) {
  const greeting = name || "friend";
  return `<!DOCTYPE html><html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

<tr><td style="background:#1f2937;padding:28px 32px;">
<span style="color:#ffffff;font-size:20px;font-family:Georgia,serif;letter-spacing:0.5px;">HeatherLynWilson.com</span>
<span style="float:right;color:#c8a365;font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;padding-top:4px;">ONE BOOK DEEP</span>
</td></tr>

<tr><td style="padding:36px 32px 12px;">
<h1 style="margin:0 0 16px;font-size:24px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;">You are in, ${greeting}.</h1>
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">The group is ${dayNum} day${dayNum === 1 ? "" : "s"} into reading James. Glad you are joining.</p>
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">The beauty of this challenge is that you are reading the same book every day. So there is nothing to catch up on. Just start reading James today and journal what stands out.</p>
</td></tr>

<tr><td style="padding:0 32px 28px;" align="center">
<a href="${dashboardUrl}" style="display:inline-block;padding:14px 32px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Go to My Dashboard</a>
</td></tr>

<tr><td style="padding:0 32px 28px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.6;font-style:italic;font-family:Georgia,serif;">Heather</p>
</td></tr>

<tr><td style="padding:12px 32px 24px;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for the One Book Deep challenge at heatherlynwilson.com.${unsubUrl ? `<br><a href="${unsubUrl}" style="color:#6b7280;">Unsubscribe</a>` : ""}
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
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

function formatDateShort(isoDate) {
  const parts = isoDate.split("-");
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function buildWelcomeEmail(name, track, dashboardUrl, unsubUrl, startDate) {
  const trackLabel = track === "full-bible" ? "The Full Bible in 31 Days" : "The New Testament in 31 Days";
  const greeting = name || "friend";
  const startDisplay = startDate ? formatDateShort(startDate) : "July 1, 2026";

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
<p style="margin:0;font-size:18px;color:#1f2937;font-family:Georgia,serif;font-weight:600;">${startDisplay}</p>
</td></tr>
</table>
</td></tr>

<tr><td style="padding:0 32px 28px;">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Starting ${startDisplay}, you will get an email from me every morning at 6am Eastern with:</p>
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
<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">See you ${startDisplay}.</p>
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
