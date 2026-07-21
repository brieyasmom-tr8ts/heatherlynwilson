// POST /api/blog-edit - save blog post edits
// Stores the full updated JSON in D1 so the publish script and editor can read it.

export async function onRequestPost(context) {
  const { key, slug, data } = await context.request.json();
  if (!key || key !== context.env.ADMIN_KEY) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  if (!slug || !data) {
    return new Response(JSON.stringify({ error: "missing slug or data" }), { status: 400 });
  }

  // Ensure table exists
  await context.env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS blog_queue_edits (
      slug TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  // Upsert the post
  await context.env.DB.prepare(
    "INSERT INTO blog_queue_edits (slug, data, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(slug) DO UPDATE SET data = excluded.data, updated_at = datetime('now')"
  ).bind(slug, JSON.stringify(data)).run();

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  const slug = url.searchParams.get("slug");

  if (!key || key !== context.env.ADMIN_KEY) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  if (slug) {
    // Return single post edit
    try {
      const row = await context.env.DB.prepare(
        "SELECT data FROM blog_queue_edits WHERE slug = ?"
      ).bind(slug).first();
      if (row) {
        return new Response(row.data, {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    } catch (e) {}
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }

  // Return all edits
  try {
    const rows = await context.env.DB.prepare(
      "SELECT slug, data, updated_at FROM blog_queue_edits ORDER BY updated_at DESC"
    ).all();
    return new Response(JSON.stringify({ edits: rows.results }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ edits: [] }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
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
