export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const slug = url.searchParams.get("slug");
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const { results } = await context.env.DB.prepare(
    "SELECT id, name, comment, created_at FROM post_comments WHERE slug = ? ORDER BY created_at DESC LIMIT 100"
  ).bind(slug).all();

  return new Response(JSON.stringify({ slug, comments: results || [] }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  const { slug, name, comment } = body;

  if (!slug || !name || !comment) {
    return new Response(JSON.stringify({ error: "Missing slug, name, or comment" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  if (name.length > 100 || comment.length > 2000) {
    return new Response(JSON.stringify({ error: "Name or comment too long" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  await context.env.DB.prepare(
    "INSERT INTO post_comments (slug, name, comment) VALUES (?, ?, ?)"
  ).bind(slug, name, comment).run();

  const { results } = await context.env.DB.prepare(
    "SELECT id, name, comment, created_at FROM post_comments WHERE slug = ? ORDER BY created_at DESC LIMIT 100"
  ).bind(slug).all();

  return new Response(JSON.stringify({ slug, comments: results || [] }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export async function onRequestDelete(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");
  const key = url.searchParams.get("key");

  if (!id || key !== context.env.ADMIN_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  await context.env.DB.prepare("DELETE FROM post_comments WHERE id = ?").bind(id).run();

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
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
