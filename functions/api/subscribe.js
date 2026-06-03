export async function onRequestPost(context) {
  const body = await context.request.json();
  const email = (body.email || "").trim().toLowerCase();
  const source = body.source || "general";

  if (!email || !email.includes("@")) {
    return new Response(JSON.stringify({ error: "Invalid email" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
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
      return new Response(JSON.stringify({ error: "Captcha failed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Save to D1
  let isNew = true;
  try {
    const existing = await context.env.DB.prepare(
      "SELECT email FROM subscribers WHERE email = ?"
    ).bind(email).first();
    if (existing) isNew = false;

    await context.env.DB.prepare(
      "INSERT OR IGNORE INTO subscribers (email) VALUES (?)"
    ).bind(email).run();
  } catch (e) {
    // already subscribed, that's fine
  }

  if (context.env.BREVO_API_KEY) {
    // Send welcome email with PDF to the subscriber
    try {
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": context.env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "Heather Lyn Wilson", email: "heather@heatherlynwilson.com" },
          to: [{ email: email }],
          subject: "Your free guide: Reading the Bible in a Month",
          htmlContent: buildWelcomeEmail(source),
        }),
      });
    } catch (e) {}

    // Notify Heather
    if (isNew) {
      try {
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": context.env.BREVO_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: { name: "Heather Wilson", email: "heather@heatherlynwilson.com" },
            to: [{ email: "heather@givesendgo.com", name: "Heather Wilson" }],
            subject: "New Subscriber: " + email,
            textContent: "Someone just subscribed to your site!\n\nEmail: " + email + "\nSource: " + source + "\nDate: " + new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
          }),
        });
      } catch (e) {}
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

function buildWelcomeEmail(source) {
  const showGuide = source === "lead-magnet" || source === "general";
  const guideBlock = showGuide ? `
<tr><td style="padding:0 32px 28px;">
<a href="https://heatherlynwilson.com/downloads/31-days-in-the-word.pdf" style="display:inline-block;padding:14px 32px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Download Your Free Guide</a>
</td></tr>` : "";

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
<h1 style="margin:0 0 16px;font-size:24px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;">Welcome, friend!</h1>
<p style="margin:0 0 20px;font-size:16px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">I am so glad you are here. Thank you for subscribing.</p>
<p style="margin:0 0 20px;font-size:16px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">Here is your free copy of <strong style="color:#1f2937;">Reading the Bible in a Month</strong>, my personal guide to reading the entire Bible in a month. It includes the lessons I learned, the mistakes to avoid, the tips that helped me finish, and the exact reading plan I used.</p>
<p style="margin:0 0 20px;font-size:16px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">One tip before you start: if you are going to be intentional about this, you might as well pick a month with 31 days. Just saying.</p>
</td></tr>

${guideBlock}

<tr><td style="padding:8px 32px 28px;">
<p style="margin:0 0 20px;font-size:16px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;">Every Monday, Wednesday, and Friday, I share Scripture reflections and real-life lessons on faith, leadership, and learning to follow God in the middle of it all. You will hear from me soon.</p>
<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.6;font-family:-apple-system,sans-serif;font-style:italic;font-family:Georgia,serif;">Heather</p>
</td></tr>

<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">
<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">
You are receiving this because you subscribed at heatherlynwilson.com.
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
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
