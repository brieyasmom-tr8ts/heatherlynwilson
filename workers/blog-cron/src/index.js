/**
 * HeatherLynWilson.com Daily Cron Worker
 *
 * Two crons so blog and challenge emails don't arrive at the same time:
 *   "5 10 * * *" (6:05am ET) - challenge daily emails + special emails
 *   "5 12 * * *" (8:05am ET) - blog notification email + traffic digest
 *
 * Blog publishing: the subscriber notification email is sent directly by
 * this worker (no GitHub token needed). The actual HTML publishing still
 * happens via a GitHub Actions cron, but the email no longer depends on it.
 * A Pages Function fallback at /blog/[slug].html renders from the content
 * queue JSON so the link works even before Actions runs.
 *
 * Secrets (set via `wrangler secret put`):
 *   BREVO_API_KEY  – Brevo transactional email API key
 *   NOTIFY_SECRET  – HMAC secret for generating dashboard/unsubscribe links
 *
 * Bindings:
 *   DB – D1 database (blog-engagement)
 */

const CHALLENGE = "july-2026";
const SITE = "https://heatherlynwilson.com";
const FB_PAGE_ID = "1522539041374773";

export default {
  async fetch(request, env) {
    return new Response("", { status: 200 });
  },
  async scheduled(event, env) {
    if (event.cron === "5 10 * * *") {
      // 6:05am ET - challenge emails
      await sendChallengeEmails(env);
      await sendSpecialEmails(env);
      await sendDripEmails(env);
      await sendFollowUpEmails(env);
      await sendHeatherDigest(env);
      await sendGroupDigests(env);
    } else if (event.cron === "5 12 * * *") {
      // 8:05am ET - blog notification + traffic digest (FB blog post is inside sendBlogNotification)
      await sendBlogNotification(env);
      await sendTrafficDigest(env);
    } else {
      // One shared trigger covers both FB promo times (Cloudflare allows only
      // 3 cron triggers per worker). Post 11:05am ET on Tue/Sat and 6:05pm ET
      // on Thu/Sun; skip the other firings.
      const t = new Date(event.scheduledTime || Date.now());
      const h = t.getUTCHours(), day = t.getUTCDay();
      const morningPost = h === 15 && (day === 2 || day === 6);
      const eveningPost = h === 22 && (day === 0 || day === 4);
      if (morningPost || eveningPost) await postFbPromo(env);
    }
  },
};

// ─── Daily Digest for Heather ────────────────────────────────────────────────

async function sendHeatherDigest(env) {
  if (!env.BREVO_API_KEY || !env.DB) return;

  const now = new Date();
  const easternDate = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const dayOfWeek = new Date(easternDate + "T12:00:00").getDay();
  // Weekly digest on Mondays only
  if (dayOfWeek !== 1) return;

  // Look back 7 days for the weekly digest
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const since = weekAgo + "T00:00:00";

  let sections = [];

  // New challenge signups since yesterday
  try {
    const r = await env.DB.prepare(
      "SELECT name, email, track, challenge, created_at FROM challenge_signups WHERE created_at >= ? ORDER BY created_at DESC"
    ).bind(since).all();
    const signups = r.results || [];
    if (signups.length > 0) {
      const TRACK_LABELS = { 'full-bible': 'Bible 31d', 'new-testament': 'NT 31d', 'chronological': 'Chrono 31d', 'bible-90': 'Bible 3mo', 'chrono-90': 'Chrono 3mo', 'ot-90': 'OT 3mo', 'nt-90': 'NT 3mo', 'james': 'James', 'niv': 'Beatitudes NIV', 'esv': 'Beatitudes ESV', 'nlt': 'Beatitudes NLT', 'kjv': 'Beatitudes KJV', 'family': 'Proverbs' };
      const CHALLENGE_LABELS = { 'july-2026': 'Bible Challenge', 'august-james-2026': 'James', 'september-beatitudes-2026': 'Beatitudes', 'october-proverbs-2026': 'Proverbs' };
      let list = signups.map(s => s.name + " - " + (CHALLENGE_LABELS[s.challenge] || s.challenge) + " (" + (TRACK_LABELS[s.track] || s.track) + ")").join("\n");
      sections.push("CHALLENGE SIGNUPS (" + signups.length + ")\n" + list);
    }
  } catch (e) {}

  // New subscribers
  try {
    const r = await env.DB.prepare(
      "SELECT email, created_at FROM subscribers WHERE created_at >= ? AND active = 1 ORDER BY created_at DESC"
    ).bind(since).all();
    const subs = r.results || [];
    if (subs.length > 0) {
      sections.push("NEW SUBSCRIBERS (" + subs.length + ")\n" + subs.map(s => s.email).join("\n"));
    }
  } catch (e) {}

  // Contact submissions
  try {
    const r = await env.DB.prepare(
      "SELECT name, email, reason, message, created_at FROM contact_submissions WHERE created_at >= ? ORDER BY created_at DESC"
    ).bind(since).all();
    const contacts = r.results || [];
    if (contacts.length > 0) {
      let list = contacts.map(c => c.name + " (" + (c.reason || "General") + ") - " + (c.message || "").slice(0, 80)).join("\n");
      sections.push("CONTACT SUBMISSIONS (" + contacts.length + ")\n" + list);
    }
  } catch (e) {}

  // Launch team signups
  try {
    const r = await env.DB.prepare(
      "SELECT name, email, created_at FROM launch_team WHERE created_at >= ? ORDER BY created_at DESC"
    ).bind(since).all();
    const lt = r.results || [];
    if (lt.length > 0) {
      sections.push("LAUNCH TEAM (" + lt.length + ")\n" + lt.map(m => m.name + " - " + m.email).join("\n"));
    }
  } catch (e) {}

  if (sections.length === 0) {
    console.log("Digest: nothing new this week.");
    return;
  }

  const body = "Good morning, Heather. Here is your weekly summary.\n\n" + sections.join("\n\n") + "\n\nView your full dashboard:\nhttps://heatherlynwilson.com/admin.html";

  try {
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: "HeatherLynWilson.com", email: "heather@heatherlynwilson.com" },
        to: [{ email: "heather@givesendgo.com", name: "Heather" }],
        subject: "Weekly Digest: " + sections.reduce((n, s) => { const m = s.match(/\((\d+)\)/); return n + (m ? parseInt(m[1]) : 0); }, 0) + " new this week",
        textContent: body,
      }),
    });
    console.log("Digest sent to Heather.");
  } catch (e) {
    console.error("Digest send failed:", e.message);
  }
}

// ─── Group Join Digests (for creators who opted into daily digest) ───────────

async function sendGroupDigests(env) {
  if (!env.BREVO_API_KEY || !env.DB) return;

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const since = yesterday + "T00:00:00";

  // Find group creators who chose digest mode
  try {
    const digestCreators = await env.DB.prepare(`
      SELECT gm.email, gm.name, gm.group_id, cg.name as group_name
      FROM group_members gm
      JOIN challenge_groups cg ON cg.id = gm.group_id
      WHERE gm.notify_digest = 1 AND cg.created_by_email = gm.email
    `).all();

    if (!digestCreators.results || !digestCreators.results.length) return;

    const secret = env.NOTIFY_SECRET || "challenge-secret";
    const gdOptouts = await loadEmailOptouts(env);

    for (const creator of digestCreators.results) {
      if (gdOptouts.group.has(creator.email)) continue;
      // Find new members who joined since yesterday
      const newMembers = await env.DB.prepare(
        "SELECT name FROM group_members WHERE group_id = ? AND joined_at >= ? AND email != ?"
      ).bind(creator.group_id, since, creator.email).all();

      if (!newMembers.results || !newMembers.results.length) continue;

      const names = newMembers.results.map(m => m.name || "Someone");
      const dashToken = await hmacHex(secret, creator.email + ":challenge:2026-10-01");
      const dashUrl = `${SITE}/challenge/dashboard.html?email=${encodeURIComponent(creator.email)}&token=${dashToken}`;
      const instantUrl = `${SITE}/api/group-notify?email=${encodeURIComponent(creator.email)}&token=${dashToken}&group=${creator.group_id}&mode=instant`;

      const subject = names.length === 1
        ? names[0] + " joined your group yesterday"
        : names.length + " people joined your group yesterday";

      const body = `Good morning, ${creator.name || "friend"}.\n\n${names.length === 1 ? names[0] + " joined" : names.join(", ") + " joined"} "${creator.group_name}" since yesterday.\n\nOpen your dashboard to see your group.`;

      try {
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { name: "Heather Lyn Wilson", email: "heather@heatherlynwilson.com" },
            to: [{ email: creator.email, name: creator.name || "friend" }],
            subject: subject,
            htmlContent: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;"><tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1f2937;padding:28px 32px;"><span style="color:#fff;font-size:20px;font-family:Georgia,serif;">HeatherLynWilson.com</span></td></tr>
<tr><td style="padding:36px 32px 24px;">
<p style="margin:0 0 16px;font-size:20px;color:#1f2937;font-weight:600;font-family:Georgia,serif;">Your group "${creator.group_name}" is growing!</p>
<p style="margin:0 0 20px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">${names.join(", ")} joined since yesterday.</p>
</td></tr>
<tr><td style="padding:0 32px 32px;" align="center">
<a href="${dashUrl}" style="display:inline-block;padding:14px 32px;background:#b85638;color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">See Your Group</a>
</td></tr>
<tr><td style="padding:12px 32px 24px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;">Want instant notifications instead? <a href="${instantUrl}" style="color:#b85638;">Switch back to instant</a></p>
</td></tr>
</table></td></tr></table></body></html>`,
          }),
        });
      } catch (e) {}
    }
  } catch (e) {
    console.error("Group digest error:", e.message);
  }
}

// ─── Blog Notification (no GitHub token needed) ─────────────────────────────

async function sendBlogNotification(env) {
  if (!env.BREVO_API_KEY || !env.DB) {
    console.log("No BREVO_API_KEY or DB, skipping blog notification.");
    return;
  }

  const now = new Date();
  const easternDate = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const dayOfWeek = new Date(easternDate + "T12:00:00").getDay(); // 0=Sun
  const isMWF = dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5;
  const isMonday = dayOfWeek === 1;

  // No blog emails on non-MWF days (unless Monday digest)
  if (!isMWF && !isMonday) {
    console.log("Not a blog email day, skipping.");
    return;
  }

  // Fetch the schedule manifest
  let schedule;
  try {
    const res = await fetch(SITE + "/content-queue/schedule.json", {
      headers: { "User-Agent": "hlw-cron" },
    });
    if (!res.ok) { console.log("No schedule manifest found."); return; }
    schedule = await res.json();
  } catch (e) {
    console.error("Failed to fetch schedule manifest:", e.message);
    return;
  }

  const allPosts = schedule.posts || [];

  // Today's post (for daily subscribers)
  const todayPost = allPosts.find(p => p.publish_date === easternDate);

  // Auto-post to Facebook Page when a new blog post publishes
  if (todayPost && isMWF && env.FB_PAGE_TOKEN) {
    try {
      const postUrl = `${SITE}/blog/${todayPost.slug}.html`;
      const fbRes = await fetch(`https://graph.facebook.com/v20.0/${FB_PAGE_ID}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `message=${encodeURIComponent(todayPost.title + "\n\n" + (todayPost.excerpt || ""))}&link=${encodeURIComponent(postUrl)}&access_token=${encodeURIComponent(env.FB_PAGE_TOKEN)}`,
      });
      if (fbRes.ok) {
        console.log("Facebook post published for: " + todayPost.slug);
      } else {
        const fbErr = await fbRes.text();
        console.error("Facebook post failed:", fbErr);
        // If token expired, email Heather
        if (fbErr.includes("OAuthException") || fbErr.includes("expired") || fbErr.includes("validat")) {
          if (env.BREVO_API_KEY) {
            try {
              await fetch("https://api.brevo.com/v3/smtp/email", {
                method: "POST",
                headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
                body: JSON.stringify({
                  sender: { name: "HeatherLynWilson.com", email: "heather@heatherlynwilson.com" },
                  to: [{ email: "heather@givesendgo.com", name: "Heather" }],
                  subject: "Facebook auto-posting stopped: token expired",
                  textContent: "Your Facebook Page token has expired. Blog posts are no longer auto-posting to your Facebook page.\n\nTo fix it: go to developers.facebook.com/tools/explorer, select the HeatherLynWilson app, select your page, add pages_manage_posts permission, generate a new token, and tell Claude to update it.\n\nYour blog posts are still publishing to the website normally. Only the Facebook cross-post is paused.",
                }),
              });
            } catch (e2) {}
          }
        }
      }
    } catch (e) { console.error("Facebook post error:", e.message); }
  }

  // This week's posts (for Monday digest: last 7 days)
  let weekPosts = [];
  if (isMonday) {
    const sevenAgo = new Date(easternDate + "T00:00:00");
    sevenAgo.setDate(sevenAgo.getDate() - 7);
    const sevenAgoStr = sevenAgo.toISOString().slice(0, 10);
    weekPosts = allPosts.filter(p => p.publish_date > sevenAgoStr && p.publish_date <= easternDate);
    // Also check the blog table for posts published this past week
    if (!weekPosts.length) {
      try {
        const q = await env.DB.prepare(
          "SELECT slug, title, excerpt FROM blog_posts WHERE published_at >= ? ORDER BY published_at DESC LIMIT 5"
        ).bind(sevenAgoStr).all();
        weekPosts = (q.results || []).map(r => ({ slug: r.slug, title: r.title, excerpt: r.excerpt || "" }));
      } catch (e) {}
    }
  }

  if (!todayPost && !weekPosts.length) {
    console.log("No blog content to send today.");
    return;
  }

  // Get active subscribers + their blog_daily preference
  let subscribers;
  try {
    const q = await env.DB.prepare(
      "SELECT s.email, COALESCE(p.blog_daily, 0) as blog_daily FROM subscribers s LEFT JOIN email_prefs p ON p.email = s.email WHERE s.unsubscribed_at IS NULL"
    ).all();
    subscribers = dedupeByEmail(q.results);
  } catch (e) {
    console.error("Could not query subscribers:", e.message);
    return;
  }

  if (!subscribers.length) {
    console.log("No active subscribers.");
    return;
  }

  const secret = env.NOTIFY_SECRET || "";
  let sent = 0, errors = 0;

  // Monday: send weekly digest to non-daily subscribers, daily post to daily subscribers
  // MWF (non-Monday): send only to daily subscribers
  for (let i = 0; i < subscribers.length; i += 10) {
    const batch = subscribers.slice(i, i + 10);
    const promises = batch.map(async (row) => {
      const isDaily = !!row.blog_daily;
      const unsubToken = await hmacHex(secret, row.email);
      const unsubUrl = `${SITE}/api/unsubscribe?email=${encodeURIComponent(row.email)}&token=${unsubToken}`;
      const dailyOptUrl = `${SITE}/api/blog-pref?email=${encodeURIComponent(row.email)}&token=${unsubToken}&mode=daily`;
      const weeklyOptUrl = `${SITE}/api/blog-pref?email=${encodeURIComponent(row.email)}&token=${unsubToken}&mode=weekly`;

      let subject, html;

      if (isDaily && todayPost && isMWF) {
        // Daily subscriber gets individual post
        subject = todayPost.title;
        const postUrl = `${SITE}/blog/${todayPost.slug}.html`;
        html = buildBlogEmail(todayPost.title, todayPost.excerpt, postUrl, unsubUrl, weeklyOptUrl);
      } else if (!isDaily && isMonday && weekPosts.length) {
        // Weekly subscriber gets Monday digest
        subject = weekPosts.length === 1
          ? "This week on the blog: " + weekPosts[0].title
          : "This week on the blog (" + weekPosts.length + " new posts)";
        html = buildBlogDigestEmail(weekPosts, unsubUrl, dailyOptUrl);
      } else {
        return; // Nothing to send to this subscriber today
      }

      try {
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { name: "Heather Lyn Wilson", email: "heather@heatherlynwilson.com" },
            to: [{ email: row.email }],
            subject,
            htmlContent: html,
          }),
        });
        if (res.ok) sent++;
        else errors++;
      } catch (e) { errors++; }
    });
    await Promise.allSettled(promises);
  }

  console.log(`Blog notification: ${sent} sent, ${errors} errors, ${subscribers.length} total subscribers.`);
}

function buildBlogEmail(title, excerpt, postUrl, unsubUrl, weeklyOptUrl) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1f2937;padding:28px 32px;">
<span style="color:#ffffff;font-size:20px;font-family:Georgia,serif;letter-spacing:0.5px;">HeatherLynWilson.com</span>
</td></tr>
<tr><td style="padding:36px 32px 24px;">
<h1 style="margin:0 0 16px;font-size:24px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;">${htmlEscape(title)}</h1>
<p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">${htmlEscape(excerpt)}</p>
<a href="${postUrl}" style="display:inline-block;padding:12px 28px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;">Read the full post</a>
</td></tr>
<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving each post the day it publishes. <a href="${weeklyOptUrl}" style="color:#6b7280;">Switch to a weekly digest instead</a>.<br>
<a href="${unsubUrl}" style="color:#6b7280;">Manage all email preferences</a></p>
</td></tr>
</table>
</td></tr></table></body></html>`;
}

function buildBlogDigestEmail(posts, unsubUrl, dailyOptUrl) {
  const postRows = posts.map(p => {
    const url = `${SITE}/blog/${p.slug}.html`;
    return `<tr><td style="padding:20px 0;border-bottom:1px solid #e5e0d5;">
