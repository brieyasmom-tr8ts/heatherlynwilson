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

    return new Response(JSON.stringify({ states }), {
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
