// Countdown emails leading up to the July Bible Challenge.
// Sends to all challenge signups.
//
// POST with X-Notify-Secret header.
// Body: { "email_id": 1 }          — send a specific email to all signups
// Body: { "test_email": "..." }     — send ALL emails to one address for preview

const CHALLENGE = "july-2026";
const CHALLENGE_URL = "https://heatherlynwilson.com/challenge.html";

const COUNTDOWN_EMAILS = [
  {
    id: 1,
    send_date: "2026-06-17",
    subject: "Know someone who would want to do this with you?",
    body: buildShareEmail,
  },
  {
    id: 2,
    send_date: "2026-06-20",
    subject: "10 days until we start reading",
    body: buildTenDaysEmail,
  },
  {
    id: 3,
    send_date: "2026-06-25",
    subject: "6 days out. Here is how to get ready.",
    body: buildPrepEmail,
  },
  {
    id: 4,
    send_date: "2026-06-30",
    subject: "Tomorrow we start.",
    body: buildEveEmail,
  },
];

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

  const reqBody = await context.request.json();
  const testEmail = (reqBody.test_email || "").trim().toLowerCase();
  const emailId = reqBody.email_id;

  // TEST MODE: send all emails to one address
  if (testEmail) {
    let sent = 0;
    for (const email of COUNTDOWN_EMAILS) {
      const unsub = await unsubscribeUrl(context.request.url, secret, testEmail);
      const html = email.body(unsub);
      try {
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": brevoKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { name: "Heather Lyn Wilson", email: "heather@heatherlynwilson.com" },
            to: [{ email: testEmail }],
            subject: `[TEST ${email.id}/4] ${email.subject}`,
            htmlContent: html,
          }),
        });
        if (res.ok) sent++;
      } catch (e) {}
    }
    return new Response(JSON.stringify({ success: true, sent, test: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // PRODUCTION MODE: send specific email to all signups
  if (!emailId) {
    return new Response(JSON.stringify({ error: "Provide email_id (1-4) or test_email" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const emailDef = COUNTDOWN_EMAILS.find(e => e.id === emailId);
  if (!emailDef) {
    return new Response(JSON.stringify({ error: "Invalid email_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { results } = await context.env.DB.prepare(
    "SELECT email FROM challenge_signups WHERE challenge = ?"
  ).bind(CHALLENGE).all();

  if (!results || results.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: "No signups" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let failed = 0;

  for (const row of results) {
    const unsub = await unsubscribeUrl(context.request.url, secret, row.email);
    const html = emailDef.body(unsub);
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": brevoKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: "Heather Lyn Wilson", email: "heather@heatherlynwilson.com" },
          to: [{ email: row.email }],
          subject: emailDef.subject,
          htmlContent: html,
        }),
      });
      if (res.ok) sent++;
      else failed++;
    } catch (e) {
      failed++;
    }
  }

  return new Response(JSON.stringify({ sent, failed, total: results.length, email_id: emailId }), {
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

// ── Email 1: Share with a friend (June 17) ──

function buildShareEmail(unsubUrl) {
  const shareText = encodeURIComponent("I signed up to read the entire Bible in 31 days this July. Want to do it with me? Sign up here:");
  const shareUrl = encodeURIComponent(CHALLENGE_URL);

  return `<!DOCTYPE html>
<html>
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
<h1 style="margin:0 0 20px;font-size:26px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;">This is better with someone else.</h1>
<p style="margin:0 0 18px;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">You signed up to read the Bible in 31 days this July. That is a big commitment. And it is a whole lot easier when you are not doing it alone.</p>
<p style="margin:0 0 18px;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">Think of one person who would want to do this with you. A friend. A sibling. Someone from your small group. Your spouse. Your college roommate you have not talked to in a while.</p>
<p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">Send them the link. That is all it takes.</p>
</td></tr>

<tr><td style="padding:0 32px 24px;" align="center">
<p style="margin:0 0 16px;font-size:14px;color:#6b7280;font-family:-apple-system,sans-serif;font-weight:600;letter-spacing:0.5px;">SHARE THE CHALLENGE</p>
<table cellpadding="0" cellspacing="0"><tr>
<td style="padding:0 6px;"><a href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}" style="display:inline-block;padding:12px 20px;background:#1877f2;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-family:-apple-system,sans-serif;font-weight:600;">Facebook</a></td>
<td style="padding:0 6px;"><a href="https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}" style="display:inline-block;padding:12px 20px;background:#1f2937;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-family:-apple-system,sans-serif;font-weight:600;">X / Twitter</a></td>
<td style="padding:0 6px;"><a href="mailto:?subject=${encodeURIComponent("Read the Bible with me this July")}&body=${shareText}%20${shareUrl}" style="display:inline-block;padding:12px 20px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-family:-apple-system,sans-serif;font-weight:600;">Email</a></td>
</tr></table>
</td></tr>

<tr><td style="padding:0 32px 24px;" align="center">
<p style="margin:0 0 8px;font-size:14px;color:#6b7280;font-family:-apple-system,sans-serif;">Or just copy and text them this link:</p>
<p style="margin:0;padding:12px 20px;background:#f7f4ee;border:1px solid #e5e0d5;border-radius:6px;font-size:15px;font-family:monospace;color:#1f2937;letter-spacing:0.3px;">heatherlynwilson.com/challenge</p>
</td></tr>

<tr><td style="padding:8px 32px 28px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.6;font-style:italic;font-family:Georgia,serif;">Heather</p>
</td></tr>

<tr><td style="padding:12px 32px 24px;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for the July Bible Challenge at heatherlynwilson.com.<br>
<a href="${unsubUrl}" style="color:#6b7280;">Unsubscribe</a>
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Email 2: 10 days out (June 20) ──

function buildTenDaysEmail(unsubUrl) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

<tr><td style="background:#1f2937;padding:28px 32px;">
<span style="color:#ffffff;font-size:20px;font-family:Georgia,serif;letter-spacing:0.5px;">HeatherLynWilson.com</span>
<span style="float:right;color:#c8a365;font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;padding-top:4px;">10 DAYS OUT</span>
</td></tr>

<tr><td style="padding:36px 32px 12px;">
<h1 style="margin:0 0 20px;font-size:26px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;">10 days until we start reading.</h1>
<p style="margin:0 0 18px;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">July 1st is coming fast. And I just want you to know that I am really looking forward to doing this with you.</p>
<p style="margin:0 0 18px;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">Every morning in July you will get an email from me with your reading for the day and a few words to keep you going. You do not need to prepare anything. You do not need a study guide. Just show up and read.</p>
<p style="margin:0 0 18px;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">If you have friends or family who might want to join, there is still time. The more people doing this together, the better.</p>
<p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">I will check in again before we start. See you on the other side of this.</p>
</td></tr>

<tr><td style="padding:0 32px 32px;" align="center">
<a href="https://heatherlynwilson.com/challenge.html" style="display:inline-block;padding:14px 32px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Share the signup link</a>
</td></tr>

<tr><td style="padding:8px 32px 28px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.6;font-style:italic;font-family:Georgia,serif;">Heather</p>
</td></tr>

<tr><td style="padding:12px 32px 24px;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for the July Bible Challenge at heatherlynwilson.com.<br>
<a href="${unsubUrl}" style="color:#6b7280;">Unsubscribe</a>
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Email 3: 6 days out / prep tips (June 25) ──

function buildPrepEmail(unsubUrl) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

<tr><td style="background:#1f2937;padding:28px 32px;">
<span style="color:#ffffff;font-size:20px;font-family:Georgia,serif;letter-spacing:0.5px;">HeatherLynWilson.com</span>
<span style="float:right;color:#c8a365;font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;padding-top:4px;">6 DAYS OUT</span>
</td></tr>

<tr><td style="padding:36px 32px 12px;">
<h1 style="margin:0 0 20px;font-size:26px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;">Here is how to get ready.</h1>
<p style="margin:0 0 18px;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">We start in six days. You do not need much, but a little prep goes a long way. Here are a few things that helped me.</p>
</td></tr>

<tr><td style="padding:0 32px 24px;">
<table cellpadding="0" cellspacing="0" width="100%">
<tr><td style="padding:16px 0;border-bottom:1px solid #e5e0d5;">
<p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#b85638;font-family:-apple-system,sans-serif;">1. Pick your Bible now</p>
<p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">Physical, phone app, audio. Whatever you will actually use. I like NLT for reading fast, but use the translation you are most comfortable with.</p>
</td></tr>
<tr><td style="padding:16px 0;border-bottom:1px solid #e5e0d5;">
<p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#b85638;font-family:-apple-system,sans-serif;">2. Block the time</p>
<p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">You will need about 2 to 3 hours a day for the full Bible, or about 45 minutes for the New Testament. Morning, lunch, evening. Break it up however works for you.</p>
</td></tr>
<tr><td style="padding:16px 0;border-bottom:1px solid #e5e0d5;">
<p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#b85638;font-family:-apple-system,sans-serif;">3. Tell someone</p>
<p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">Accountability changes everything. Tell a friend you are doing this. Better yet, get them to sign up too.</p>
</td></tr>
<tr><td style="padding:16px 0;">
<p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#b85638;font-family:-apple-system,sans-serif;">4. Give yourself grace in advance</p>
<p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">You will fall behind at some point. That is okay. Do not quit on Day 8 because Day 7 was hard. Just pick up where you left off.</p>
</td></tr>
</table>
</td></tr>

<tr><td style="padding:0 32px 32px;">
<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">That is it. You do not need to be a Bible scholar. You just need to show up.</p>
</td></tr>

<tr><td style="padding:8px 32px 28px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.6;font-style:italic;font-family:Georgia,serif;">Heather</p>
</td></tr>

<tr><td style="padding:12px 32px 24px;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for the July Bible Challenge at heatherlynwilson.com.<br>
<a href="${unsubUrl}" style="color:#6b7280;">Unsubscribe</a>
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Email 4: Eve of challenge (June 30) ──

function buildEveEmail(unsubUrl) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

<tr><td style="background:#1f2937;padding:28px 32px;">
<span style="color:#ffffff;font-size:20px;font-family:Georgia,serif;letter-spacing:0.5px;">HeatherLynWilson.com</span>
<span style="float:right;color:#c8a365;font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;padding-top:4px;">TOMORROW</span>
</td></tr>

<tr><td style="padding:36px 32px 12px;">
<h1 style="margin:0 0 20px;font-size:26px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;">Tomorrow we start.</h1>
<p style="margin:0 0 18px;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">Tomorrow morning you will get your first email from me with Day 1's reading. Genesis 1 through 50 if you are doing the full Bible. Matthew 1 through 9 if you are doing the New Testament.</p>
<p style="margin:0 0 18px;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">Here is what I want you to know before we begin.</p>
<p style="margin:0 0 18px;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">You do not have to be perfect at this. Some days you will be behind. Some days you will want to quit. Some days the reading will feel dry and nothing will stand out. That is normal. Keep going anyway.</p>
<p style="margin:0 0 18px;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">And some days a verse will stop you cold. Some days you will read something you have read a hundred times and see it completely new. Some days you will cry. That is the Word doing what it does.</p>
<p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">I am doing this right alongside you. Every page. Every chapter. Every day. You are not alone in this.</p>
<p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.65;font-family:-apple-system,sans-serif;">See you in the morning.</p>
</td></tr>

<tr><td style="padding:8px 32px 28px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.6;font-style:italic;font-family:Georgia,serif;">Heather</p>
</td></tr>

<tr><td style="padding:12px 32px 24px;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you signed up for the July Bible Challenge at heatherlynwilson.com.<br>
<a href="${unsubUrl}" style="color:#6b7280;">Unsubscribe</a>
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
