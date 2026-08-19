// POST /api/resend-welcome?key=ADMIN_KEY  { email, challenge }
// Admin-only: re-sends a signed-up reader their challenge intro, with their
// plan, start date, and a fresh dashboard link. Used by the "resend intro"
// button in the admin Signups table when a reader loses their welcome email.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function hmacHex(secret, msg) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const CHALLENGE_NAMES = {
  "july-2026": "Bible Reading Challenge",
  "august-james-2026": "One Book Deep: James + Prayer",
  "september-beatitudes-2026": "Hide It In Your Heart",
  "october-proverbs-2026": "Around the Table",
  "november-thanks-2026": "Give Thanks",
  "december-gospels-2026": "God With Us",
};

const OFFICIAL_STARTS = {
  "august-james-2026": "August 1",
  "september-beatitudes-2026": "September 1",
  "october-proverbs-2026": "October 1",
  "november-thanks-2026": "November 1",
  "december-gospels-2026": "December 1",
};

const TRACK_LABELS = {
  "full-bible": "The whole Bible in 31 days",
  "full-bible-classic": "The whole Bible in 31 days",
  "new-testament": "The New Testament in 31 days",
  "chronological": "The Bible in chronological order, 31 days",
  "bible-90": "The whole Bible in 3 months",
  "chrono-90": "Chronological order, 3 months",
  "ot-90": "The Old Testament in 3 months",
  "nt-90": "The New Testament in 3 months",
  "niv": "Memorizing in the NIV translation",
  "nlt": "Memorizing in the NLT translation",
  "esv": "Memorizing in the ESV translation",
  "kjv": "Memorizing in the KJV translation",
  "family": "Family devotional, one Proverbs chapter a day",
  "one-psalm": "One psalm a day",
  "all-psalms": "All 150 Psalms in 30 days",
  "four-gospels": "All four Gospels in December",
  "luke": "Luke, one chapter a day",
};

export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  if (url.searchParams.get("key") !== context.env.ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!context.env.BREVO_API_KEY) {
    return json({ error: "Email is not configured." }, 500);
  }

  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: "Bad request" }, 400); }
  const email = (body.email || "").trim().toLowerCase();
  const challenge = (body.challenge || "").trim();
  if (!email || !challenge) return json({ error: "Missing email or challenge" }, 400);

  const signup = await context.env.DB.prepare(
    "SELECT name, track, personal_start_date FROM challenge_signups WHERE email = ? AND challenge = ?"
  ).bind(email, challenge).first();
  if (!signup) return json({ error: "No signup found for that email and challenge." }, 404);

  const name = signup.name || "friend";
  const chName = CHALLENGE_NAMES[challenge] || "your Bible challenge";
  const plan = TRACK_LABELS[signup.track] || "";

  let startLine = "";
  if (signup.personal_start_date) {
    startLine = "Your Day 1 is <strong>" + signup.personal_start_date + "</strong>.";
  } else if (OFFICIAL_STARTS[challenge]) {
    startLine = "The challenge starts <strong>" + OFFICIAL_STARTS[challenge] + "</strong>.";
  } else {
    startLine = "You can start any day you like.";
  }

  const origin = url.origin;
  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const dashToken = await hmacHex(secret, email + ":challenge:" + "2027-07-01");
  const dashUrl = `${origin}/challenge/dashboard.html?email=${encodeURIComponent(email)}&token=${dashToken}`;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": context.env.BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { name: "Heather Lyn Wilson", email: "heather@heatherlynwilson.com" },
      to: [{ email, name }],
      subject: "Here is your " + chName + " info again",
      htmlContent: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;"><tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1f2937;padding:28px 32px;"><span style="color:#fff;font-size:20px;font-family:Georgia,serif;">HeatherLynWilson.com</span></td></tr>
<tr><td style="padding:36px 32px 8px;">
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Hi ${name},</p>
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Here is your <strong>${chName}</strong> info again, as requested.</p>
${plan ? `<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Your plan: <strong>${plan}</strong>.</p>` : ""}
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">${startLine}</p>
<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Each morning of the challenge you will get an email with the day's reading. Your dashboard has everything else: check off your reading, see your streak, and change your plan or start date any time.</p>
</td></tr>
<tr><td style="padding:8px 32px 28px;" align="center">
<a href="${dashUrl}" style="display:inline-block;padding:16px 36px;background:#b85638;color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Open My Dashboard</a>
</td></tr>
<tr><td style="padding:0 32px 32px;">
<p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;font-family:-apple-system,sans-serif;">If you ever lose this email, go to heatherlynwilson.com/challenge/login.html and enter your email. A fresh dashboard link will be sent to you.</p>
</td></tr>
</table></td></tr></table></body></html>`,
    }),
  });

  if (!res.ok) return json({ error: "The email service did not accept the send. Try again." }, 502);
  return json({ success: true });
}
