// POST /api/challenge-restart
// Archives the round a user just finished into challenge_completions (so we
// keep a count and the dates of past completions), clears their progress for
// that challenge, and sets a fresh personal start date so they begin at Day 1.

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyToken(email, token, secret) {
  const expected = await hmacHex(secret, email + ":challenge:" + "2027-07-01");
  return token === expected;
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  const email = (body.email || "").trim().toLowerCase();
  const token = body.token || "";
  const challenge = body.challenge || "july-2026";

  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  if (!email || !token || !await verifyToken(email, token, secret)) {
    return json({ error: "Unauthorized" }, 403);
  }

  const db = context.env.DB;

  // New start date: honor a picked date, otherwise start tomorrow (Eastern).
  const easternToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  let newStart;
  if (body.start_date && /^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
    // Never allow a start in the past
    newStart = body.start_date < easternToday ? easternToday : body.start_date;
  } else {
    const t = new Date(easternToday + "T00:00:00");
    t.setDate(t.getDate() + 1);
    newStart = t.toISOString().slice(0, 10);
  }

  // Make sure the history table exists
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS challenge_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      challenge TEXT NOT NULL,
      track TEXT DEFAULT '',
      start_date TEXT,
      ended_date TEXT,
      days_completed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  // Read the round they are finishing (start date + track)
  let oldStart = null, track = "";
  try {
    const row = await db.prepare(
      "SELECT personal_start_date, track FROM challenge_signups WHERE email = ? AND challenge = ?"
    ).bind(email, challenge).first();
    if (row) { oldStart = row.personal_start_date; track = row.track || ""; }
  } catch (e) {}

  // How many days they completed this round
  let daysCompleted = 0;
  try {
    const c = await db.prepare(
      "SELECT COUNT(*) as cnt FROM challenge_checkins WHERE email = ? AND challenge = ?"
    ).bind(email, challenge).first();
    daysCompleted = c ? c.cnt : 0;
  } catch (e) {}

  // Archive the round to history
  await db.prepare(
    "INSERT INTO challenge_completions (email, challenge, track, start_date, ended_date, days_completed) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(email, challenge, track, oldStart, easternToday, daysCompleted).run();

  // Clear this challenge's personal progress for a fresh slate (leave shared
  // community posts like reflections and prayers alone). Starting over also
  // unmutes this challenge's emails: restarting means they want them again.
  for (const sql of [
    "DELETE FROM challenge_checkins WHERE email = ? AND challenge = ?",
    "DELETE FROM challenge_subcheckins WHERE email = ? AND challenge = ?",
    "DELETE FROM challenge_journal WHERE email = ? AND challenge = ?",
    "DELETE FROM challenge_email_optouts WHERE email = ? AND challenge = ?",
  ]) {
    try { await db.prepare(sql).bind(email, challenge).run(); } catch (e) {}
  }

  // Set the fresh start date, and optionally switch plans for the new round
  // (e.g. finished the whole Bible, doing it again chronologically).
  const BIBLE_TRACKS = ["full-bible", "new-testament", "chronological", "bible-90", "chrono-90", "ot-90", "nt-90"];
  const newTrack = (challenge === "july-2026" && BIBLE_TRACKS.includes(body.track)) ? body.track : null;
  if (newTrack) {
    await db.prepare(
      "UPDATE challenge_signups SET personal_start_date = ?, track = ? WHERE email = ? AND challenge = ?"
    ).bind(newStart, newTrack, email, challenge).run();
  } else {
    await db.prepare(
      "UPDATE challenge_signups SET personal_start_date = ? WHERE email = ? AND challenge = ?"
    ).bind(newStart, email, challenge).run();
  }

  return json({ success: true, new_start: newStart, new_track: newTrack || track, days_completed: daysCompleted });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
