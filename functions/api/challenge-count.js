export async function onRequestGet(context) {
  try {
    const row = await context.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM challenge_signups WHERE challenge = 'july-2026'"
    ).first();
    const count = row ? row.cnt : 0;
    return new Response(JSON.stringify({ count }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (e) {
    // Table may not exist yet
    return new Response(JSON.stringify({ count: 0 }), {
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