<h2 style="margin:0 0 8px;font-size:20px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;"><a href="${url}" style="color:#1f2937;text-decoration:none;">${htmlEscape(p.title)}</a></h2>
<p style="margin:0 0 12px;font-size:15px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">${htmlEscape(p.excerpt || "")}</p>
<a href="${url}" style="color:#b85638;font-size:14px;font-weight:600;font-family:-apple-system,sans-serif;text-decoration:none;">Read &rarr;</a>
</td></tr>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1f2937;padding:28px 32px;">
<span style="color:#ffffff;font-size:20px;font-family:Georgia,serif;letter-spacing:0.5px;">HeatherLynWilson.com</span>
<span style="float:right;color:#c8a365;font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;padding-top:4px;">WEEKLY DIGEST</span>
</td></tr>
<tr><td style="padding:36px 32px 8px;">
<p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">Here is what went up on the blog this week:</p>
</td></tr>
<tr><td style="padding:0 32px 24px;">
<table width="100%" cellpadding="0" cellspacing="0">${postRows}</table>
</td></tr>
<tr><td style="padding:16px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You get this digest once a week on Monday. <a href="${dailyOptUrl}" style="color:#b85638;font-weight:600;">Want each post the day it publishes?</a><br>
<a href="${unsubUrl}" style="color:#6b7280;">Manage all email preferences</a></p>
</td></tr>
</table>
</td></tr></table></body></html>`;
}

// ─── Facebook Promo Posts (non-blog days) ────────────────────────────────────
// On Tue/Thu/Sat/Sun, post one rotating promo to FB: challenge invites + books.
// Uses day-of-year to cycle through the pool so each post gets equal rotation.

// Challenge promos: 3 variations per challenge, only the next upcoming one is used
const FB_CHALLENGE_PROMOS = {
  "august-james-2026": {
    start: "2026-08-01",
    link: SITE + "/challenge-james",
    images: [
      SITE + "/images/promo-james-start.jpg",
      SITE + "/images/promo-james-deeper.jpg",
      SITE + "/images/promo-read-together.jpg"
    ],
    posts: [
      "One Book Deep starts August 1st.\n\nRead the book of James every single day for 31 days. Same five chapters, thirty-one times. Repetition is how the Word gets from your head to your heart.\n\nJoin us. It is free.",
      "Read less. Read deeper.\n\nWhat would happen if you read the same five chapters of the Bible every day for a month? That is the One Book Deep challenge. James. Every day. For 31 days. By the end it will be part of you.\n\nStarts August 1st.",
      "Do not read alone. Read together.\n\nStart a group with your friends, your small group, your family. Everyone reads James together. You see who checked in. You cheer each other on.\n\nOne Book Deep starts August 1st."
    ]
  },
  "september-beatitudes-2026": {
    start: "2026-09-01",
    link: SITE + "/challenge-beatitudes",
    image: SITE + "/images/og-challenge.png",
    posts: [
      "What if you memorized the Beatitudes this September?\n\nHide It In Your Heart: 30 days, one line at a time, a memory game on your dashboard that hides more words each day. By Day 30 you say the whole passage from memory.\n\nPick your translation and join us.",
      "Once Scripture is in you, no one can take it. It is there in the hard moments, the waiting, the times you do not know what to pray.\n\nThis September, memorize the Beatitudes with me. One line at a time. 30 days. Join us.",
      "Blessed are the poor in spirit, for theirs is the kingdom of heaven.\n\nWhat if you knew those words by heart? All of them. By the end of September.\n\nHide It In Your Heart starts September 1st. Pick your translation and let's go."
    ]
  },
  "october-proverbs-2026": {
    start: "2026-10-01",
    link: SITE + "/challenge-proverbs",
    image: SITE + "/images/challenge-card.jpg",
    posts: [
      "What if your family read one chapter of Proverbs together every day in October?\n\nAround the Table gives you the chapter, questions for your kids by age, and one small family challenge. Ten minutes. No table required. The car works fine.",
      "Thirty-one days of Proverbs will put more wisdom in your kids than a year of lectures.\n\nAround the Table starts October 1st. One chapter a day, questions by age, one family challenge. Ten minutes wherever you are.",
      "You do not need a quiet house or a formal dinner to do family devotions.\n\nAround the Table works at breakfast, in the car, or wherever your family actually is. One Proverbs chapter, ten minutes, and real conversation that counts.\n\nStarts October 1st."
    ]
  },
  "november-thanks-2026": {
    start: "2026-11-01",
    link: SITE + "/challenge-thanks",
    image: SITE + "/images/og-challenge.png",
    posts: [
      "This November: one psalm a day, one short note from me, and three things you are thankful for.\n\nBy Thanksgiving your list will be ninety long, and you will read it at the table.\n\nGive Thanks starts November 1st.",
      "What if you spent November building a gratitude list instead of a wish list?\n\nGive Thanks: a psalm a day, a gratitude prompt, and by Thanksgiving you have ninety things written down. Join us.",
      "Ninety things you are thankful for, written down, by Thanksgiving.\n\nThat is Give Thanks. One psalm a day. Three things on your list. Five quiet minutes that will change your November.\n\nStarts November 1st."
    ]
  },
  "december-gospels-2026": {
    start: "2026-12-01",
    link: SITE + "/challenge-gospels",
    image: SITE + "/images/og-challenge.png",
    posts: [
      "This December, read the Gospels with me.\n\nMark shows you what Jesus did. John tells you who He is. Matthew proves He is the promised King. And Luke sits you at the manger on Christmas Eve.\n\nOr just read Luke, one chapter a day, and finish by Christmas Eve.",
      "What if this Christmas you knew exactly who that baby was?\n\nGod With Us: all four Gospels in December, ending at the manger on Christmas Eve. Or just Luke, one chapter a day.\n\nStarts December 1st.",
      "By Christmas Eve you will have read every word Jesus spoke, every miracle, every parable, every moment from the cross to the empty tomb.\n\nGod With Us starts December 1st. Fifteen minutes a day. Join us."
    ]
  }
};

// Book promos (always available, rotate evenly)
const FB_BOOK_PROMOS = [
  {
    message: "What happens when you say yes to God, and everything gets harder?\n\nWhen five foster children from hard places showed up at my door, I thought I was ready. What followed was a crash course in chaos, surrender, and the kind of obedience that doesn't come with applause.\n\nAre You That Dude's Girlfriend? is my story of learning to love like Jesus.",
    link: "https://www.amazon.com/Are-You-That-Dudes-Girlfriend/dp/B0FD8RZD3X/",
    image: SITE + "/images/cover-dude.png"
  },
  {
    message: "As I pulled into my driveway, my front door swung open and five children rushed out to greet me.\n\nWith a smile, I asked, \"Hey, what are you all doing at my house?\" One of them looked me up and down and loudly asked, \"Are you that dude's girlfriend?\"\n\nThat moment changed everything. This is my story of learning to love like Jesus.",
    link: "https://www.amazon.com/Are-You-That-Dudes-Girlfriend/dp/B0FD8RZD3X/",
    image: SITE + "/images/promo-dudes-gf.png"
  },
  {
    message: "I sat for a minute and then slowly I unbuckled my seatbelt, got out of my minivan and opened the trunk. It was the only way to reach Silas who was sitting in the middle of the back row, so yes, I climbed into the trunk of my own minivan to reach him.\n\nSome moments in fostering look nothing like what you imagined. This one changed me.",
    link: "https://www.amazon.com/Are-You-That-Dudes-Girlfriend/dp/B0FD8RZD3X/",
    image: SITE + "/images/promo-dudes-gf-2.jpg"
  },
  {
    message: "If someone called you a banana, would that make you one?\n\nI Am NOT a Banana is a children's book about knowing who you are. When hurtful names start to make Kenzie question herself, her mom helps her see the truth: just because someone says something doesn't make it true.\n\nPerfect for kids learning that their identity is not defined by what others say.",
    link: "https://a.co/d/02cusvs8",
    image: SITE + "/images/cover-banana.png"
  },
  {
    message: "Your identity is not in what others say, but in who God says you are.\n\nWhen someone asks about the pin, share with them that their worth and identity are not found in what others say, but in who God says they are.\n\nI Am NOT a Banana. A children's book about knowing who you are.",
    link: "https://a.co/d/02cusvs8",
    image: SITE + "/images/promo-banana-pin.jpg"
  },
  {
    message: "You are not yellow. You do not have a peel. You are not a fruit.\n\nWhen people lie about you or call you names, remember: they might as well be calling you a banana. Your identity is not in what others say, but in who God says you are.\n\nI Am NOT a Banana. For every kid who needs to hear this.",
    link: "https://a.co/d/02cusvs8",
    image: SITE + "/images/promo-banana-card.png"
  },
  {
    message: "Plant seeds of faith early.\n\nYou Can't Hide the Fruit is a board book that brings the Fruit of the Spirit to life for kids through colorful illustrations and playful rhymes. Love, joy, peace, patience, kindness, goodness, faithfulness, gentleness, and self-control as gifts from God that shine through them.\n\nFree with Kindle Unlimited.",
    link: "https://www.amazon.com/You-Cant-Hide-Fruit-Colorful-ebook/dp/B0GCV1N9FG",
    image: SITE + "/images/cover-fruit.png"
  },
  {
    message: "You can't plant hate and grow out love. So fill your heart with things above.\n\nBecause whatever's tucked inside your root will bloom and show up in your fruit.\n\nYou Can't Hide the Fruit. A Fruit of the Spirit board book for kids.",
    link: "https://www.amazon.com/You-Cant-Hide-Fruit-Colorful-ebook/dp/B0GCV1N9FG",
    image: SITE + "/images/promo-fruit-verse.png"
  },
  {
    message: "When the God of the universe speaks, we should listen and remember.\n\nI made a leather journal for exactly that. Soft cover, 100 lined pages. Perfect for prayer notes, sermon thoughts, or capturing the moments when God whispers truth to your heart.",
    link: SITE + "/books#journal",
    image: SITE + "/images/cover-journal.jpg"
  },
  {
    message: "\"That is the kind of God we serve. A God who is not shocked by our failures. A God who loves us too much to leave us stuck in them. A God who uses even our weakest, most broken moments to tell a bigger story of redemption.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.",
    link: "https://a.co/d/099u6QDX",
    image: SITE + "/images/promo-dudes-q1.png"
  },
  {
    message: "\"When we live so concerned about what others think of us, we can quickly turn any uncomfortable moment into an approval-seeking mission.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.",
    link: "https://a.co/d/099u6QDX",
    image: SITE + "/images/promo-dudes-q2.png"
  },
  {
    message: "\"If we're honest, we all wrestle with the desire to be noticed, to feel special, to be recognized and praised. Not just by people, but sometimes even by God.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.",
    link: "https://a.co/d/099u6QDX",
    image: SITE + "/images/promo-dudes-q3.png"
  },
  {
    message: "\"Two little girls. Two very different prayers. One filled with aching reality. One filled with innocent hopes. Both heard by the same God, who cared deeply about both.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.",
    link: "https://a.co/d/099u6QDX",
    image: SITE + "/images/promo-dudes-q4.png"
  },
  {
    message: "\"I told God I was tired. I did not want to keep loving people who hated me.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.",
    link: "https://a.co/d/099u6QDX",
    image: SITE + "/images/promo-dudes-q5.png"
  },
  {
    message: "\"Because loving like Jesus does not make sense. It never has.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.",
    link: "https://a.co/d/099u6QDX",
    image: SITE + "/images/promo-dudes-q6.png"
  },
  {
    message: "\"Chasing down a child who did not know how to trust love yet and showing up anyway. That is the Gospel.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.",
    link: "https://a.co/d/099u6QDX",
    image: SITE + "/images/promo-dudes-q7.png"
  },
  {
    message: "\"I never thought I'd be the kind of mom who makes dessert just so I could take it away... but there we were.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.",
    link: "https://a.co/d/099u6QDX",
    image: SITE + "/images/promo-dudes-q8.png"
  },
  {
    message: "\"The secret battles are the ones that shape our souls the most. Because they are the ones no one else sees. Only you and God know what is happening there.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.",
    link: "https://a.co/d/099u6QDX",
    image: SITE + "/images/promo-dudes-q9.png"
  },
  {
    message: "\"I learned that loving like Jesus is not about being perfect. It is not about being strong enough or prepared enough or spiritual enough. It is simply about being willing.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.",
    link: "https://a.co/d/099u6QDX",
    image: SITE + "/images/promo-dudes-q10.png"
  },
  // Built to Shine launch series: the lies women leading in business believe.
  // Introducing the book ahead of its September release.
  {
    message: "My new book is coming this September, and I want to start introducing you to what is inside.\n\nBuilt to Shine is for the woman leading with faith in the business world. And it is built around the lies we quietly believe. This one runs deep: if I am doing this right, everything should feel balanced.\n\nNobody walking in real obedience feels balanced all the time. Some seasons God asks for more than feels tidy.\n\nDoes your life feel balanced right now? Be honest.",
    link: SITE + "/built-to-shine",
    image: SITE + "/images/promo-bts-lie-balance.jpg"
  },
  {
    message: "The lie sounds like this: I am not qualified enough to lead here.\n\nIt shows up as chasing credentials instead of calling. Constant comparison. Feeling too young, or not enough. Passing yourself over before anyone else can.\n\nHere is the truth I wrote a whole chapter about: you do not need to earn your seat. You were invited before you arrived.\n\nBuilt to Shine comes out this September. For the woman leading with faith in the business world.",
    link: SITE + "/built-to-shine",
    image: SITE + "/images/promo-bts-lie-legitimacy.jpg"
  },
  {
    message: "I have to hide my faith to be successful in business.\n\nI believed some version of that lie for years. Faith over here, work over there, and never let them touch. But God did not build you in compartments, and the version of you He built is the one your work actually needs.\n\nSo here is the question that chapter asks: what part of myself am I hiding?\n\nBuilt to Shine, my new book for women leading with faith in the business world, comes out this September.",
    link: SITE + "/built-to-shine",
    image: SITE + "/images/promo-bts-lie-compartments.jpg"
  },
  {
    message: "Somewhere along the way, a lot of us picked up this lie: men and women are competitors, not co-laborers.\n\nScripture tells a different story. We were built to build together. When I stopped seeing the people around the table as rivals, leading got lighter and better.\n\nThe question this chapter of Built to Shine asks: who do I see as the enemy?\n\nComing this September, for the woman leading with faith in the business world.",
    link: SITE + "/built-to-shine",
    image: SITE + "/images/promo-bts-lie-usthem.jpg"
  },
  {
    message: "The quietest lie of them all: what I am doing does not really matter.\n\nThe hidden faithfulness. The unseen obedience. The work nobody claps for. The enemy would love for you to believe none of it counts.\n\nIt counts. It has always counted. Did my obedience actually matter? That question gets a whole chapter in Built to Shine, and the answer might make you cry in a good way.\n\nComing this September. For the woman leading with faith in the business world.",
    link: SITE + "/built-to-shine",
    image: SITE + "/images/promo-bts-lie-smallimpact.jpg"
  },
];

// Engagement posts — questions that get people talking (no link, no image)
const FB_ENGAGEMENT = [
  {
    message: "What is one verse you keep coming back to no matter what season you are in?\n\nDrop it below. I want to read every single one.",
  },
  {
    message: "Be honest: what time of day do you actually read your Bible?\n\nMorning person? Night owl? Lunch break warrior? Car line theologian?",
  },
  {
    message: "What is the hardest part of reading the Bible consistently?\n\nI will go first: finding the quiet. My house has never once been silent at 6am.",
  },
  {
    message: "If you could sit down with one person from the Bible and ask them one question, who would it be and what would you ask?",
  },
  {
    message: "What book of the Bible changed your life the most and why?\n\nI will tell you mine in the comments.",
  },
  {
    message: "Fill in the blank: I used to think faith meant __________, but now I know it means __________.",
  },
  {
    message: "What is one thing your kids have taught you about God that no sermon ever could?",
  },
  {
    message: "Who is one person in your life who showed you what it looks like to love like Jesus? Tag them or tell us about them.",
  },
  {
    message: "Real talk: what is the kindest thing a stranger has ever done for you?\n\nI need some good stories today.",
  },
  {
    message: "If you could give one piece of advice to a woman just stepping into leadership for the first time, what would it be?",
  },
  // Built to Shine conversation starters, pulled from the lies the book names
  {
    message: "Be honest, women in business: have you ever felt like you had to leave your faith in the parking lot to be taken seriously at work?\n\nI am writing about this exact thing and I want to hear your story.",
  },
  {
    message: "Fill in the blank: as a woman leading with faith, the lie I have to fight hardest is __________.\n\nNot enough? Too much? Doesn't matter? Say it out loud. Naming it is half the battle.",
  },
  {
    message: "Does anyone actually have a balanced life? Or do we all just have seasons where something gets more of us than everything else?\n\nAsking for a book I wrote.",
  },
  {
    message: "Tell me about a woman of faith in business who inspires you. Your boss, your friend, your mom, you.\n\nTag her or tell us about her. Let's fill this comment section with women worth celebrating.",
  },
  {
    message: "What is one small, unseen thing you do faithfully that nobody claps for?\n\nThe hidden work counts. I want to hear about yours today.",
  },
  // This-or-that
  {
    message: "This or that, Bible edition: Old Testament or New Testament? And why?",
  },
  {
    message: "Psalms or Proverbs? Pick one and tell me why it wins.",
  },
  {
    message: "Morning Bible reading or night Bible reading? No wrong answer but I have opinions.",
  },
  {
    message: "David or Joseph? Which one's story hits you harder?",
  },
  {
    message: "Reading one book of the Bible over and over or reading straight through? I know which camp I am in.",
  },
  {
    message: "Sermon on the Mount or Sermon on the Plain? (Bonus points if you even knew there were two.)",
  },
  {
    message: "Paul's letters or the Gospels? Which ones do you reach for first?",
  },
  {
    message: "Ruth or Esther? Two women, two wildly different stories, both incredible.",
  },
  {
    message: "Memorize Scripture or journal Scripture? Which one sticks better for you?",
  },
  {
    message: "Audio Bible or physical Bible? And do not say both, pick one.",
  },
  // Finish the sentence
  {
    message: "Finish this sentence: The book of the Bible I have reread the most is __________ because __________.",
  },
  {
    message: "Finish this sentence: The Bible story I wish more people knew about is __________.",
  },
  {
    message: "Finish this sentence: When I do not know what to read, I always go back to __________.",
  },
  {
    message: "Finish this sentence: The verse I needed most this year was __________.",
  },
  {
    message: "Finish this sentence: If I could teach my kids one thing from the Bible it would be __________.",
  },
  {
    message: "Finish this sentence: The Bible character I relate to the most right now is __________ and I am not sure that is a good thing.",
  },
  // What are you reading / studying / praying
  {
    message: "What are you reading in the Bible right now? Not what you think you should be reading. What are you actually in?",
  },
  {
    message: "What is one thing you are praying about this week? You do not have to explain it. Just name it. I will pray with you.",
  },
  {
    message: "What book are you studying right now, on your own or with your church? I am always looking for what God is doing in other people's reading.",
  },
  {
    message: "Is there a passage you keep getting pulled back to lately? Sometimes God puts the same verses in front of you over and over for a reason.",
  },
  {
    message: "What are you learning about God right now that you did not understand a year ago?",
  },
  // Polls / future challenges and blog topics
  {
    message: "What book of the Bible would you want to do a reading challenge on? I have some ideas but yours are better.",
  },
  {
    message: "I write a blog three times a week. What do you want me to write about next?\n\nA. Faith and parenting\nB. Leading as a woman in business\nC. Studying the Bible when you do not know where to start\nD. Something else, tell me in the comments",
  },
  {
    message: "If I did a 30-day challenge on one of these, which would you actually do?\n\nA. Sermon on the Mount\nB. The book of Acts\nC. Philippians\nD. Genesis 1-25 (Abraham's whole story)\n\nI am genuinely deciding. Help me out.",
  },
  {
    message: "What topic do you wish more people talked about honestly from a faith perspective? That is probably what I should be writing about.",
  },
  // Recommendations
  {
    message: "What is one book, other than the Bible, that Christ-following women should read? Drop your recommendation below.",
  },
  {
    message: "I need a new podcast. What are you listening to that actually makes you think and not just fills the silence?",
  },
  {
    message: "What worship song has been on repeat for you lately? I am building a playlist and I want yours on it.",
  },
  {
    message: "Who is a speaker you have heard that made you think 'I need to hear everything this person has ever said'? Tag them or tell me their name.",
  },
  {
    message: "What is one book you have given away more than once because it was that good?",
  },
  {
    message: "Drop your favorite worship album below. Not just a song, the whole album. The one you can play start to finish.",
  },
  // Short shareable prayers
  {
    message: "Lord, give me the courage to obey even when I cannot see where it leads. Amen.\n\nShare this with someone who needs it today.",
  },
  {
    message: "God, help me to be faithful in the small things today. Not impressive. Just faithful. Amen.",
  },
  {
    message: "Father, I do not know what this week holds but You do. That is enough. Amen.\n\nTag someone you are praying for this week.",
  },
  {
    message: "Lord, help me love the people in front of me today better than I did yesterday. Amen.",
  },
  {
    message: "God, quiet the noise. Show me what actually matters today. Amen.\n\nShare this if you need a simpler day.",
  },
  {
    message: "Father, I am tired. I am not quitting, but I am tired. Meet me here. Amen.\n\nIf this is you today, drop a heart below.",
  },
  {
    message: "Lord, give me wisdom with my kids today. Not perfection. Just wisdom. Amen.\n\nEvery parent needs this one. Share it.",
  },
  {
    message: "God, replace my anxiety with trust. Not because the situation changed, but because You have not. Amen.",
  },
  {
    message: "Father, use me today even if I do not feel ready. Amen.\n\nTag someone who needs to hear that readiness is not the requirement.",
  },
  {
    message: "Lord, forgive me for trying to control what was never mine to carry. Amen.\n\nShare this with someone who needs to let go today.",
  },
  {
    message: "God, thank You for showing up in the ordinary. The morning coffee. The safe drive. The kid who finally listened. None of it is small to You. Amen.",
  },
  {
    message: "Father, help me stop comparing my story to hers. You wrote them both on purpose. Amen.\n\nShare this with a woman who needs the reminder.",
  },
];

// Built to Shine pre-launch buzz
const FB_BTS = [
  {
    message: "I am writing a book for women in leadership.\n\nIt is called Built to Shine, and it is about the lies we carry into the rooms we lead in. The lie that says you need permission. The lie that says there is not enough room. The lie that says you have to be liked to be effective.\n\nWhich lie have you carried the longest? Tell me in the comments. Your story might end up shaping a chapter.",
  },
  {
    message: "Ten lies. Ten chapters. One truth that replaces each one.\n\nBuilt to Shine is coming soon, and it is for every woman who is leading something real and quietly wondering if she is doing it right.\n\nWhat is the biggest lie you have had to unlearn as a leader?",
  },
  {
    message: "\"You were not built to lead from these lies. You were built to shine.\"\n\nBuilt to Shine is almost here. A book for women leading with faith in the business world.\n\nJoin the launch team and be the first to read it.",
    link: SITE + "/launch-team"
  },
  {
    message: "Have you ever felt like you needed someone's permission before you could step into what God already called you to?\n\nThat is chapter one of Built to Shine. And it is the lie I carried the longest.\n\nComing soon. If this resonates, drop a heart below.",
  },
  {
    message: "The Lie of Scarcity says there is not enough room for you at the table.\n\nThe truth is God did not build a table with limited seats.\n\nBuilt to Shine is coming soon. For the woman who needs to hear this.",
  },
  {
    message: "Be honest: have you ever softened your leadership because you were afraid of not being liked?\n\nThat is the Lie of Likability, and it is one of ten lies I am writing about in Built to Shine.\n\nYou were not called to be liked. You were called to lead. Tell me your story below.",
  },
];

// Other projects (Connectly + Tr8ts — show up ~1-2x/month in rotation)
const FB_PROJECTS = [
  {
    message: "Stop losing business cards.\n\nI built Connectly because I was tired of coming home from events with a stack of cards I would never look at again. Now I scan them with my phone, the AI reads them, and every contact is saved and organized.\n\nSign up for a free account and never lose a connection again.",
    link: "https://connectly.social"
  },
  {
    message: "You met someone great at that event. You took their card. And now it is sitting in a drawer somewhere.\n\nConnectly fixes that. Scan the card, save the contact, set a reminder to follow up. It takes ten seconds and it is free.\n\nCreate your free account today.",
    link: "https://connectly.social"
  },
  {
    message: "I built a free DISC assessment for high schoolers.\n\nTr8ts helps students discover how they are wired: how they lead, how they communicate, how they handle conflict, and what kind of work fits them best.\n\nGreat for youth groups, classrooms, or any teenager figuring out who they are.",
    link: "https://tr8ts.com"
  },
  {
    message: "Know your traits.\n\nTr8ts is a free personality assessment I built for high school students. It takes a few minutes, and at the end they get a visual breakdown of how God wired them.\n\nShare it with a student, a youth group, or a teacher who would use it.",
    link: "https://tr8ts.com"
  },
  {
    message: "I used to be the person who came home from a conference with forty business cards rubber-banded together in my purse. I found them six months later and could not remember a single conversation.\n\nThat is why I built Connectly. Scan the card, save the contact, follow up before you forget why you connected in the first place.\n\nFree to use. No excuse not to try it.",
    link: "https://connectly.social"
  },
  {
    message: "The follow-up is where the relationship starts. The conference is just the introduction.\n\nConnectly helps you scan business cards, organize your contacts, and actually follow through on the connections you made. Because meeting someone is easy. Remembering to email them on Monday is the hard part.",
    link: "https://connectly.social"
  },
  {
    message: "If you are going to a conference this year, do yourself a favor. Download Connectly before you go.\n\nScan every card you get. Add a note about what you talked about. Set a reminder to follow up. You will thank yourself in two weeks when you actually remember who everyone was.",
    link: "https://connectly.social"
  },
  {
    message: "Networking does not have to feel gross. It is just people meeting people.\n\nConnectly makes the logistical part easy so you can focus on the human part. Scan cards, save contacts, follow up when you said you would. That is it. Free to use.",
    link: "https://connectly.social"
  },
  {
    message: "I co-founded GiveSendGo ten years ago because I believed people should be able to fund what matters to them. Now I am building something new.\n\nFilm Launcher is a platform for faith-based filmmakers to crowdfund their projects and distribute them in the same place. Fund it, make it, release it, all without losing your audience along the way.\n\nIf you are a filmmaker or you love faith-based film, this is for you.",
    link: "https://filmlauncher.com"
  },
  {
    message: "There are stories that need to be told and audiences waiting to watch them. The gap has always been funding and distribution.\n\nFilm Launcher closes that gap. Crowdfund your film, build your audience during production, and release it to the people who already believe in it.\n\nFor faith-based filmmakers who are tired of waiting for someone else to greenlight their vision.",
    link: "https://filmlauncher.com"
  },
];

// Pick the next upcoming challenge (or current if in first 14 days)
function getNextChallenge(easternDate) {
  const today = new Date(easternDate + "T00:00:00");
  for (const [id, cfg] of Object.entries(FB_CHALLENGE_PROMOS)) {
    const start = new Date(cfg.start + "T00:00:00");
    const daysSince = Math.floor((today - start) / 86400000);
    // Promote if challenge hasn't started yet, or is in its first 14 days
    if (daysSince < 14) return cfg;
  }
  return null; // All challenges are past
}


// Pick the day's promo with back-to-back limits:
//   - Max 1 book post in a row
//   - Max 2 engage posts in a row

// Book quote captions always credit the author. If a caption mentions one of
// the books after From but never names Heather, the byline is added right
// there, so posts loaded from the database get it too.
function withAuthor(msg) {
  if (!msg || msg.indexOf("Heather Lyn Wilson") !== -1) return msg;
  const titles = ["Are You That Dude's Girlfriend?", "I Am NOT a Banana", "You Can't Hide the Fruit", "Built to Shine"];
  for (const t of titles) {
    const marker = "From " + t;
    const i = msg.indexOf(marker);
    if (i === -1) continue;
    const at = i + marker.length;
    const next = msg[at] || "";
    if (".,!;:".indexOf(next) !== -1) {
      return msg.slice(0, at) + " by Heather Lyn Wilson" + msg.slice(at);
    }
    return msg.slice(0, at) + " by Heather Lyn Wilson." + msg.slice(at);
  }
  return msg;
}

function pickPromoForDate(pool, targetEastern, skipsMap) {
  // Walk every posting day from a fixed epoch to the target date, tracking
  // what ACTUALLY posts each day (including bumps and manual swaps), so the
  // back-to-back limits hold: max 1 book in a row, max 2 engage in a row.
  // Each posting day consumes the next slot in the pool (sequential rotation),
  // so no post repeats until the whole pool has had a turn. Pure UTC day
  // arithmetic keeps this cheap for Cloudflare CPU limits; posting slots fire
  // at 15:05/22:05 UTC, where the UTC date equals the Eastern date.
  const L = pool.length;
  const catAt = (i) => pool[i % L].category || "engage";
  const DAY = 86400000;
  const epochDay = Math.floor(Date.UTC(2026, 0, 1) / DAY);
  const targetMs = Date.parse(targetEastern + "T12:00:00Z");
  if (isNaN(targetMs)) return pool[0];
  const targetDay = Math.floor(targetMs / DAY);
  const prev = [];
  let slot = 0;
  for (let d = epochDay; d <= targetDay && d < epochDay + 800; d++) {
    const wd = (d + 4) % 7;
    if (wd !== 0 && wd !== 2 && wd !== 4 && wd !== 6) continue;
    const dt = new Date(d * DAY);
    const iso = dt.toISOString().slice(0, 10);
    const blocked = (c) =>
      (c === "book" && prev.length >= 1 && prev[0] === "book") ||
      (c === "engage" && prev.length >= 2 && prev[0] === "engage" && prev[1] === "engage");
    let pos = slot;
    let guard = 0;
    while (blocked(catAt(pos)) && guard++ < L) pos++;
    const skips = (skipsMap && skipsMap[iso]) || 0;
    for (let s = 0; s < skips; s++) {
      pos++;
      guard = 0;
      while (blocked(catAt(pos)) && guard++ < L) pos++;
    }
    const idx = pos % L;
    if (iso === targetEastern) return pool[idx];
    prev.unshift(catAt(idx));
    if (prev.length > 2) prev.length = 2;
    slot = pos + 1;
  }
  return pool[0];
}



// Every graphic post from the code rotation must exist in the live fb_posts
// database too, since the database drives the real schedule. Checks by image
// filename and inserts whatever is missing. Runs cheap once present.
async function ensureRotationPosts(DB) {
  try {
    const wanted = [
      { category: "book", message: "What happens when you say yes to God, and everything gets harder?\n\nWhen five foster children from hard places showed up at my door, I thought I was ready. What followed was a crash course in chaos, surrender, and the kind of obedience that doesn't come with applause.\n\nAre You That Dude's Girlfriend? is my story of learning to love like Jesus.", link: "https://www.amazon.com/Are-You-That-Dudes-Girlfriend/dp/B0FD8RZD3X/", image: "https://heatherlynwilson.com/images/cover-dude.png" },
      { category: "book", message: "As I pulled into my driveway, my front door swung open and five children rushed out to greet me.\n\nWith a smile, I asked, \"Hey, what are you all doing at my house?\" One of them looked me up and down and loudly asked, \"Are you that dude's girlfriend?\"\n\nThat moment changed everything. This is my story of learning to love like Jesus.", link: "https://www.amazon.com/Are-You-That-Dudes-Girlfriend/dp/B0FD8RZD3X/", image: "https://heatherlynwilson.com/images/promo-dudes-gf.png" },
      { category: "book", message: "I sat for a minute and then slowly I unbuckled my seatbelt, got out of my minivan and opened the trunk. It was the only way to reach Silas who was sitting in the middle of the back row, so yes, I climbed into the trunk of my own minivan to reach him.\n\nSome moments in fostering look nothing like what you imagined. This one changed me.", link: "https://www.amazon.com/Are-You-That-Dudes-Girlfriend/dp/B0FD8RZD3X/", image: "https://heatherlynwilson.com/images/promo-dudes-gf-2.jpg" },
      { category: "book", message: "If someone called you a banana, would that make you one?\n\nI Am NOT a Banana is a children's book about knowing who you are. When hurtful names start to make Kenzie question herself, her mom helps her see the truth: just because someone says something doesn't make it true.\n\nPerfect for kids learning that their identity is not defined by what others say.", link: "https://a.co/d/02cusvs8", image: "https://heatherlynwilson.com/images/cover-banana.png" },
      { category: "book", message: "Your identity is not in what others say, but in who God says you are.\n\nWhen someone asks about the pin, share with them that their worth and identity are not found in what others say, but in who God says they are.\n\nI Am NOT a Banana. A children's book about knowing who you are.", link: "https://a.co/d/02cusvs8", image: "https://heatherlynwilson.com/images/promo-banana-pin.jpg" },
      { category: "book", message: "You are not yellow. You do not have a peel. You are not a fruit.\n\nWhen people lie about you or call you names, remember: they might as well be calling you a banana. Your identity is not in what others say, but in who God says you are.\n\nI Am NOT a Banana. For every kid who needs to hear this.", link: "https://a.co/d/02cusvs8", image: "https://heatherlynwilson.com/images/promo-banana-card.png" },
      { category: "book", message: "Plant seeds of faith early.\n\nYou Can't Hide the Fruit is a board book that brings the Fruit of the Spirit to life for kids through colorful illustrations and playful rhymes. Love, joy, peace, patience, kindness, goodness, faithfulness, gentleness, and self-control as gifts from God that shine through them.\n\nFree with Kindle Unlimited.", link: "https://www.amazon.com/You-Cant-Hide-Fruit-Colorful-ebook/dp/B0GCV1N9FG", image: "https://heatherlynwilson.com/images/cover-fruit.png" },
      { category: "book", message: "You can't plant hate and grow out love. So fill your heart with things above.\n\nBecause whatever's tucked inside your root will bloom and show up in your fruit.\n\nYou Can't Hide the Fruit. A Fruit of the Spirit board book for kids.", link: "https://www.amazon.com/You-Cant-Hide-Fruit-Colorful-ebook/dp/B0GCV1N9FG", image: "https://heatherlynwilson.com/images/promo-fruit-verse.png" },
      { category: "book", message: "When the God of the universe speaks, we should listen and remember.\n\nI made a leather journal for exactly that. Soft cover, 100 lined pages. Perfect for prayer notes, sermon thoughts, or capturing the moments when God whispers truth to your heart.", link: "https://heatherlynwilson.com/books#journal", image: "https://heatherlynwilson.com/images/cover-journal.jpg" },
      { category: "book", message: "\"That is the kind of God we serve. A God who is not shocked by our failures. A God who loves us too much to leave us stuck in them. A God who uses even our weakest, most broken moments to tell a bigger story of redemption.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q1.png" },
      { category: "book", message: "\"When we live so concerned about what others think of us, we can quickly turn any uncomfortable moment into an approval-seeking mission.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q2.png" },
      { category: "book", message: "\"If we're honest, we all wrestle with the desire to be noticed, to feel special, to be recognized and praised. Not just by people, but sometimes even by God.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q3.png" },
      { category: "book", message: "\"Two little girls. Two very different prayers. One filled with aching reality. One filled with innocent hopes. Both heard by the same God, who cared deeply about both.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q4.png" },
      { category: "book", message: "\"I told God I was tired. I did not want to keep loving people who hated me.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q5.png" },
      { category: "book", message: "\"Because loving like Jesus does not make sense. It never has.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q6.png" },
      { category: "book", message: "\"Chasing down a child who did not know how to trust love yet and showing up anyway. That is the Gospel.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q7.png" },
      { category: "book", message: "\"I never thought I'd be the kind of mom who makes dessert just so I could take it away... but there we were.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q8.png" },
      { category: "book", message: "\"The secret battles are the ones that shape our souls the most. Because they are the ones no one else sees. Only you and God know what is happening there.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q9.png" },
      { category: "book", message: "\"I learned that loving like Jesus is not about being perfect. It is not about being strong enough or prepared enough or spiritual enough. It is simply about being willing.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q10.png" },
      { category: "bts", message: "My new book is coming this September, and I want to start introducing you to what is inside.\n\nBuilt to Shine is for the woman leading with faith in the business world. And it is built around the lies we quietly believe. This one runs deep: if I am doing this right, everything should feel balanced.\n\nNobody walking in real obedience feels balanced all the time. Some seasons God asks for more than feels tidy.\n\nDoes your life feel balanced right now? Be honest.", link: "https://heatherlynwilson.com/built-to-shine", image: "https://heatherlynwilson.com/images/promo-bts-lie-balance.jpg" },
      { category: "bts", message: "The lie sounds like this: I am not qualified enough to lead here.\n\nIt shows up as chasing credentials instead of calling. Constant comparison. Feeling too young, or not enough. Passing yourself over before anyone else can.\n\nHere is the truth I wrote a whole chapter about: you do not need to earn your seat. You were invited before you arrived.\n\nBuilt to Shine comes out this September. For the woman leading with faith in the business world.", link: "https://heatherlynwilson.com/built-to-shine", image: "https://heatherlynwilson.com/images/promo-bts-lie-legitimacy.jpg" },
      { category: "bts", message: "I have to hide my faith to be successful in business.\n\nI believed some version of that lie for years. Faith over here, work over there, and never let them touch. But God did not build you in compartments, and the version of you He built is the one your work actually needs.\n\nSo here is the question that chapter asks: what part of myself am I hiding?\n\nBuilt to Shine, my new book for women leading with faith in the business world, comes out this September.", link: "https://heatherlynwilson.com/built-to-shine", image: "https://heatherlynwilson.com/images/promo-bts-lie-compartments.jpg" },
      { category: "bts", message: "Somewhere along the way, a lot of us picked up this lie: men and women are competitors, not co-laborers.\n\nScripture tells a different story. We were built to build together. When I stopped seeing the people around the table as rivals, leading got lighter and better.\n\nThe question this chapter of Built to Shine asks: who do I see as the enemy?\n\nComing this September, for the woman leading with faith in the business world.", link: "https://heatherlynwilson.com/built-to-shine", image: "https://heatherlynwilson.com/images/promo-bts-lie-usthem.jpg" },
      { category: "bts", message: "The quietest lie of them all: what I am doing does not really matter.\n\nThe hidden faithfulness. The unseen obedience. The work nobody claps for. The enemy would love for you to believe none of it counts.\n\nIt counts. It has always counted. Did my obedience actually matter? That question gets a whole chapter in Built to Shine, and the answer might make you cry in a good way.\n\nComing this September. For the woman leading with faith in the business world.", link: "https://heatherlynwilson.com/built-to-shine", image: "https://heatherlynwilson.com/images/promo-bts-lie-smallimpact.jpg" }
    ];
    const existing = await DB.prepare("SELECT image_url FROM fb_posts").all();
    const have = new Set((existing.results || []).map(r => (r.image_url || "").split("/").pop()).filter(Boolean));
    try { await DB.prepare("UPDATE fb_posts SET active = 1 WHERE active IS NULL").run(); } catch (e) {}
    const missing = wanted.filter(w => !have.has(w.image.split("/").pop()));
    if (!missing.length) return;
    const orders = {};
    for (const w of missing) {
      if (orders[w.category] === undefined) {
        const maxRow = await DB.prepare("SELECT MAX(sort_order) AS mx FROM fb_posts WHERE category = ?").bind(w.category).first();
        orders[w.category] = ((maxRow && maxRow.mx != null) ? maxRow.mx : -1) + 1;
      }
      await DB.prepare(
        "INSERT INTO fb_posts (category, message, link, image_url, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)"
      ).bind(w.category, w.message, w.link, w.image, orders[w.category]++).run();
    }
  } catch (e) {}
}

async function postFbPromo(env) {
  if (!env.FB_PAGE_TOKEN) return;
  await ensureRotationPosts(env.DB);

  const now = new Date();
  const easternDate = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  // Manual swaps from the admin schedule (all days: past swaps shape the
  // back-to-back history, today's swap changes today's pick)
  let skipsMap = {};
  try {
    const sk = await env.DB.prepare("SELECT date, skips FROM fb_skips").all();
    (sk.results || []).forEach(r => { skipsMap[r.date] = r.skips; });
  } catch (e) {}

  // Try to load posts from D1; fall back to hardcoded arrays
  let dbPosts = null;
  try {
    const { results } = await env.DB.prepare("SELECT * FROM fb_posts WHERE active = 1 ORDER BY category, sort_order").all();
    if (results && results.length > 0) dbPosts = results;
  } catch (e) { console.log("FB D1 read failed, using hardcoded:", e.message); }

  let promo;
  if (dbPosts) {
    // Group DB posts by category
    const bucketMap = {};
    for (const p of dbPosts) {
      if (!bucketMap[p.category]) bucketMap[p.category] = [];
      bucketMap[p.category].push({ message: p.message, link: p.link || "", image: p.image_url || "", category: p.category });
    }
    const bucketArrays = ["book", "engage", "bts", "site", "project"].filter(c => bucketMap[c]?.length).map(c => bucketMap[c]);

    // Add challenge posts
    const nextCh = getNextChallenge(easternDate);
    const chPosts = [];
    if (nextCh) {
      nextCh.posts.forEach((msg, i) => {
        const img = nextCh.images ? nextCh.images[i % nextCh.images.length] : nextCh.image;
        chPosts.push({ message: msg, link: nextCh.link, image: img, category: "challenge" });
      });
    }
    if (chPosts.length) bucketArrays.push(chPosts);

    // Interleave
    const pool = [];
    const maxLen = Math.max(...bucketArrays.map(b => b.length));
    for (let i = 0; i < maxLen; i++) {
      for (const bucket of bucketArrays) {
        if (i < bucket.length) pool.push(bucket[i]);
      }
    }

    promo = pickPromoForDate(pool, easternDate, skipsMap);
  } else {
    // Fallback to hardcoded arrays
    const nextCh = getNextChallenge(easternDate);
    const chPosts = [];
    if (nextCh) {
      nextCh.posts.forEach((msg, i) => {
        const img = nextCh.images ? nextCh.images[i % nextCh.images.length] : nextCh.image;
        chPosts.push({ message: msg, link: nextCh.link, image: img, category: "challenge" });
      });
    }
    const labeled = [["book", FB_BOOK_PROMOS], ["engage", FB_ENGAGEMENT], ["bts", FB_BTS], ["challenge", chPosts], ["project", FB_PROJECTS]];
    const buckets = labeled.filter(([, b]) => b.length).map(([cat, b]) => b.map(p => ({ ...p, category: p.category || cat })));
    const pool = [];
    const maxLen = Math.max(...buckets.map(b => b.length));
    for (let i = 0; i < maxLen; i++) {
      for (const bucket of buckets) {
        if (i < bucket.length) pool.push(bucket[i]);
      }
    }

    promo = pickPromoForDate(pool, easternDate, skipsMap);
  }

  try {
    // Posts with photos use /photos endpoint; text-only and link posts use /feed
    const hasImage = !!promo.image;
    const hasLink = !!promo.link;
    const endpoint = hasImage
      ? `https://graph.facebook.com/v20.0/${FB_PAGE_ID}/photos`
      : `https://graph.facebook.com/v20.0/${FB_PAGE_ID}/feed`;
    const baseMsg = withAuthor(promo.message);
    const msgText = hasLink ? baseMsg + "\n\n" + promo.link : baseMsg;
    const bodyParts = [`message=${encodeURIComponent(msgText)}`, `access_token=${encodeURIComponent(env.FB_PAGE_TOKEN)}`];
    if (hasImage) bodyParts.push(`url=${encodeURIComponent(promo.image)}`);
    else if (hasLink) bodyParts.push(`link=${encodeURIComponent(promo.link)}`);

    const fbRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: bodyParts.join("&"),
    });
    if (fbRes.ok) console.log("FB promo posted: " + (promo.link || "engagement"));
    else {
      const err = await fbRes.text();
      console.error("FB promo failed:", err);
      // Alert on token expiry
      if (err.includes("OAuthException") || err.includes("expired")) {
        if (env.BREVO_API_KEY) {
          try {
            await fetch("https://api.brevo.com/v3/smtp/email", {
              method: "POST",
              headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({
                sender: { name: "HeatherLynWilson.com", email: "heather@heatherlynwilson.com" },
                to: [{ email: "heather@givesendgo.com", name: "Heather" }],
                subject: "Facebook auto-posting stopped: token expired",
                textContent: "Your Facebook Page token has expired. Blog and promo posts are no longer auto-posting to your Facebook page.\n\nTo fix it: go to developers.facebook.com/tools/explorer, select the HeatherLynWilson app, select your page, add pages_manage_posts permission, generate a new token, and tell Claude to update it.",
              }),
            });
          } catch (e2) {}
        }
      }
    }
  } catch (e) { console.error("FB promo error:", e.message); }
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
  { id: "october-proverbs-2026", total: 31, official: "2026-10-01", hash: "#october-proverbs-2026", invite: SITE + "/challenge-proverbs", footer: "the Around the Table challenge", contentUrl: SITE + "/challenge/emails-proverbs.json" },
  { id: "november-thanks-2026", total: 30, official: "2026-11-01", hash: "#november-thanks-2026", invite: SITE + "/challenge-thanks", footer: "the Give Thanks challenge" },
  { id: "december-gospels-2026", total: 31, official: "2026-12-01", hash: "#december-gospels-2026", invite: SITE + "/challenge-gospels", footer: "the God With Us challenge" },
];

