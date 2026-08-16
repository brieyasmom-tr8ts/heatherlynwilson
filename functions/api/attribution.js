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
  const fromParam = url.searchParams.get("from") || "2000-01-01";
  const toParam = url.searchParams.get("to") || "2099-12-31";
  const challenge = url.searchParams.get("challenge") || "";
  const touch = url.searchParams.get("touch") || "last";
  const isFirst = touch === "first";

  // Admin sends Eastern dates. D1 stores UTC timestamps. Eastern is UTC-4 (summer)
  // / UTC-5 (winter). To include all records for an Eastern date, convert to UTC:
  // from 04:00 UTC on the from-date to 04:59 UTC on the day after to-date.
  // Using 05:00 (EST) is safe year-round since it's the wider window.
  const from = fromParam + "T04:00:00";
  const toNext = new Date(Date.parse(toParam + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
  const to = toNext + "T05:00:00";

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
      WHERE created_at >= ? AND created_at < ?`;
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
         WHERE created_at >= ? AND created_at < ?
         AND utm_source != ''${pathFilter}
         GROUP BY path ORDER BY visitors DESC LIMIT 50`
      ).bind(from, to, ...pathBind).all();
      for (const pv of (pvRows.results || [])) {
        if (!landingPages[pv.path]) landingPages[pv.path] = { registrations: 0 };
        landingPages[pv.path].visitors = pv.visitors;
      }
    } catch (e) {}

    // Unique visitors by source, campaign, and content (from page_views with structured UTM)
    const visitorsBySource = {};
    const visitorsByCampaign = {};
    const visitorsByContent = {};
    try {
      const srcVisitors = await db.prepare(
        `SELECT utm_source, COUNT(DISTINCT visitor_id) as visitors FROM page_views
         WHERE created_at >= ? AND created_at < ? AND utm_source != ''${pathFilter}
         GROUP BY utm_source ORDER BY visitors DESC`
      ).bind(from, to, ...pathBind).all();
      for (const r of (srcVisitors.results || [])) visitorsBySource[r.utm_source] = r.visitors;
    } catch (e) {}
    try {
      const campVisitors = await db.prepare(
        `SELECT utm_campaign, COUNT(DISTINCT visitor_id) as visitors FROM page_views
         WHERE created_at >= ? AND created_at < ? AND utm_campaign != ''${pathFilter}
         GROUP BY utm_campaign ORDER BY visitors DESC`
      ).bind(from, to, ...pathBind).all();
      for (const r of (campVisitors.results || [])) visitorsByCampaign[r.utm_campaign] = r.visitors;
    } catch (e) {}
    try {
      const contVisitors = await db.prepare(
        `SELECT utm_content, COUNT(DISTINCT visitor_id) as visitors FROM page_views
         WHERE created_at >= ? AND created_at < ? AND utm_content != ''${pathFilter}
         GROUP BY utm_content ORDER BY visitors DESC`
      ).bind(from, to, ...pathBind).all();
      for (const r of (contVisitors.results || [])) visitorsByContent[r.utm_content] = r.visitors;
    } catch (e) {}

    const toSorted = (obj) => Object.entries(obj)
      .map(([k, v]) => ({ label: k, count: v }))
      .sort((a, b) => b.count - a.count);

    // Enrich campaign and content aggregates with visitor counts and conversion rates.
    // Also add visitor-only entries (campaigns/content with visits but 0 registrations).
    const enrichWithVisitors = (items, visitorMap) => {
      const result = items.map(item => ({
        ...item,
        visitors: visitorMap[item.label] || 0,
        conversion: visitorMap[item.label] ? ((item.count / visitorMap[item.label]) * 100).toFixed(1) + "%" : "—",
      }));
      const seen = new Set(items.map(i => i.label));
      for (const [label, visitors] of Object.entries(visitorMap)) {
        if (!seen.has(label)) {
          result.push({ label, count: 0, visitors, conversion: "0.0%" });
        }
      }
      return result.sort((a, b) => (b.visitors || 0) - (a.visitors || 0) || b.count - a.count);
    };

    return json({
      total_signups: rows.length,
      new_subscribers: newSubCount,
      existing_subscribers: existingSubCount,
      touch,
      by_source: enrichWithVisitors(toSorted(bySource), visitorsBySource),
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
      signups: rows.filter(s => s.utm_source || s.utm_first_source).slice(0, 100).map(s => ({
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
