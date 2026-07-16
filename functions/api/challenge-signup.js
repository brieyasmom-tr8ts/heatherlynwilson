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
  const track = challenge === "august-james-2026" ? "james"
    : challenge === "september-beatitudes-2026" ? (["niv", "nlt", "esv", "kjv"].includes(body.track) ? body.track : "niv")
    : (["new-testament", "chronological"].includes(body.track) ? body.track : "full-bible");
  const prayer = body.prayer ? 1 : 0;

  // Each challenge launches as a fixed cohort for its first 7 days (everyone
  // starts together on the 1st), then flips to evergreen: later signups pick
  // their own date and begin at Day 1. This computes the right start date.
  const OFFICIAL_STARTS = {
    "july-2026": "2026-07-01",
    "august-james-2026": "2026-08-01",
    "september-beatitudes-2026": "2026-09-01"
  };
  const officialStart = OFFICIAL_STARTS[challenge] || null;
  let personalStartDate = null;
  if (officialStart) {
    const easternToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const daysSince = Math.floor((new Date(easternToday + "T00:00:00") - new Date(officialStart + "T00:00:00")) / 86400000);
    if (daysSince < 7) {
      // Launch window (before the start, or the first 7 days): fixed cohort
      personalStartDate = officialStart;
    } else {
      // Evergreen: honor the date they picked, otherwise default to tomorrow
      if (body.start_date && /^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
        personalStartDate = body.start_date;
      } else {
        const tomorrow = new Date(easternToday + "T00:00:00");
        tomorrow.setDate(tomorrow.getDate() + 1);
        personalStartDate = tomorrow.toISOString().slice(0, 10);
      }
    }
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

  if (existing && !dashAuthed) {
    // They are already signed up for this challenge. Do not change anything
    // and do not sign them up again. Tell them, and email their dashboard
    // link so they can pick right back up.
    if (context.env.BREVO_API_KEY) {
      try {
        const origin = new URL(context.request.url).origin;
        const secretA = context.env.NOTIFY_SECRET || "challenge-secret";
        const dashTokenA = await hmacHex(secretA, email + ":challenge:" + "2026-10-01");
        const dashUrlA = `${origin}/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${dashTokenA}`;
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": context.env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { name: "Heather Lyn Wilson", email: "heather@heatherlynwilson.com" },
            to: [{ email: email, name: name || "friend" }],
            subject: "You are already signed up. Here is your dashboard link.",
            htmlContent: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;"><tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1f2937;padding:28px 32px;"><span style="color:#fff;font-size:20px;font-family:Georgia,serif;">HeatherLynWilson.com</span></td></tr>
<tr><td style="padding:36px 32px 24px;">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Good news: you were already signed up for this challenge, so nothing changed. Here is your dashboard link. Bookmark it, it works on any device.</p>
</td></tr>
<tr><td style="padding:0 32px 32px;" align="center">
<a href="${dashUrlA}" style="display:inline-block;padding:16px 36px;background:#b85638;color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Open My Dashboard</a>
</td></tr>
</table></td></tr></table></body></html>`,
          }),
        });
      } catch (e) {}
    }
    return json({ success: false, already: true, error: "You are already signed up for this challenge. We just emailed you your dashboard link." });
  }

  if (existing) {
    // Dashboard-authenticated update (e.g. switching Beatitudes translation).
    // Update details; only move the start date if one was explicitly picked.
    const explicitStart = (body.start_date && /^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) ? body.start_date : null;
    if (explicitStart) {
      await context.env.DB.prepare(
        "UPDATE challenge_signups SET name = ?, track = ?, prayer = ?, personal_start_date = ? WHERE email = ? AND challenge = ?"
      ).bind(name, track, prayer, explicitStart, email, challenge).run();
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
    } else if (challenge === "september-beatitudes-2026") {
      // September Beatitudes memory challenge
      const beatDashUrl = `${origin}/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${dashToken}#september-beatitudes-2026`;
      const dayNum = getChallengeDayFor("2026-09-01");
      subject = dayNum === 0
        ? "You're in! Hide It In Your Heart starts September 1st."
        : "You're in! The Beatitudes challenge is underway.";
      htmlContent = buildBeatitudesWelcomeEmail(name, beatDashUrl, unsubUrl, track);
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

    // Welcome email only for brand-new signups. Dashboard-authenticated
    // updates (like switching translation) should not re-trigger it.
    if (!existing) {
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
    }

    // If their Day 1 is TODAY, the 6:05am daily send already went out before
    // they signed up, so they would miss the Day 1 reading email. Send it now.
    // The daily worker picks up normally with Day 2 tomorrow.
    const easternToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    if (!existing && personalStartDate === easternToday) {
      try {
        await sendFirstDayEmail(context.env.DB, origin, context.env.BREVO_API_KEY, challenge, track, name, email, dashToken, unsubUrl);
      } catch (e) {}
    }

    // Notify Heather
    if (!existing) {
      try {
        const trackLabel = challenge === "august-james-2026" ? "James + Prayer"
          : challenge === "september-beatitudes-2026" ? ("Beatitudes " + track.toUpperCase())
          : (track === "chronological" ? "Chronological" : track === "new-testament" ? "New Testament" : "Full Bible");
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": context.env.BREVO_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: { name: "Heather Wilson", email: "heather@heatherlynwilson.com" },
            to: [{ email: "heather@givesendgo.com", name: "Heather Wilson" }],
            subject: (challenge === "august-james-2026" ? "James Challenge" : challenge === "september-beatitudes-2026" ? "Beatitudes Challenge" : "Bible Challenge") + " Signup #" + count + ": " + name,
            textContent: "New challenge signup!\n\nName: " + name + "\nEmail: " + email + "\nTrack: " + trackLabel + "\nStart date: " + (personalStartDate ? formatDateShort(personalStartDate) : "default") + "\nPrayer: " + (prayer ? "Yes" : "No") + "\nTotal signups: " + count + "\nSigned up: " + new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
          }),
        });
      } catch (e) {}
    }
  }

  return json({ success: true, count: count });
}