async function fetchJsonSafe(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "hlw-cron" } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

// Email content lives in the challenge_emails D1 table (editable by Heather
// from the admin page). Returns {day: row} or null if the plan is not seeded,
// in which case callers fall back to the packaged content.
async function loadPlanEmailMap(env, plan) {
  try {
    const q = await env.DB.prepare(
      "SELECT day, subject, reading, title, focus, prayer_focus, prayer_verse, practice, body FROM challenge_emails WHERE plan = ? ORDER BY day"
    ).bind(plan).all();
    const rows = q.results || [];
    if (!rows.length) return null;
    const map = {};
    rows.forEach(r => { map[r.day] = r; });
    return map;
  } catch (e) { return null; }
}

// Readers can turn off challenge emails and group notifications at
// /api/unsubscribe without touching their signups. Senders skip them.
// One email per address, no matter what the table holds. Guards against
// mixed-case duplicates and any stray double signup rows.
function dedupeByEmail(rows) {
  const seen = new Set();
  return (rows || []).filter(r => {
    const key = String(r.email || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadEmailOptouts(env) {
  // challenge = legacy "stop all challenge emails" flag,
  // pair = per-challenge stops saved as "email|challenge-id"
  const out = { challenge: new Set(), group: new Set(), pair: new Set() };
  try {
    const q = await env.DB.prepare(
      "SELECT email, challenge_optout, group_optout FROM email_prefs WHERE challenge_optout = 1 OR group_optout = 1"
    ).all();
    (q.results || []).forEach(r => {
      if (r.challenge_optout) out.challenge.add(r.email);
      if (r.group_optout) out.group.add(r.email);
    });
  } catch (e) {}
  try {
    const p = await env.DB.prepare(
      "SELECT email, challenge FROM challenge_email_optouts"
    ).all();
    (p.results || []).forEach(r => out.pair.add(r.email + "|" + r.challenge));
  } catch (e) {}
  return out;
}

function challengeEmailStopped(optouts, email, challengeId) {
  if (!optouts) return false;
  if (optouts.challenge.has(email)) return true;
  return optouts.pair.has(email + "|" + challengeId);
}

async function sendChallengeEmails(env) {
  if (!env.BREVO_API_KEY || !env.DB) {
    console.log("No BREVO_API_KEY or DB, skipping challenge emails.");
    return;
  }
  const now = new Date();
  const easternDate = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const todayDate = new Date(easternDate + "T00:00:00");

  const optouts = await loadEmailOptouts(env);
  for (const cfg of CHALLENGE_CONFIGS) {
    try {
      await sendOneChallenge(env, cfg, todayDate, optouts);
    } catch (e) {
      console.error(`Challenge send failed for ${cfg.id}:`, e.message);
    }
  }
}

async function sendOneChallenge(env, cfg, todayDate, optouts) {
  let results;
  try {
    const q = await env.DB.prepare(
      "SELECT name, email, track, personal_start_date FROM challenge_signups WHERE challenge = ?"
    ).bind(cfg.id).all();
    results = dedupeByEmail(q.results);
  } catch (e) {
    console.error(`Could not query signups for ${cfg.id}:`, e.message);
    return;
  }
  if (!results.length) return;

  // Load last check-in date per user for this challenge (for inactive detection)
  const lastCheckin = {};
  try {
    const q = await env.DB.prepare(
      "SELECT email, MAX(checked_at) as last_at FROM challenge_checkins WHERE challenge = ? GROUP BY email"
    ).bind(cfg.id).all();
    (q.results || []).forEach(r => { lastCheckin[r.email] = r.last_at; });
  } catch (e) {}

  const isMonday = todayDate.getDay() === 1;

  // Community count for this challenge
  let communityCount = 0;
  try {
    const row = await env.DB.prepare(
      "SELECT COUNT(DISTINCT email) as cnt FROM challenge_checkins WHERE challenge = ?"
    ).bind(cfg.id).first();
    communityCount = row ? row.cnt : 0;
  } catch (e) {}

  // Content: the D1 challenge_emails table is the source of truth (editable
  // from the admin page). Fall back to the packaged content if not seeded.
  let dbFB = null, dbFBv2 = null, fbV2Fallback = null, dbNT = null, dbChrono = null, chronoFallback = null, dbMap = null;
  const db90 = {}, fb90 = {};
  if (cfg.id === "july-2026") {
    dbFB = await loadPlanEmailMap(env, "full-bible");
    dbFBv2 = await loadPlanEmailMap(env, "full-bible-v2");
    if (!dbFBv2 && results.some(u => u.track === "full-bible")) {
      fbV2Fallback = await fetchJsonSafe(SITE + "/challenge/emails-full-bible-v2.json");
    }
    dbNT = await loadPlanEmailMap(env, "new-testament");
    dbChrono = await loadPlanEmailMap(env, "chronological");
    if (!dbChrono && results.some(u => u.track === "chronological")) {
      chronoFallback = await fetchJsonSafe(SITE + "/challenge/emails-chronological.json");
    }
    // The four 3-month plans all work the same way: weekly emails, content
    // from the D1 table first, packaged JSON as the fallback.
    for (const p of ["bible-90", "chrono-90", "ot-90", "nt-90"]) {
      db90[p] = await loadPlanEmailMap(env, p);
      if (!db90[p] && results.some(u => u.track === p)) {
        fb90[p] = await fetchJsonSafe(SITE + "/challenge/emails-" + p + ".json");
      }
    }
  } else if (cfg.id === "august-james-2026") {
    dbMap = await loadPlanEmailMap(env, "james");
  } else if (cfg.id === "september-beatitudes-2026") {
    dbMap = await loadPlanEmailMap(env, "beatitudes");
  } else if (cfg.id === "october-proverbs-2026") {
    dbMap = await loadPlanEmailMap(env, "proverbs");
  } else if (cfg.id === "november-thanks-2026" || cfg.id === "december-gospels-2026") {
    const trackPlans = cfg.id === "november-thanks-2026"
      ? { "one-psalm": "thanks", "all-psalms": "psalms-150" }
      : { "four-gospels": "gospels", "luke": "luke" };
    for (const t of Object.keys(trackPlans)) {
      const p = trackPlans[t];
      db90[p] = await loadPlanEmailMap(env, p);
      if (!db90[p] && results.some(u => u.track === t)) {
        fb90[p] = await fetchJsonSafe(SITE + "/challenge/emails-" + p + ".json");
      }
    }
  }

  let content = null;
  if (cfg.contentUrl && !dbMap) {
    content = await fetchJsonSafe(cfg.contentUrl);
    if (!content) { console.error(`No content for ${cfg.id}, skipping.`); return; }
  }

  const secret = env.NOTIFY_SECRET || "challenge-secret";
  const validUntil = "2026-10-01";
  let sent = 0, errors = 0, due = 0;

  for (let i = 0; i < results.length; i += 10) {
    const batch = results.slice(i, i + 10);
    const promises = batch.map(async (user) => {
      if (challengeEmailStopped(optouts, user.email, cfg.id)) return;
      const startStr = user.personal_start_date || cfg.official;
      const userStart = new Date(startStr + "T00:00:00");
      const diffMs = todayDate - userStart;
      const personalDay = diffMs < 0 ? 0 : Math.floor(diffMs / 86400000) + 1;
      const is90 = String(user.track || "").endsWith("-90");
      const userTotal = is90 ? 90 : cfg.total;
      if (personalDay < 1 || personalDay > userTotal) return;
      // The 3-month plans get one email at the start of each week, not daily
      if (is90 && (personalDay - 1) % 7 !== 0) return;
      due++;

      const name = user.name || "friend";
      const email = user.email;

      // Inactive detection: no check-in in 7+ days → weekly summary on Mondays only
      // Skip first 7 days (give them a chance to get started)
      if (personalDay > 7 && !is90) {
        const lastAt = lastCheckin[email];
        let daysSinceCheckin = personalDay; // never checked in = treat as inactive since start
        if (lastAt) {
          const lastDate = new Date(lastAt.includes("T") ? lastAt : lastAt + "T00:00:00");
          daysSinceCheckin = Math.floor((todayDate - lastDate) / 86400000);
        }
        if (daysSinceCheckin >= 7) {
          if (!isMonday) return; // skip daily email for inactive users on non-Monday
          // Monday: send weekly catch-up summary instead of daily email
          const dashToken = await hmacHex(secret, email + ":challenge:" + validUntil);
          const dashboardUrl = `${SITE}/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${dashToken}${cfg.hash}`;
          const unsubToken = await hmacHex(secret, email);
          const unsubUrl = `${SITE}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubToken}`;
          try {
            const weeklyHtml = buildWeeklyCatchupEmail(name, cfg, user.track, personalDay, userTotal, startStr, dashboardUrl, unsubUrl);
            const res = await fetch("https://api.brevo.com/v3/smtp/email", {
              method: "POST",
              headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({
                sender: { name: "Heather Lyn Wilson", email: "heather@heatherlynwilson.com" },
                to: [{ email, name }],
                subject: "Your week in the Word: where you are and what is next",
                htmlContent: weeklyHtml,
              }),
            });
            if (res.ok) sent++;
            else errors++;
          } catch (e) { errors++; }
          return;
        }
      }

      const dashToken = await hmacHex(secret, email + ":challenge:" + validUntil);
      const dashboardUrl = `${SITE}/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${dashToken}${cfg.hash}`;
      const unsubToken = await hmacHex(secret, email);
      const unsubUrl = `${SITE}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubToken}`;

      let subject, htmlContent;

      // Near the finish line, point them at the other challenges: two days
      // before the end (plan ahead) and on the last day (keep going). The
      // 3-month plans get it on their final weekly email.
      const week90 = is90 ? Math.floor((personalDay - 1) / 7) + 1 : 0;
      const isLastEmail = is90 ? (week90 === 13) : (personalDay === userTotal);
      const showNext = isLastEmail || (!is90 && personalDay === userTotal - 2);
      const nextBlock = showNext ? buildWhatsNextBlock(cfg.id, isLastEmail) : "";

      // Build group status block for this user
      let groupBlock = "";
      let groupName = "";
      try {
        const gr = await env.DB.prepare(
          "SELECT g.id, g.name FROM challenge_groups g INNER JOIN group_members gm ON gm.group_id = g.id WHERE gm.email = ? AND g.challenge = ? LIMIT 1"
        ).bind(email, cfg.id).first();
        if (gr) groupName = gr.name || "";
        if (gr && personalDay > 1) {
          const yesterdayDay = personalDay - 1;
          const mc = await env.DB.prepare("SELECT COUNT(*) as total FROM group_members WHERE group_id = ?").bind(gr.id).first();
          const cc = await env.DB.prepare(
            "SELECT COUNT(DISTINCT cc.email) as cnt FROM challenge_checkins cc INNER JOIN group_members gm ON gm.email = cc.email AND gm.group_id = ? WHERE cc.challenge = ? AND cc.day = ?"
          ).bind(gr.id, cfg.id, yesterdayDay).first();
          const total = mc ? mc.total : 0;
          const checked = cc ? cc.cnt : 0;
          if (total > 1) {
            const allRead = checked >= total;
            const statusText = allRead ? "Everyone read yesterday!" : checked + " of " + total + " friends read yesterday.";
            groupBlock = `<tr><td style="padding:0 32px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ef;border-radius:6px;">
<tr><td style="padding:14px 20px;">
<p style="margin:0;font-size:14px;font-weight:600;color:#1f2937;font-family:-apple-system,sans-serif;">Your group: ${gr.name}</p>
<p style="margin:4px 0 0;font-size:14px;color:#4b5563;font-family:-apple-system,sans-serif;">${statusText} <a href="${dashboardUrl}" style="color:#b85638;font-weight:600;">See your group &rarr;</a></p>
</td></tr></table></td></tr>`;
          }
        }
      } catch (e) {}

      if (cfg.id === "july-2026") {
        let d = null;
        let dayLabel = "DAY " + personalDay + " OF 31";
        if (is90) {
          const week = Math.floor((personalDay - 1) / 7) + 1;
          const map = db90[user.track];
          const fb = fb90[user.track];
          d = (map && map[week]) || (fb && fb[week - 1]);
          dayLabel = "WEEK " + week + " OF 13";
        } else if (user.track === "chronological") {
          d = (dbChrono && dbChrono[personalDay]) || (chronoFallback && chronoFallback[personalDay - 1]);
        } else if (user.track === "new-testament") {
          d = (dbNT && dbNT[personalDay]) || EMAILS_NT[personalDay - 1];
        } else if (startStr >= "2026-07-29") {
          // Rebalanced whole-Bible plan for readers who start July 29 or later
          d = (dbFBv2 && dbFBv2[personalDay]) || (fbV2Fallback && fbV2Fallback[personalDay - 1]) || EMAILS_FB[personalDay - 1];
        } else {
          d = (dbFB && dbFB[personalDay]) || EMAILS_FB[personalDay - 1];
        }
        if (!d) return;
        subject = d.subject;
        const bodyText = d.body.replace("Good morning.", `Good morning, ${name}.`);
        htmlContent = buildEmailHtml(dayLabel, d.reading, bodyText, dashboardUrl, communityCount, unsubUrl, nextBlock);
      } else if (cfg.id === "august-james-2026") {
        const d = (dbMap && dbMap[personalDay]) || (content && content[personalDay - 1]);
        if (!d) return;
        subject = d.subject || ("Day " + personalDay + ": James");
        let body = d.body.replace("Good morning.", `Good morning, ${name}.`);
        const heading = d.reading || "James 1-5";
        const eyebrow = d.prayer_focus ? ("Prayer focus: " + d.prayer_focus) : "Today's reading";
        htmlContent = buildChallengeEmail({ dayNum: personalDay, total: cfg.total, eyebrow, heading, body, dashboardUrl, communityCount, invite: cfg.invite, footer: cfg.footer, unsubUrl, groupBlock, nextBlock });
      } else if (cfg.id === "september-beatitudes-2026") {
        const d = (dbMap && dbMap[personalDay]) || (content && content[personalDay - 1]);
        if (!d) return;
        subject = "Day " + personalDay + ": " + (d.title || "The Beatitudes");
        let body = (d.body || "");
        if (d.practice) body += "\n\nToday: " + d.practice;
        htmlContent = buildChallengeEmail({ dayNum: personalDay, total: cfg.total, eyebrow: d.focus || "Today", heading: d.title || "The Beatitudes", body, dashboardUrl, communityCount, invite: cfg.invite, footer: cfg.footer, unsubUrl, groupBlock, nextBlock });
      } else if (cfg.id === "october-proverbs-2026") {
        const d = (dbMap && dbMap[personalDay]) || (content && content[personalDay - 1]);
        if (!d) return;
        subject = d.subject || ("Day " + personalDay + ": Proverbs " + personalDay);
        const body = composeProverbsEmailBody(d);
        htmlContent = buildChallengeEmail({ dayNum: personalDay, total: cfg.total, eyebrow: d.reading || ("Proverbs " + personalDay), heading: d.title || "Around the Table", body, dashboardUrl, communityCount, invite: cfg.invite, footer: cfg.footer, unsubUrl, groupBlock, nextBlock });
      } else if (cfg.id === "november-thanks-2026") {
        const plan = user.track === "all-psalms" ? "psalms-150" : "thanks";
        const d = (db90[plan] && db90[plan][personalDay]) || (fb90[plan] && fb90[plan][personalDay - 1]);
        if (!d) return;
        subject = d.subject || ("Day " + personalDay + ": Give Thanks");
        let body = (d.body || "").replace("Good morning.", `Good morning, ${name}.`);
        const pr = d.prompt || d.practice || "";
        if (pr) body += "\n\nToday's list: " + pr;
        htmlContent = buildChallengeEmail({ dayNum: personalDay, total: cfg.total, eyebrow: d.reading || "Today's psalm", heading: d.title || "Give Thanks", body, dashboardUrl, communityCount, invite: cfg.invite, footer: cfg.footer, unsubUrl, groupBlock, nextBlock });
      } else if (cfg.id === "december-gospels-2026") {
        const plan = user.track === "luke" ? "luke" : "gospels";
        const d = (db90[plan] && db90[plan][personalDay]) || (fb90[plan] && fb90[plan][personalDay - 1]);
        if (!d) return;
        subject = d.subject || ("Day " + personalDay + ": The Gospels");
        const body = (d.body || "").replace("Good morning.", `Good morning, ${name}.`);
        htmlContent = buildChallengeEmail({ dayNum: personalDay, total: cfg.total, eyebrow: (d.focus ? d.focus + " | " : "") + (d.reading || "Today's reading"), heading: d.title || "God With Us", body, dashboardUrl, communityCount, invite: cfg.invite, footer: cfg.footer, unsubUrl, groupBlock, nextBlock });
      } else {
        return;
      }

      // Append group name to subject for group members
      if (groupName) subject = subject + " | " + groupName;

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

// Around the Table daily email body. Content comes from either the JSON file
// (q_young/q_teen arrays, family_challenge, tip) or the D1 challenge_emails
// table (questions joined with newlines in prayer_focus/prayer_verse,
// family challenge in focus, tip in practice).
function composeProverbsEmailBody(d) {
  const qy = Array.isArray(d.q_young) ? d.q_young : (d.prayer_focus ? String(d.prayer_focus).split("\n").filter(Boolean) : []);
  const qt = Array.isArray(d.q_teen) ? d.q_teen : (d.prayer_verse ? String(d.prayer_verse).split("\n").filter(Boolean) : []);
  const fam = d.family_challenge || d.focus || "";
  const tip = d.tip || d.practice || "";
  const littles = d.littles || d.verse_ref || "";
  let out = d.body || "";
  if (littles) out = "Reading with little ones? Read just " + littles + " out loud. Proverbs talks honestly about grown-up things, so this keeps the reading age right. Older kids and parents read the whole chapter.\n\n" + out;
  if (qy.length) out += "\n\nFor ages 5 to 10:\n" + qy.map(q => "• " + q).join("\n");
  if (qt.length) out += "\n\nFor ages 11 to 17:\n" + qt.map(q => "• " + q).join("\n");
  if (fam) out += "\n\nFamily challenge: " + fam;
  if (tip) out += "\n\nReal life tip: " + tip;
  return out;
}

// Generic challenge email used by James and the Beatitudes.
// Weekly catch-up email for inactive readers (no check-in in 7+ days).
// Lists the coming week's readings with dates so they know what to read.
function buildWeeklyCatchupEmail(name, cfg, track, personalDay, userTotal, startStr, dashboardUrl, unsubUrl) {
  const greeting = name || "friend";
  // Build the next 7 days of readings
  const userStart = new Date(startStr + "T00:00:00");
  let rows = "";
  for (let d = personalDay; d < Math.min(personalDay + 7, userTotal + 1); d++) {
    const dayDate = new Date(userStart.getTime() + (d - 1) * 86400000);
    const dateLabel = dayDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    rows += `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e0d5;font-family:-apple-system,sans-serif;">
<span style="font-size:13px;font-weight:700;color:#b85638;min-width:50px;display:inline-block;">Day ${d}</span>
<span style="font-size:14px;color:#6b7280;margin-left:4px;">${dateLabel}</span>
</td></tr>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;"><tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1f2937;padding:28px 32px;">
<span style="color:#fff;font-size:20px;font-family:Georgia,serif;">HeatherLynWilson.com</span>
<span style="float:right;color:#c8a365;font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;padding-top:4px;">WEEKLY UPDATE</span>
</td></tr>
<tr><td style="padding:36px 32px 16px;">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Good morning, ${greeting}.</p>
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">It has been a little while since you checked in. No guilt in that. Life is full. Here is where you are and what is ahead this week:</p>
</td></tr>
<tr><td style="padding:0 32px 16px;">
<p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1f2937;font-family:-apple-system,sans-serif;">You are on Day ${personalDay} of ${userTotal}</p>
<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
</td></tr>
<tr><td style="padding:16px 32px 24px;">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Pick any day and start there. Your dashboard has the full reading for each one. When you check in again, your daily emails will pick right back up.</p>
</td></tr>
<tr><td style="padding:0 32px 28px;" align="center">
<a href="${dashboardUrl}" style="display:inline-block;padding:14px 32px;background:#b85638;color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Open My Dashboard</a>
</td></tr>
<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this weekly summary because you have not checked in recently. Check in on your dashboard and your daily emails will resume.<br>
<a href="${unsubUrl}" style="color:#6b7280;">Manage email preferences</a></p>
</td></tr>
</table></td></tr></table></body></html>`;
}

// "What's next" block, shown near the end of every challenge (two days
// before the finish and on the last day) so readers pick their next
// challenge while the habit is strong.
function buildWhatsNextBlock(currentId, finished) {
  const items = [];
  if (currentId === "july-2026") {
    items.push({ name: "Read it again, a different way", url: SITE + "/bible-plans", desc: "Chronological, the New Testament, or a gentler 3 month pace. Use Start over on your dashboard to switch plans and keep your history." });
  } else {
    items.push({ name: "The Bible Reading Challenge", url: SITE + "/challenge-bible", desc: "The whole Bible or the New Testament, in 31 days or 3 months. Start any day you like." });
  }
  if (currentId !== "august-james-2026") {
    items.push({ name: "One Book Deep: James", url: SITE + "/challenge-james", desc: "The entire book of James every day for a month, with a daily prayer focus and journal." });
  }
  if (currentId !== "september-beatitudes-2026") {
    items.push({ name: "Hide It In Your Heart", url: SITE + "/challenge-beatitudes", desc: "Memorize the Beatitudes in 30 days, one line at a time, with games that make it stick." });
  }
  if (currentId !== "october-proverbs-2026") {
    items.push({ name: "Around the Table", url: SITE + "/challenge-proverbs", desc: "One Proverbs chapter a day as a family. Questions for the kids, at the table or in the car." });
  }
  if (currentId !== "november-thanks-2026") {
    items.push({ name: "Give Thanks", url: SITE + "/challenge-thanks", desc: "A psalm a day and a gratitude list that becomes a keepsake for the Thanksgiving table. Or all 150 Psalms in a month." });
  }
  if (currentId !== "december-gospels-2026") {
    items.push({ name: "God With Us", url: SITE + "/challenge-gospels", desc: "All four Gospels in a month with the manger landing on Christmas Eve, or Luke one chapter a day." });
  }
  const rows = items.map(it =>
    `<p style="margin:0 0 12px;font-size:14px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;"><a href="${it.url}" style="color:#b85638;font-weight:600;text-decoration:none;">${it.name}</a><br>${it.desc}</p>`
  ).join("");
  const head = finished ? "You made it. Do not stop here." : "Almost there. Pick your next one now.";
  const sub = finished
    ? "The habit you built is the real win. Here is where to take it next:"
    : "Just a couple of days left. Deciding your next challenge now is the best way to keep the habit going:";
  return `<tr><td style="padding:0 32px 24px;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ef;border:1px solid #e5e0d5;border-radius:8px;">
<tr><td style="padding:20px 22px;">
<p style="margin:0 0 4px;font-size:12px;color:#b85638;font-family:-apple-system,sans-serif;font-weight:700;letter-spacing:1px;text-transform:uppercase;">WHAT'S NEXT</p>
<p style="margin:0 0 12px;font-size:17px;color:#1f2937;font-family:Georgia,serif;font-weight:600;">${head}</p>
<p style="margin:0 0 14px;font-size:14px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">${sub}</p>
${rows}
</td></tr></table>
</td></tr>`;
}

function buildChallengeEmail({ dayNum, total, eyebrow, heading, body, dashboardUrl, communityCount, invite, footer, unsubUrl, groupBlock, nextBlock }) {
  const paragraphs = body.split("\n\n").map(p => {
    if (p === "Heather" || p.startsWith("With love,")) {
      return `<p style="margin:12px 0 0;font-size:18px;color:#1f2937;font-style:italic;font-family:Georgia,serif;">${p.replace("\n", "<br>")}</p>`;
    }
    return `<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">${p.replace(/\n/g, "<br>")}</p>`;
  }).join("\n");

  // If user has a group, show group status instead of global community count
  const communityBlock = groupBlock
    ? ""
    : (communityCount > 0
      ? `<tr><td style="padding:0 32px 24px;text-align:center;"><p style="margin:0;font-size:14px;color:#6b7280;font-family:-apple-system,sans-serif;">${communityCount} ${communityCount === 1 ? "person is" : "people are"} doing this alongside you.</p></td></tr>`
      : "");

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
${groupBlock || ""}<tr><td style="padding:0 32px 28px;" align="center">
<a href="${dashboardUrl}" style="display:inline-block;padding:14px 32px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Go to My Dashboard</a>
</td></tr>
${communityBlock}
${nextBlock || ""}
<tr><td style="padding:0 32px 24px;text-align:center;">
<p style="margin:0;font-size:14px;color:#6b7280;font-family:-apple-system,sans-serif;">Know someone who would want to join? <a href="${invite}" style="color:#b85638;">${invite.replace("https://", "")}</a></p>
</td></tr>
<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for ${footer}.${unsubUrl ? `<br><a href="${unsubUrl}" style="color:#6b7280;">Choose which emails you get</a>` : ""}</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

function buildEmailHtml(dayLabel, reading, body, dashboardUrl, communityCount, unsubUrl, nextBlock) {
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
<span style="float:right;color:#c8a365;font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;padding-top:4px;">${dayLabel}</span>
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
<p style="margin:0 0 8px;font-size:14px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">&#x2713; &nbsp;<a href="${dashboardUrl}" style="color:#b85638;text-decoration:none;">Track your reading</a> - check off what you finished today</p>
<p style="margin:0 0 8px;font-size:14px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">&#x270F; &nbsp;<a href="${dashboardUrl}" style="color:#b85638;text-decoration:none;">Share a reflection</a> - what stood out to you today</p>
<p style="margin:0;font-size:14px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">&#x1F64F; &nbsp;<a href="${dashboardUrl}" style="color:#b85638;text-decoration:none;">Post a prayer request</a> - the group is praying</p>
</td></tr>
</table>
</td></tr>
${communityBlock}
${nextBlock || ""}
<tr><td style="padding:0 32px 24px;text-align:center;">
<p style="margin:0;font-size:14px;color:#6b7280;font-family:-apple-system,sans-serif;">Know someone who would want to read along? <a href="${SITE}/challenge" style="color:#b85638;">heatherlynwilson.com/challenge</a></p>
</td></tr>
<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for the July Bible Challenge.${unsubUrl ? `<br><a href="${unsubUrl}" style="color:#6b7280;">Choose which emails you get</a>` : ""}</p>
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
  const spOptouts = await loadEmailOptouts(env);
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
    results = dedupeByEmail(q.results);
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
      if (challengeEmailStopped(spOptouts, user.email, CHALLENGE)) return;
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
July Bible Challenge at heatherlynwilson.com${unsubUrl ? `<br><a href="${unsubUrl}" style="color:#6b7280;">Choose which emails you get</a>` : ""}</p></td></tr>
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

// ─── Pre-launch drip (James, Beatitudes, and any future challenge) ───────────
// Sent to everyone signed up for a challenge, on set days before it starts.
// Keyed by how many days before the official start date.
const DRIP = {
  "november-thanks-2026": {
    start: "2026-11-01",
    invite: "heatherlynwilson.com/challenge-thanks",
    footer: "the Give Thanks challenge",
    emails: {
      7: { subject: "One week until Give Thanks", body: "Good morning, {{name}}.\n\nOne week from today we open the Psalms together.\n\nEvery day in November: one psalm, one short note, and three things you are thankful for. By Thanksgiving your list will be ninety long, and you will read it at the table.\n\nIf you picked the full pace, you will read all 150 Psalms this month. Either way, pick the time of day you will do it and set an alarm. Five minutes is enough.\n\nSee you November 1st.\n\nHeather" },
      3: { subject: "Three days. Who should build a list with you?", body: "Good morning, {{name}}.\n\nThree days until Give Thanks begins.\n\nGratitude grows faster out loud. Is there someone who should build a thanksgiving list alongside you this month? A friend, your kids, your small group?\n\nText them the link:\n\nheatherlynwilson.com/challenge-thanks\n\nSee you soon.\n\nHeather" },
      1: { subject: "Tomorrow we open the Psalms", body: "Good morning, {{name}}.\n\nTomorrow morning your first psalm arrives.\n\nHere is the whole method: read the psalm, let it point you at something, and write down three things you are thankful for. Do not aim for profound. Aim for true. Ninety true things by Thanksgiving will preach better than any sermon.\n\nSee you in the morning.\n\nHeather" }
    }
  },
  "december-gospels-2026": {
    start: "2026-12-01",
    invite: "heatherlynwilson.com/challenge-gospels",
    footer: "the God With Us challenge",
    emails: {
      7: { subject: "One week until we open the Gospels", body: "Good morning, {{name}}.\n\nOne week from today we start reading the Gospels.\n\nHere is the road: Mark shows you what Jesus did. John tells you who He is. Matthew proves He is the promised King. And then Luke sits you down at the manger on Christmas Eve, when you know exactly who that baby is.\n\nIf you picked Luke instead, even simpler: one chapter a day, done by Christmas Eve.\n\nPick your reading time this week and set the alarm. See you December 1st.\n\nHeather" },
      3: { subject: "Three days. Bring someone to Bethlehem.", body: "Good morning, {{name}}.\n\nThree days until God With Us begins.\n\nIs there someone who should read the Gospels with you this Christmas? Someone far from church who might say yes to just reading about Jesus? This is the easiest invitation of the year.\n\nheatherlynwilson.com/challenge-gospels\n\nSee you soon.\n\nHeather" },
      1: { subject: "Tomorrow: Mark, chapter one", body: "Good morning, {{name}}.\n\nTomorrow morning we start with Mark, the fastest gospel, and his favorite word: immediately.\n\nDo not worry about study notes or getting every detail. Just read and watch Him. The whole month is built on one question the disciples keep asking: who is this? By Christmas Eve, you will know the answer better than you ever have.\n\nSee you in the morning.\n\nHeather" },
      "1-luke": { subject: "Tomorrow: Luke, chapter one", body: "Good morning, {{name}}.\n\nTomorrow morning we open Luke together.\n\nLuke is a storyteller. He writes like a journalist. He interviewed the eyewitnesses, and he starts where every good story starts: at the beginning, with an old priest, an empty nursery, and an angel who shows up at work.\n\nOne chapter a day. About five minutes. By Christmas Eve you will be standing at the manger knowing exactly who that baby is, because Luke will have shown you everything that led there.\n\nDo not overthink it. Just read and let him tell the story.\n\nSee you in the morning.\n\nHeather" }
    }
  },
  "august-james-2026": {
    start: "2026-08-01",
    invite: "heatherlynwilson.com/challenge-james",
    footer: "the One Book Deep challenge",
    emails: {
      7: { subject: "One week until One Book Deep", body: "Good morning, {{name}}.\n\nOne week from today, we begin.\n\nOn August 1st, you and I start reading the entire book of James, every single day, for a month. Five chapters. About 15 minutes.\n\nThis is not a race to read more. It is a chance to go deep. To read one book so many times it becomes part of you.\n\nThis week, do two things. Pick the time you will read each morning. And tell one person you are doing this, so you are not doing it alone.\n\nYour dashboard is ready whenever you want to look around.\n\nSee you August 1st.\n\nHeather" },
      3: { subject: "Three days. Is there someone who should join you?", body: "Good morning, {{name}}.\n\nThree days until One Book Deep.\n\nHere is my one ask this morning. Is there someone who should do this with you? A friend, your sister, someone in your small group who has been wanting to get into the Word.\n\nText them the link. It is the easiest way to make sure you both finish.\n\nheatherlynwilson.com/challenge-james\n\nThree days. See who comes to mind.\n\nHeather" },
      1: { subject: "Tomorrow we begin. James, every day.", body: "Good morning, {{name}}.\n\nTomorrow we begin.\n\nAt 6am you will get your first email from me. Open it, then open your Bible to James chapter 1 and read all five chapters. Do not overthink it. Just read.\n\nThe same book, thirty-one times. Repetition is how the Word moves from your head to your heart.\n\nI have been praying for this group. For you. For what God will say through James this month.\n\nSee you in the morning.\n\nHeather" }
    }
  },
  "september-beatitudes-2026": {
    start: "2026-09-01",
    invite: "heatherlynwilson.com/challenge-beatitudes",
    footer: "the Hide It In Your Heart challenge",
    emails: {
      7: { subject: "One week until we start hiding His word", body: "Good morning, {{name}}.\n\nOne week from today, we start hiding His word in our hearts.\n\nOn September 1st, we begin memorizing the Beatitudes, Matthew 5:1-12, one line at a time. By the end of the month you will be able to say the whole thing from memory.\n\nThis week, pick the time you will practice each day. Even five minutes is enough. And decide where you will post the words so you see them all day. The fridge, the mirror, the car.\n\nYour dashboard is ready whenever you want to look around.\n\nSee you September 1st.\n\nHeather" },
      3: { subject: "Three days. Pick your translation, invite a friend.", body: "Good morning, {{name}}.\n\nThree days until we begin.\n\nMemorizing sticks better with a friend. Is there someone who would love to hide the Beatitudes in their heart alongside you? Send them the link this morning.\n\nheatherlynwilson.com/challenge-beatitudes\n\nAnd if you have not picked your translation yet, open your dashboard and choose the one you want to learn. NIV, NLT, ESV, or KJV.\n\nThree days.\n\nHeather" },
      1: { subject: "Tomorrow. The first line.", body: "Good morning, {{name}}.\n\nTomorrow we start.\n\nAt 6am you will get your first email from me, and we will begin with the whole picture before we learn the first line.\n\nHere is what I love about memorizing Scripture. Once it is in you, no one can take it. It is there in the hard moments, the waiting, the times you do not know what to pray.\n\nThirty days from now, the Beatitudes will be yours for good.\n\nSee you in the morning.\n\nHeather" }
    }
  },
  "october-proverbs-2026": {
    start: "2026-10-01",
    invite: "heatherlynwilson.com/challenge-proverbs",
    footer: "the Around the Table challenge",
    emails: {
      7: { subject: "One week until Around the Table", body: "Good morning, {{name}}.\n\nOne week from today, your family starts Proverbs together.\n\nOn October 1st we begin. One chapter a day, a big idea, a few questions for the kids, and one family challenge. Ten to fifteen minutes, and it counts even when it is messy.\n\nThis week, pick your moment. Around the table at dinner is great. So is the car on the way to school. Families are in the car more than they are around a table, and that works just fine. Have a kid read the verses out loud, or play the chapter on the Bible app while you drive.\n\nTell the kids it is coming. Kids do better when they know something is starting.\n\nSee you October 1st.\n\nHeather" },
      3: { subject: "Three days. Know another family who should do this?", body: "Good morning, {{name}}.\n\nThree days until Around the Table.\n\nHere is my one ask this morning. Is there another family who should do this with yours? Cousins, neighbors, the family you sit near at church. Kids love knowing their friends are reading the same chapter.\n\nText them the link. It takes ten seconds.\n\nheatherlynwilson.com/challenge-proverbs\n\nThree days. See who comes to mind.\n\nHeather" },
      1: { subject: "Tomorrow we open Proverbs. Chapter 1.", body: "Good morning, {{name}}.\n\nTomorrow we begin.\n\nIn the morning you will get your first email from me. It has the chapter, the big idea, questions for your kids by age, and one family challenge for the day.\n\nDo not aim for perfect. Aim for together. If dinner is chaos, do it in the car. If a kid rolls their eyes, keep going. If you miss a day, jump back in the next one. Thirty-one days of Proverbs will put more wisdom in your kids than a year of lectures.\n\nI am praying for your family this month.\n\nSee you in the morning.\n\nHeather" }
    }
  }
};

async function sendDripEmails(env) {
  if (!env.BREVO_API_KEY || !env.DB) return;
  const optouts = await loadEmailOptouts(env);
  const now = new Date();
  const easternDate = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const today = new Date(easternDate + "T00:00:00");
  const secret = env.NOTIFY_SECRET || "challenge-secret";
  const validUntil = "2026-10-01";

  const DRIP_PLAN_MAP = {
    "august-james-2026": "james-drip",
    "september-beatitudes-2026": "beatitudes-drip",
    "october-proverbs-2026": "proverbs-drip",
    "november-thanks-2026": "thanks-drip",
    "december-gospels-2026": "gospels-drip"
  };
  const DRIP_DAY_MAP = { 7: 7, 3: 3, 1: 2 };
  const DRIP_DAYS = [7, 3, 1]; // days before start that get drip emails

  for (const challengeId of Object.keys(DRIP)) {
    const cfg = DRIP[challengeId];

    // Pre-load any D1-edited drip emails for this challenge
    const dripPlan = DRIP_PLAN_MAP[challengeId];
    const dbDripEmails = {};
    if (dripPlan) {
      for (const db of DRIP_DAYS) {
        const dripDay = DRIP_DAY_MAP[db];
        if (!dripDay) continue;
        try {
          const dbEmail = await env.DB.prepare(
            "SELECT subject, body FROM challenge_emails WHERE plan = ? AND day = ?"
          ).bind(dripPlan, dripDay).first();
          if (dbEmail && dbEmail.subject && dbEmail.body) dbDripEmails[db] = dbEmail;
        } catch (e) {}
      }
    }

    // Load signups WITH personal_start_date
    let results;
    try {
      const q = await env.DB.prepare(
        "SELECT name, email, track, personal_start_date FROM challenge_signups WHERE challenge = ?"
      ).bind(challengeId).all();
      results = dedupeByEmail(q.results);
    } catch (e) { continue; }
    if (!results.length) continue;

    let sent = 0;
    for (let i = 0; i < results.length; i += 10) {
      const batch = results.slice(i, i + 10);
      const promises = batch.map(async (user) => {
        if (challengeEmailStopped(optouts, user.email, challengeId)) return;

        // Use the user's personal start date, fall back to official
        const userStart = new Date((user.personal_start_date || cfg.start) + "T00:00:00");
        const daysBefore = Math.round((userStart - today) / 86400000);

        // Only send if today matches one of the drip days (7, 3, or 1 day before)
        if (!DRIP_DAYS.includes(daysBefore)) return;

        let emailData = dbDripEmails[daysBefore] || cfg.emails[daysBefore];
        if (!emailData) return;

        // Use track-specific drip variant if available (e.g. "1-luke" for Luke track)
        const trackKey = daysBefore + "-" + (user.track || "");
        if (cfg.emails[trackKey]) emailData = cfg.emails[trackKey];

        const name = user.name || "friend";
        const email = user.email;
        const dashToken = await hmacHex(secret, email + ":challenge:" + validUntil);
        const dashboardUrl = `${SITE}/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${dashToken}#${challengeId}`;
        const unsubToken = await hmacHex(secret, email);
        const unsubUrl = `${SITE}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubToken}`;

        const body = emailData.body.replace(/\{\{name\}\}/g, name);
        const html = buildDripHtml(body, dashboardUrl, cfg.footer, unsubUrl);
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
    console.log(`Drip for ${challengeId}: sent ${sent} (per-user start dates).`);
  }
}

// ─── Post-challenge follow-ups ───────────────────────────────────────────────
// One week and one month after someone's most recent challenge ends, if they
// have nothing else going or coming up, a short encouragement email with the
// open challenges. Two nudges, then we leave them alone.

const FOLLOWUP_TOTALS = { "july-2026": 31, "august-james-2026": 31, "september-beatitudes-2026": 30, "october-proverbs-2026": 31, "november-thanks-2026": 30, "december-gospels-2026": 31 };
const FOLLOWUP_OFFICIALS = { "july-2026": "2026-07-01", "august-james-2026": "2026-08-01", "september-beatitudes-2026": "2026-09-01", "october-proverbs-2026": "2026-10-01", "november-thanks-2026": "2026-11-01", "december-gospels-2026": "2026-12-01" };

const FOLLOWUP_LIST = "The Bible Reading Challenge, the whole Bible or the New Testament, in 31 days or 3 months: heatherlynwilson.com/challenge-bible\n\nOne Book Deep, the book of James every day for a month: heatherlynwilson.com/challenge-james\n\nHide It In Your Heart, memorize the Beatitudes in 30 days: heatherlynwilson.com/challenge-beatitudes\n\nAround the Table, one Proverbs chapter a day as a family: heatherlynwilson.com/challenge-proverbs\n\nGive Thanks, 30 days in the Psalms with a growing gratitude list: heatherlynwilson.com/challenge-thanks\n\nGod With Us, all four Gospels in a month, or Luke by Christmas Eve: heatherlynwilson.com/challenge-gospels";

const FOLLOWUPS = {
  7: {
    subject: "It has been a week. Come back to the table.",
    body: "Good morning, {{name}}.\n\nIt has been about a week since your challenge ended, and I wanted to check in.\n\nThe hardest part of a daily habit is not building it. It is picking it back up after a break. A week off is nothing. The Word is right where you left it.\n\nHere is what is open right now:\n\n" + FOLLOWUP_LIST + "\n\nPick whichever one fits your life today and start whenever you want. I would love to have you back.\n\nHeather"
  },
  30: {
    subject: "A month later. The Word is still there.",
    body: "Good morning, {{name}}.\n\nIt has been about a month since your last challenge ended. No guilt in that. Life is full.\n\nBut I know something about you: you finished a challenge once, which means you can do it again. And the version of you that was in the Word every day is worth going back for.\n\nEverything is open, and you can start any day you like:\n\n" + FOLLOWUP_LIST + "\n\nThis is the last nudge from me. The door stays open either way.\n\nHeather"
  }
};

async function sendFollowUpEmails(env) {
  if (!env.BREVO_API_KEY || !env.DB) return;
  let results;
  try {
    const q = await env.DB.prepare(
      "SELECT name, email, track, challenge, personal_start_date FROM challenge_signups"
    ).all();
    results = q.results || [];
  } catch (e) { return; }
  if (!results.length) return;

  const easternDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const todayDate = new Date(easternDate + "T00:00:00");
  const secret = env.NOTIFY_SECRET || "challenge-secret";

  // Group signups per person (lowercased, so case variants stay one person)
  // and work out where each stands
  const byEmail = {};
  for (const r of results) {
    const key = String(r.email || "").trim().toLowerCase();
    if (!key) continue;
    r.email = key;
    (byEmail[key] = byEmail[key] || []).push(r);
  }

  const fuOptouts = await loadEmailOptouts(env);
  let sent = 0;
  for (const email of Object.keys(byEmail)) {
    const signups = byEmail[email];
    // Skip follow-ups if they stopped emails globally or for any of
    // their challenges. If they said "less email", honor it.
    if (fuOptouts.challenge.has(email)) continue;
    if (signups.some(s => fuOptouts.pair.has(email + "|" + s.challenge))) continue;
    // Days past the end for each of their challenges (negative or zero means
    // upcoming or still going)
    let anyActive = false;
    let minSinceEnd = Infinity;
    let name = "friend";
    for (const s of signups) {
      if (s.name) name = s.name;
      const total = String(s.track || "").endsWith("-90") ? 90 : (FOLLOWUP_TOTALS[s.challenge] || 31);
      const startStr = s.personal_start_date || FOLLOWUP_OFFICIALS[s.challenge] || easternDate;
      const start = new Date(startStr + "T00:00:00");
      const day = Math.floor((todayDate - start) / 86400000) + 1;
      const sinceEnd = day - total;
      if (sinceEnd <= 0) { anyActive = true; break; }
      if (sinceEnd < minSinceEnd) minSinceEnd = sinceEnd;
    }
    if (anyActive) continue;

    const fu = FOLLOWUPS[minSinceEnd];
    if (!fu) continue;

    try {
      const dashToken = await hmacHex(secret, email + ":challenge:" + "2026-10-01");
      const dashboardUrl = `${SITE}/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${dashToken}`;
      const unsubToken = await hmacHex(secret, email);
      const unsubUrl = `${SITE}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubToken}`;
      const body = fu.body.replace(/\{\{name\}\}/g, name);
      const html = buildDripHtml(body, dashboardUrl, "a Bible challenge at heatherlynwilson.com", unsubUrl);
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: "Heather Lyn Wilson", email: "heather@heatherlynwilson.com" },
          to: [{ email, name }],
          subject: fu.subject,
          htmlContent: html,
        }),
      });
      if (res.ok) sent++;
    } catch (e) {}
  }
  if (sent) console.log(`Follow-up emails sent: ${sent}.`);
}

function buildDripHtml(body, dashboardUrl, footer, unsubUrl) {
  const paragraphs = body.split("\n\n").map(p => {
    if (p === "Heather" || p.startsWith("With love,")) {
      return `<p style="margin:12px 0 0;font-size:18px;color:#1f2937;font-style:italic;font-family:Georgia,serif;">${p.replace("\n", "<br>")}</p>`;
    }
    return `<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">${p}</p>`;
  }).join("\n");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
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
You are receiving this because you signed up for ${footer}.${unsubUrl ? `<br><a href="${unsubUrl}" style="color:#6b7280;">Choose which emails you get</a>` : ""}</p></td></tr>
</table></td></tr></table></body></html>`;
}

// ─── Email Content (compressed) ──────────────────────────────────────────────
// Full Bible track
const EMAILS_FB=[{day:1,subject:"Day 1 \u2014 Here we go. Genesis.",reading:"Genesis 1\u201350",body:"Good morning.\n\nToday is the day. You signed up for this. I signed up for this. And right now, a group of us are opening to Genesis 1 together.\n\nYes, the whole book of Genesis today. Fifty chapters. I am not going to sugarcoat it. That is a lot. But here is what I want you to know. Genesis reads fast. It is all story. Creation, the flood, Abraham, Isaac, Jacob, Joseph. You will get pulled in.\n\nDo not worry about understanding every detail. Do not stop to study. Just read. Let the words wash over you. You are not writing a paper. You are meeting God in His Word.\n\nIf you cannot finish all 50 chapters today, that is okay. Read what you can. Mark where you stopped. Come back to it. The goal is not perfection. The goal is showing up.\n\nI am reading alongside you today.\n\nHeather"},{day:2,subject:"Day 2 \u2014 Slavery, plagues, and a God who shows up",reading:"Exodus 1\u201340",body:"Good morning.\n\nYesterday was Genesis. Today is Exodus. And the tone shifts fast.\n\nThe people of God go from favor to slavery in the first chapter. And then God raises up Moses, a man who did not want the job, to lead them out.\n\nHere is what stood out to me when I read this. God did not wait for Moses to be ready. He did not wait for the people to have it together. He showed up because He heard them crying. That was enough.\n\nToday you will read about plagues and Passover and the Red Sea and the Ten Commandments and the building of the tabernacle. It is a full book. Take it one chapter at a time.\n\nYou are on Day 2. You showed up again. That matters.\n\nHeather"},{day:3,subject:"Day 3 \u2014 The one nobody looks forward to",reading:"Leviticus 1\u201327",body:"Good morning.\n\nLeviticus. I know.\n\nThis is the book people quit on. All the rules about sacrifices and skin diseases and what to eat and what not to eat. It feels like reading a manual for a world that does not exist anymore.\n\nBut here is what I want you to see today. Every single rule in this book exists because God wanted to be close to His people. He was not trying to make their lives harder. He was teaching them how to live near a holy God and survive it.\n\nThe whole book is God saying, I want to dwell among you. Here is how.\n\nSo push through it. Read it fast if you need to. But do not skip it. There is something in there for you today.\n\nIf you are still going after Leviticus, you can handle anything this month throws at you.\n\nHeather"},{day:4,subject:"Day 4 \u2014 Wandering starts here",reading:"Numbers 1\u201336",body:"Good morning.\n\nNumbers starts with a census. Then it turns into the story of a people who could not stop complaining.\n\nGod had rescued them. Parted the sea. Fed them from the sky. And they still grumbled. They still wanted to go back to Egypt. They still doubted.\n\nAnd honestly, I see myself in them more than I want to admit.\n\nHow many times has God shown up in my life and I still doubted the next thing? How many times has He provided and I still worried about tomorrow?\n\nThat is the gift of reading the whole Bible like this. You start to see yourself in the story. Not always in the heroes. Sometimes in the people who could not stop looking back.\n\nKeep going. You are almost through the wilderness.\n\nHeather"},{day:5,subject:"Day 5 \u2014 Moses says goodbye",reading:"Deuteronomy 1\u201334",body:"Good morning.\n\nYou have read four books of the Bible this week. And woven through all of them is this idea of rest. In Genesis, God stopped on the seventh day. Not because He was tired. Because He was done, and what He made was good. In Exodus, He told the Israelites not to gather manna on the seventh day. He gave them a double portion on Friday so they would not have to work. Then He put rest right in the middle of the Ten Commandments. Remember the Sabbath. Keep it holy. In Leviticus, the rest went even further. Not just a day but a whole year every seven years. The land needed to breathe too.\n\nRest is not a reward for finishing your work. It is built into the rhythm God designed from the beginning.\n\nToday is Deuteronomy, and Moses is going to repeat the commandments again. Including the Sabbath. But this time he gives a different reason. In Exodus, God said rest because He rested at creation. In Deuteronomy, Moses says rest because you were slaves in Egypt, and slaves do not get to rest. Rest is what free people do.\n\nYou are free. Rest in that today.\n\nDeuteronomy is Moses giving his final speech. He knows he is not going into the Promised Land. He knows his time is almost up. And he spends his last days reminding the people of everything God has done.\n\nRemember. Do not forget. Tell your children. Remember.\n\nHe says it over and over. Because he knows what happens when people forget.\n\nPay attention to the heart behind this book. This is a man who walked with God for forty years, standing at the edge of something he will never see, and his last words are not about himself. They are about making sure the next generation does not lose what matters.\n\nFive days in. Five books down.\n\nHeather"},{day:6,subject:"Day 6 \u2014 They finally get there",reading:"Joshua 1\u201324",body:"Good morning.\n\nAfter forty years in the wilderness, they cross into the Promised Land. Joshua is in charge now. And the very first thing God says to him is be strong and courageous.\n\nHe does not say be smart. He does not say have a plan. He says be strong and do not be afraid.\n\nThey made it. Not because they were perfect. Because God kept His promise.\n\nYou are almost a week in. Be strong and keep going.\n\nHeather"},{day:7,subject:"Day 7 \u2014 One week done",reading:"Judges 1\u201321, Ruth 1\u20134",body:"Good morning.\n\nYou have been reading the Bible for a full week. Seven days. That is worth pausing on.\n\nToday is Judges and Ruth. Judges is the story of Israel falling apart. Over and over they turn away from God, things go badly, they cry out, God raises up a judge to save them, and then they do it all again.\n\nAnd then Ruth shows up. Right in the middle of all that chaos, this quiet little story about faithfulness and kindness and a woman who refused to leave.\n\nOne week down. I am proud of you.\n\nHeather"},{day:8,subject:"Day 8 \u2014 A boy in the temple hears God\u2019s voice",reading:"1 Samuel 1\u201331",body:"Good morning.\n\nToday is one of my favorite books. First Samuel. A woman named Hannah prays for a son. God gives her Samuel. She gives him back to God. And then this little boy lying in the temple hears the voice of God and does not even know what it is.\n\nThen you get Saul. Then David. The giant. The friendship with Jonathan. The jealousy. The running. The caves.\n\nFirst Samuel has everything. It reads like a novel. Enjoy it today.\n\nHeather"},{day:9,subject:"Day 9 \u2014 David at his best and worst",reading:"2 Samuel 1\u201324",body:"Good morning.\n\nSecond Samuel is David\u2019s reign. And it is complicated.\n\nThe thing that sets David apart is not that he never sinned. It is that he always came back. He repented. He grieved. He did not pretend.\n\nThat is the lesson I take from today. Not that I will get it right every time. But that when I do not, I can still come back.\n\nHeather"},{day:10,subject:"Day 10 \u2014 Solomon builds the temple and then loses his way",reading:"1 Kings 1\u201322",body:"Good morning.\n\nFirst Kings starts with Solomon building the most magnificent temple the world had ever seen. And it ends with him worshiping other gods.\n\nYou will also meet Elijah today. Standing alone against 450 prophets of Baal. And then running away and hiding under a tree the very next day.\n\nThe Bible is honest about people. That is one of the reasons I trust it.\n\nYou are ten days in. A third of the way through this challenge.\n\nHeather"},{day:11,subject:"Day 11 \u2014 Everything falls apart",reading:"2 Kings 1\u201325",body:"Good morning.\n\nSecond Kings is hard. You are watching two kingdoms fall. And then Babylon comes. Jerusalem falls. The temple gets destroyed. The people are carried into exile.\n\nIt is heavy. But do not rush past the grief of it. This matters.\n\nSome days the reading is going to be hard. Today is one of those days. But you are still here. And that matters.\n\nHeather"},{day:12,subject:"Day 12 \u2014 The same story, different angle",reading:"1 Chronicles 1\u201329",body:"Good morning.\n\nFirst Chronicles covers a lot of the same ground as Samuel and Kings. But it was written after the exile. When you lose everything and then look back, you see different things. You see the hand of God in places you missed the first time.\n\nAlmost two weeks in. You are doing this.\n\nHeather"},{day:13,subject:"Day 13 \u2014 The rise and fall, one more time",reading:"2 Chronicles 1\u201336",body:"Good morning.\n\nAnd notice the very last verse. Cyrus, king of Persia, lets the people go home. After seventy years of exile, someone opens the door.\n\nGod does not forget His promises. Even when it takes seventy years.\n\nThirteen days. You have read thirteen books of the Bible.\n\nHeather"},{day:14,subject:"Day 14 \u2014 They go home",reading:"Ezra 1\u201310, Nehemiah 1\u201313, Esther 1\u201310",body:"Good morning. Two weeks in.\n\nAll three books are about restoration. About going back to the rubble and building something again. About courage in hard places.\n\nIf you are feeling the weight of this challenge right now, these three books are for you today. Broken things get rebuilt. And it starts with one person who says I will go.\n\nHeather"},{day:15,subject:"Day 15 \u2014 The hardest question in the Bible",reading:"Job 1\u201342",body:"Good morning.\n\nJob. The whole thing. A man who did everything right loses everything. And then God speaks. And He does not answer the question. He just says, I am God and you are not.\n\nWe do not always get to know why. We just get to know who.\n\nYou are almost halfway through the Bible.\n\nHeather"},{day:16,subject:"Day 16 \u2014 Halfway. You made it to the Psalms.",reading:"Psalms 1\u201350",body:"Good morning.\n\nSixteen days in. You are officially past the halfway mark. And today you land in the Psalms. This is people talking to God. Crying out. Praising. Asking why.\n\nRead them out loud if you can. They were written to be spoken.\n\nHalfway there. I am so proud of you.\n\nHere is my one ask for the second half: tell someone.\n\nNot so you have a buddy to keep you accountable. Tell them because of what this has been for you. If reading the Word this way has meant something, if it has shifted how you see God or how you read the Bible, there is someone in your life who needs that too. Good things are meant to be handed to other people.\n\nYou do not even have to find the words. Here is something you can copy, change to sound like you, and post or text to a friend:\n\n\"Reading the whole Bible in a month has changed how I read it. Not as individual verses and stories, but the big picture. I am halfway through. You can start any day you want. Come do it with me. heatherlynwilson.com/challenge #31DayBibleChallenge\"\n\nPost it, text it, drop it in your group chat. Someone else meeting God in His Word could start with your one sentence.\n\nHeather"},{day:17,subject:"Day 17 \u2014 More Psalms. Stay with it.",reading:"Psalms 51\u2013100",body:"Good morning.\n\nPsalm 51. David after Bathsheba. Create in me a clean heart, O God.\n\nIf you are behind on reading, this is your Psalm 51 moment. Do not quit. Just come back. Read today. That is enough.\n\nHeather"},{day:18,subject:"Day 18 \u2014 The last of the Psalms",reading:"Psalms 101\u2013150",body:"Good morning.\n\nPsalm 150. Let everything that has breath praise the Lord. After all the crying, the questioning, the doubt, it ends with praise.\n\nYou just read the entire book of Psalms in three days. That is remarkable.\n\nEighteen days down. Thirteen to go.\n\nHeather"},{day:19,subject:"Day 19 \u2014 Wisdom for the rest of your life",reading:"Proverbs, Ecclesiastes, Song of Solomon",body:"Good morning.\n\nProverbs is practical. Ecclesiastes is honest. Song of Solomon is beautiful.\n\nEnjoy today. After the weight of Job and Psalms, this is a different kind of reading.\n\nHeather"},{day:20,subject:"Day 20 \u2014 The prophet nobody wanted to listen to",reading:"Isaiah 1\u201333",body:"Good morning.\n\nIsaiah is two things at once. Judgment is coming. But a savior is coming too. For unto us a child is born. That is Isaiah 9.\n\nTwenty days. You are almost there.\n\nHeather"},{day:21,subject:"Day 21 \u2014 Comfort, comfort my people",reading:"Isaiah 34\u201366",body:"Good morning. Three weeks in.\n\nComfort, comfort my people. Those who wait on the Lord shall renew their strength. He was wounded for our transgressions.\n\nIsaiah wrote these words hundreds of years before Jesus. This might be your favorite day of reading this entire month.\n\nThree weeks done. Ten days left.\n\nHeather"},{day:22,subject:"Day 22 \u2014 The prophet who did not want the job",reading:"Jeremiah 1\u201326",body:"Good morning.\n\nJeremiah spent his entire life preaching to people who would not listen. And he kept going.\n\nSometimes faithfulness does not look like success. Sometimes it just looks like showing up.\n\nNine days left. Keep showing up.\n\nHeather"},{day:23,subject:"Day 23 \u2014 Jerusalem falls. Jeremiah weeps.",reading:"Jeremiah 27\u201352, Lamentations 1\u20135",body:"Good morning.\n\nGreat is His faithfulness. His mercies are new every morning.\n\nThat verse was not written on a good day. It was written in the ruins. And that is what makes it so powerful.\n\nMercy is new this morning. For you too.\n\nHeather"},{day:24,subject:"Day 24 \u2014 Visions, bones, and a valley that comes alive",reading:"Ezekiel 1\u201348, Daniel 1\u201312",body:"Good morning.\n\nCan these bones live? And God says, watch me.\n\nOur God is able to deliver us, but even if He does not, we will not bow.\n\nOne week left.\n\nHeather"},{day:25,subject:"Day 25 \u2014 Twelve books in one day",reading:"Hosea through Malachi",body:"Good morning.\n\nMicah tells you what God requires. Do justice. Love mercy. Walk humbly.\n\nMalachi is the last word of the Old Testament. And then silence. Four hundred years of silence.\n\nYou just finished the Old Testament. Tomorrow you open to Matthew.\n\nHeather"},{day:26,subject:"Day 26 \u2014 Jesus is here",reading:"Matthew 1\u201328, Mark 1\u201316",body:"Good morning.\n\nAfter everything you have read, all the promises and prophecies and waiting, today you open to the New Testament. The whole story has been leading here.\n\nYou have spent 25 days reading about a God who promised He would come. Today He arrives.\n\nSix days left.\n\nHeather"},{day:27,subject:"Day 27 \u2014 Two more portraits of Jesus",reading:"Luke 1\u201324, John 1\u201321",body:"Good morning.\n\nLuke is the historian. John is the poet. Same Jesus. Completely different angles.\n\nYou have now read all four Gospels. Four witnesses. One story. Four days from the finish line.\n\nHeather"},{day:28,subject:"Day 28 \u2014 The church explodes and Paul changes everything",reading:"Acts 1\u201328, Romans 1\u201316",body:"Good morning.\n\nActs reads like an action movie. Shipwrecks. Prison breaks. Miracles. And through all of it, the gospel spreads.\n\nThen Romans. For all have sinned. Nothing can separate us from the love of God.\n\nThree more days.\n\nHeather"},{day:29,subject:"Day 29 \u2014 Letters to churches that sound like they were written yesterday",reading:"1 Corinthians through Colossians",body:"Good morning.\n\nLove is patient. Love is kind. Paul did not write it for weddings. He wrote it for a church that was tearing itself apart.\n\nGalatians is freedom. Ephesians is identity. Philippians is joy from a prison cell.\n\nTwo more days.\n\nHeather"},{day:30,subject:"Day 30 \u2014 One more day after this",reading:"1 Thessalonians through Hebrews",body:"Good morning.\n\nHebrews chapter 11 is the faith hall of fame. By faith Abraham. By faith Moses. By faith Rahab. These are your people now. You have read their stories.\n\nOne more day. You are going to finish this.\n\nHeather"},{day:31,subject:"Day 31 \u2014 You did it.",reading:"James through Revelation",body:"Good morning.\n\nThe Bible ends with a promise. He is making all things new. There will be no more tears. No more death. No more pain.\n\nThe story that started in a garden ends in a city. The story that started with God walking with two people ends with God dwelling among all His people forever.\n\nYou just read the entire Bible in 31 days.\n\nI am so proud of you. Thank you for reading alongside me.\n\nWith love,\nHeather"}];

// New Testament track
const EMAILS_NT=[{day:1,subject:"Day 1 \u2014 Here we go. The story of Jesus starts now.",reading:"Matthew 1\u20139",body:"Good morning.\n\nToday is the day. You are starting the New Testament and I am reading alongside you.\n\nMatthew opens with a genealogy. Do not skip it. Buried in that list are Rahab, Ruth, and Bathsheba. Women who should not be in the family tree of the Messiah. But they are.\n\nThe Sermon on the Mount begins in chapter 5 and it is some of the most powerful teaching you will ever read.\n\nNine chapters today. You can do this.\n\nHeather"},{day:2,subject:"Day 2 \u2014 Miracles and hard questions",reading:"Matthew 10\u201318",body:"Good morning.\n\nJesus asks the most important question in the entire Bible. Who do you say that I am?\n\nThat question is for you too.\n\nYou are on Day 2. You showed up again. That is what matters.\n\nHeather"},{day:3,subject:"Day 3 \u2014 The week that changed everything",reading:"Matthew 19\u201328",body:"Good morning.\n\nThe last supper. The garden. The betrayal. The cross. The tomb.\n\nAnd then chapter 28. He is not here. He has risen.\n\nYou just finished your first Gospel. Keep going.\n\nHeather"},{day:4,subject:"Day 4 \u2014 Mark does not slow down",reading:"Mark 1\u20138",body:"Good morning.\n\nMark writes like someone in a hurry to tell you the most important story in the world. Let him.\n\nDay 4. You are building momentum.\n\nHeather"},{day:5,subject:"Day 5 \u2014 The cross, again. It hits different the second time.",reading:"Mark 9\u201316",body:"Good morning.\n\nYou are reading the crucifixion story for the second time in five days. You notice things you missed.\n\nTwo Gospels done. You are almost a week in.\n\nHeather"},{day:6,subject:"Day 6 \u2014 Luke notices the people nobody else sees",reading:"Luke 1\u20136",body:"Good morning.\n\nLuke sees the margins. The overlooked. The forgotten. If you have ever felt invisible, Luke\u2019s Gospel is for you.\n\nSix days in. You are finding your rhythm.\n\nHeather"},{day:7,subject:"Day 7 \u2014 One week done",reading:"Luke 7\u201312",body:"Good morning. One full week.\n\nMartha and Mary. Martha is doing all the work. Mary is sitting at the feet of Jesus. And Jesus says Mary chose the better thing.\n\nYou have been reading for seven days straight. Take a breath. You are doing so well.\n\nHeather"},{day:8,subject:"Day 8 \u2014 Lost things and found things",reading:"Luke 13\u201318",body:"Good morning.\n\nThe prodigal son comes home expecting to be a servant. And the father runs to him. Does not wait. Does not lecture. Runs.\n\nThat is how God feels about you. Right now. Today.\n\nHeather"},{day:9,subject:"Day 9 \u2014 The cross, the third time. What do you see now?",reading:"Luke 19\u201324",body:"Good morning.\n\nLuke includes things the others do not. The thief on the cross. The road to Emmaus. Sometimes Jesus is right next to you and you do not see it until later.\n\nThree Gospels done.\n\nHeather"},{day:10,subject:"Day 10 \u2014 John sees something the others did not",reading:"John 1\u20137",body:"Good morning.\n\nIn the beginning was the Word, and the Word was with God, and the Word was God.\n\nJohn is not trying to tell you what Jesus did. He is trying to show you who Jesus is.\n\nTen days in. One third done.\n\nHeather"},{day:11,subject:"Day 11 \u2014 I am",reading:"John 8\u201314",body:"Good morning.\n\nI am the light of the world. I am the good shepherd. I am the resurrection and the life.\n\nJesus was not being subtle. He was saying exactly who He was.\n\nHeather"},{day:12,subject:"Day 12 \u2014 The upper room and the empty tomb",reading:"John 15\u201321",body:"Good morning.\n\nI am the vine. Abide in me. I call you friends. I am praying for you.\n\nFour Gospels done. Tomorrow the church begins.\n\nHeather"},{day:13,subject:"Day 13 \u2014 The Holy Spirit shows up and everything changes",reading:"Acts 1\u20137",body:"Good morning.\n\nPeter, the man who denied Jesus, stands up and preaches and three thousand people believe.\n\nActs is the most exciting book in the New Testament. It reads like an adventure story. Because it is one.\n\nHeather"},{day:14,subject:"Day 14 \u2014 Two weeks in. Paul enters the story.",reading:"Acts 8\u201314",body:"Good morning. Two weeks.\n\nSaul becomes Paul. Nobody is too far gone. The worst enemy of the church became its greatest champion.\n\nYou are halfway through the challenge.\n\nHeather"},{day:15,subject:"Day 15 \u2014 Missionary journeys and midnight worship",reading:"Acts 15\u201321",body:"Good morning.\n\nPaul and Silas singing in a jail cell at midnight. After being beaten. And an earthquake breaks the chains.\n\nThat is the power of worship in the dark places.\n\nFifteen days down.\n\nHeather"},{day:16,subject:"Day 16 \u2014 Paul will not stop",reading:"Acts 22\u201328",body:"Good morning.\n\nThe last word of Acts. Unhindered. The gospel cannot be stopped.\n\nTomorrow you start Paul\u2019s letters.\n\nHere is my one ask for the second half: tell someone.\n\nNot so you have a buddy to keep you accountable. Tell them because of what this has been for you. If reading the Word this way has meant something, if it has shifted how you see God or how you read the Bible, there is someone in your life who needs that too. Good things are meant to be handed to other people.\n\nYou do not even have to find the words. Here is something you can copy, change to sound like you, and post or text to a friend:\n\n\"Reading the New Testament in a month has changed how I read it. Not as individual verses and stories, but the big picture. I am halfway through. You can start any day you want. Come do it with me. heatherlynwilson.com/challenge #31DayBibleChallenge\"\n\nPost it, text it, drop it in your group chat. Someone else meeting God in His Word could start with your one sentence.\n\nHeather"},{day:17,subject:"Day 17 \u2014 The deepest theology Paul ever wrote",reading:"Romans 1\u20138",body:"Good morning.\n\nRomans 8 might be the single greatest chapter in the entire Bible.\n\nNothing can separate us from the love of God.\n\nIf you only remember one chapter from this entire challenge, make it Romans 8.\n\nHeather"},{day:18,subject:"Day 18 \u2014 Grace changes everything",reading:"Romans 9\u201316",body:"Good morning.\n\nLove sincerely. Hate evil. Be joyful in hope. Patient in affliction. Faithful in prayer.\n\nThat is what grace looks like when it hits the ground.\n\nEighteen down. Keep it.\n\nHeather"},{day:19,subject:"Day 19 \u2014 Paul writes to a messy church",reading:"1 Corinthians 1\u20138",body:"Good morning.\n\nPaul does not start by yelling at them. He starts by reminding them who they are.\n\nThat is always God\u2019s approach. Before He corrects you, He reminds you who you are.\n\nTwelve days left.\n\nHeather"},{day:20,subject:"Day 20 \u2014 Love and resurrection",reading:"1 Corinthians 9\u201316",body:"Good morning. Twenty days in.\n\nLove is patient. Love is kind. It is not a poem about romance. It is a mirror held up to a church that needed to hear it.\n\nEleven to go.\n\nHeather"},{day:21,subject:"Day 21 \u2014 Three weeks. Strength in weakness.",reading:"2 Corinthians 1\u20137",body:"Good morning. Three full weeks.\n\nWe have this treasure in jars of clay. Fragile. Cracked. Ordinary. But carrying something extraordinary.\n\nThe cracks are how the light gets out.\n\nHeather"},{day:22,subject:"Day 22 \u2014 Freedom",reading:"2 Corinthians 8\u201313, Galatians 1\u20136",body:"Good morning.\n\nIt is for freedom that Christ has set us free. Stand firm.\n\nThat verse changed my life. Because I am really good at putting chains back on myself that God already removed.\n\nNine days left.\n\nHeather"},{day:23,subject:"Day 23 \u2014 Who you are in Christ",reading:"Ephesians, Philippians, Colossians",body:"Good morning.\n\nPhilippians was written from prison. And it is the most joyful book in the New Testament.\n\nJoy is not about circumstances. It never has been.\n\nEight days left.\n\nHeather"},{day:24,subject:"Day 24 \u2014 Letters to friends and a young pastor",reading:"1\u20132 Thessalonians, 1 Timothy",body:"Good morning.\n\nDon\u2019t let anyone look down on you because you are young. Fight the good fight.\n\nOne week left.\n\nHeather"},{day:25,subject:"Day 25 \u2014 Paul\u2019s last letter and a one-page masterpiece",reading:"2 Timothy, Titus, Philemon",body:"Good morning.\n\nI have fought the good fight. I have finished the race. I have kept the faith.\n\nThat is how Paul says goodbye.\n\nSix days to go.\n\nHeather"},{day:26,subject:"Day 26 \u2014 The Old Testament finally makes sense",reading:"Hebrews 1\u201313",body:"Good morning.\n\nChapter 11 is the faith hall of fame. Chapter 12 says you are surrounded by this great cloud of witnesses cheering you on.\n\nFive days left.\n\nHeather"},{day:27,subject:"Day 27 \u2014 Faith that does something",reading:"James, 1 Peter, 2 Peter",body:"Good morning.\n\nFaith without works is dead. Do not just listen to the word. Do what it says.\n\nFour more days.\n\nHeather"},{day:28,subject:"Day 28 \u2014 Love. That is the whole thing.",reading:"1\u20133 John, Jude",body:"Good morning.\n\nGod is love. There is no fear in love. Perfect love drives out fear.\n\nThree days left.\n\nHeather"},{day:29,subject:"Day 29 \u2014 The beginning of the end",reading:"Revelation 1\u20138",body:"Good morning.\n\nHoly, holy, holy is the Lord God Almighty, who was and is and is to come.\n\nThe story is heading toward worship.\n\nTwo more days.\n\nHeather"},{day:30,subject:"Day 30 \u2014 Hold on. Almost there.",reading:"Revelation 9\u201316",body:"Good morning.\n\nThe kingdom of the world has become the kingdom of our Lord and of His Christ, and He shall reign forever and ever.\n\nOne more day. Tomorrow you finish.\n\nHeather"},{day:31,subject:"Day 31 \u2014 You did it.",reading:"Revelation 17\u201322",body:"Good morning.\n\nHe will wipe every tear from their eyes. There will be no more death or mourning or crying or pain. I am making everything new.\n\nYou just read the entire New Testament in 31 days.\n\nThank you for doing this with me. I am so proud of you.\n\nWith love,\nHeather"}];

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
  if (s == null) return "-";
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
<div style="font-family:Georgia,serif;font-size:22px;color:#1f2937;font-weight:600;line-height:1;">${yesterday.bounce_pct != null ? yesterday.bounce_pct + "%" : "-"}</div>
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
