// Live community feed for the Bible Challenge: most recent check-ins,
// joined with signup names. No auth — anyone with the dashboard URL can
// poll this to see the live activity stream.
//
// GET /api/challenge-feed -> { entries: [{name, day, track, ts}, ...] }

const CHALLENGE = "july-2026";
const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const limit = Math.min(50, Math.max(5, parseInt(url.searchParams.get("limit") || "20", 10)));

    const rows = await context.env.DB.prepare(
      "SELECT c.email, c.day, c.checked_at, s.name, s.track " +
      "FROM challenge_checkins c " +
      "LEFT JOIN challenge_signups s ON s.email = c.email AND s.challenge = c.challenge " +
      "WHERE c.challenge = ? " +
      "ORDER BY c.checked_at DESC LIMIT ?"
    ).bind(CHALLENGE, limit).all();

    const entries = (rows.results || []).map((r) => ({
      name: firstName(r.name || ""),
      day: r.day,
      track: r.track || "full-bible",
      ts: r.checked_at,
    }));

    return new Response(JSON.stringify({ entries }), { headers: JSON_HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ entries: [] }), { headers: JSON_HEADERS });
  }
}

function firstName(full) {
  const t = (full || "").trim();
  if (!t) return "Someone";
  const parts = t.split(/\s+/);
  return parts[0];
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