// Sends the Day 1 reading email right away, using the same content the daily
// worker uses: the editable challenge_emails table first, then the packaged
// JSON as a fallback. Used when someone starts today.
async function sendFirstDayEmail(db, origin, apiKey, challenge, track, name, email, dashToken, unsubUrl) {
  if (!apiKey) return;
  let contentUrl, hash, total, footer, invite, plan;
  if (challenge === "august-james-2026") {
    plan = "james";
    contentUrl = origin + "/challenge/emails-james-prayer.json"; hash = "#august-james-2026"; total = 31;
    footer = "the One Book Deep challenge"; invite = "heatherlynwilson.com/challenge-james";
  } else if (challenge === "september-beatitudes-2026") {
    plan = "beatitudes";
    contentUrl = origin + "/challenge/emails-beatitudes.json"; hash = "#september-beatitudes-2026"; total = 30;
    footer = "the Hide It In Your Heart challenge"; invite = "heatherlynwilson.com/challenge-beatitudes";
  } else {
    plan = (track === "new-testament" || track === "chronological") ? track : "full-bible";
    contentUrl = origin + "/challenge/emails-" + plan + ".json";
    hash = ""; total = 31; footer = "the Bible Challenge"; invite = "heatherlynwilson.com/challenge";
  }

  // Editable content first
  let d = null;
  try {
    d = await db.prepare(
      "SELECT subject, reading, title, focus, practice, body FROM challenge_emails WHERE plan = ? AND day = 1"
    ).bind(plan).first();
  } catch (e) {}

  if (!d) {
    let arr;
    try {
      const r = await fetch(contentUrl, { headers: { "User-Agent": "hlw-signup" } });
      if (!r.ok) return;
      arr = await r.json();
    } catch (e) { return; }
    d = arr && arr[0];
  }
  if (!d) return;

  let subject, heading, body;
  if (challenge === "september-beatitudes-2026") {
    subject = "Day 1: " + (d.title || "The Beatitudes");
    heading = d.title || "The Beatitudes";
    body = (d.body || "") + (d.practice ? "\n\nToday: " + d.practice : "");
  } else {
    subject = d.subject || "Day 1";
    heading = d.reading || "Day 1";
    body = (d.body || "").replace("Good morning.", "Good morning, " + name + ".");
  }

  const dashUrl = origin + "/challenge/dashboard.html?email=" + encodeURIComponent(email) + "&token=" + dashToken + hash;
  const html = buildDayOneEmail(heading, body, dashUrl, footer, invite, unsubUrl);

  await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { name: "Heather Lyn Wilson", email: "heather@heatherlynwilson.com" },
      to: [{ email, name }],
      subject,
      htmlContent: html,
    }),
  });
}

