// Email preferences. GET shows a page where the reader chooses exactly what
// they receive: blog posts, challenge emails, group notifications. POST saves
// the choices. Two-step so email security scanners that pre-crawl links never
// change anything; only a real person pressing Save does.
//
// Choices live in two places: blog in the subscribers table (as before), and
// challenge/group opt-outs in email_prefs. Stopping challenge emails never
// touches the signup itself: progress, streaks, dashboard, and groups all
// stay, and flipping the toggle back on resumes the emails.

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = url.searchParams.get("token") || "";

  if (!email || !token) {
    return Response.redirect(url.origin + "/unsubscribed.html?status=invalid", 302);
  }

  const secret = context.env.NOTIFY_SECRET || "";
  const expected = await hmacHex(secret, email);
  if (token !== expected) {
    return Response.redirect(url.origin + "/unsubscribed.html?status=invalid", 302);
  }

  // Current state of each stream
  let blogOn = false;
  try {
    const s = await context.env.DB.prepare(
      "SELECT unsubscribed_at FROM subscribers WHERE email = ?"
    ).bind(email).first();
    blogOn = !!s && !s.unsubscribed_at;
  } catch (e) {}

  let groupOn = true, globalChallengeOff = false, blogDaily = false;
  try {
    const p = await context.env.DB.prepare(
      "SELECT challenge_optout, group_optout, blog_daily FROM email_prefs WHERE email = ?"
    ).bind(email).first();
    if (p) {
      groupOn = !p.group_optout;
      globalChallengeOff = !!p.challenge_optout;
      blogDaily = !!p.blog_daily;
    }
  } catch (e) {}

  let signups = [];
  try {
    const q = await context.env.DB.prepare(
      "SELECT challenge FROM challenge_signups WHERE email = ? ORDER BY created_at ASC"
    ).bind(email).all();
    signups = [...new Set((q.results || []).map(r => r.challenge))];
  } catch (e) {}
  let optedOut = new Set();
  try {
    const q = await context.env.DB.prepare(
      "SELECT challenge FROM challenge_email_optouts WHERE email = ?"
    ).bind(email).all();
    (q.results || []).forEach(r => optedOut.add(r.challenge));
  } catch (e) {}

  const CH_LABELS = {
    "july-2026": ["Bible Reading Challenge", "Your daily or weekly reading email."],
    "august-james-2026": ["One Book Deep: James", "The daily James reading and prayer focus."],
    "september-beatitudes-2026": ["Hide It In Your Heart", "The daily Beatitudes line and practice."],
    "october-proverbs-2026": ["Around the Table", "The daily family Proverbs devotional."],
    "november-thanks-2026": ["Give Thanks", "The daily psalm and gratitude prompt."],
    "december-gospels-2026": ["God With Us", "The daily Gospels reading."]
  };

  const row = (name, checked, title, desc) => `
<label class="pref">
<input type="checkbox" name="${name}" value="1" ${checked ? "checked" : ""}>
<span class="box"></span>
<span class="pref-text"><strong>${title}</strong><small>${desc}</small></span>
</label>`;

  const challengeRows = signups.length
    ? signups.map(ch => {
        const [t, d] = CH_LABELS[ch] || [ch, "Daily challenge emails."];
        const on = !globalChallengeOff && !optedOut.has(ch);
        return row("ch_" + ch, on, t + " emails", d);
      }).join("")
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Email Preferences | Heather Lyn Wilson</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
body { margin: 0; padding: 40px 20px; background: #faf6ef; font-family: 'Inter', system-ui, sans-serif; color: #1f2937; min-height: 100vh; box-sizing: border-box; }
.card { max-width: 480px; margin: 40px auto 0; background: #fff; padding: 40px 32px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
h1 { font-family: 'Lora', serif; font-size: 26px; font-weight: 600; margin: 0 0 8px; text-align: center; }
.sub { color: #6b7280; font-size: 14px; text-align: center; margin: 0 0 28px; font-weight: 300; }
.sub .email { color: #1f2937; font-weight: 500; }
.pref { display: flex; align-items: flex-start; gap: 12px; padding: 16px 14px; border: 1.5px solid #e5e0d5; border-radius: 8px; margin-bottom: 12px; cursor: pointer; }
.pref input { position: absolute; opacity: 0; }
.pref .box { flex-shrink: 0; width: 22px; height: 22px; border: 2px solid #c8beab; border-radius: 6px; margin-top: 1px; position: relative; }
.pref input:checked + .box { background: #b85638; border-color: #b85638; }
.pref input:checked + .box::after { content: ''; position: absolute; left: 6px; top: 2px; width: 5px; height: 10px; border: solid #fff; border-width: 0 2.5px 2.5px 0; transform: rotate(45deg); }
.pref-text strong { display: block; font-size: 15px; margin-bottom: 3px; }
.pref-text small { display: block; font-size: 13px; color: #6b7280; line-height: 1.5; font-weight: 300; }
.hint { font-size: 13px; color: #6b7280; line-height: 1.6; margin: 18px 0 24px; font-weight: 300; text-align: center; }
button { width: 100%; background: #b85638; color: #fff; border: none; padding: 15px; font-size: 14px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; border-radius: 6px; font-family: inherit; }
button:hover { background: #8d3e26; }
.cancel { display: block; text-align: center; margin-top: 16px; color: #6b7280; font-size: 13px; text-decoration: none; }
</style>
</head>
<body>
<div class="card">
<h1>Email Preferences</h1>
<p class="sub">Checked means you receive it. For <span class="email">${escapeHtml(email)}</span>.</p>
<form method="POST" action="/api/unsubscribe">
<input type="hidden" name="email" value="${escapeHtml(email)}">
<input type="hidden" name="token" value="${escapeHtml(token)}">
${row("blog", blogOn, "Blog posts", blogDaily ? "You get each post the day it publishes (Mon/Wed/Fri)." : "You get a weekly digest on Mondays.")}
${blogOn ? row("blog_daily", blogDaily, "Send each post individually", "Instead of the Monday digest, get each post the day it goes up.") : ""}
${challengeRows}
${row("group", groupOn, "Group notifications", "A note when someone new joins a group you lead.")}
<p class="hint">Turning off challenge emails never touches your progress. Your dashboard, streaks, and groups stay exactly as they are, and you can turn the emails back on here any time.</p>
<button type="submit">Save My Preferences</button>
</form>
<a class="cancel" href="https://heatherlynwilson.com">Back to heatherlynwilson.com</a>
</div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  let email = "", token = "", blog = false, group = false, blogDaily = false;
  const chOn = {};

  const ct = context.request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const body = await context.request.json();
    email = (body.email || "").trim().toLowerCase();
    token = body.token || "";
    blog = !!body.blog; group = !!body.group; blogDaily = !!body.blog_daily;
    Object.keys(body).forEach(k => { if (k.startsWith("ch_")) chOn[k.slice(3)] = !!body[k]; });
  } else {
    const form = await context.request.formData();
    email = ((form.get("email") || "") + "").trim().toLowerCase();
    token = (form.get("token") || "") + "";
    blog = form.get("blog") === "1";
    group = form.get("group") === "1";
    blogDaily = form.get("blog_daily") === "1";
    for (const k of form.keys()) { if (k.startsWith("ch_")) chOn[k.slice(3)] = form.get(k) === "1"; }
  }

  if (!email || !token) {
    return Response.redirect(url.origin + "/unsubscribed.html?status=invalid", 302);
  }

  const secret = context.env.NOTIFY_SECRET || "";
  const expected = await hmacHex(secret, email);
  if (token !== expected) {
    return Response.redirect(url.origin + "/unsubscribed.html?status=invalid", 302);
  }

  // Blog: mark in the subscribers table
  try {
    await context.env.DB.prepare("INSERT OR IGNORE INTO subscribers (email) VALUES (?)").bind(email).run();
  } catch (e) {}
  try {
    if (blog) {
      await context.env.DB.prepare("UPDATE subscribers SET unsubscribed_at = NULL WHERE email = ?").bind(email).run();
    } else {
      await context.env.DB.prepare("UPDATE subscribers SET unsubscribed_at = datetime('now') WHERE email = ? AND unsubscribed_at IS NULL").bind(email).run();
    }
  } catch (e) {}
  try {
    await context.env.DB.prepare("UPDATE subscribers SET active = ? WHERE email = ?").bind(blog ? 1 : 0, email).run();
  } catch (e) {}

  // Group flag lives in email_prefs; the global challenge flag clears here
  // because this page manages challenges one by one now
  try {
    await context.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS email_prefs (
        email TEXT PRIMARY KEY,
        challenge_optout INTEGER NOT NULL DEFAULT 0,
        group_optout INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `).run();
    try { await context.env.DB.prepare("ALTER TABLE email_prefs ADD COLUMN blog_daily INTEGER NOT NULL DEFAULT 0").run(); } catch (e) {}
    await context.env.DB.prepare(`
      INSERT INTO email_prefs (email, challenge_optout, group_optout, blog_daily, updated_at)
      VALUES (?, 0, ?, ?, datetime('now'))
      ON CONFLICT(email) DO UPDATE SET
        challenge_optout = 0,
        group_optout = excluded.group_optout,
        blog_daily = excluded.blog_daily,
        updated_at = datetime('now')
    `).bind(email, group ? 0 : 1, blogDaily ? 1 : 0).run();
  } catch (e) {}

  // Per-challenge opt-outs, only for challenges they are actually in
  let mySignups = [];
  try {
    const q = await context.env.DB.prepare(
      "SELECT challenge FROM challenge_signups WHERE email = ?"
    ).bind(email).all();
    mySignups = [...new Set((q.results || []).map(r => r.challenge))];
  } catch (e) {}
  try {
    await context.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS challenge_email_optouts (
        email TEXT NOT NULL,
        challenge TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (email, challenge)
      )
    `).run();
    for (const ch of mySignups) {
      if (chOn[ch]) {
        await context.env.DB.prepare("DELETE FROM challenge_email_optouts WHERE email = ? AND challenge = ?").bind(email, ch).run();
      } else {
        await context.env.DB.prepare("INSERT OR IGNORE INTO challenge_email_optouts (email, challenge) VALUES (?, ?)").bind(email, ch).run();
      }
    }
  } catch (e) {}

  const backUrl = "/api/unsubscribe?email=" + encodeURIComponent(email) + "&token=" + encodeURIComponent(token);
  const line = (on, name) => `<p style="margin:0 0 8px;font-size:15px;color:#4b5563;">${on ? "&#10003;" : "&#10005;"} ${name}: <strong>${on ? "on" : "off"}</strong></p>`;
  const NAMES = { "july-2026": "Bible Reading Challenge", "august-james-2026": "One Book Deep", "september-beatitudes-2026": "Hide It In Your Heart", "october-proverbs-2026": "Around the Table", "november-thanks-2026": "Give Thanks", "december-gospels-2026": "God With Us" };
  const challengeLines = mySignups.map(ch => line(!!chOn[ch], (NAMES[ch] || ch) + " emails")).join("");
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex">
<title>Preferences Saved | Heather Lyn Wilson</title>
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;600&family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:60px 20px;background:#faf6ef;font-family:Inter,system-ui,sans-serif;color:#1f2937;">
<div style="max-width:440px;margin:40px auto 0;background:#fff;padding:40px 32px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.06);text-align:center;">
<h1 style="font-family:Lora,serif;font-size:26px;font-weight:600;margin:0 0 20px;">Saved.</h1>
${line(blog, "Blog posts")}
${challengeLines}
${line(group, "Group notifications")}
<p style="font-size:13px;color:#6b7280;line-height:1.6;margin:20px 0 0;font-weight:300;">Your challenge progress and dashboard are untouched either way. <a href="${backUrl}" style="color:#b85638;">Change these again</a> any time.</p>
</div>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
