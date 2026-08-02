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
    : challenge === "october-proverbs-2026" ? "family"
    : challenge === "september-beatitudes-2026" ? (["niv", "nlt", "esv", "kjv"].includes(body.track) ? body.track : "niv")
    : challenge === "november-thanks-2026" ? (["one-psalm", "all-psalms"].includes(body.track) ? body.track : "one-psalm")
    : challenge === "december-gospels-2026" ? (["four-gospels", "luke"].includes(body.track) ? body.track : "four-gospels")
    : (["new-testament", "chronological", "bible-90", "chrono-90", "ot-90", "nt-90"].includes(body.track) ? body.track : "full-bible");
  const prayer = body.prayer ? 1 : 0;
  const source = (body.source || "").trim().slice(0, 100);
  const region = (context.request.cf && context.request.cf.region) || "";

  // Signups before the official start are held: everyone begins on the 1st.
  // From the 1st onward the challenge is evergreen: signups pick their own
  // date and begin at Day 1. This computes the right start date.
  const OFFICIAL_STARTS = {
    "july-2026": "2026-07-01",
    "august-james-2026": "2026-08-01",
    "september-beatitudes-2026": "2026-09-01",
    "october-proverbs-2026": "2026-10-01",
    "november-thanks-2026": "2026-11-01",
    "december-gospels-2026": "2026-12-01"
  };
  const officialStart = OFFICIAL_STARTS[challenge] || null;
  let personalStartDate = null;
  if (officialStart) {
    const easternToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const daysSince = Math.floor((new Date(easternToday + "T00:00:00") - new Date(officialStart + "T00:00:00")) / 86400000);
    if (daysSince < 0) {
      // Before the official start: everyone is held to the 1st
      personalStartDate = officialStart;
    } else {
      // Evergreen: honor the date they picked. Past dates are allowed on
      // purpose: someone whose friends started yesterday can pick yesterday
      // and catch up. The signup form warns them when they choose a past
      // date. No date picked: launch day itself defaults to today so they
      // start with everyone, any other day defaults to tomorrow.
      if (body.start_date && /^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
        personalStartDate = body.start_date;
      } else if (daysSince === 0) {
        personalStartDate = officialStart;
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
    "SELECT id, prayer FROM challenge_signups WHERE email = ? AND challenge = ?"
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
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Good news: you were already signed up for this challenge, so nothing changed. Here is your dashboard link. Want to start a fresh round or switch to a different plan (chronological, 3 months)? Open your dashboard and use the Start over card.</p>
</td></tr>
<tr><td style="padding:0 32px 32px;" align="center">
<a href="${dashUrlA}" style="display:inline-block;padding:16px 36px;background:#b85638;color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Open My Dashboard</a>
</td></tr>
</table></td></tr></table></body></html>`,
          }),
        });
      } catch (e) {}
    }
    // Still join the group even if already signed up
    let alreadyGroupJoined = false;
    const alreadyGroupCode = (body.group || "").trim().toLowerCase();
    if (alreadyGroupCode) {
      try {
        const grp = await context.env.DB.prepare("SELECT id FROM challenge_groups WHERE id = ?").bind(alreadyGroupCode).first();
        if (grp) {
          await context.env.DB.prepare("INSERT OR IGNORE INTO group_members (group_id, email, name) VALUES (?, ?, ?)").bind(alreadyGroupCode, email, name).run();
          alreadyGroupJoined = true;
          try { await syncStartToGroupCreator(context.env, alreadyGroupCode, email); } catch (e2) {}
          if (context.env.BREVO_API_KEY) {
            try { await notifyGroupJoin(context.env, alreadyGroupCode, name, email); } catch (e2) {}
          }
        }
      } catch (e) {}
    }
    const alreadyToken = await hmacHex(context.env.NOTIFY_SECRET || "challenge-secret", email + ":challenge:2026-10-01");
    return json({ success: false, already: true, group_joined: alreadyGroupJoined, token: alreadyToken, error: alreadyGroupJoined ? "You are already signed up, but you have been added to the group! Check your email for your dashboard link." : "You are already signed up for this challenge. We just emailed you your dashboard link." });
  }

  if (existing) {
    // Dashboard-authenticated update (e.g. switching Beatitudes translation).
    // Update details; only move the start date if one was explicitly picked,
    // and keep their saved prayer choice when the caller does not send one
    // (the translation switcher only sends the track).
    const explicitStart = (body.start_date && /^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) ? body.start_date : null;
    const prayerKeep = (body.prayer === undefined) ? (existing.prayer ? 1 : 0) : prayer;
    if (explicitStart) {
      await context.env.DB.prepare(
        "UPDATE challenge_signups SET name = ?, track = ?, prayer = ?, personal_start_date = ? WHERE email = ? AND challenge = ?"
      ).bind(name, track, prayerKeep, explicitStart, email, challenge).run();
    } else {
      await context.env.DB.prepare(
        "UPDATE challenge_signups SET name = ?, track = ?, prayer = ? WHERE email = ? AND challenge = ?"
      ).bind(name, track, prayerKeep, email, challenge).run();
    }
  } else {
    await context.env.DB.prepare(
      "INSERT INTO challenge_signups (name, email, track, prayer, challenge, personal_start_date, source, region) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(name, email, track, prayer, challenge, personalStartDate, source || "", region || "").run();
  }

  // Also add to subscribers list so they stay on the email list after the challenge
  try {
    await context.env.DB.prepare(
      "INSERT OR IGNORE INTO subscribers (email) VALUES (?)"
    ).bind(email).run();
  } catch (e) {}

  // Signing up for a challenge means they want its emails: clear any old
  // challenge-email opt-out for this address
  if (!existing) {
    try {
      await context.env.DB.prepare(
        "UPDATE email_prefs SET challenge_optout = 0, updated_at = datetime('now') WHERE email = ?"
      ).bind(email).run();
    } catch (e) {}
  }

  // Auto-join group if a group code was passed
  let groupJoined = false;
  const groupCode = (body.group || "").trim().toLowerCase();
  if (groupCode && !existing) {
    try {
      const group = await context.env.DB.prepare(
        "SELECT id FROM challenge_groups WHERE id = ?"
      ).bind(groupCode).first();
      if (group) {
        await context.env.DB.prepare(
          "INSERT OR IGNORE INTO group_members (group_id, email, name) VALUES (?, ?, ?)"
        ).bind(groupCode, email, name).run();
        groupJoined = true;
        // Joining a group puts them on the group's calendar
        try {
          const synced = await syncStartToGroupCreator(context.env, groupCode, email);
          if (synced) personalStartDate = synced;
        } catch (e) {}
        // Notify existing group members
        if (context.env.BREVO_API_KEY) {
          try { await notifyGroupJoin(context.env, groupCode, name, email); } catch (e) {}
        }
      }
    } catch (e) {}
  }

  // Create a new group if group_name was passed (user clicked "Create Group" on signup page)
  let createdGroupId = "";
  let createdGroupInvite = "";
  const groupName = (body.group_name || "").trim().slice(0, 60);
  if (groupName && !existing) {
    try {
      const chars = "abcdefghjkmnpqrstuvwxyz23456789";
      let gid = "";
      const arr = new Uint8Array(8);
      crypto.getRandomValues(arr);
      for (let i = 0; i < 8; i++) gid += chars[arr[i] % chars.length];

      await context.env.DB.prepare(
        "INSERT INTO challenge_groups (id, name, challenge, created_by_email, track) VALUES (?, ?, ?, ?, ?)"
      ).bind(gid, groupName, challenge, email, track).run();
      await context.env.DB.prepare(
        "INSERT OR IGNORE INTO group_members (group_id, email, name) VALUES (?, ?, ?)"
      ).bind(gid, email, name).run();

      const origin = new URL(context.request.url).origin;
      const grpSlug = challenge === "august-james-2026" ? "challenge-james"
        : challenge === "september-beatitudes-2026" ? "challenge-beatitudes"
        : challenge === "october-proverbs-2026" ? "challenge-proverbs"
        : challenge === "november-thanks-2026" ? "challenge-thanks"
        : challenge === "december-gospels-2026" ? "challenge-gospels"
        : "challenge-bible";
      createdGroupId = gid;
      createdGroupInvite = origin + "/" + grpSlug + "?group=" + gid;
    } catch (e) {}
  }

  // Get updated count
  const countRow = await context.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM challenge_signups WHERE challenge = ?"
  ).bind(challenge).first();
  const count = countRow ? countRow.cnt : 0;

  // Generate dashboard token (used for welcome email AND returned to client for group creation)
  const origin = new URL(context.request.url).origin;
  const notifySecret = context.env.NOTIFY_SECRET || "";
  const dashToken = await hmacHex(notifySecret || "challenge-secret", email + ":challenge:2026-10-01");

  // Send welcome email
  if (context.env.BREVO_API_KEY) {
    const unsubToken = notifySecret ? await hmacHex(notifySecret, email) : "";
    const unsubUrl = unsubToken
      ? `${origin}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubToken}`
      : "";

    const dashboardUrl = `${origin}/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${dashToken}`;

    // If user is in a group, use the group invite link in the welcome email
    const userGroupCode = createdGroupId || (groupJoined ? groupCode : "");
    const challengeSlug = challenge === "august-james-2026" ? "challenge-james"
      : challenge === "september-beatitudes-2026" ? "challenge-beatitudes"
      : challenge === "october-proverbs-2026" ? "challenge-proverbs"
      : challenge === "november-thanks-2026" ? "challenge-thanks"
      : challenge === "december-gospels-2026" ? "challenge-gospels"
      : "challenge-bible";
    const groupInviteUrl = userGroupCode
      ? `https://heatherlynwilson.com/${challengeSlug}?group=${userGroupCode}`
      : "";

    let subject, htmlContent;

    if (challenge === "august-james-2026") {
      // August James challenge
      const jamesDashUrl = `${origin}/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${dashToken}#august-james-2026`;
      const dayNum = getChallengeDayFor("2026-08-01");
      if (dayNum === 0) {
        subject = "You're in! One Book Deep starts August 1st.";
        htmlContent = buildJamesWelcomeEmail(name, jamesDashUrl, unsubUrl, groupInviteUrl);
      } else {
        subject = "You're in! One Book Deep is underway.";
        htmlContent = buildJamesCatchupEmail(name, jamesDashUrl, unsubUrl, dayNum, groupInviteUrl);
      }
    } else if (challenge === "october-proverbs-2026") {
      const provDashUrl = `${origin}/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${dashToken}#october-proverbs-2026`;
      const dayNum = getChallengeDayFor(personalStartDate || "2026-10-01");
      subject = dayNum <= 0
        ? "Your family is in! Around the Table starts " + formatDateShort(personalStartDate || "2026-10-01") + "."
        : "Your family is in! Around the Table starts today.";
      htmlContent = buildProverbsWelcomeEmail(name, provDashUrl, unsubUrl, personalStartDate || "2026-10-01", groupInviteUrl);
    } else if (challenge === "november-thanks-2026") {
      const nDash = `${origin}/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${dashToken}#november-thanks-2026`;
      const nStart = personalStartDate || "2026-11-01";
      subject = "You are in! Give Thanks starts " + formatDateShort(nStart) + ".";
      htmlContent = buildSimpleWelcomeEmail(name, nDash, unsubUrl, groupInviteUrl, {
        badge: "GIVE THANKS",
        heading: `You are in, ${name || "friend"}!`,
        lines: [
          `Starting ${formatDateShort(nStart)}, you will get one email from me each morning with the day's psalm, a short note, and your gratitude prompt.`,
          track === "all-psalms"
            ? "You picked the full pace: five psalms a day, the entire book of Psalms in one month. It will change you."
            : "You picked one psalm a day. Five quiet minutes, and a gratitude list that grows all month.",
          "Every day you write three things you are thankful for on your dashboard. By Thanksgiving you will have ninety, and a keepsake list to print and read at the table."
        ],
        inviteFallback: "heatherlynwilson.com/challenge-thanks",
        footerName: "Give Thanks at heatherlynwilson.com"
      });
    } else if (challenge === "december-gospels-2026") {
      const gDash = `${origin}/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${dashToken}#december-gospels-2026`;
      const gStart = personalStartDate || "2026-12-01";
      subject = "You are in! God With Us starts " + formatDateShort(gStart) + ".";
      htmlContent = buildSimpleWelcomeEmail(name, gDash, unsubUrl, groupInviteUrl, {
        badge: "GOD WITH US",
        heading: `You are in, ${name || "friend"}!`,
        lines: [
          `Starting ${formatDateShort(gStart)}, you will get one email from me each morning with the day's Gospel chapters, reading links, and a short note.`,
          track === "luke"
            ? "You picked Luke: one chapter a day, and you finish the whole story of Jesus on Christmas Eve. Then we spend the last week of the year in John's upper room."
            : "You picked all four Gospels: Mark shows you what Jesus did, John tells you who He is, Matthew proves He is the promised King, and Luke lands you at the manger on Christmas Eve.",
          "About fifteen minutes a day on the full pace, five on Luke. The Scripture is the meal; my note just sets the table."
        ],
        inviteFallback: "heatherlynwilson.com/challenge-gospels",
        footerName: "God With Us at heatherlynwilson.com"
      });
    } else if (challenge === "september-beatitudes-2026") {
      // September Beatitudes memory challenge
      const beatDashUrl = `${origin}/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${dashToken}#september-beatitudes-2026`;
      const dayNum = getChallengeDayFor("2026-09-01");
      subject = dayNum === 0
        ? "You're in! Hide It In Your Heart starts September 1st."
        : "You're in! The Beatitudes challenge is underway.";
      htmlContent = buildBeatitudesWelcomeEmail(name, beatDashUrl, unsubUrl, track, groupInviteUrl);
    } else {
      // July challenge (evergreen: each user has their own start date)
      const userStartDate = personalStartDate || "2026-07-01";
      const startDayNum = getChallengeDayFor(userStartDate);
      if (startDayNum <= 0) {
        // Start date is in the future
        subject = "You are in! See you on " + formatDateShort(userStartDate) + ".";
        htmlContent = buildWelcomeEmail(name, track, dashboardUrl, unsubUrl, userStartDate, groupInviteUrl);
      } else {
        // Start date is today or in the past - treat as just-started (Day 1 begins today for them)
        subject = "You are in! Your reading starts today.";
        htmlContent = buildWelcomeEmail(name, track, dashboardUrl, unsubUrl, userStartDate, groupInviteUrl);
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
        await sendFirstDayEmail(context.env.DB, origin, context.env.BREVO_API_KEY, challenge, track, name, email, dashToken, unsubUrl, groupInviteUrl);
      } catch (e) {}
    }

    // Send group-created email with share link, code, and invite checklist
    if (!existing && createdGroupId && createdGroupInvite) {
      try {
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": context.env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { name: "Heather Lyn Wilson", email: "heather@heatherlynwilson.com" },
            to: [{ email: email, name: name }],
            subject: "Your group \"" + groupName + "\" is ready! Here is your invite link.",
            htmlContent: buildGroupCreatedEmail(name, groupName, createdGroupId, createdGroupInvite, dashboardUrl, unsubUrl),
          }),
        });
      } catch (e) {}
    }

    // No per-signup notification - Heather gets a daily digest from the cron worker
  }

  return json({ success: true, count: count, group_joined: groupJoined, group_id: createdGroupId || undefined, group_invite: createdGroupInvite || undefined, token: dashToken });
}

