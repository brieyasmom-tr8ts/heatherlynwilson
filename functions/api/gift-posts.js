// Gift Posts management API (Add to Cart series)
// GET    /api/gift-posts?key=ADMIN_KEY — list all gift posts
// POST   /api/gift-posts?key=ADMIN_KEY — create or update a gift post
// DELETE /api/gift-posts?key=ADMIN_KEY&id=N — delete a gift post

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) return json({ error: "Unauthorized" }, 401);

  try {
    const { results } = await context.env.DB.prepare(
      "SELECT * FROM gift_posts ORDER BY scheduled_date, slot"
    ).all();
    return json({ posts: results || [] });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await context.request.json();
    const { scheduled_date, slot, message, image_url } = body;
    if (!scheduled_date || !slot || !message) return json({ error: "scheduled_date, slot, and message required" }, 400);
    if (slot !== "morning" && slot !== "evening") return json({ error: "slot must be 'morning' or 'evening'" }, 400);

    const existing = await context.env.DB.prepare(
      "SELECT id FROM gift_posts WHERE scheduled_date = ? AND slot = ?"
    ).bind(scheduled_date, slot).first();

    let id;
    if (existing) {
      await context.env.DB.prepare(
        "UPDATE gift_posts SET message = ?, image_url = ? WHERE id = ?"
      ).bind(message, image_url || null, existing.id).run();
      id = existing.id;
    } else {
      const result = await context.env.DB.prepare(
        "INSERT INTO gift_posts (scheduled_date, slot, message, image_url) VALUES (?, ?, ?, ?)"
      ).bind(scheduled_date, slot, message, image_url || null).run();
      id = result.meta.last_row_id;
    }

    return json({ success: true, id });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) return json({ error: "Unauthorized" }, 401);

  const id = url.searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);

  try {
    await context.env.DB.prepare("DELETE FROM gift_posts WHERE id = ?").bind(id).run();
    return json({ success: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
