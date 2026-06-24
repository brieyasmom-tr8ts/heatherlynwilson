// Admin-only endpoint that returns site traffic statistics aggregated from
// the page_views table. Pass ?key=<ADMIN_KEY>.
//
// Returns visit counts, dwell-time averages, bounce rate (% of visits where
// dwell_seconds < 10), top pages with engagement (likes + comments), top
// referrers, top countries, and a 30-day daily series.

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

const BOUNCE_THRESHOLD_SECONDS = 10;

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  const db = context.env.DB;

  async function bucket(rangeSql) {
    const counts = await db.prepare(
      "SELECT COUNT(*) as views, COUNT(DISTINCT visitor_id) as visitors FROM page_views WHERE " + rangeSql
    ).first();
    const dwell = await db.prepare(
      "SELECT AVG(dwell_seconds) as avg_seconds, " +
      "SUM(CASE WHEN dwell_seconds IS NOT NULL AND dwell_seconds < ? THEN 1 ELSE 0 END) as bounced, " +
      "SUM(CASE WHEN dwell_seconds IS NOT NULL THEN 1 ELSE 0 END) as with_dwell " +
      "FROM page_views WHERE " + rangeSql
    ).bind(BOUNCE_THRESHOLD_SECONDS).first();
    const bouncePct = dwell && dwell.with_dwell
      ? Math.round((dwell.bounced / dwell.with_dwell) * 100)
      : null;
    return {
      views: counts ? counts.views : 0,
      visitors: counts ? counts.visitors : 0,
      avg_seconds: dwell && dwell.avg_seconds != null ? Math.round(dwell.avg_seconds) : null,
      bounce_pct: bouncePct,
    };
  }

  const today = await bucket("date(created_at) = date('now')");
  const yesterday = await bucket("date(created_at) = date('now', '-1 day')");
  const week = await bucket("date(created_at) >= date('now', '-6 days')");
  const month = await bucket("date(created_at) >= date('now', '-29 days')");
  const all_time = await bucket("1=1");

  // Top pages (views + visitors)
  const pagesRows = await db.prepare(
    "SELECT path, COUNT(*) as views, COUNT(DISTINCT visitor_id) as visitors, " +
    "AVG(dwell_seconds) as avg_seconds " +
    "FROM page_views WHERE date(created_at) >= date('now', '-29 days') " +
    "GROUP BY path ORDER BY views DESC LIMIT 20"
  ).all();
  const top_pages = pagesRows.results || [];

  // Enrich blog-post rows with like + comment counts
  const blogPages = top_pages.filter((p) => (p.path || "").indexOf("/blog/") === 0);
  for (const p of blogPages) {
    const slug = p.path.replace(/^\/blog\//, "").replace(/\.html$/, "");
    try {
      const likeRow = await db.prepare("SELECT count FROM post_likes WHERE slug = ?").bind(slug).first();
      p.likes = likeRow ? likeRow.count : 0;
    } catch (e) { p.likes = 0; }
    try {
      const cRow = await db.prepare("SELECT COUNT(*) as c FROM post_comments WHERE slug = ?").bind(slug).first();
      p.comments = cRow ? cRow.c : 0;
    } catch (e) { p.comments = 0; }
    if (p.avg_seconds != null) p.avg_seconds = Math.round(p.avg_seconds);
  }
  // Round avg_seconds for non-blog pages too
  for (const p of top_pages) {
    if (p.likes == null) p.likes = null;
    if (p.comments == null) p.comments = null;
    if (p.avg_seconds != null) p.avg_seconds = Math.round(p.avg_seconds);
  }

  const top_referrers = await db.prepare(
    "SELECT referrer, COUNT(*) as views FROM page_views " +
    "WHERE date(created_at) >= date('now', '-29 days') AND referrer != '' " +
    "GROUP BY referrer ORDER BY views DESC LIMIT 10"
  ).all();

  const top_countries = await db.prepare(
    "SELECT country, COUNT(*) as views FROM page_views " +
    "WHERE date(created_at) >= date('now', '-29 days') AND country != '' " +
    "GROUP BY country ORDER BY views DESC LIMIT 10"
  ).all();

  const daily = await db.prepare(
    "SELECT date(created_at) as day, COUNT(*) as views, COUNT(DISTINCT visitor_id) as visitors " +
    "FROM page_views WHERE date(created_at) >= date('now', '-29 days') " +
    "GROUP BY date(created_at) ORDER BY day"
  ).all();

  return new Response(JSON.stringify({
    today, yesterday, week, month, all_time,
    top_pages,
    top_referrers: top_referrers.results || [],
    top_countries: top_countries.results || [],
    daily: daily.results || [],
  }), { headers: JSON_HEADERS });
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
