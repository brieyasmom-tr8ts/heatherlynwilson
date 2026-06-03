// POST: Submit a "pray for me today" request
// GET: Get today's prayer count

export async function onRequestPost(context) {
  const body = await context.request.json();
  const email = (body.email || "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return json({ error: "Invalid email" }, 400);
  }

  // Create table if not exists
  await context.env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS challenge_prayer_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      request_date TEXT NOT NULL,
      challenge TEXT NOT NULL DEFAULT 'july-2026',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(email, request_date, challenge)
    )
  `).run();

  // Use Eastern Time date
  const now = new Date();
  const eastern = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  // One prayer request per person per day
  try {
    await context.env.DB.prepare(
      "INSERT OR IGNORE INTO challenge_prayer_requests (email, request_date, challenge) VALUES (?, ?, 'july-2026')"
    ).bind(email, eastern).run();
  } catch (e) {}

  // Return today's count
  const row = await context.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM challenge_prayer_requests WHERE request_date = ? AND challenge = 'july-2026'"
  ).bind(eastern).first();

  return json({ success: true, count: row ? row.cnt : 0 });
}

export async function onRequestGet(context) {
  try {
    const now = new Date();
    const eastern = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });

    const row = await context.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM challenge_prayer_requests WHERE request_date = ? AND challenge = 'july-2026'"
    ).bind(eastern).first();

    return json({ count: row ? row.cnt : 0 });
  } catch (e) {
    return json({ count: 0 });
  }
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
