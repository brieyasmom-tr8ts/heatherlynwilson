/**
 * HeatherLynWilson.com Daily Cron Worker
 *
 * Two crons so blog and challenge emails don't arrive at the same time:
 *   "5 10 * * *" (6:05am ET) — challenge daily emails + special emails
 *   "5 12 * * *" (8:05am ET) — blog publish dispatch + traffic digest
 *
 * Secrets (set via `wrangler secret put`):
 *   GITHUB_TOKEN   – fine-grained PAT with Actions write on the repo
 *   BREVO_API_KEY  – Brevo transactional email API key
 *   NOTIFY_SECRET  – HMAC secret for generating dashboard links
 *
 * Bindings:
 *   DB – D1 database (blog-engagement)
 */

const REPO = "brieyasmom-tr8ts/heatherlynwilson";
const WORKFLOW = "publish-blog.yml";
const CHALLENGE = "july-2026";
const SITE = "https://heatherlynwilson.com";

export default {
  async fetch(request, env) {
    return new Response("", { status: 200 });
  },
  async scheduled(event, env) {
    if (event.cron === "5 10 * * *") {
      // 6:05am ET — challenge emails
      await sendChallengeEmails(env);
      await sendSpecialEmails(env);
    } else {
      // 8:05am ET — blog publish + traffic digest
      await dispatchBlog(env);
      await sendTrafficDigest(env);
    }
  },
};

// ─── Blog Dispatch ───────────────────────────────────────────────────────────

async function dispatchBlog(env) {
  if (!env.GITHUB_TOKEN) {
    console.log("No GITHUB_TOKEN, skipping blog dispatch.");
    return;
  }
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "blog-publish-cron",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );
  if (res.ok) {
    console.log("Blog workflow dispatched.");
  } else {
    const text = await res.text();
    console.error(`Blog dispatch failed ${res.status}: ${text}`);
  }
}

// ─── Challenge Emails ────────────────────────────────────────────────────────

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// One config per challenge. The same engine sends all of them: for each
// signed-up person it computes their personal day from their own start date
// and sends that day's email. Content for James and the Beatitudes is fetched
// from the JSON files on the site so there is one source of truth.
const CHALLENGE_CONFIGS = [
  { id: "july-2026", total: 31, official: "2026-07-01", hash: "", invite: SITE + "/challenge", footer: "the Bible Challenge" },
  { id: "august-james-2026", total: 31, official: "2026-08-01", hash: "#august-james-2026", invite: SITE + "/challenge-james", footer: "the One Book Deep challenge", contentUrl: SITE + "/challenge/emails-james-prayer.json" },
  { id: "september-beatitudes-2026", total: 30, official: "2026-09-01", hash: "#september-beatitudes-2026", invite: SITE + "/challenge-beatitudes", footer: "the Hide It In Your Heart challenge", contentUrl: SITE + "/challenge/emails-beatitudes.json" },
];

async function fetchJsonSafe(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "hlw-cron" } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

async function sendChallengeEmails(env) {
  if (!env.BREVO_API_KEY || !env.DB) {
    console.log("No BREVO_API_KEY or DB, skipping challenge emails.");
    return;
  }
  const now = new Date();
  const easternDate = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const todayDate = new Date(easternDate + "T00:00:00");

  for (const cfg of CHALLENGE_CONFIGS) {
    try {
      await sendOneChallenge(env, cfg, todayDate);
    } catch (e) {
      console.error(`Challenge send failed for ${cfg.id}:`, e.message);
    }
  }
}

async function sendOneChallenge(env, cfg, todayDate) {
  let results;
  try {
    const q = await env.DB.prepare(
      "SELECT name, email, track, personal_start_date FROM challenge_signups WHERE challenge = ?"
    ).bind(cfg.id).all();
    results = q.results || [];
  } catch (e) {
    console.error(`Could not query signups for ${cfg.id}:`, e.message);
    return;
  }
  if (!results.length) return;

  // Community count for this challenge
  let communityCount = 0;
  try {
    const row = await env.DB.prepare(
      "SELECT COUNT(DISTINCT email) as cnt FROM challenge_checkins WHERE challenge = ?"
    ).bind(cfg.id).first();
    communityCount = row ? row.cnt : 0;
  } catch (e) {}

  // Load content for challenges whose emails live in JSON on the site
  let content = null;
  if (cfg.contentUrl) {
    content = await fetchJsonSafe(cfg.contentUrl);
    if (!content) { console.error(`No content for ${cfg.id}, skipping.`); return; }
  }

  const secret = env.NOTIFY_SECRET || "challenge-secret";
  const validUntil = "2026-10-01";
  let sent = 0, errors = 0, due = 0;

  for (let i = 0; i < results.length; i += 10) {
    const batch = results.slice(i, i + 10);
    const promises = batch.map(async (user) => {
      const startStr = user.personal_start_date || cfg.official;
      const userStart = new Date(startStr + "T00:00:00");
      const diffMs = todayDate - userStart;
      const personalDay = diffMs < 0 ? 0 : Math.floor(diffMs / 86400000) + 1;
      if (personalDay < 1 || personalDay > cfg.total) return;
      due++;

      const name = user.name || "friend";
      const email = user.email;
      const dashToken = await hmacHex(secret, email + ":challenge:" + validUntil);
      const dashboardUrl = `${SITE}/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${dashToken}${cfg.hash}`;
      const unsubToken = await hmacHex(secret, email);
      const unsubUrl = `${SITE}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubToken}`;

      let subject, htmlContent;

      if (cfg.id === "july-2026") {
        const emails = (user.track === "new-testament") ? EMAILS_NT : EMAILS_FB;
        const d = emails[personalDay - 1];
        if (!d) return;
        subject = d.subject;
        const bodyText = d.body.replace("Good morning.", `Good morning, ${name}.`);
        htmlContent = buildEmailHtml(personalDay, d.reading, bodyText, dashboardUrl, communityCount, unsubUrl);
      } else if (cfg.id === "august-james-2026") {
        const d = content[personalDay - 1];
        if (!d) return;
        subject = d.subject || ("Day " + personalDay + ": James");
        let body = d.body.replace("Good morning.", `Good morning, ${name}.`);
        const heading = d.reading || "James 1-5";
        const eyebrow = d.prayer_focus ? ("Prayer focus: " + d.prayer_focus) : "Today's reading";
        htmlContent = buildChallengeEmail({ dayNum: personalDay, total: cfg.total, eyebrow, heading, body, dashboardUrl, communityCount, invite: cfg.invite, footer: cfg.footer, unsubUrl });
      } else if (cfg.id === "september-beatitudes-2026") {
        const d = content[personalDay - 1];
        if (!d) return;
        subject = "Day " + personalDay + ": " + (d.title || "The Beatitudes");
        let body = (d.body || "");
        if (d.practice) body += "\n\nToday: " + d.practice;
        htmlContent = buildChallengeEmail({ dayNum: personalDay, total: cfg.total, eyebrow: d.focus || "Today", heading: d.title || "The Beatitudes", body, dashboardUrl, communityCount, invite: cfg.invite, footer: cfg.footer, unsubUrl });
      } else {
        return;
      }

      try {
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { name: "Heather Lyn Wilson", email: "heather@heatherlynwilson.com" },
            to: [{ email, name }],
            subject,
            htmlContent,
          }),
        });
        if (res.ok) sent++;
        else { errors++; console.error(`Failed ${email} (${cfg.id}): ${res.status}`); }
      } catch (e) { errors++; }
    });
    await Promise.allSettled(promises);
  }

  console.log(`${cfg.id}: ${results.length} signups, ${due} due today, sent ${sent}, errors ${errors}.`);
}

