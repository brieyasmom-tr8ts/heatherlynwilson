export async function onRequestGet(context) {
  try {
    const rows = await context.env.DB.prepare(
      "SELECT region, COUNT(*) as cnt FROM challenge_signups WHERE region IS NOT NULL AND region != '' GROUP BY region"
    ).all();

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
