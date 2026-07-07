// POST: save/update a journal entry for a day
// GET: get all journal entries for a user in a challenge

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
  const challenge = body.challenge || "august-james-2026";
  const day = body.day != null ? parseInt(body.day, 10) : null;

  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  if (!email || !token || !await verifyToken(email, token, secret)) {
    return json({ error: "Unauthorized" }, 403);
  }

  if (!day || day < 1 || day > 31) {
    return json({ error: "Invalid day" }, 400);
  }

  // Create table if not exists
  await context.env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS challenge_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge TEXT NOT NULL DEFAULT 'august-james-2026',
      email TEXT NOT NULL,
      day INTEGER NOT NULL,
      stood_out TEXT DEFAULT '',
      god_speaking TEXT DEFAULT '',
      prayer TEXT DEFAULT '',
      yesterday_reflection TEXT DEFAULT '',
      read_confirmed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(challenge, email, day)
    )
  `).run();

  const stoodOut = (body.stood_out || "").trim();
  const godSpeaking = (body.god_speaking || "").trim();
  const prayer = (body.prayer || "").trim();
  const yesterdayReflection = (body.yesterday_reflection || "").trim();
  const readConfirmed = body.read_confirmed ? 1 : 0;

  // Upsert the journal entry
  await context.env.DB.prepare(`
    INSERT INTO challenge_journal (challenge, email, day, stood_out, god_speaking, prayer, yesterday_reflection, read_confirmed, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(challenge, email, day) DO UPDATE SET
      stood_out = excluded.stood_out,
      god_speaking = excluded.god_speaking,
      prayer = excluded.prayer,
      yesterday_reflection = excluded.yesterday_reflection,
      read_confirmed = excluded.read_confirmed,
      updated_at = datetime('now')
  `).bind(challenge, email, day, stoodOut, godSpeaking, prayer, yesterdayReflection, readConfirmed).run();

  // Also mark their checkin for this day (so streak works)
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

  if (readConfirmed) {
    await context.env.DB.prepare(
      "INSERT OR IGNORE INTO challenge_checkins (email, day, challenge) VALUES (?, ?, ?)"
    ).bind(email, day, challenge).run();
  }

  return json({ success: true });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = url.searchParams.get("token") || "";
  const challenge = url.searchParams.get("challenge") || "august-james-2026";

  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  if (!email || !token || !await verifyToken(email, token, secret)) {
    return json({ error: "Unauthorized" }, 403);
  }

  try {
    // Get all journal entries for this user + challenge
    const { results } = await context.env.DB.prepare(
      "SELECT day, stood_out, god_speaking, prayer, yesterday_reflection, read_confirmed, created_at, updated_at FROM challenge_journal WHERE challenge = ? AND email = ? ORDER BY day"
    ).bind(challenge, email).all();

    // Get checked days for streak calc
    const checkins = await context.env.DB.prepare(
      "SELECT day FROM challenge_checkins WHERE email = ? AND challenge = ? ORDER BY day"
    ).bind(email, challenge).all();
    const days = (checkins.results || []).map(r => r.day);

    // Current day calculation for August challenge
    const currentDay = getChallengeDay(challenge);

    // Streak
    let streak = 0;
    const daySet = new Set(days);
    let checkFrom = currentDay;
    if (!daySet.has(checkFrom) && checkFrom > 1) checkFrom = currentDay - 1;
    for (let d = checkFrom; d >= 1; d--) {
      if (daySet.has(d)) streak++;
      else break;
    }

    return json({
      entries: results || [],
      days,
      streak,
      total: days.length,
      currentDay
    });
  } catch (e) {
    return json({ entries: [], days: [], streak: 0, total: 0, currentDay: 0 });
  }
}

function getChallengeDay(challenge) {
  const starts = {
    "july-2026": "2026-07-01",
    "august-james-2026": "2026-08-01"
  };
  const startStr = starts[challenge] || "2026-08-01";
  const now = new Date();
  const eastern = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const today = new Date(eastern + "T00:00:00");
  const start = new Date(startStr + "T00:00:00");
  const diffMs = today - start;
  if (diffMs < 0) return 0;
  return Math.min(31, Math.floor(diffMs / 86400000) + 1);
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