// Generic challenge email used by James and the Beatitudes.
function buildChallengeEmail({ dayNum, total, eyebrow, heading, body, dashboardUrl, communityCount, invite, footer, unsubUrl }) {
  const paragraphs = body.split("\n\n").map(p => {
    if (p === "Heather" || p.startsWith("With love,")) {
      return `<p style="margin:12px 0 0;font-size:18px;color:#1f2937;font-style:italic;font-family:Georgia,serif;">${p.replace("\n", "<br>")}</p>`;
    }
    return `<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">${p}</p>`;
  }).join("\n");

  const communityBlock = communityCount > 0
    ? `<tr><td style="padding:0 32px 24px;text-align:center;"><p style="margin:0;font-size:14px;color:#6b7280;font-family:-apple-system,sans-serif;">${communityCount} ${communityCount === 1 ? "person is" : "people are"} doing this alongside you.</p></td></tr>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1f2937;padding:28px 32px;">
<span style="color:#ffffff;font-size:20px;font-family:Georgia,serif;">HeatherLynWilson.com</span>
<span style="float:right;color:#c8a365;font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;padding-top:4px;">DAY ${dayNum} OF ${total}</span>
</td></tr>
<tr><td style="padding:28px 32px 8px;">
<p style="margin:0 0 4px;font-size:12px;color:#b85638;font-family:-apple-system,sans-serif;font-weight:600;letter-spacing:1px;text-transform:uppercase;">${eyebrow}</p>
<p style="margin:0 0 20px;font-size:22px;color:#1f2937;font-family:Georgia,serif;font-weight:600;">${heading}</p>
</td></tr>
<tr><td style="padding:0 32px 24px;">${paragraphs}</td></tr>
<tr><td style="padding:0 32px 28px;" align="center">
<a href="${dashboardUrl}" style="display:inline-block;padding:14px 32px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Go to My Dashboard</a>
</td></tr>
${communityBlock}
<tr><td style="padding:0 32px 24px;text-align:center;">
<p style="margin:0;font-size:14px;color:#6b7280;font-family:-apple-system,sans-serif;">Know someone who would want to join? <a href="${invite}" style="color:#b85638;">${invite.replace("https://", "")}</a></p>
</td></tr>
<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for ${footer}.${unsubUrl ? `<br><a href="${unsubUrl}" style="color:#6b7280;">Unsubscribe</a>` : ""}</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

function buildEmailHtml(dayNum, reading, body, dashboardUrl, communityCount, unsubUrl) {
  const paragraphs = body.split("\n\n").map(p => {
    if (p === "Heather" || p.startsWith("With love,")) {
      return `<p style="margin:12px 0 0;font-size:18px;color:#1f2937;font-style:italic;font-family:Georgia,serif;">${p.replace("\n", "<br>")}</p>`;
    }
    return `<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">${p}</p>`;
  }).join("\n");

  const communityBlock = communityCount > 0
    ? `<tr><td style="padding:0 32px 24px;text-align:center;"><p style="margin:0;font-size:14px;color:#6b7280;font-family:-apple-system,sans-serif;">${communityCount} ${communityCount === 1 ? "person is" : "people are"} reading along with you.</p></td></tr>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1f2937;padding:28px 32px;">
<span style="color:#ffffff;font-size:20px;font-family:Georgia,serif;">HeatherLynWilson.com</span>
<span style="float:right;color:#c8a365;font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;padding-top:4px;">DAY ${dayNum} OF 31</span>
</td></tr>
<tr><td style="padding:28px 32px 8px;">
<p style="margin:0 0 4px;font-size:12px;color:#b85638;font-family:-apple-system,sans-serif;font-weight:600;letter-spacing:1px;text-transform:uppercase;">TODAY'S READING</p>
<p style="margin:0 0 20px;font-size:22px;color:#1f2937;font-family:Georgia,serif;font-weight:600;">${reading}</p>
</td></tr>
<tr><td style="padding:0 32px 24px;">${paragraphs}</td></tr>
<tr><td style="padding:0 32px 28px;" align="center">
<a href="${dashboardUrl}" style="display:inline-block;padding:14px 32px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Go to My Dashboard</a>
</td></tr>
<tr><td style="padding:0 32px 24px;">
<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e0d5;border-radius:6px;overflow:hidden;">
<tr><td style="padding:16px 20px;background:#f7f4ee;">
<p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#1f2937;font-family:-apple-system,sans-serif;letter-spacing:0.3px;">YOUR DASHBOARD</p>
<p style="margin:0 0 8px;font-size:14px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">&#x2713; &nbsp;<a href="${dashboardUrl}" style="color:#b85638;text-decoration:none;">Track your reading</a> — check off what you finished today</p>
<p style="margin:0 0 8px;font-size:14px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">&#x270F; &nbsp;<a href="${dashboardUrl}" style="color:#b85638;text-decoration:none;">Share a reflection</a> — what stood out to you today</p>
<p style="margin:0;font-size:14px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">&#x1F64F; &nbsp;<a href="${dashboardUrl}" style="color:#b85638;text-decoration:none;">Post a prayer request</a> — the group is praying</p>
</td></tr>
</table>
</td></tr>
${communityBlock}
<tr><td style="padding:0 32px 24px;text-align:center;">
<p style="margin:0;font-size:14px;color:#6b7280;font-family:-apple-system,sans-serif;">Know someone who would want to read along? <a href="${SITE}/challenge" style="color:#b85638;">heatherlynwilson.com/challenge</a></p>
</td></tr>
<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for the July Bible Challenge.${unsubUrl ? `<br><a href="${unsubUrl}" style="color:#6b7280;">Unsubscribe</a>` : ""}</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

// ─── Special Emails (pre-launch + post-challenge) ────────────────────────────

const SPECIAL_EMAILS = {
  "2026-06-24": {
    subject: "One week until we start reading together",
    body: "Good morning, {{name}}.\n\nOne week from today, we start.\n\nJuly 1st. Your first email from me arrives at 6am. Your reading plan is ready. Your dashboard is waiting.\n\nHere are three things you can do this week to set yourself up:\n\n1. Block out your reading time. Morning works best for most people. Before the day takes over.\n\n2. Tell someone you are doing this. A friend. Your spouse. Your small group. Accountability changes everything.\n\n3. Open your dashboard and look at the full reading plan. Know what is coming. No surprises.\n\nI am doing this alongside you. Not as someone who has it all figured out. As someone who knows what it is like to sit down with the Bible and let it change you.\n\nSee you July 1st.\n\nHeather"
  },
  "2026-06-26": {
    subject: "Did you peek at your dashboard yet?",
    body: "Good morning, {{name}}.\n\nFive days from today.\n\nIf you have not opened your dashboard yet, please do today. The link is at the bottom of this email. It is the home base for the whole challenge, and there are a few things there I want you to see before we start.\n\nThere is a countdown clock so you can feel it getting closer.\n\nThere is a five-item Get Ready checklist. Pick your Bible. Set your alarm. Pick your spot. Things you can knock out in a few minutes. Each one matters when day one shows up.\n\nThere is the free guide I wrote about reading the Bible in a month. The mistakes I made and the tips that actually worked. Reading it now will save you days of frustration in July.\n\nAnd there is a prayer wall. It is anonymous. If something is weighing on you as you head into this month, share it there. Other readers can pray for it. You can pray for theirs. We are walking into this together.\n\nHit the button below and look around.\n\nHeather"
  },
  "2026-06-27": {
    subject: "Did you peek at your dashboard yet?",
    body: "Good morning, {{name}}.\n\nFour days from today.\n\nIf you have not opened your dashboard yet, please do today. The link is at the bottom of this email. It is the home base for the whole challenge, and there are a few things there I want you to see before we start.\n\nThere is a countdown clock so you can feel it getting closer.\n\nThere is a five-item Get Ready checklist. Pick your Bible. Set your alarm. Pick your spot. Things you can knock out in a few minutes. Each one matters when day one shows up.\n\nThere is the free guide I wrote about reading the Bible in a month. The mistakes I made and the tips that actually worked. Reading it now will save you days of frustration in July.\n\nAnd there is a prayer wall. It is anonymous. If something is weighing on you as you head into this month, share it there. Other readers can pray for it. You can pray for theirs. We are walking into this together.\n\nHit the button below and look around.\n\nHeather"
  },
  "2026-06-28": {
    subject: "There is still room for one more",
    body: "Good morning, {{name}}.\n\nThree days from today.\n\nI want to ask you one thing this morning. Is there someone in your life who would be glad to do this with you?\n\nA sister. A friend at work. Someone from your small group. Your daughter. Your mom. Your husband. Someone who has been telling you they want to read the Bible more but does not know where to start.\n\nThis is the moment to invite them.\n\nThe whole challenge is built so that doing it with someone makes it easier to finish. You will text each other on the hard days. You will compare what stood out. You will pray for each other when life is heavy.\n\nOpen your dashboard. There are share buttons that will copy a ready-to-send caption to your clipboard. Send it in a text. Post it. Whatever feels natural.\n\nOr just send them this link.\n\nheatherlynwilson.com/challenge\n\nThat is enough.\n\nThree days. See who God puts on your heart this morning.\n\nHeather"
  },
  "2026-06-30": {
    subject: "Tomorrow we start. Are you ready?",
    body: "Good morning, {{name}}.\n\nTomorrow is July 1st.\n\nYour first reading email arrives at 6am. Open it. Read what it says. Then open your Bible and start.\n\nDo not overthink it. Do not worry about finishing perfectly. The only thing that matters tomorrow is that you show up.\n\nRight now, hundreds of people are going to bed tonight knowing that tomorrow they start reading the Bible together. You are one of them. That is not nothing.\n\nI have been praying for this group. For you. For what God is going to do in the next 31 days.\n\nNo guilt. No perfection required. Just keep showing up.\n\nSee you in the morning.\n\nHeather"
  },
  "2026-08-01": {
    subject: "You showed up. Here is what happened.",
    body: "Good morning, {{name}}.\n\nThe July Bible Challenge is over.\n\nI want you to take a moment and think about what just happened. You signed up to read the Bible in a month. And you showed up. Day after day. Whether you finished every single reading or not, you were part of something real.\n\n{{stats}}\n\nIf you completed all 31 days, your certificate is waiting on your dashboard. Screenshot it. Share it. You earned it.\n\nHere is what happens next. You are staying on my email list. Every Monday, Wednesday, and Friday I share Scripture reflections and real-life lessons on faith, leadership, and following God in the middle of everything. You will hear from me soon.\n\nAnd if you want to do this again, the next challenge is in October. Same format. Same community. Tell a friend.\n\nThank you for reading alongside me this month. It meant more than you know.\n\nWith love,\nHeather"
  }
};

async function sendSpecialEmails(env) {
  if (!env.BREVO_API_KEY || !env.DB) return;

  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const emailData = SPECIAL_EMAILS[today];
  if (!emailData) return;

  console.log(`Sending special email for ${today}...`);

  let results;
  try {
    const q = await env.DB.prepare(
      "SELECT name, email FROM challenge_signups WHERE challenge = ?"
    ).bind(CHALLENGE).all();
    results = q.results || [];
  } catch (e) {
    console.error("Could not query signups for special email:", e.message);
    return;
  }

  if (!results.length) return;

  // Get stats for Aug 1 email
  let statsBlock = "";
  if (today === "2026-08-01") {
    try {
      const total = results.length;
      const completedRow = await env.DB.prepare(
        "SELECT COUNT(DISTINCT email) as cnt FROM challenge_checkins WHERE challenge = ? GROUP BY email HAVING COUNT(*) = 31"
      ).bind(CHALLENGE).all();
      const completed = completedRow.results ? completedRow.results.length : 0;
      statsBlock = total + " people signed up for this challenge. " + completed + " completed all 31 days.";
    } catch (e) {
      statsBlock = "";
    }
  }

  const secret = env.NOTIFY_SECRET || "challenge-secret";
  const validUntil = "2026-10-01";
  let sent = 0;

  for (let i = 0; i < results.length; i += 10) {
    const batch = results.slice(i, i + 10);
    const promises = batch.map(async (user) => {
      const name = user.name || "friend";
      const email = user.email;

      const dashToken = await hmacHex(secret, email + ":challenge:" + validUntil);
      const dashboardUrl = `${SITE}/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${dashToken}`;
      const unsubToken = await hmacHex(secret, email);
      const unsubUrl = `${SITE}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubToken}`;

      let body = emailData.body.replace(/\{\{name\}\}/g, name).replace(/\{\{stats\}\}/g, statsBlock);
      const paragraphs = body.split("\n\n").map(p => {
        if (p === "Heather" || p.startsWith("With love,")) {
          return `<p style="margin:12px 0 0;font-size:18px;color:#1f2937;font-style:italic;font-family:Georgia,serif;">${p.replace("\n", "<br>")}</p>`;
        }
        return `<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">${p}</p>`;
      }).join("\n");

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1f2937;padding:28px 32px;">
<span style="color:#fff;font-size:20px;font-family:Georgia,serif;">HeatherLynWilson.com</span></td></tr>
<tr><td style="padding:36px 32px 24px;">${paragraphs}</td></tr>
<tr><td style="padding:0 32px 28px;" align="center">
<a href="${dashboardUrl}" style="display:inline-block;padding:14px 32px;background:#b85638;color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Open My Dashboard</a></td></tr>
<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;">
July Bible Challenge at heatherlynwilson.com${unsubUrl ? `<br><a href="${unsubUrl}" style="color:#6b7280;">Unsubscribe</a>` : ""}</p></td></tr>
</table></td></tr></table></body></html>`;

      try {
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { name: "Heather Lyn Wilson", email: "heather@heatherlynwilson.com" },
            to: [{ email, name }],
            subject: emailData.subject,
            htmlContent: html,
          }),
        });
        if (res.ok) sent++;
      } catch (e) {}
    });
    await Promise.allSettled(promises);
  }

  console.log(`Special email for ${today} done. Sent: ${sent}/${results.length}`);
}

// ─── Email Content (compressed) ──────────────────────────────────────────────
// Full Bible track
const EMAILS_FB=[{day:1,subject:"Day 1 \u2014 Here we go. Genesis.",reading:"Genesis 1\u201350",body:"Good morning.\n\nToday is the day. You signed up for this. I signed up for this. And right now, a group of us are opening to Genesis 1 together.\n\nYes, the whole book of Genesis today. Fifty chapters. I am not going to sugarcoat it. That is a lot. But here is what I want you to know. Genesis reads fast. It is all story. Creation, the flood, Abraham, Isaac, Jacob, Joseph. You will get pulled in.\n\nDo not worry about understanding every detail. Do not stop to study. Just read. Let the words wash over you. You are not writing a paper. You are meeting God in His Word.\n\nIf you cannot finish all 50 chapters today, that is okay. Read what you can. Mark where you stopped. Come back to it. The goal is not perfection. The goal is showing up.\n\nI am reading alongside you today.\n\nHeather"},{day:2,subject:"Day 2 \u2014 Slavery, plagues, and a God who shows up",reading:"Exodus 1\u201340",body:"Good morning.\n\nYesterday was Genesis. Today is Exodus. And the tone shifts fast.\n\nThe people of God go from favor to slavery in the first chapter. And then God raises up Moses, a man who did not want the job, to lead them out.\n\nHere is what stood out to me when I read this. God did not wait for Moses to be ready. He did not wait for the people to have it together. He showed up because He heard them crying. That was enough.\n\nToday you will read about plagues and Passover and the Red Sea and the Ten Commandments and the building of the tabernacle. It is a full book. Take it one chapter at a time.\n\nYou are on Day 2. You showed up again. That matters.\n\nHeather"},{day:3,subject:"Day 3 \u2014 The one nobody looks forward to",reading:"Leviticus 1\u201327",body:"Good morning.\n\nLeviticus. I know.\n\nThis is the book people quit on. All the rules about sacrifices and skin diseases and what to eat and what not to eat. It feels like reading a manual for a world that does not exist anymore.\n\nBut here is what I want you to see today. Every single rule in this book exists because God wanted to be close to His people. He was not trying to make their lives harder. He was teaching them how to live near a holy God and survive it.\n\nThe whole book is God saying, I want to dwell among you. Here is how.\n\nSo push through it. Read it fast if you need to. But do not skip it. There is something in there for you today.\n\nIf you are still going after Leviticus, you can handle anything this month throws at you.\n\nHeather"},{day:4,subject:"Day 4 \u2014 Wandering starts here",reading:"Numbers 1\u201336",body:"Good morning.\n\nNumbers starts with a census. Then it turns into the story of a people who could not stop complaining.\n\nGod had rescued them. Parted the sea. Fed them from the sky. And they still grumbled. They still wanted to go back to Egypt. They still doubted.\n\nAnd honestly, I see myself in them more than I want to admit.\n\nHow many times has God shown up in my life and I still doubted the next thing? How many times has He provided and I still worried about tomorrow?\n\nThat is the gift of reading the whole Bible like this. You start to see yourself in the story. Not always in the heroes. Sometimes in the people who could not stop looking back.\n\nKeep going. You are almost through the wilderness.\n\nHeather"},{day:5,subject:"Day 5 \u2014 Moses says goodbye",reading:"Deuteronomy 1\u201334",body:"Good morning.\n\nYou have read four books of the Bible this week. And woven through all of them is this idea of rest. In Genesis, God stopped on the seventh day. Not because He was tired. Because He was done, and what He made was good. In Exodus, He told the Israelites not to gather manna on the seventh day. He gave them a double portion on Friday so they would not have to work. Then He put rest right in the middle of the Ten Commandments. Remember the Sabbath. Keep it holy. In Leviticus, the rest went even further. Not just a day but a whole year every seven years. The land needed to breathe too.\n\nRest is not a reward for finishing your work. It is built into the rhythm God designed from the beginning.\n\nToday is Deuteronomy, and Moses is going to repeat the commandments again. Including the Sabbath. But this time he gives a different reason. In Exodus, God said rest because He rested at creation. In Deuteronomy, Moses says rest because you were slaves in Egypt, and slaves do not get to rest. Rest is what free people do.\n\nYou are free. Rest in that today.\n\nDeuteronomy is Moses giving his final speech. He knows he is not going into the Promised Land. He knows his time is almost up. And he spends his last days reminding the people of everything God has done.\n\nRemember. Do not forget. Tell your children. Remember.\n\nHe says it over and over. Because he knows what happens when people forget.\n\nPay attention to the heart behind this book. This is a man who walked with God for forty years, standing at the edge of something he will never see, and his last words are not about himself. They are about making sure the next generation does not lose what matters.\n\nFive days in. Five books down.\n\nHeather"},{day:6,subject:"Day 6 \u2014 They finally get there",reading:"Joshua 1\u201324",body:"Good morning.\n\nAfter forty years in the wilderness, they cross into the Promised Land. Joshua is in charge now. And the very first thing God says to him is be strong and courageous.\n\nHe does not say be smart. He does not say have a plan. He says be strong and do not be afraid.\n\nThey made it. Not because they were perfect. Because God kept His promise.\n\nYou are almost a week in. Be strong and keep going.\n\nHeather"},{day:7,subject:"Day 7 \u2014 One week done",reading:"Judges 1\u201321, Ruth 1\u20134",body:"Good morning.\n\nYou have been reading the Bible for a full week. Seven days. That is worth pausing on.\n\nToday is Judges and Ruth. Judges is the story of Israel falling apart. Over and over they turn away from God, things go badly, they cry out, God raises up a judge to save them, and then they do it all again.\n\nAnd then Ruth shows up. Right in the middle of all that chaos, this quiet little story about faithfulness and kindness and a woman who refused to leave.\n\nOne week down. I am proud of you.\n\nHeather"},{day:8,subject:"Day 8 \u2014 A boy in the temple hears God\u2019s voice",reading:"1 Samuel 1\u201331",body:"Good morning.\n\nToday is one of my favorite books. First Samuel. A woman named Hannah prays for a son. God gives her Samuel. She gives him back to God. And then this little boy lying in the temple hears the voice of God and does not even know what it is.\n\nThen you get Saul. Then David. The giant. The friendship with Jonathan. The jealousy. The running. The caves.\n\nFirst Samuel has everything. It reads like a novel. Enjoy it today.\n\nHeather"},{day:9,subject:"Day 9 \u2014 David at his best and worst",reading:"2 Samuel 1\u201324",body:"Good morning.\n\nSecond Samuel is David\u2019s reign. And it is complicated.\n\nThe thing that sets David apart is not that he never sinned. It is that he always came back. He repented. He grieved. He did not pretend.\n\nThat is the lesson I take from today. Not that I will get it right every time. But that when I do not, I can still come back.\n\nHeather"},{day:10,subject:"Day 10 \u2014 Solomon builds the temple and then loses his way",reading:"1 Kings 1\u201322",body:"Good morning.\n\nFirst Kings starts with Solomon building the most magnificent temple the world had ever seen. And it ends with him worshiping other gods.\n\nYou will also meet Elijah today. Standing alone against 450 prophets of Baal. And then running away and hiding under a tree the very next day.\n\nThe Bible is honest about people. That is one of the reasons I trust it.\n\nYou are ten days in. A third of the way through this challenge.\n\nHeather"},{day:11,subject:"Day 11 \u2014 Everything falls apart",reading:"2 Kings 1\u201325",body:"Good morning.\n\nSecond Kings is hard. You are watching two kingdoms fall. And then Babylon comes. Jerusalem falls. The temple gets destroyed. The people are carried into exile.\n\nIt is heavy. But do not rush past the grief of it. This matters.\n\nSome days the reading is going to be hard. Today is one of those days. But you are still here. And that matters.\n\nHeather"},{day:12,subject:"Day 12 \u2014 The same story, different angle",reading:"1 Chronicles 1\u201329",body:"Good morning.\n\nFirst Chronicles covers a lot of the same ground as Samuel and Kings. But it was written after the exile. When you lose everything and then look back, you see different things. You see the hand of God in places you missed the first time.\n\nAlmost two weeks in. You are doing this.\n\nHeather"},{day:13,subject:"Day 13 \u2014 The rise and fall, one more time",reading:"2 Chronicles 1\u201336",body:"Good morning.\n\nAnd notice the very last verse. Cyrus, king of Persia, lets the people go home. After seventy years of exile, someone opens the door.\n\nGod does not forget His promises. Even when it takes seventy years.\n\nThirteen days. You have read thirteen books of the Bible.\n\nHeather"},{day:14,subject:"Day 14 \u2014 They go home",reading:"Ezra 1\u201310, Nehemiah 1\u201313, Esther 1\u201310",body:"Good morning. Two weeks in.\n\nAll three books are about restoration. About going back to the rubble and building something again. About courage in hard places.\n\nIf you are feeling the weight of this challenge right now, these three books are for you today. Broken things get rebuilt. And it starts with one person who says I will go.\n\nHeather"},{day:15,subject:"Day 15 \u2014 The hardest question in the Bible",reading:"Job 1\u201342",body:"Good morning.\n\nJob. The whole thing. A man who did everything right loses everything. And then God speaks. And He does not answer the question. He just says, I am God and you are not.\n\nWe do not always get to know why. We just get to know who.\n\nYou are almost halfway through the Bible.\n\nHeather"},{day:16,subject:"Day 16 \u2014 Halfway. You made it to the Psalms.",reading:"Psalms 1\u201350",body:"Good morning.\n\nSixteen days in. You are officially past the halfway mark. And today you land in the Psalms. This is people talking to God. Crying out. Praising. Asking why.\n\nRead them out loud if you can. They were written to be spoken.\n\nHalfway there. I am so proud of you.\n\nHeather"},{day:17,subject:"Day 17 \u2014 More Psalms. Stay with it.",reading:"Psalms 51\u2013100",body:"Good morning.\n\nPsalm 51. David after Bathsheba. Create in me a clean heart, O God.\n\nIf you are behind on reading, this is your Psalm 51 moment. Do not quit. Just come back. Read today. That is enough.\n\nHeather"},{day:18,subject:"Day 18 \u2014 The last of the Psalms",reading:"Psalms 101\u2013150",body:"Good morning.\n\nPsalm 150. Let everything that has breath praise the Lord. After all the crying, the questioning, the doubt, it ends with praise.\n\nYou just read the entire book of Psalms in three days. That is remarkable.\n\nEighteen days down. Thirteen to go.\n\nHeather"},{day:19,subject:"Day 19 \u2014 Wisdom for the rest of your life",reading:"Proverbs, Ecclesiastes, Song of Solomon",body:"Good morning.\n\nProverbs is practical. Ecclesiastes is honest. Song of Solomon is beautiful.\n\nEnjoy today. After the weight of Job and Psalms, this is a different kind of reading.\n\nHeather"},{day:20,subject:"Day 20 \u2014 The prophet nobody wanted to listen to",reading:"Isaiah 1\u201333",body:"Good morning.\n\nIsaiah is two things at once. Judgment is coming. But a savior is coming too. For unto us a child is born. That is Isaiah 9.\n\nTwenty days. You are almost there.\n\nHeather"},{day:21,subject:"Day 21 \u2014 Comfort, comfort my people",reading:"Isaiah 34\u201366",body:"Good morning. Three weeks in.\n\nComfort, comfort my people. Those who wait on the Lord shall renew their strength. He was wounded for our transgressions.\n\nIsaiah wrote these words hundreds of years before Jesus. This might be your favorite day of reading this entire month.\n\nThree weeks done. Ten days left.\n\nHeather"},{day:22,subject:"Day 22 \u2014 The prophet who did not want the job",reading:"Jeremiah 1\u201326",body:"Good morning.\n\nJeremiah spent his entire life preaching to people who would not listen. And he kept going.\n\nSometimes faithfulness does not look like success. Sometimes it just looks like showing up.\n\nNine days left. Keep showing up.\n\nHeather"},{day:23,subject:"Day 23 \u2014 Jerusalem falls. Jeremiah weeps.",reading:"Jeremiah 27\u201352, Lamentations 1\u20135",body:"Good morning.\n\nGreat is His faithfulness. His mercies are new every morning.\n\nThat verse was not written on a good day. It was written in the ruins. And that is what makes it so powerful.\n\nMercy is new this morning. For you too.\n\nHeather"},{day:24,subject:"Day 24 \u2014 Visions, bones, and a valley that comes alive",reading:"Ezekiel 1\u201348, Daniel 1\u201312",body:"Good morning.\n\nCan these bones live? And God says, watch me.\n\nOur God is able to deliver us, but even if He does not, we will not bow.\n\nOne week left.\n\nHeather"},{day:25,subject:"Day 25 \u2014 Twelve books in one day",reading:"Hosea through Malachi",body:"Good morning.\n\nMicah tells you what God requires. Do justice. Love mercy. Walk humbly.\n\nMalachi is the last word of the Old Testament. And then silence. Four hundred years of silence.\n\nYou just finished the Old Testament. Tomorrow you open to Matthew.\n\nHeather"},{day:26,subject:"Day 26 \u2014 Jesus is here",reading:"Matthew 1\u201328, Mark 1\u201316",body:"Good morning.\n\nAfter everything you have read, all the promises and prophecies and waiting, today you open to the New Testament. The whole story has been leading here.\n\nYou have spent 25 days reading about a God who promised He would come. Today He arrives.\n\nSix days left.\n\nHeather"},{day:27,subject:"Day 27 \u2014 Two more portraits of Jesus",reading:"Luke 1\u201324, John 1\u201321",body:"Good morning.\n\nLuke is the historian. John is the poet. Same Jesus. Completely different angles.\n\nYou have now read all four Gospels. Four witnesses. One story. Four days from the finish line.\n\nHeather"},{day:28,subject:"Day 28 \u2014 The church explodes and Paul changes everything",reading:"Acts 1\u201328, Romans 1\u201316",body:"Good morning.\n\nActs reads like an action movie. Shipwrecks. Prison breaks. Miracles. And through all of it, the gospel spreads.\n\nThen Romans. For all have sinned. Nothing can separate us from the love of God.\n\nThree more days.\n\nHeather"},{day:29,subject:"Day 29 \u2014 Letters to churches that sound like they were written yesterday",reading:"1 Corinthians through Colossians",body:"Good morning.\n\nLove is patient. Love is kind. Paul did not write it for weddings. He wrote it for a church that was tearing itself apart.\n\nGalatians is freedom. Ephesians is identity. Philippians is joy from a prison cell.\n\nTwo more days.\n\nHeather"},{day:30,subject:"Day 30 \u2014 One more day after this",reading:"1 Thessalonians through Hebrews",body:"Good morning.\n\nHebrews chapter 11 is the faith hall of fame. By faith Abraham. By faith Moses. By faith Rahab. These are your people now. You have read their stories.\n\nOne more day. You are going to finish this.\n\nHeather"},{day:31,subject:"Day 31 \u2014 You did it.",reading:"James through Revelation",body:"Good morning.\n\nThe Bible ends with a promise. He is making all things new. There will be no more tears. No more death. No more pain.\n\nThe story that started in a garden ends in a city. The story that started with God walking with two people ends with God dwelling among all His people forever.\n\nYou just read the entire Bible in 31 days.\n\nI am so proud of you. Thank you for reading alongside me.\n\nWith love,\nHeather"}];

// New Testament track
const EMAILS_NT=[{day:1,subject:"Day 1 \u2014 Here we go. The story of Jesus starts now.",reading:"Matthew 1\u20139",body:"Good morning.\n\nToday is the day. You are starting the New Testament and I am reading alongside you.\n\nMatthew opens with a genealogy. Do not skip it. Buried in that list are Rahab, Ruth, and Bathsheba. Women who should not be in the family tree of the Messiah. But they are.\n\nThe Sermon on the Mount begins in chapter 5 and it is some of the most powerful teaching you will ever read.\n\nNine chapters today. You can do this.\n\nHeather"},{day:2,subject:"Day 2 \u2014 Miracles and hard questions",reading:"Matthew 10\u201318",body:"Good morning.\n\nJesus asks the most important question in the entire Bible. Who do you say that I am?\n\nThat question is for you too.\n\nYou are on Day 2. You showed up again. That is what matters.\n\nHeather"},{day:3,subject:"Day 3 \u2014 The week that changed everything",reading:"Matthew 19\u201328",body:"Good morning.\n\nThe last supper. The garden. The betrayal. The cross. The tomb.\n\nAnd then chapter 28. He is not here. He has risen.\n\nYou just finished your first Gospel. Keep going.\n\nHeather"},{day:4,subject:"Day 4 \u2014 Mark does not slow down",reading:"Mark 1\u20138",body:"Good morning.\n\nMark writes like someone in a hurry to tell you the most important story in the world. Let him.\n\nDay 4. You are building momentum.\n\nHeather"},{day:5,subject:"Day 5 \u2014 The cross, again. It hits different the second time.",reading:"Mark 9\u201316",body:"Good morning.\n\nYou are reading the crucifixion story for the second time in five days. You notice things you missed.\n\nTwo Gospels done. You are almost a week in.\n\nHeather"},{day:6,subject:"Day 6 \u2014 Luke notices the people nobody else sees",reading:"Luke 1\u20136",body:"Good morning.\n\nLuke sees the margins. The overlooked. The forgotten. If you have ever felt invisible, Luke\u2019s Gospel is for you.\n\nSix days in. You are finding your rhythm.\n\nHeather"},{day:7,subject:"Day 7 \u2014 One week done",reading:"Luke 7\u201312",body:"Good morning. One full week.\n\nMartha and Mary. Martha is doing all the work. Mary is sitting at the feet of Jesus. And Jesus says Mary chose the better thing.\n\nYou have been reading for seven days straight. Take a breath. You are doing so well.\n\nHeather"},{day:8,subject:"Day 8 \u2014 Lost things and found things",reading:"Luke 13\u201318",body:"Good morning.\n\nThe prodigal son comes home expecting to be a servant. And the father runs to him. Does not wait. Does not lecture. Runs.\n\nThat is how God feels about you. Right now. Today.\n\nHeather"},{day:9,subject:"Day 9 \u2014 The cross, the third time. What do you see now?",reading:"Luke 19\u201324",body:"Good morning.\n\nLuke includes things the others do not. The thief on the cross. The road to Emmaus. Sometimes Jesus is right next to you and you do not see it until later.\n\nThree Gospels done.\n\nHeather"},{day:10,subject:"Day 10 \u2014 John sees something the others did not",reading:"John 1\u20137",body:"Good morning.\n\nIn the beginning was the Word, and the Word was with God, and the Word was God.\n\nJohn is not trying to tell you what Jesus did. He is trying to show you who Jesus is.\n\nTen days in. One third done.\n\nHeather"},{day:11,subject:"Day 11 \u2014 I am",reading:"John 8\u201314",body:"Good morning.\n\nI am the light of the world. I am the good shepherd. I am the resurrection and the life.\n\nJesus was not being subtle. He was saying exactly who He was.\n\nHeather"},{day:12,subject:"Day 12 \u2014 The upper room and the empty tomb",reading:"John 15\u201321",body:"Good morning.\n\nI am the vine. Abide in me. I call you friends. I am praying for you.\n\nFour Gospels done. Tomorrow the church begins.\n\nHeather"},{day:13,subject:"Day 13 \u2014 The Holy Spirit shows up and everything changes",reading:"Acts 1\u20137",body:"Good morning.\n\nPeter, the man who denied Jesus, stands up and preaches and three thousand people believe.\n\nActs is the most exciting book in the New Testament. It reads like an adventure story. Because it is one.\n\nHeather"},{day:14,subject:"Day 14 \u2014 Two weeks in. Paul enters the story.",reading:"Acts 8\u201314",body:"Good morning. Two weeks.\n\nSaul becomes Paul. Nobody is too far gone. The worst enemy of the church became its greatest champion.\n\nYou are halfway through the challenge.\n\nHeather"},{day:15,subject:"Day 15 \u2014 Missionary journeys and midnight worship",reading:"Acts 15\u201321",body:"Good morning.\n\nPaul and Silas singing in a jail cell at midnight. After being beaten. And an earthquake breaks the chains.\n\nThat is the power of worship in the dark places.\n\nFifteen days down.\n\nHeather"},{day:16,subject:"Day 16 \u2014 Paul will not stop",reading:"Acts 22\u201328",body:"Good morning.\n\nThe last word of Acts. Unhindered. The gospel cannot be stopped.\n\nTomorrow you start Paul\u2019s letters.\n\nHeather"},{day:17,subject:"Day 17 \u2014 The deepest theology Paul ever wrote",reading:"Romans 1\u20138",body:"Good morning.\n\nRomans 8 might be the single greatest chapter in the entire Bible.\n\nNothing can separate us from the love of God.\n\nIf you only remember one chapter from this entire challenge, make it Romans 8.\n\nHeather"},{day:18,subject:"Day 18 \u2014 Grace changes everything",reading:"Romans 9\u201316",body:"Good morning.\n\nLove sincerely. Hate evil. Be joyful in hope. Patient in affliction. Faithful in prayer.\n\nThat is what grace looks like when it hits the ground.\n\nEighteen down. Keep it.\n\nHeather"},{day:19,subject:"Day 19 \u2014 Paul writes to a messy church",reading:"1 Corinthians 1\u20138",body:"Good morning.\n\nPaul does not start by yelling at them. He starts by reminding them who they are.\n\nThat is always God\u2019s approach. Before He corrects you, He reminds you who you are.\n\nTwelve days left.\n\nHeather"},{day:20,subject:"Day 20 \u2014 Love and resurrection",reading:"1 Corinthians 9\u201316",body:"Good morning. Twenty days in.\n\nLove is patient. Love is kind. It is not a poem about romance. It is a mirror held up to a church that needed to hear it.\n\nEleven to go.\n\nHeather"},{day:21,subject:"Day 21 \u2014 Three weeks. Strength in weakness.",reading:"2 Corinthians 1\u20137",body:"Good morning. Three full weeks.\n\nWe have this treasure in jars of clay. Fragile. Cracked. Ordinary. But carrying something extraordinary.\n\nThe cracks are how the light gets out.\n\nHeather"},{day:22,subject:"Day 22 \u2014 Freedom",reading:"2 Corinthians 8\u201313, Galatians 1\u20136",body:"Good morning.\n\nIt is for freedom that Christ has set us free. Stand firm.\n\nThat verse changed my life. Because I am really good at putting chains back on myself that God already removed.\n\nNine days left.\n\nHeather"},{day:23,subject:"Day 23 \u2014 Who you are in Christ",reading:"Ephesians, Philippians, Colossians",body:"Good morning.\n\nPhilippians was written from prison. And it is the most joyful book in the New Testament.\n\nJoy is not about circumstances. It never has been.\n\nEight days left.\n\nHeather"},{day:24,subject:"Day 24 \u2014 Letters to friends and a young pastor",reading:"1\u20132 Thessalonians, 1 Timothy",body:"Good morning.\n\nDon\u2019t let anyone look down on you because you are young. Fight the good fight.\n\nOne week left.\n\nHeather"},{day:25,subject:"Day 25 \u2014 Paul\u2019s last letter and a one-page masterpiece",reading:"2 Timothy, Titus, Philemon",body:"Good morning.\n\nI have fought the good fight. I have finished the race. I have kept the faith.\n\nThat is how Paul says goodbye.\n\nSix days to go.\n\nHeather"},{day:26,subject:"Day 26 \u2014 The Old Testament finally makes sense",reading:"Hebrews 1\u201313",body:"Good morning.\n\nChapter 11 is the faith hall of fame. Chapter 12 says you are surrounded by this great cloud of witnesses cheering you on.\n\nFive days left.\n\nHeather"},{day:27,subject:"Day 27 \u2014 Faith that does something",reading:"James, 1 Peter, 2 Peter",body:"Good morning.\n\nFaith without works is dead. Do not just listen to the word. Do what it says.\n\nFour more days.\n\nHeather"},{day:28,subject:"Day 28 \u2014 Love. That is the whole thing.",reading:"1\u20133 John, Jude",body:"Good morning.\n\nGod is love. There is no fear in love. Perfect love drives out fear.\n\nThree days left.\n\nHeather"},{day:29,subject:"Day 29 \u2014 The beginning of the end",reading:"Revelation 1\u20138",body:"Good morning.\n\nHoly, holy, holy is the Lord God Almighty, who was and is and is to come.\n\nThe story is heading toward worship.\n\nTwo more days.\n\nHeather"},{day:30,subject:"Day 30 \u2014 Hold on. Almost there.",reading:"Revelation 9\u201316",body:"Good morning.\n\nThe kingdom of the world has become the kingdom of our Lord and of His Christ, and He shall reign forever and ever.\n\nOne more day. Tomorrow you finish.\n\nHeather"},{day:31,subject:"Day 31 \u2014 You did it.",reading:"Revelation 17\u201322",body:"Good morning.\n\nHe will wipe every tear from their eyes. There will be no more death or mourning or crying or pain. I am making everything new.\n\nYou just read the entire New Testament in 31 days.\n\nThank you for doing this with me. I am so proud of you.\n\nWith love,\nHeather"}];

// ─── Daily Traffic Digest ────────────────────────────────────────────────────

const DIGEST_TO = "heather@givesendgo.com";
const DIGEST_FROM = { name: "HLW Site", email: "heather@heatherlynwilson.com" };

async function sendTrafficDigest(env) {
  if (!env.BREVO_API_KEY || !env.DB) return;
  try {
    const db = env.DB;

    async function bucket(rangeSql) {
      const counts = await db.prepare(
        "SELECT COUNT(*) as views, COUNT(DISTINCT visitor_id) as visitors FROM page_views WHERE " + rangeSql
      ).first();
      const dwell = await db.prepare(
        "SELECT AVG(dwell_seconds) as avg_seconds, " +
        "SUM(CASE WHEN dwell_seconds IS NOT NULL AND dwell_seconds < 10 THEN 1 ELSE 0 END) as bounced, " +
        "SUM(CASE WHEN dwell_seconds IS NOT NULL THEN 1 ELSE 0 END) as with_dwell " +
        "FROM page_views WHERE " + rangeSql
      ).first();
      const bouncePct = dwell && dwell.with_dwell
        ? Math.round((dwell.bounced / dwell.with_dwell) * 100)
        : null;
      return {
        views: (counts && counts.views) || 0,
        visitors: (counts && counts.visitors) || 0,
        avg_seconds: dwell && dwell.avg_seconds != null ? Math.round(dwell.avg_seconds) : null,
        bounce_pct: bouncePct,
      };
    }

    const yesterday = await bucket("date(created_at) = date('now', '-1 day')");
    const week = await bucket("date(created_at) >= date('now', '-7 days')");

    // Skip if yesterday had zero traffic
    if (yesterday.views === 0) {
      console.log("Skipping traffic digest: zero views yesterday.");
      return;
    }

    const topPagesRows = await db.prepare(
      "SELECT path, COUNT(*) as views FROM page_views " +
      "WHERE date(created_at) = date('now', '-1 day') " +
      "GROUP BY path ORDER BY views DESC LIMIT 5"
    ).all();
    const topPages = topPagesRows.results || [];

    const topRefsRows = await db.prepare(
      "SELECT referrer, COUNT(*) as views FROM page_views " +
      "WHERE date(created_at) = date('now', '-1 day') AND referrer != '' " +
      "GROUP BY referrer ORDER BY views DESC LIMIT 5"
    ).all();
    const topRefs = topRefsRows.results || [];

    const newSubsRow = await db.prepare(
      "SELECT COUNT(*) as c FROM subscribers WHERE date(created_at) = date('now', '-1 day')"
    ).first();
    const newSubs = (newSubsRow && newSubsRow.c) || 0;

    const newCommentsRow = await db.prepare(
      "SELECT COUNT(*) as c FROM post_comments WHERE date(created_at) = date('now', '-1 day')"
    ).first();
    const newComments = (newCommentsRow && newCommentsRow.c) || 0;

    const dateStr = new Date(Date.now() - 86400000).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York",
    });

    const html = buildDigestEmail({
      dateStr, yesterday, week, topPages, topRefs, newSubs, newComments,
    });

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: DIGEST_FROM,
        to: [{ email: DIGEST_TO, name: "Heather Wilson" }],
        subject: `Yesterday on heatherlynwilson.com: ${yesterday.visitors} visitor${yesterday.visitors === 1 ? "" : "s"}, ${yesterday.views} view${yesterday.views === 1 ? "" : "s"}`,
        htmlContent: html,
      }),
    });
    console.log(`Traffic digest sent: ${res.status}`);
  } catch (e) {
    console.error("Traffic digest failed:", e);
  }
}

function fmtDwell(s) {
  if (s == null) return "—";
  if (s < 60) return s + "s";
  return Math.floor(s / 60) + "m " + (s % 60) + "s";
}

function htmlEscape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildDigestEmail({ dateStr, yesterday, week, topPages, topRefs, newSubs, newComments }) {
  const pageRows = topPages.map(p =>
    `<tr><td style="padding:6px 0;font-size:14px;color:#1f2937;">${htmlEscape(p.path)}</td><td style="padding:6px 0;font-size:14px;color:#1f2937;text-align:right;font-weight:600;">${p.views}</td></tr>`
  ).join("") || `<tr><td style="padding:6px 0;font-size:13px;color:#9ca3af;">No pages yet.</td><td></td></tr>`;
  const refRows = topRefs.map(r => {
    let host = r.referrer;
    try { host = new URL(r.referrer).host || r.referrer; } catch (e) {}
    return `<tr><td style="padding:6px 0;font-size:14px;color:#1f2937;">${htmlEscape(host)}</td><td style="padding:6px 0;font-size:14px;color:#1f2937;text-align:right;font-weight:600;">${r.views}</td></tr>`;
  }).join("") || `<tr><td style="padding:6px 0;font-size:13px;color:#9ca3af;">No external referrers yesterday.</td><td></td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:-apple-system,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">