// Sends the Day 1 reading email right away, using the same content the daily
// worker uses: the editable challenge_emails table first, then the packaged
// JSON as a fallback. Used when someone starts today.
async function sendFirstDayEmail(db, origin, apiKey, challenge, track, name, email, dashToken, unsubUrl, groupInviteUrl) {
  if (!apiKey) return;
  let contentUrl, hash, total, footer, invite, plan;
  if (challenge === "october-proverbs-2026") {
    plan = "proverbs";
    contentUrl = origin + "/challenge/emails-proverbs.json"; hash = "#october-proverbs-2026"; total = 31;
    footer = "Around the Table"; invite = "heatherlynwilson.com/challenge-proverbs";
  } else if (challenge === "august-james-2026") {
    plan = "james";
    contentUrl = origin + "/challenge/emails-james-prayer.json"; hash = "#august-james-2026"; total = 31;
    footer = "the One Book Deep challenge"; invite = "heatherlynwilson.com/challenge-james";
  } else if (challenge === "september-beatitudes-2026") {
    plan = "beatitudes";
    contentUrl = origin + "/challenge/emails-beatitudes.json"; hash = "#september-beatitudes-2026"; total = 30;
    footer = "the Hide It In Your Heart challenge"; invite = "heatherlynwilson.com/challenge-beatitudes";
  } else if (challenge === "november-thanks-2026") {
    plan = track === "all-psalms" ? "psalms-150" : "thanks";
    contentUrl = origin + "/challenge/emails-" + plan + ".json"; hash = "#november-thanks-2026"; total = 30;
    footer = "the Give Thanks challenge"; invite = "heatherlynwilson.com/challenge-thanks";
  } else if (challenge === "december-gospels-2026") {
    plan = track === "luke" ? "luke" : "gospels";
    contentUrl = origin + "/challenge/emails-" + plan + ".json"; hash = "#december-gospels-2026"; total = 31;
    footer = "the God With Us challenge"; invite = "heatherlynwilson.com/challenge-gospels";
  } else {
    plan = ["new-testament", "chronological", "bible-90", "chrono-90", "ot-90", "nt-90"].includes(track) ? track : "full-bible";
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
  if (challenge === "october-proverbs-2026") {
    subject = d.subject || "Day 1: Around the Table";
    heading = (d.reading || "Proverbs 1") + (d.title ? " - " + d.title : "");
    body = composeProverbsBody(d);
  } else if (challenge === "september-beatitudes-2026") {
    subject = "Day 1: " + (d.title || "The Beatitudes");
    heading = d.title || "The Beatitudes";
    body = (d.body || "") + (d.practice ? "\n\nToday: " + d.practice : "");
  } else if (challenge === "november-thanks-2026") {
    subject = d.subject || "Day 1: Give Thanks";
    heading = d.reading || "Psalm 1";
    body = (d.body || "").replace("Good morning.", "Good morning, " + name + ".");
    const pr = d.prompt || d.practice || "";
    if (pr) body += "\n\nToday's list: " + pr;
  } else {
    subject = d.subject || "Day 1";
    heading = d.reading || "Day 1";
    body = (d.body || "").replace("Good morning.", "Good morning, " + name + ".");
  }

  const dashUrl = origin + "/challenge/dashboard.html?email=" + encodeURIComponent(email) + "&token=" + dashToken + hash;
  const actualInvite = groupInviteUrl || ("https://" + invite);
  const html = buildDayOneEmail(heading, body, dashUrl, footer, actualInvite, unsubUrl);

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
<p style="margin:0;font-size:14px;color:#6b7280;font-family:-apple-system,sans-serif;">${invite.includes('group=') ? 'Invite friends to join your group:' : 'Know someone who would want to join?'} <a href="${invite}" style="color:#b85638;">${invite.replace('https://', '')}</a></p></td></tr>
<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;">You are receiving this because you signed up for ${footer}.${unsubUrl ? '<br><a href="' + unsubUrl + '" style="color:#6b7280;">Choose which emails you get</a>' : ""}</p></td></tr>
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

function buildJamesWelcomeEmail(name, dashboardUrl, unsubUrl, groupInviteUrl) {
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
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">${groupInviteUrl ? "Invite friends to join your group:" : "Know someone who should do this?"}</p>
<p style="margin:0;"><a href="${groupInviteUrl || "https://heatherlynwilson.com/challenge-james"}" style="color:#b85638;font-size:16px;font-family:-apple-system,sans-serif;font-weight:600;">${groupInviteUrl ? groupInviteUrl.replace("https://", "") : "heatherlynwilson.com/challenge-james"}</a></p>
</td></tr>

<tr><td style="padding:0 32px 28px;">
<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">See you August 1st.</p>
<p style="margin:12px 0 0;font-size:18px;color:#1f2937;font-style:italic;font-family:Georgia,serif;">Heather</p>
</td></tr>

<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for the One Book Deep challenge at heatherlynwilson.com. You will also get my blog posts a few mornings a week; you can keep the challenge emails and skip the blog any time.${unsubUrl ? `<br><a href="${unsubUrl}" style="color:#6b7280;">Choose which emails you get</a>` : ""}
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildJamesCatchupEmail(name, dashboardUrl, unsubUrl, dayNum, groupInviteUrl) {
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
You are receiving this because you signed up for the One Book Deep challenge at heatherlynwilson.com. You will also get my blog posts a few mornings a week; you can keep the challenge emails and skip the blog any time.${unsubUrl ? `<br><a href="${unsubUrl}" style="color:#6b7280;">Choose which emails you get</a>` : ""}
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
  const trackLabel = track === "bible-90" ? "Whole Bible, 3 months" : track === "chrono-90" ? "Chronological, 3 months" : track === "ot-90" ? "Old Testament, 3 months" : track === "nt-90" ? "New Testament, 3 months" : track === "chronological" ? "Chronological, 31 days" : track === "new-testament" ? "New Testament, 31 days" : "Whole Bible, 31 days";

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
You are receiving this because you signed up for the July Bible Challenge at heatherlynwilson.com. You will also get my blog posts a few mornings a week; you can keep the challenge emails and skip the blog any time.${unsubUrl ? `<br><a href="${unsubUrl}" style="color:#6b7280;">Choose which emails you get</a>` : ""}
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// Turn a structured Around the Table day into email body text
function composeProverbsBody(d) {
  // DB rows carry the questions in prayer_focus/prayer_verse (one per line),
  // the family challenge in focus, and the tip in practice.
  const qy = d.q_young ? d.q_young : (d.prayer_focus ? d.prayer_focus.split("\n") : []);
  const qt = d.q_teen ? d.q_teen : (d.prayer_verse ? d.prayer_verse.split("\n") : []);
  const fam = d.family_challenge || d.focus || "";
  const tip = d.tip || d.practice || "";
  const littles = d.littles || d.verse_ref || "";
  let out = "The big idea: " + (d.title || "") + "\n\n" + (d.body || "");
  if (littles) out = "Reading with little ones? Read just " + littles + " out loud. Proverbs talks honestly about grown-up things, so this keeps the reading age right. Older kids and parents read the whole chapter.\n\n" + out;
  if (qy.length) out += "\n\nFor ages 5 to 10:\n" + qy.map(q => "\u2022 " + q).join("\n");
  if (qt.length) out += "\n\nFor ages 11 to 17:\n" + qt.map(q => "\u2022 " + q).join("\n");
  if (fam) out += "\n\nFamily challenge: " + fam;
  if (tip) out += "\n\nReal life tip: " + tip;
  return out;
}

// Compact welcome email used by the newer challenges. Copy comes in as
// {badge, heading, lines[], inviteFallback, footerName}.
function buildSimpleWelcomeEmail(name, dashboardUrl, unsubUrl, groupInviteUrl, o) {
  const paras = o.lines.map(l =>
    `<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">${l}</p>`
  ).join("\n");
  const inviteLine = groupInviteUrl
    ? `<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Invite friends to join your group:</p><p style="margin:0;"><a href="${groupInviteUrl}" style="color:#b85638;font-size:16px;font-family:-apple-system,sans-serif;font-weight:600;">${groupInviteUrl.replace("https://", "")}</a></p>`
    : `<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Know someone who should do this with you?</p><p style="margin:0;"><a href="https://${o.inviteFallback}" style="color:#b85638;font-size:16px;font-family:-apple-system,sans-serif;font-weight:600;">${o.inviteFallback}</a></p>`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;"><tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1f2937;padding:28px 32px;">
<span style="color:#ffffff;font-size:20px;font-family:Georgia,serif;letter-spacing:0.5px;">HeatherLynWilson.com</span>
<span style="float:right;color:#c8a365;font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;padding-top:4px;">${o.badge}</span>
</td></tr>
<tr><td style="padding:36px 32px 12px;">
<h1 style="margin:0 0 16px;font-size:24px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;">${o.heading}</h1>
${paras}
</td></tr>
<tr><td style="padding:0 32px 28px;" align="center">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Bookmark your dashboard:</p>
<a href="${dashboardUrl}" style="display:inline-block;padding:16px 36px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Open My Dashboard</a>
</td></tr>
<tr><td style="padding:0 32px 28px;">${inviteLine}</td></tr>
<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for ${o.footerName}. You will also get my blog posts a few mornings a week; you can keep the challenge emails and skip the blog any time.${unsubUrl ? ` <a href="${unsubUrl}" style="color:#6b7280;">Choose which emails you get</a>.` : ""}
</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

function buildProverbsWelcomeEmail(name, dashboardUrl, unsubUrl, startDate, groupInviteUrl) {
  const greeting = name || "friend";
  return `<!DOCTYPE html><html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1f2937;padding:28px 32px;">
<span style="color:#ffffff;font-size:20px;font-family:Georgia,serif;letter-spacing:0.5px;">HeatherLynWilson.com</span>
<span style="float:right;color:#c8a365;font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;padding-top:4px;">AROUND THE TABLE</span>
</td></tr>
<tr><td style="padding:36px 32px 12px;">
<h1 style="margin:0 0 16px;font-size:24px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;">Your family is in, ${greeting}!</h1>
<p style="margin:0 0 20px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Starting ${formatDateShort(startDate)}, you will get one email from me each morning with everything your family needs for the day:</p>
<p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; The day's Proverbs chapter and one big idea</p>
<p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; Questions for kids 5 to 10 and 11 to 17</p>
<p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; One small family challenge</p>
<p style="margin:0 0 20px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; A real-life tip, because families are busy</p>
<p style="margin:0 0 20px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">And hear me on this: no table required. Do it at breakfast, at dinner, or in the car on the way to practice. Let a kid read the verses out loud, or play the chapter on the Bible app while you drive. Ten minutes of real conversation counts, wherever it happens.</p>
<p style="margin:0 0 20px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">One more thing, parents of little ones: Proverbs is honest about grown-up things, and some chapters are not meant for a five year old to hear straight through. So every daily email includes a short "with little ones" reading, a few verses picked for young ears. Read those out loud with the littles, and save the full chapter for yourself and the teens.</p>
</td></tr>
<tr><td style="padding:0 32px 28px;" align="center">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Bookmark your family dashboard:</p>
<a href="${dashboardUrl}" style="display:inline-block;padding:16px 36px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Open Our Dashboard</a>
</td></tr>
<tr><td style="padding:0 32px 28px;">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">${groupInviteUrl ? "Invite friends to join your group:" : "Know another family who should do this?"}</p>
<p style="margin:0;"><a href="${groupInviteUrl || "https://heatherlynwilson.com/challenge-proverbs"}" style="color:#b85638;font-size:16px;font-family:-apple-system,sans-serif;font-weight:600;">${groupInviteUrl ? groupInviteUrl.replace("https://", "") : "heatherlynwilson.com/challenge-proverbs"}</a></p>
</td></tr>
<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for Around the Table at heatherlynwilson.com. You will also get my blog posts a few mornings a week; you can keep the challenge emails and skip the blog any time.${unsubUrl ? ` <a href="${unsubUrl}" style="color:#6b7280;">Choose which emails you get</a>.` : ""}
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

function buildBeatitudesWelcomeEmail(name, dashboardUrl, unsubUrl, translation, groupInviteUrl) {
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
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">${groupInviteUrl ? "Invite friends to join your group:" : "Know someone who should do this?"}</p>
<p style="margin:0;"><a href="${groupInviteUrl || "https://heatherlynwilson.com/challenge-beatitudes"}" style="color:#b85638;font-size:16px;font-family:-apple-system,sans-serif;font-weight:600;">${groupInviteUrl ? groupInviteUrl.replace("https://", "") : "heatherlynwilson.com/challenge-beatitudes"}</a></p>
</td></tr>

<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for the Beatitudes challenge at heatherlynwilson.com. You will also get my blog posts a few mornings a week; you can keep the challenge emails and skip the blog any time.${unsubUrl ? ` <a href="${unsubUrl}" style="color:#6b7280;">Choose which emails you get</a>.` : ""}
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildWelcomeEmail(name, track, dashboardUrl, unsubUrl, startDate, groupInviteUrl) {
  const isWeekly = String(track || "").endsWith("-90");
  const cadenceBlock = isWeekly
    ? `<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Starting ${formatDateShort(startDate || "2026-07-01")}, you will get one email from me at the start of each week with:</p>
<p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; The week's reading plan, about 45 minutes a day</p>
<p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; A short encouragement from me</p>
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; Your dashboard shows each day's exact chapters and tracks your progress</p>`
    : `<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Starting ${formatDateShort(startDate || "2026-07-01")}, you will get an email from me every morning at 6am Eastern with:</p>
<p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; That day's reading assignment</p>
<p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; A short encouragement from me</p>
<p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; A link to check off your reading for the day</p>
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#8226; How many people are reading alongside you</p>`;
  const trackLabel = track === "bible-90" ? "The Whole Bible in 3 Months" : track === "chrono-90" ? "The Whole Bible in 3 Months, Chronological" : track === "ot-90" ? "The Old Testament in 3 Months" : track === "nt-90" ? "The New Testament in 3 Months" : track === "chronological" ? "The Whole Bible in 31 Days, Chronological" : track === "new-testament" ? "The New Testament in 31 Days" : "The Full Bible in 31 Days";
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
${cadenceBlock}
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
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">${groupInviteUrl ? "Invite friends to join your group:" : "Know someone who would want to read along? Send them:"}</p>
<p style="margin:0;"><a href="${groupInviteUrl || "https://heatherlynwilson.com/challenge"}" style="color:#b85638;font-size:16px;font-family:-apple-system,sans-serif;font-weight:600;">${groupInviteUrl ? groupInviteUrl.replace("https://", "") : "heatherlynwilson.com/challenge"}</a></p>
</td></tr>

<tr><td style="padding:0 32px 28px;">
<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">See you ${startDisplay}.</p>
<p style="margin:12px 0 0;font-size:18px;color:#1f2937;font-style:italic;font-family:Georgia,serif;">Heather</p>
</td></tr>

<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for the July Bible Challenge at heatherlynwilson.com. You will also get my blog posts a few mornings a week; you can keep the challenge emails and skip the blog any time.${unsubUrl ? `<br><a href="${unsubUrl}" style="color:#6b7280;">Choose which emails you get</a>` : ""}
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// Notify existing group members when someone new joins
// Joining a group means joining its calendar: the member's start date is
// set to the group creator's so the whole group reads the same day.
// Returns the synced date, or null if there was nothing to sync.
async function syncStartToGroupCreator(env, groupId, memberEmail) {
  const group = await env.DB.prepare(
    "SELECT challenge, created_by_email FROM challenge_groups WHERE id = ?"
  ).bind(groupId).first();
  if (!group || group.created_by_email === memberEmail) return null;
  const cs = await env.DB.prepare(
    "SELECT personal_start_date FROM challenge_signups WHERE email = ? AND challenge = ?"
  ).bind(group.created_by_email, group.challenge).first();
  if (!cs || !cs.personal_start_date) return null;
  await env.DB.prepare(
    "UPDATE challenge_signups SET personal_start_date = ? WHERE email = ? AND challenge = ?"
  ).bind(cs.personal_start_date, memberEmail, group.challenge).run();
  return cs.personal_start_date;
}

async function notifyGroupJoin(env, groupId, newMemberName, newMemberEmail) {
  const group = await env.DB.prepare(
    "SELECT name, created_by_email FROM challenge_groups WHERE id = ?"
  ).bind(groupId).first();
  if (!group) return;

  // Only notify the group creator
  const creator = await env.DB.prepare(
    "SELECT email, name, notify_digest FROM group_members WHERE group_id = ? AND email = ?"
  ).bind(groupId, group.created_by_email).first();
  if (!creator || creator.email === newMemberEmail) return;

  // If creator chose daily digest, skip instant notification (cron handles it)
  if (creator.notify_digest) return;

  // Honor the creator's group-notification preference
  try {
    const pref = await env.DB.prepare(
      "SELECT group_optout FROM email_prefs WHERE email = ?"
    ).bind(creator.email).first();
    if (pref && pref.group_optout) return;
  } catch (e) {}

  const secret = env.NOTIFY_SECRET || "challenge-secret";
  const dashToken = await hmacHex(secret, creator.email + ":challenge:2026-10-01");
  const dashUrl = "https://heatherlynwilson.com/challenge/dashboard.html?email=" + encodeURIComponent(creator.email) + "&token=" + dashToken;
  const digestUrl = "https://heatherlynwilson.com/api/group-notify?email=" + encodeURIComponent(creator.email) + "&token=" + dashToken + "&group=" + groupId + "&mode=digest";
  try {
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: "Heather Lyn Wilson", email: "heather@heatherlynwilson.com" },
        to: [{ email: creator.email, name: creator.name || "friend" }],
        subject: newMemberName + " just joined your group!",
        htmlContent: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;"><tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1f2937;padding:28px 32px;"><span style="color:#fff;font-size:20px;font-family:Georgia,serif;">HeatherLynWilson.com</span></td></tr>
<tr><td style="padding:36px 32px 24px;">
<p style="margin:0 0 16px;font-size:20px;color:#1f2937;font-weight:600;font-family:Georgia,serif;">${newMemberName} joined "${group.name}"!</p>
<p style="margin:0 0 20px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Your group is growing. Open your dashboard to see who is reading with you.</p>
</td></tr>
<tr><td style="padding:0 32px 32px;" align="center">
<a href="${dashUrl}" style="display:inline-block;padding:14px 32px;background:#b85638;color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">See Your Group</a>
</td></tr>
<tr><td style="padding:12px 32px 24px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;">Getting too many of these? <a href="${digestUrl}" style="color:#b85638;">Switch to a daily digest</a> instead.</p>
</td></tr>
</table></td></tr></table></body></html>`,
      }),
    });
  } catch (e) {}
}

function buildGroupCreatedEmail(name, groupName, groupCode, inviteUrl, dashUrl, unsubUrl) {
  const greeting = name || "friend";
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
'<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,\'Times New Roman\',serif;">' +
'<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;"><tr><td align="center">' +
'<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">' +

'<tr><td style="background:#1f2937;padding:28px 32px;">' +
'<span style="color:#ffffff;font-size:20px;font-family:Georgia,serif;letter-spacing:0.5px;">HeatherLynWilson.com</span>' +
'<span style="float:right;color:#c8a365;font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;padding-top:4px;">DO IT WITH FRIENDS</span>' +
'</td></tr>' +

'<tr><td style="padding:36px 32px 12px;">' +
'<h1 style="margin:0 0 16px;font-size:24px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;">Your group is ready, ' + greeting + '!</h1>' +
'<p style="margin:0 0 20px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">I love that you want to do this with people. Reading together changes everything. When someone else is counting on you to show up, you show up. And when you talk about what you are reading, it sticks.</p>' +
'</td></tr>' +

'<tr><td style="padding:0 32px 24px;">' +
'<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ef;border-radius:6px;">' +
'<tr><td style="padding:24px;">' +
'<p style="margin:0 0 6px;font-size:12px;color:#b85638;font-family:-apple-system,sans-serif;font-weight:600;letter-spacing:1px;text-transform:uppercase;">YOUR GROUP</p>' +
'<p style="margin:0 0 16px;font-size:18px;color:#1f2937;font-family:Georgia,serif;font-weight:600;">' + groupName + '</p>' +
'<p style="margin:0 0 6px;font-size:12px;color:#b85638;font-family:-apple-system,sans-serif;font-weight:600;letter-spacing:1px;text-transform:uppercase;">SHARE LINK</p>' +
'<p style="margin:0 0 16px;font-size:16px;font-family:-apple-system,sans-serif;"><a href="' + inviteUrl + '" style="color:#b85638;font-weight:600;word-break:break-all;">' + inviteUrl.replace('https://', '') + '</a></p>' +
'<p style="margin:0 0 6px;font-size:12px;color:#b85638;font-family:-apple-system,sans-serif;font-weight:600;letter-spacing:1px;text-transform:uppercase;">GROUP CODE</p>' +
'<p style="margin:0;font-size:22px;color:#1f2937;font-family:monospace;font-weight:700;letter-spacing:2px;">' + groupCode + '</p>' +
'</td></tr></table>' +
'</td></tr>' +

'<tr><td style="padding:0 32px 28px;">' +
'<p style="margin:0 0 16px;font-size:16px;color:#1f2937;line-height:1.7;font-family:-apple-system,sans-serif;font-weight:600;">Ways to invite people:</p>' +
'<table width="100%" cellpadding="0" cellspacing="0">' +
'<tr><td style="padding:6px 0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#9745; Text your share link to a friend right now</td></tr>' +
'<tr><td style="padding:6px 0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#9745; Drop it in your small group or Bible study chat</td></tr>' +
'<tr><td style="padding:6px 0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#9745; Post it on your Instagram story</td></tr>' +
'<tr><td style="padding:6px 0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#9745; Share it on Facebook with a personal note</td></tr>' +
'<tr><td style="padding:6px 0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#9745; Email it to that one person who came to mind just now</td></tr>' +
'<tr><td style="padding:6px 0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#9745; Tell your spouse, your sister, your neighbor</td></tr>' +
'</table>' +
'</td></tr>' +

'<tr><td style="padding:0 32px 28px;">' +
'<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">When they click your link, they will land on the signup page with your group name at the top. They sign up, and they are in. You will get an email when each person joins.</p>' +
'<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">If someone is already signed up, they can join from their dashboard by entering your group code: <strong style="font-family:monospace;letter-spacing:1px;">' + groupCode + '</strong></p>' +
'</td></tr>' +

'<tr><td style="padding:0 32px 28px;" align="center">' +
'<a href="' + dashUrl + '" style="display:inline-block;padding:16px 36px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Go to My Dashboard</a>' +
'</td></tr>' +

'<tr><td style="padding:0 32px 28px;">' +
'<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Go get your people.</p>' +
'<p style="margin:12px 0 0;font-size:18px;color:#1f2937;font-style:italic;font-family:Georgia,serif;">Heather</p>' +
'</td></tr>' +

'<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">' +
'<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">' +
'You are receiving this because you created a group at heatherlynwilson.com.' +
(unsubUrl ? ' <a href="' + unsubUrl + '" style="color:#6b7280;">Choose which emails you get</a>.' : '') +
'</p></td></tr>' +

'</table></td></tr></table></body></html>';
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
