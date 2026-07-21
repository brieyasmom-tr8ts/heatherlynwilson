// POST: check in for a day (or uncheck)
// GET: get all check-ins + streak for a user

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyToken(email, token, secret) {
  const validUntil = "2026-10-01";
  const expected = await hmacHex(secret, email + ":challenge:" + validUntil);
  return token === expected;
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  const email = (body.email || "").trim().toLowerCase();
  const token = body.token || "";
  const day = body.day != null ? parseInt(body.day, 10) : null;
  const checked = body.checked !== false;
  const bookmark = body.bookmark;

  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  if (!email || !token || !await verifyToken(email, token, secret)) {
    return json({ error: "Unauthorized" }, 403);
  }

  // Handle bookmark save (no day required)
  if (bookmark !== undefined) {
    try {
      await context.env.DB.prepare("ALTER TABLE challenge_signups ADD COLUMN bookmark TEXT DEFAULT ''").run();
    } catch (e) {} // column may already exist
    try {
      await context.env.DB.prepare(
        "UPDATE challenge_signups SET bookmark = ? WHERE email = ? AND challenge = 'july-2026'"
      ).bind(bookmark || "", email).run();
    } catch (e) {}
    if (!day) {
      const data = await getUserData(context.env.DB, email);
      return json({ success: true, ...data });
    }
  }

  if (!day || day < 1 || day > 90) {
    return json({ error: "Invalid day" }, 400);
  }

  // Create table if not exists
  await context.env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS challenge_checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      day INTEGER NOT NULL,
      challenge TEXT NOT NULL DEFAULT 'july-2026',
      checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(email, day, challenge)
    )
  `).run();

  if (checked) {
    await context.env.DB.prepare(
      "INSERT OR IGNORE INTO challenge_checkins (email, day, challenge) VALUES (?, ?, 'july-2026')"
    ).bind(email, day).run();
  } else {
    await context.env.DB.prepare(
      "DELETE FROM challenge_checkins WHERE email = ? AND day = ? AND challenge = 'july-2026'"
    ).bind(email, day).run();
  }

  // Return updated data
  const data = await getUserData(context.env.DB, email);
  return json({ success: true, ...data });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = url.searchParams.get("token") || "";

  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  if (!email || !token || !await verifyToken(email, token, secret)) {
    return json({ error: "Unauthorized" }, 403);
  }

  try {
    const data = await getUserData(context.env.DB, email);
    return json(data);
  } catch (e) {
    return json({ days: [], streak: 0, total: 0, todayCount: 0 });
  }
}

async function getUserData(db, email) {
  // Get user's checked days
  const { results } = await db.prepare(
    "SELECT day FROM challenge_checkins WHERE email = ? AND challenge = 'july-2026' ORDER BY day"
  ).bind(email).all();
  const days = (results || []).map(r => r.day);

  // Get bookmark, personal start date, and track (track sets the plan length)
  let bookmark = "";
  let personalStartDate = "2026-07-01";
  let totalDays = 31;
  try {
    const signupRow = await db.prepare(
      "SELECT bookmark, personal_start_date, track FROM challenge_signups WHERE email = ? AND challenge = 'july-2026'"
    ).bind(email).first();
    bookmark = signupRow ? (signupRow.bookmark || "") : "";
    personalStartDate = (signupRow && signupRow.personal_start_date) ? signupRow.personal_start_date : "2026-07-01";
    if (signupRow && String(signupRow.track || "").endsWith("-90")) totalDays = 90;
  } catch (e) {}

  // Calculate current streak (consecutive days ending at today or yesterday)
  const now = new Date();
  const eastern = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const todayDate = new Date(eastern + "T00:00:00");
  const challengeStart = new Date(personalStartDate + "T00:00:00");
  const diffMs = todayDate - challengeStart;
  const currentDay = diffMs < 0 ? 0 : Math.min(totalDays, Math.floor(diffMs / 86400000) + 1);

  let streak = 0;
  const daySet = new Set(days);
  // Count backwards from today (or yesterday if today isn't checked yet)
  let checkFrom = currentDay;
  if (!daySet.has(checkFrom) && checkFrom > 1) {
    checkFrom = currentDay - 1;
  }
  for (let d = checkFrom; d >= 1; d--) {
    if (daySet.has(d)) {
      streak++;
    } else {
      break;
    }
  }

  // How many people checked in today
  let todayCount = 0;
  try {
    const row = await db.prepare(
      "SELECT COUNT(DISTINCT email) as cnt FROM challenge_checkins WHERE day = ? AND challenge = 'july-2026'"
    ).bind(currentDay).first();
    todayCount = row ? row.cnt : 0;
  } catch (e) {}

  return { days, streak, total: days.length, currentDay, todayCount, bookmark, totalDays };
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
