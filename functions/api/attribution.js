// Campaign attribution API
// GET /api/attribution?key=ADMIN_KEY — returns UTM attribution data for signups and subscribers
// Optional: ?from=2026-08-01&to=2026-08-31&challenge=september-beatitudes-2026&touch=first|last

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) return json({ error: "Unauthorized" }, 401);

  const db = context.env.DB;
  const from = url.searchParams.get("from") || "2000-01-01";
  const to = url.searchParams.get("to") || "2099-12-31";
  const challenge = url.searchParams.get("challenge") || "";
  const touch = url.searchParams.get("touch") || "last";
  const isFirst = touch === "first";

  // Column prefixes for first vs last touch
  const srcCol = isFirst ? "utm_first_source" : "utm_source";
  const medCol = isFirst ? "utm_first_medium" : "utm_medium";
  const campCol = isFirst ? "utm_first_campaign" : "utm_campaign";
  const contCol = isFirst ? "utm_first_content" : "utm_content";
  const termCol = isFirst ? "utm_first_term" : "utm_term";

  try {
    // Signups with UTM data
    let signupSql = `SELECT name, email, challenge, track, created_at, source, is_new_subscriber,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      utm_first_source, utm_first_medium, utm_first_campaign, utm_first_content, utm_first_term,
      utm_landing_page, utm_last_landing_page, utm_referrer
      FROM challenge_signups
      WHERE date(created_at) >= ? AND date(created_at) <= ?`;
    const binds = [from, to];
    if (challenge) {
      signupSql += " AND challenge = ?";
      binds.push(challenge);
    }
    signupSql += " ORDER BY created_at DESC";
    const signups = await db.prepare(signupSql).bind(...binds).all();
    const rows = signups.results || [];

    // Aggregate by the selected touch type
    const bySource = {};
    const byCampaign = {};
    const byContent = {};
    const byMedium = {};
    const byTerm = {};

    let newSubCount = 0;
    let existingSubCount = 0;

    for (const s of rows) {
      const src = s[srcCol] || s.source || "direct";
      const med = s[medCol] || "none";
      const camp = s[campCol] || "none";
      const cont = s[contCol] || "none";
      const trm = s[termCol] || "";

      bySource[src] = (bySource[src] || 0) + 1;
      byMedium[med] = (byMedium[med] || 0) + 1;
      byCampaign[camp] = (byCampaign[camp] || 0) + 1;
      byContent[cont] = (byContent[cont] || 0) + 1;
      if (trm) byTerm[trm] = (byTerm[trm] || 0) + 1;

      if (s.is_new_subscriber === 1) newSubCount++;
      else if (s.is_new_subscriber === 0) existingSubCount++;
      // NULL = historical record before tracking was added, not counted as either
    }

    // Landing page conversion: registrations by landing page + unique visitors
    const lpCol = isFirst ? "utm_landing_page" : "utm_last_landing_page";
    const landingPages = {};
    for (const s of rows) {
      const page = s[lpCol] || s.utm_landing_page || "unknown";
      if (!page || page === "unknown") continue;
      if (!landingPages[page]) landingPages[page] = { registrations: 0 };
      landingPages[page].registrations++;
    }
    // When filtered to a specific challenge, only count visitors to that challenge's page
    const CHALLENGE_PATHS = {
      "july-2026": "/challenge-bible",
      "august-james-2026": "/challenge-james",
      "september-beatitudes-2026": "/challenge-beatitudes",
      "october-proverbs-2026": "/challenge-proverbs",
      "november-thanks-2026": "/challenge-thanks",
      "december-gospels-2026": "/challenge-gospels",
    };
    const challengePath = challenge ? (CHALLENGE_PATHS[challenge] || "") : "";
    const pathFilter = challengePath ? " AND path LIKE ?" : "";
    const pathBind = challengePath ? [challengePath + "%"] : [];

    try {
      const pvRows = await db.prepare(
        `SELECT path, COUNT(DISTINCT visitor_id) as visitors FROM page_views
         WHERE date(created_at) >= ? AND date(created_at) <= ?
         AND utm_source != ''${pathFilter}
         GROUP BY path ORDER BY visitors DESC LIMIT 50`
      ).bind(from, to, ...pathBind).all();
      for (const pv of (pvRows.results || [])) {
        if (!landingPages[pv.path]) landingPages[pv.path] = { registrations: 0 };
        landingPages[pv.path].visitors = pv.visitors;
      }
    } catch (e) {}

    // Unique visitors by campaign and content (from page_views with structured UTM)
    const visitorsByCampaign = {};
    const visitorsByContent = {};
    try {
      const campVisitors = await db.prepare(
        `SELECT utm_campaign, COUNT(DISTINCT visitor_id) as visitors FROM page_views
         WHERE date(created_at) >= ? AND date(created_at) <= ? AND utm_campaign != ''${pathFilter}
         GROUP BY utm_campaign ORDER BY visitors DESC`
      ).bind(from, to, ...pathBind).all();
      for (const r of (campVisitors.results || [])) visitorsByCampaign[r.utm_campaign] = r.visitors;
    } catch (e) {}
    try {
      const contVisitors = await db.prepare(
        `SELECT utm_content, COUNT(DISTINCT visitor_id) as visitors FROM page_views
         WHERE date(created_at) >= ? AND date(created_at) <= ? AND utm_content != ''${pathFilter}
         GROUP BY utm_content ORDER BY visitors DESC`
      ).bind(from, to, ...pathBind).all();
      for (const r of (contVisitors.results || [])) visitorsByContent[r.utm_content] = r.visitors;
    } catch (e) {}

    const toSorted = (obj) => Object.entries(obj)
      .map(([k, v]) => ({ label: k, count: v }))
      .sort((a, b) => b.count - a.count);

    // Enrich campaign and content aggregates with visitor counts and conversion rates
    const enrichWithVisitors = (items, visitorMap) => items.map(item => ({
      ...item,
      visitors: visitorMap[item.label] || 0,
      conversion: visitorMap[item.label] ? ((item.count / visitorMap[item.label]) * 100).toFixed(1) + "%" : "—",
    }));

    return json({
      total_signups: rows.length,
      new_subscribers: newSubCount,
      existing_subscribers: existingSubCount,
      touch,
      by_source: toSorted(bySource),
      by_medium: toSorted(byMedium),
      by_campaign: enrichWithVisitors(toSorted(byCampaign), visitorsByCampaign),
      by_content: enrichWithVisitors(toSorted(byContent), visitorsByContent),
      by_term: toSorted(byTerm),
      landing_pages: Object.entries(landingPages).map(([page, d]) => ({
        page,
        visitors: d.visitors || 0,
        registrations: d.registrations,
        conversion: d.visitors ? ((d.registrations / d.visitors) * 100).toFixed(1) + "%" : "—",
      })).sort((a, b) => b.registrations - a.registrations),
      signups: rows.slice(0, 100).map(s => ({
        name: s.name, challenge: s.challenge, created_at: s.created_at,
        source: s[srcCol] || s.source || "direct",
        medium: s[medCol] || "",
        campaign: s[campCol] || "",
        content: s[contCol] || "",
        term: s[termCol] || "",
        landing_page: s[lpCol] || s.utm_landing_page || "",
        is_new_subscriber: s.is_new_subscriber,
      })),
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
