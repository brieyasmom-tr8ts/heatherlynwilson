// Record a single page view. Called from /js/tracker.js on every page load.
// No auth; the endpoint validates the payload server-side and stores a
// daily-rotating hashed visitor id so cross-day tracking is impossible.

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

// GET /api/track?item=name&url=https://... — log click, redirect to URL
// GET /api/track?key=ADMIN_KEY&stats=1 — return click stats for admin
export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  // Admin stats
  const key = url.searchParams.get("key");
  if (key && key === context.env.ADMIN_KEY && url.searchParams.get("stats")) {
    try {
      const [byItem, recent, daily] = await Promise.allSettled([
        context.env.DB.prepare(
          "SELECT item, COUNT(*) as clicks, MAX(created_at) as last_click FROM favorite_clicks GROUP BY item ORDER BY clicks DESC"
        ).all(),
        context.env.DB.prepare(
          "SELECT item, created_at FROM favorite_clicks ORDER BY created_at DESC LIMIT 50"
        ).all(),
        context.env.DB.prepare(
          "SELECT DATE(created_at) as day, COUNT(*) as clicks FROM favorite_clicks WHERE created_at >= datetime('now', '-30 days') GROUP BY DATE(created_at) ORDER BY day DESC"
        ).all(),
      ]);
      return new Response(JSON.stringify({
        by_item: byItem.status === "fulfilled" ? byItem.value.results || [] : [],
        recent: recent.status === "fulfilled" ? recent.value.results || [] : [],
        daily: daily.status === "fulfilled" ? daily.value.results || [] : [],
      }), { headers: JSON_HEADERS });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: JSON_HEADERS });
    }
  }

  // Track click and redirect
  const item = url.searchParams.get("item") || "";
  const dest = url.searchParams.get("url") || "";
  if (!dest) return new Response("Missing url", { status: 400 });

  const referrer = context.request.headers.get("referer") || "";
  try {
    context.waitUntil(
      context.env.DB.prepare(
        "INSERT INTO favorite_clicks (item, url, referrer) VALUES (?, ?, ?)"
      ).bind(item, dest, referrer).run()
    );
  } catch (e) {}

  return new Response(null, { status: 302, headers: { "Location": dest } });
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    // Item-only posts are engagement events (video plays and the like),
    // logged into the same table the favorites clicks use so they show
    // up in the admin without any new plumbing.
    if (body.item && !body.path) {
      const item = String(body.item).slice(0, 100);
      try {
        await context.env.DB.prepare(
          "INSERT INTO favorite_clicks (item, url, referrer) VALUES (?, '', ?)"
        ).bind(item, context.request.headers.get("referer") || "").run();
      } catch (e) {}
      return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
    }

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

    // visitor_id is a daily-rotating hash of IP+UA+date - same visitor on
    // the same day gets the same id, but it does not persist across days.
    const visitor_id = (await sha256Hex(ip + "|" + ua + "|" + today)).slice(0, 16);

    // Device type from User-Agent
    const device = /Mobile|Android.*Mobile|iPhone|iPod/i.test(ua) ? "mobile"
      : /iPad|Android(?!.*Mobile)|Tablet/i.test(ua) ? "tablet"
      : "desktop";

    await context.env.DB.prepare(
      "INSERT INTO page_views (path, referrer, visitor_id, country, view_id, region, device) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(path, referrer, visitor_id, country, view_id, region, device).run();

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
