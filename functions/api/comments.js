// Blog post comments. The table is created on first use, and every handler
// answers with JSON instead of crashing: the first-ever commenter found the
// missing table the hard way through a Cloudflare 1101 error page.

const JSON_HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS post_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT DEFAULT '',
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  // An older version of this table existed without these columns; the
  // create-if-missing above cannot fix that, so migrate in place.
  try { await db.prepare("ALTER TABLE post_comments ADD COLUMN email TEXT DEFAULT ''").run(); } catch (e) {}
  try { await db.prepare("ALTER TABLE post_comments ADD COLUMN created_at TEXT DEFAULT ''").run(); } catch (e) {}
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS comment_hearts (
      comment_id INTEGER NOT NULL,
      visitor TEXT NOT NULL,
      created_at TEXT DEFAULT '',
      UNIQUE(comment_id, visitor)
    )
  `).run();
}

const COMMENT_LIST_SQL =
  "SELECT id, name, comment, created_at, " +
  "(SELECT COUNT(*) FROM comment_hearts h WHERE h.comment_id = post_comments.id) AS hearts " +
  "FROM post_comments WHERE slug = ? ORDER BY created_at DESC LIMIT 100";

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const slug = url.searchParams.get("slug");
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), { status: 400, headers: JSON_HEADERS });
  }

  try {
    await ensureTable(context.env.DB);
    const { results } = await context.env.DB.prepare(COMMENT_LIST_SQL).bind(slug).all();
    return new Response(JSON.stringify({ slug, comments: results || [] }), { headers: JSON_HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ slug, comments: [] }), { headers: JSON_HEADERS });
  }
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Bad request" }), { status: 400, headers: JSON_HEADERS });
  }
  const { slug, name, email, comment } = body;
  const token = body["cf-turnstile-response"] || "";

  if (!slug || !name || !comment) {
    return new Response(JSON.stringify({ error: "Missing slug, name, or comment" }), { status: 400, headers: JSON_HEADERS });
  }

  if (name.length > 100 || comment.length > 2000) {
    return new Response(JSON.stringify({ error: "Name or comment too long" }), { status: 400, headers: JSON_HEADERS });
  }

  // Verify Turnstile
  if (context.env.TURNSTILE_SECRET) {
    try {
      const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `secret=${encodeURIComponent(context.env.TURNSTILE_SECRET)}&response=${encodeURIComponent(token)}`,
      });
      const result = await res.json();
      if (!result.success) {
        return new Response(JSON.stringify({ error: "Captcha failed. Please refresh and try again." }), { status: 403, headers: JSON_HEADERS });
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: "Captcha check failed. Please try again." }), { status: 403, headers: JSON_HEADERS });
    }
  }

  try {
    await ensureTable(context.env.DB);
    await context.env.DB.prepare(
      "INSERT INTO post_comments (slug, name, email, comment, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).bind(slug, name, email || "", comment).run();

    // Tell Heather someone commented, with a link straight to the post
    if (context.env.BREVO_API_KEY) {
      try {
        const postUrl = "https://heatherlynwilson.com/blog/" + slug + ".html";
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": context.env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { name: "HeatherLynWilson.com", email: "heather@heatherlynwilson.com" },
            to: [{ email: "heather@givesendgo.com", name: "Heather Wilson" }],
            replyTo: email ? { email: email, name: name } : undefined,
            subject: "New blog comment from " + name,
            textContent: name + " commented on " + slug + ":\n\n\"" + comment + "\"\n\nSee it on the post:\n" + postUrl + (email ? "\n\nTheir email: " + email : ""),
          }),
        });
      } catch (e) {}
    }

    const { results } = await context.env.DB.prepare(COMMENT_LIST_SQL).bind(slug).all();
    return new Response(JSON.stringify({ slug, comments: results || [] }), { headers: JSON_HEADERS });
  } catch (e) {
    const why = String((e && e.message) || e).slice(0, 80);
    return new Response(JSON.stringify({ error: "Could not save your comment (" + why + ")" }), { status: 500, headers: JSON_HEADERS });
  }
}

export async function onRequestDelete(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");
  const key = url.searchParams.get("key");

  if (!id || key !== context.env.ADMIN_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: JSON_HEADERS });
  }

  try {
    await context.env.DB.prepare("DELETE FROM post_comments WHERE id = ?").bind(id).run();
    await context.env.DB.prepare("DELETE FROM comment_hearts WHERE comment_id = ?").bind(id).run();
  } catch (e) {}

  return new Response(JSON.stringify({ success: true }), { headers: JSON_HEADERS });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
