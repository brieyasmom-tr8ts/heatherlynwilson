// POST /api/launch-team — sign up for the book launch team
// GET /api/launch-team?key=ADMIN_KEY — list all signups (admin)

export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: "Invalid request." }, 400); }

  const name = (body.name || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const instagram = (body.instagram || "").trim().replace(/^@/, "").slice(0, 50);
  const why = (body.why || "").trim().slice(0, 500);
  const agreedRead = body.agreed_read ? 1 : 0;
  const agreedReview = body.agreed_review ? 1 : 0;
  const agreedShare = body.agreed_share ? 1 : 0;
  const source = (body.source || "").trim().slice(0, 100);
  const region = (context.request.cf && context.request.cf.region) || "";
  const book = (body.book || "built-to-shine").trim().slice(0, 50);

  if (!name || !email || !email.includes("@")) {
    return json({ error: "Please fill in your name and email." }, 400);
  }

  if (!agreedRead || !agreedReview || !agreedShare) {
    return json({ error: "Please agree to all three commitments to join the launch team." }, 400);
  }

  // Verify Turnstile if configured
  const token = body["cf-turnstile-response"] || "";
  if (context.env.TURNSTILE_SECRET) {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(context.env.TURNSTILE_SECRET)}&response=${encodeURIComponent(token)}`,
    });
    const result = await res.json();
    if (!result.success) {
      return json({ error: "Verification failed. Please refresh and try again." }, 403);
    }
  }

  // Check for duplicate
  const existing = await context.env.DB.prepare(
    "SELECT id FROM launch_team WHERE email = ? AND book = ?"
  ).bind(email, book).first();

  if (existing) {
    return json({ error: "You are already on the launch team! We will be in touch." });
  }

  await context.env.DB.prepare(
    "INSERT INTO launch_team (name, email, instagram, why, agreed_read, agreed_review, agreed_share, source, region, book) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(name, email, instagram, why, agreedRead, agreedReview, agreedShare, source, region, book).run();

  // Get count
  const countRow = await context.env.DB.prepare("SELECT COUNT(*) as cnt FROM launch_team WHERE book = ?").bind(book).first();
  const count = countRow ? countRow.cnt : 0;

  // Also add to subscribers
  try {
    await context.env.DB.prepare("INSERT OR IGNORE INTO subscribers (email) VALUES (?)").bind(email).run();
  } catch (e) {}

  // Notify Heather
  if (context.env.BREVO_API_KEY) {
    try {
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": context.env.BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: "HeatherLynWilson.com", email: "heather@heatherlynwilson.com" },
          to: [{ email: "heather@givesendgo.com", name: "Heather" }],
          subject: "BTS Launch Team Signup #" + count + ": " + name,
          textContent: "New Built to Shine launch team member!\n\nName: " + name + "\nEmail: " + email + "\nSocial: " + (instagram || "none") + "\nWhy: " + (why || "not provided") + "\nBook: " + book + "\nTotal: " + count,
        }),
      });
    } catch (e) {}
  }

  return json({ success: true, count: count });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { results } = await context.env.DB.prepare(
    "SELECT * FROM launch_team ORDER BY created_at DESC"
  ).all();

  return json({
    total: (results || []).length,
    members: results || [],
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
