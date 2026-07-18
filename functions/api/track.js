// Record a single page view. Called from /js/tracker.js on every page load.
// No auth; the endpoint validates the payload server-side and stores a
// daily-rotating hashed visitor id so cross-day tracking is impossible.

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    let path = (body.path || "").slice(0, 500);
    let referrer = (body.referrer || "").slice(0, 500);
    let view_id = String(body.view_id || "").slice(0, 64);

    // Skip admin and tracking endpoints themselves
    if (path.indexOf("/admin") !== -1 || path.indexOf("admin.html") !== -1) {
      return new Response(JSON.stringify({ skipped: true }), { headers: JSON_HEADERS });
    }

    // Drop obvious bots
    const ua = context.request.headers.get("user-agent") || "";
    if (/bot|spider|crawler|preview|fetch|curl|wget|headless/i.test(ua)) {
      return new Response(JSON.stringify({ skipped: true }), { headers: JSON_HEADERS });
    }

    const ip = context.request.headers.get("cf-connecting-ip") || "";
    const country = context.request.headers.get("cf-ipcountry") || "";
    const region = (context.request.cf && context.request.cf.region) || "";
    const today = new Date().toISOString().slice(0, 10);

    // visitor_id is a daily-rotating hash of IP+UA+date — same visitor on
    // the same day gets the same id, but it does not persist across days.
    const visitor_id = (await sha256Hex(ip + "|" + ua + "|" + today)).slice(0, 16);

    await context.env.DB.prepare(
      "INSERT INTO page_views (path, referrer, visitor_id, country, view_id, region) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(path, referrer, visitor_id, country, view_id, region).run();

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

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
