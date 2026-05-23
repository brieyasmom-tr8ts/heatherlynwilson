export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const slug = url.searchParams.get("slug");
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const row = await context.env.DB.prepare("SELECT count FROM post_likes WHERE slug = ?").bind(slug).first();
  return new Response(JSON.stringify({ slug, count: row ? row.count : 0 }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  const slug = body.slug;
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  await context.env.DB.prepare(
    "INSERT INTO post_likes (slug, count, updated_at) VALUES (?, 1, datetime('now')) ON CONFLICT(slug) DO UPDATE SET count = count + 1, updated_at = datetime('now')"
  ).bind(slug).run();

  const row = await context.env.DB.prepare("SELECT count FROM post_likes WHERE slug = ?").bind(slug).first();
  return new Response(JSON.stringify({ slug, count: row.count }), {
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
