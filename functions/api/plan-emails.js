// GET /api/plan-emails?plan=x
// Public, read-only: the daily content for a plan, from the challenge_emails
// table Heather edits. Returns {emails: []} when the plan is not in the table
// yet, so callers fall back to their packaged JSON.

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const plan = (url.searchParams.get("plan") || "").trim();
  if (!plan) return json({ error: "Missing plan." }, 400);
  try {
    const { results } = await context.env.DB.prepare(
      "SELECT day, subject, reading, title, focus, verse_ref, beatitude, hide_pct, prayer_focus, prayer_verse, practice, body FROM challenge_emails WHERE plan = ? ORDER BY day"
    ).bind(plan).all();
    return json({ plan, emails: results || [] });
  } catch (e) {
    return json({ plan, emails: [] });
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}
