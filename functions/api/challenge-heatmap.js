const US_STATES = new Set(["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming","District of Columbia"]);

export async function onRequestGet(context) {
  try {
    const [views, signups, countries] = await Promise.allSettled([
      context.env.DB.prepare(
        "SELECT region, COUNT(*) as cnt FROM page_views WHERE region IS NOT NULL AND region != '' GROUP BY region"
      ).all(),
      context.env.DB.prepare(
        "SELECT region, COUNT(*) as cnt FROM challenge_signups WHERE region IS NOT NULL AND region != '' GROUP BY region"
      ).all(),
      context.env.DB.prepare(
        "SELECT country, COUNT(*) as cnt FROM page_views WHERE country != '' GROUP BY country ORDER BY cnt DESC LIMIT 3"
      ).all(),
    ]);

    // Merge both sources so the map lights up for visitors and signups
    const combined = {};
    for (const source of [views, signups]) {
      if (source.status === "fulfilled") {
        for (const r of source.value.results) {
          combined[r.region] = (combined[r.region] || 0) + r.cnt;
        }
      }
    }
    const rows = { results: Object.entries(combined).map(([region, cnt]) => ({ region, cnt })) };

    // Return only relative intensity buckets (1-3), not actual counts
    const maxCount = Math.max(1, ...rows.results.map(r => r.cnt));
    const states = {};
    for (const r of rows.results) {
      const ratio = r.cnt / maxCount;
      if (ratio > 0.5) states[r.region] = 3;
      else if (ratio > 0.15) states[r.region] = 2;
      else states[r.region] = 1;
    }

    // Leaderboard: names in rank order only, no counts, same as the map
    const topStates = rows.results
      .filter((r) => US_STATES.has(r.region))
      .sort((a, b) => b.cnt - a.cnt)
      .slice(0, 3)
      .map((r) => r.region);
    const topCountries = countries.status === "fulfilled"
      ? (countries.value.results || []).map((r) => r.country)
      : [];

    return new Response(JSON.stringify({ states, top_states: topStates, top_countries: topCountries }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ states: {} }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
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