<tr><td style="background:#1f2937;padding:24px 28px;color:#fff;">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c8a365;font-weight:700;">Site Digest</div>
<div style="font-family:Georgia,serif;font-size:22px;margin-top:6px;">${dateStr}</div>
</td></tr>

<tr><td style="padding:28px 28px 8px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td width="50%" style="padding-bottom:18px;">
<div style="font-family:Georgia,serif;font-size:34px;color:#b85638;font-weight:600;line-height:1;">${yesterday.visitors}</div>
<div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Visitors</div>
</td>
<td width="50%" style="padding-bottom:18px;">
<div style="font-family:Georgia,serif;font-size:34px;color:#b85638;font-weight:600;line-height:1;">${yesterday.views}</div>
<div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Page Views</div>
</td>
</tr>
<tr>
<td style="padding-bottom:18px;">
<div style="font-family:Georgia,serif;font-size:22px;color:#1f2937;font-weight:600;line-height:1;">${fmtDwell(yesterday.avg_seconds)}</div>
<div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Avg Time on Page</div>
</td>
<td style="padding-bottom:18px;">
<div style="font-family:Georgia,serif;font-size:22px;color:#1f2937;font-weight:600;line-height:1;">${yesterday.bounce_pct != null ? yesterday.bounce_pct + "%" : "—"}</div>
<div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Bounce Rate</div>
</td>
</tr>
</table>
</td></tr>

