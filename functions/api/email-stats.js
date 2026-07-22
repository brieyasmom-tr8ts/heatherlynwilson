// GET /api/email-stats?key=ADMIN_KEY&days=30
// Pulls email delivery/open/click stats from Brevo API for the admin dashboard.

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  const apiKey = context.env.BREVO_API_KEY;
  if (!apiKey) {
    return json({ error: "No Brevo API key configured" }, 500);
  }

  const days = Math.min(parseInt(url.searchParams.get("days")) || 30, 90);
  const endDate = new Date().toISOString().slice(0, 10);
  const startD = new Date();
  startD.setDate(startD.getDate() - days);
  const startDate = startD.toISOString().slice(0, 10);

  const headers = { "api-key": apiKey, "Content-Type": "application/json" };

  // Fetch aggregated report and daily breakdown in parallel
  const [aggRes, dailyRes] = await Promise.allSettled([
    fetch("https://api.brevo.com/v3/smtp/statistics/aggregatedReport?startDate=" + startDate + "&endDate=" + endDate, { headers }),
    fetch("https://api.brevo.com/v3/smtp/statistics/reports?limit=60&offset=0&startDate=" + startDate + "&endDate=" + endDate + "&sort=desc", { headers }),
  ]);

  let aggregated = null;
  if (aggRes.status === "fulfilled" && aggRes.value.ok) {
    aggregated = await aggRes.value.json();
  }

  let daily = [];
  if (dailyRes.status === "fulfilled" && dailyRes.value.ok) {
    const d = await dailyRes.value.json();
    daily = (d.reports || []).map(function(r) {
      return {
        date: r.date,
        requests: r.requests || 0,
        delivered: r.delivered || 0,
        opens: r.uniqueOpens || r.opens || 0,
        clicks: r.uniqueClicks || r.clicks || 0,
        bounces: (r.hardBounces || 0) + (r.softBounces || 0),
        blocked: r.blocked || 0,
      };
    });
  }

  // Compute rates
  var delivered = aggregated ? (aggregated.delivered || 0) : 0;
  var opens = aggregated ? (aggregated.uniqueOpens || aggregated.opens || 0) : 0;
  var clicks = aggregated ? (aggregated.uniqueClicks || aggregated.clicks || 0) : 0;
  var bounces = aggregated ? ((aggregated.hardBounces || 0) + (aggregated.softBounces || 0)) : 0;
  var requests = aggregated ? (aggregated.requests || 0) : 0;
  var blocked = aggregated ? (aggregated.blocked || 0) : 0;
  var unsubscribed = aggregated ? (aggregated.unsubscriptions || 0) : 0;

  // Also get D1 unsubscribe counts (challenge opt-outs + blog unsubscribes)
  var dbUnsubs = 0;
  var challengeOptouts = 0;
  try {
    const [unsubRes, optoutRes] = await Promise.allSettled([
      context.env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM subscribers WHERE unsubscribed_at IS NOT NULL AND unsubscribed_at >= ?"
      ).bind(startDate).first(),
      context.env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM email_prefs WHERE challenge_optout = 1"
      ).first(),
    ]);
    if (unsubRes.status === "fulfilled" && unsubRes.value) dbUnsubs = unsubRes.value.cnt || 0;
    if (optoutRes.status === "fulfilled" && optoutRes.value) challengeOptouts = optoutRes.value.cnt || 0;
  } catch (e) {}

  return json({
    period: { start: startDate, end: endDate, days: days },
    summary: {
      sent: requests,
      delivered: delivered,
      opens: opens,
      clicks: clicks,
      bounces: bounces,
      blocked: blocked,
      unsubscribed: unsubscribed,
      db_unsubscribed: dbUnsubs,
      challenge_optouts: challengeOptouts,
      open_rate: delivered > 0 ? Math.round((opens / delivered) * 1000) / 10 : 0,
      click_rate: delivered > 0 ? Math.round((clicks / delivered) * 1000) / 10 : 0,
      bounce_rate: requests > 0 ? Math.round((bounces / requests) * 1000) / 10 : 0,
      delivery_rate: requests > 0 ? Math.round((delivered / requests) * 1000) / 10 : 0,
    },
    daily: daily,
  });
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
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
