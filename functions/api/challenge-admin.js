// Admin endpoint for challenge signups
// GET /api/challenge-admin?key=ADMIN_KEY — list all signups with stats
// DELETE /api/challenge-admin?key=ADMIN_KEY&id=123 — remove a signup

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const { results } = await context.env.DB.prepare(
      "SELECT id, name, email, track, prayer, challenge, created_at FROM challenge_signups ORDER BY created_at DESC"
    ).all();

    const all = results || [];
    const fullBible = all.filter(r => r.track === "full-bible");
    const newTestament = all.filter(r => r.track === "new-testament");
    const prayerCount = all.filter(r => r.prayer === 1).length;

    return json({
      total: all.length,
      full_bible_count: fullBible.length,
      new_testament_count: newTestament.length,
      prayer_count: prayerCount,
      signups: all,
    });
  } catch (e) {
    return json({ total: 0, full_bible_count: 0, new_testament_count: 0, prayer_count: 0, signups: [] });
  }
}

export async function onRequestDelete(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");
  const key = url.searchParams.get("key");

  if (!id || key !== context.env.ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  await context.env.DB.prepare("DELETE FROM challenge_signups WHERE id = ?").bind(id).run();
  return json({ success: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
