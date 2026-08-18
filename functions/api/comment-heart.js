// Hearts on blog comments. One heart per visitor per comment, toggleable.
// The visitor id is a random id the browser keeps in localStorage; the
// UNIQUE constraint makes double-hearting harmless.

const JSON_HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS comment_hearts (
      comment_id INTEGER NOT NULL,
      visitor TEXT NOT NULL,
      created_at TEXT DEFAULT '',
      UNIQUE(comment_id, visitor)
    )
  `).run();
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ error: "Bad request" }, 400);
  }
  const commentId = parseInt(body.comment_id, 10);
  const visitor = String(body.visitor || "").slice(0, 64);
  const on = body.on !== false;

  if (!Number.isFinite(commentId) || commentId < 1 || !visitor) {
    return json({ error: "Missing comment or visitor" }, 400);
  }

  try {
    await ensureTable(context.env.DB);

    // Only heart comments that exist
    const exists = await context.env.DB.prepare(
      "SELECT id FROM post_comments WHERE id = ?"
    ).bind(commentId).first();
    if (!exists) return json({ error: "Comment not found" }, 404);

    if (on) {
      await context.env.DB.prepare(
        "INSERT OR IGNORE INTO comment_hearts (comment_id, visitor, created_at) VALUES (?, ?, datetime('now'))"
      ).bind(commentId, visitor).run();
    } else {
      await context.env.DB.prepare(
        "DELETE FROM comment_hearts WHERE comment_id = ? AND visitor = ?"
      ).bind(commentId, visitor).run();
    }

    const row = await context.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM comment_hearts WHERE comment_id = ?"
    ).bind(commentId).first();
    return json({ success: true, count: (row && row.n) || 0 });
  } catch (e) {
    return json({ error: "failed" }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
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
