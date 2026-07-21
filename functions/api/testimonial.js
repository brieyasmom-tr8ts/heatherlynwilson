// POST /api/testimonial - collect a story / testimonial from a reader.
// Stores it, notifies Heather, and records whether she has permission to
// share it publicly.

export async function onRequestPost(context) {
  const body = await context.request.json();
  const name = (body.name || "").trim();
  const contextType = (body.context || "").trim();
  const which = (body.which || "").trim();
  const story = (body.story || "").trim();
  const email = (body.email || "").trim();
  const permission = body.permission ? 1 : 0;

  if (!name || !story) {
    return json({ error: "Please add your name and your story." }, 400);
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
      return json({ error: "Captcha verification failed. Please refresh and try again." }, 403);
    }
  }

  // Store it (create the table if it does not exist yet)
  try {
    await context.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS testimonials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        context TEXT DEFAULT '',
        which TEXT DEFAULT '',
        story TEXT NOT NULL,
        email TEXT DEFAULT '',
        permission INTEGER NOT NULL DEFAULT 0,
        approved INTEGER NOT NULL DEFAULT 0,
        hidden INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();
    await context.env.DB.prepare(
      "INSERT INTO testimonials (name, context, which, story, email, permission) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(name, contextType, which, story, email, permission).run();
  } catch (e) {
    return json({ error: "Could not save your story. Please try again." }, 500);
  }

  // Notify Heather
  if (context.env.BREVO_API_KEY) {
    try {
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": context.env.BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: "Heather Wilson", email: "heather@heatherlynwilson.com" },
          to: [{ email: "heather@givesendgo.com", name: "Heather Wilson" }],
          replyTo: email ? { email: email, name: name } : undefined,
          subject: "New story from " + name + (permission ? " (OK to share)" : " (private)"),
          textContent:
            "New story shared!\n\n" +
            "Name: " + name + "\n" +
            "About: " + (contextType || "N/A") + (which ? " (" + which + ")" : "") + "\n" +
            "Email: " + (email || "not given") + "\n" +
            "Permission to share publicly: " + (permission ? "YES" : "No") + "\n\n" +
            "Story:\n" + story,
        }),
      });
    } catch (e) {}
  }

  return json({ success: true });
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