function buildDayOneEmail(heading, body, dashUrl, footer, invite, unsubUrl) {
  const paragraphs = body.split("\n\n").map(function(p) {
    if (p === "Heather" || p.indexOf("With love,") === 0) {
      return '<p style="margin:12px 0 0;font-size:18px;color:#1f2937;font-style:italic;font-family:Georgia,serif;">' + p.replace("\n", "<br>") + "</p>";
    }
    return '<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">' + p + "</p>";
  }).join("\n");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1f2937;padding:28px 32px;">
<span style="color:#fff;font-size:20px;font-family:Georgia,serif;">HeatherLynWilson.com</span>
<span style="float:right;color:#c8a365;font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;padding-top:4px;">DAY 1</span></td></tr>
<tr><td style="padding:28px 32px 8px;">
<p style="margin:0 0 4px;font-size:12px;color:#b85638;font-family:-apple-system,sans-serif;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Today</p>
<p style="margin:0 0 20px;font-size:22px;color:#1f2937;font-family:Georgia,serif;font-weight:600;">${heading}</p></td></tr>
<tr><td style="padding:0 32px 24px;">${paragraphs}</td></tr>
<tr><td style="padding:0 32px 28px;" align="center">
<a href="${dashUrl}" style="display:inline-block;padding:14px 32px;background:#b85638;color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Go to My Dashboard</a></td></tr>
<tr><td style="padding:0 32px 24px;text-align:center;">
<p style="margin:0;font-size:14px;color:#6b7280;font-family:-apple-system,sans-serif;">Know someone who would want to join? <a href="https://${invite}" style="color:#b85638;">${invite}</a></p></td></tr>
<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;">You are receiving this because you signed up for ${footer}.${unsubUrl ? '<br><a href="' + unsubUrl + '" style="color:#6b7280;">Unsubscribe</a>' : ""}</p></td></tr>
</table></td></tr></table></body></html>`;
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
  const trackLabel = track === "chronological" ? "Chronological" : track === "new-testament" ? "New Testament" : "Full Bible";

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

function buildBeatitudesWelcomeEmail(name, dashboardUrl, unsubUrl, translation) {
  const greeting = name || "friend";
  const transLabel = (translation || "niv").toUpperCase();
  return `<!DOCTYPE html><html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

<tr><td style="background:#1f2937;padding:28px 32px;">
<span style="color:#ffffff;font-size:20px;font-family:Georgia,serif;letter-spacing:0.5px;">HeatherLynWilson.com</span>
<span style="float:right;color:#c8a365;font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;padding-top:4px;">HIDE IT IN YOUR HEART</span>
</td></tr>

<tr><td style="padding:36px 32px 12px;">
<h1 style="margin:0 0 16px;font-size:24px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;">You are in, ${greeting}!</h1>
<p style="margin:0 0 20px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">I am so glad you are joining me to memorize the Beatitudes. Here is what to expect:</p>
</td></tr>

<tr><td style="padding:0 32px 24px;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ef;border-radius:6px;">
<tr><td style="padding:24px;">
<p style="margin:0 0 6px;font-size:12px;color:#b85638;font-family:-apple-system,sans-serif;font-weight:600;letter-spacing:1px;text-transform:uppercase;">THE CHALLENGE</p>
<p style="margin:0 0 16px;font-size:18px;color:#1f2937;font-family:Georgia,serif;font-weight:600;">Hide It In Your Heart: Memorize the Beatitudes</p>
<p style="margin:0 0 6px;font-size:12px;color:#b85638;font-family:-apple-system,sans-serif;font-weight:600;letter-spacing:1px;text-transform:uppercase;">STARTS</p>
<p style="margin:0 0 16px;font-size:18px;color:#1f2937;font-family:Georgia,serif;font-weight:600;">September 1, 2026</p>
<p style="margin:0 0 6px;font-size:12px;color:#b85638;font-family:-apple-system,sans-serif;font-weight:600;letter-spacing:1px;text-transform:uppercase;">YOUR TRANSLATION</p>
<p style="margin:0;font-size:18px;color:#1f2937;font-family:Georgia,serif;font-weight:600;">${transLabel}</p>
</td></tr>
</table>
</td></tr>

<tr><td style="padding:0 32px 28px;">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Starting September 1st, you will get an email from me every morning with:</p>
<p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; The line we are learning and what it actually means</p>
<p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; A short encouragement from me</p>
<p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; A memory game on your dashboard that hides more words each day</p>
<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; By Day 30 you will say the whole passage from memory</p>
</td></tr>

<tr><td style="padding:0 32px 28px;" align="center">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Bookmark your personal dashboard:</p>
<a href="${dashboardUrl}" style="display:inline-block;padding:16px 36px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Open My Dashboard</a>
</td></tr>

<tr><td style="padding:0 32px 28px;">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Know someone who should do this?</p>
<p style="margin:0;"><a href="https://heatherlynwilson.com/challenge-beatitudes" style="color:#b85638;font-size:16px;font-family:-apple-system,sans-serif;font-weight:600;">heatherlynwilson.com/challenge-beatitudes</a></p>
</td></tr>

<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for the Beatitudes challenge at heatherlynwilson.com.${unsubUrl ? ` <a href="${unsubUrl}" style="color:#6b7280;">Unsubscribe</a>.` : ""}
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildWelcomeEmail(name, track, dashboardUrl, unsubUrl, startDate) {
  const trackLabel = track === "chronological" ? "The Whole Bible in 31 Days, Chronological" : track === "new-testament" ? "The New Testament in 31 Days" : "The Full Bible in 31 Days";
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
