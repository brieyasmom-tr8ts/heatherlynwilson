// Admin-only endpoint that returns site traffic statistics aggregated from
// the page_views table. Pass ?key=<ADMIN_KEY>.

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

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
    return db.prepare(
      "SELECT COUNT(*) as views, COUNT(DISTINCT visitor_id) as visitors FROM page_views WHERE " + rangeSql
    ).first();
  }

  const today = await bucket("date(created_at) = date('now')");
  const yesterday = await bucket("date(created_at) = date('now', '-1 day')");
  const week = await bucket("date(created_at) >= date('now', '-6 days')");
  const month = await bucket("date(created_at) >= date('now', '-29 days')");
  const all_time = await bucket("1=1");

  const top_pages = await db.prepare(
    "SELECT path, COUNT(*) as views, COUNT(DISTINCT visitor_id) as visitors " +
    "FROM page_views WHERE date(created_at) >= date('now', '-29 days') " +
    "GROUP BY path ORDER BY views DESC LIMIT 15"
  ).all();

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
    top_pages: top_pages.results || [],
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