<tr><td style="padding:8px 28px 8px;">
<h3 style="font-family:Georgia,serif;font-size:15px;margin:0 0 8px;color:#1f2937;">Top pages yesterday</h3>
<table width="100%" cellpadding="0" cellspacing="0">${pageRows}</table>
</td></tr>

<tr><td style="padding:18px 28px 8px;">
<h3 style="font-family:Georgia,serif;font-size:15px;margin:0 0 8px;color:#1f2937;">Coming from</h3>
<table width="100%" cellpadding="0" cellspacing="0">${refRows}</table>
</td></tr>

<tr><td style="padding:18px 28px 28px;border-top:1px solid #e5e0d5;margin-top:18px;">
<div style="font-size:13px;color:#4b5563;line-height:1.7;">
<strong style="color:#1f2937;">New subscribers yesterday:</strong> ${newSubs}<br>
<strong style="color:#1f2937;">New comments yesterday:</strong> ${newComments}<br>
<strong style="color:#1f2937;">Last 7 days:</strong> ${week.visitors} visitors · ${week.views} views
</div>
<div style="margin-top:18px;">
<a href="https://heatherlynwilson.com/admin.html" style="display:inline-block;padding:10px 22px;background:#b85638;color:#fff;text-decoration:none;border-radius:5px;font-size:13px;font-weight:600;">Open dashboard</a>
</div>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}
