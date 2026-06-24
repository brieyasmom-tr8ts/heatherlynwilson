// Record how long a visitor stayed on a page. Called from /js/tracker.js
// on pagehide / visibilitychange. Matches by view_id (a UUID minted at page
// load) to update the right page_views row.
//
// dwell_seconds = 0 means the visitor left immediately (bounce candidate).

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const view_id = String(body.view_id || "").slice(0, 64);
    let seconds = parseInt(body.seconds, 10);
    if (!view_id || !Number.isFinite(seconds)) {
      return new Response(JSON.stringify({ skipped: true }), { headers: JSON_HEADERS });
    }
    // Clamp anything wild
    if (seconds < 0) seconds = 0;
    if (seconds > 60 * 60 * 12) seconds = 60 * 60 * 12;

    // Only update if not already set (first dwell ping wins, prevents
    // double-counting from visibilitychange + pagehide both firing).
    await context.env.DB.prepare(
      "UPDATE page_views SET dwell_seconds = ? WHERE view_id = ? AND dwell_seconds IS NULL"
    ).bind(seconds, view_id).run();

    return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ error: "failed" }), { status: 500, headers: JSON_HEADERS });
  }
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
