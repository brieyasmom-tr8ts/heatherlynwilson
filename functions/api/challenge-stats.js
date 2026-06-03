// Admin endpoint for challenge engagement analytics
// GET /api/challenge-stats?key=ADMIN_KEY

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  const challenge = "july-2026";
  const stats = {};

  try {
    // Total signups
    const totalRow = await context.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM challenge_signups WHERE challenge = ?"
    ).bind(challenge).first();
    stats.totalSignups = totalRow ? totalRow.cnt : 0;

    // Check-ins per day (how many people checked in each day)
    const dailyCheckins = await context.env.DB.prepare(
      "SELECT day, COUNT(DISTINCT email) as cnt FROM challenge_checkins WHERE challenge = ? GROUP BY day ORDER BY day"
    ).bind(challenge).all();
    stats.dailyCheckins = (dailyCheckins.results || []).map(r => ({ day: r.day, count: r.cnt }));

    // People who checked in today
    const now = new Date();
    const eastern = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const todayDate = new Date(eastern + "T00:00:00");
    const challengeStart = new Date("2026-07-01T00:00:00");
    const diffMs = todayDate - challengeStart;
    const currentDay = diffMs < 0 ? 0 : Math.min(31, Math.floor(diffMs / 86400000) + 1);
    stats.currentDay = currentDay;

    if (currentDay > 0) {
      const todayRow = await context.env.DB.prepare(
        "SELECT COUNT(DISTINCT email) as cnt FROM challenge_checkins WHERE day = ? AND challenge = ?"
      ).bind(currentDay, challenge).first();
      stats.todayCheckins = todayRow ? todayRow.cnt : 0;
    }

    // Completion counts (people who have checked ALL days up to current)
    const completionData = await context.env.DB.prepare(
      "SELECT email, COUNT(*) as days_done FROM challenge_checkins WHERE challenge = ? GROUP BY email"
    ).bind(challenge).all();
    const completionRows = completionData.results || [];

    stats.completedAll31 = completionRows.filter(r => r.days_done >= 31).length;
    stats.active = completionRows.filter(r => r.days_done > 0).length;

    // Average days completed
    const totalDays = completionRows.reduce((sum, r) => sum + r.days_done, 0);
    stats.averageDaysCompleted = completionRows.length > 0 ? Math.round((totalDays / completionRows.length) * 10) / 10 : 0;

    // Streak distribution
    stats.neverStarted = stats.totalSignups - stats.active;

    // Drop-off: day with biggest decrease from previous day
    if (stats.dailyCheckins.length > 1) {
      let maxDrop = 0;
      let dropDay = 0;
      for (let i = 1; i < stats.dailyCheckins.length; i++) {
        const drop = stats.dailyCheckins[i - 1].count - stats.dailyCheckins[i].count;
        if (drop > maxDrop) {
          maxDrop = drop;
          dropDay = stats.dailyCheckins[i].day;
        }
      }
      stats.biggestDropDay = dropDay;
      stats.biggestDropCount = maxDrop;
    }

    // Prayer requests today
    try {
      const prayerRow = await context.env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM challenge_prayer_requests WHERE request_date = ? AND challenge = ?"
      ).bind(eastern, challenge).first();
      stats.todayPrayers = prayerRow ? prayerRow.cnt : 0;
    } catch (e) { stats.todayPrayers = 0; }

    // Total prayer requests
    try {
      const totalPrayerRow = await context.env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM challenge_prayer_requests WHERE challenge = ?"
      ).bind(challenge).first();
      stats.totalPrayers = totalPrayerRow ? totalPrayerRow.cnt : 0;
    } catch (e) { stats.totalPrayers = 0; }

  } catch (e) {
    console.error("Stats error:", e.message);
  }

  return json(stats);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
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
