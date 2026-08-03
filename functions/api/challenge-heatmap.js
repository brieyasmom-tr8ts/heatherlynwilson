const US_STATES = new Set(["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming","District of Columbia"]);

export async function onRequestGet(context) {
  try {
    const [views, signups] = await Promise.allSettled([
      context.env.DB.prepare(
        "SELECT region, COUNT(*) as cnt FROM page_views WHERE region IS NOT NULL AND region != '' GROUP BY region"
      ).all(),
      context.env.DB.prepare(
        "SELECT region, COUNT(*) as cnt FROM challenge_signups WHERE region IS NOT NULL AND region != '' GROUP BY region"
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

    // Leaderboard: today's visits so the ranking changes often and a few
    // friends really can move their state up. Quiet mornings with fewer
    // than three states fall back to this week so it never looks empty.
    // Names in rank order only, no counts, same as the map.
    const easternDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const todayUtc = new Date(easternDate + "T00:00:00-04:00").toISOString().slice(0, 19).replace("T", " ");
    let topStates = [];
    let topCountries = [];
    let period = "today";
    const rankFrom = async (whereTime, bindArg) => {
      const [st, co] = await Promise.allSettled([
        context.env.DB.prepare(
          "SELECT region, COUNT(*) as cnt FROM page_views WHERE country = 'US' AND region != '' AND " + whereTime + " GROUP BY region ORDER BY cnt DESC LIMIT 10"
        ).bind(...bindArg).all(),
        context.env.DB.prepare(
          "SELECT country, COUNT(*) as cnt FROM page_views WHERE country != '' AND " + whereTime + " GROUP BY country ORDER BY cnt DESC LIMIT 3"
        ).bind(...bindArg).all(),
      ]);
      return {
        st: st.status === "fulfilled" ? (st.value.results || []).filter((r) => US_STATES.has(r.region)).slice(0, 3).map((r) => r.region) : [],
        co: co.status === "fulfilled" ? (co.value.results || []).map((r) => r.country) : [],
      };
    };
    try {
      let ranks = await rankFrom("created_at >= ?", [todayUtc]);
      if (ranks.st.length < 3) {
        period = "week";
        ranks = await rankFrom("created_at >= datetime('now', '-7 days')", []);
      }
      topStates = ranks.st;
      topCountries = ranks.co;
    } catch (e) {}

    return new Response(JSON.stringify({ states, top_states: topStates, top_countries: topCountries, period }), {
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
