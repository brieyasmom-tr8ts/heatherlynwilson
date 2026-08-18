// Read-only diagnostic surface. The cron worker writes short status rows
// into diag_log (API reachability, config presence, marker history) and this
// endpoint exposes them so problems can be diagnosed without depending on
// email delivery. Contains no secrets: statuses and short response excerpts
// only.

export async function onRequestGet(context) {
  try {
    const { results } = await context.env.DB.prepare(
      "SELECT k, v, at FROM diag_log ORDER BY at DESC, k LIMIT 50"
    ).all();
    return new Response(JSON.stringify({ rows: results || [] }, null, 1), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ rows: [], note: String((e && e.message) || e).slice(0, 100) }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}
