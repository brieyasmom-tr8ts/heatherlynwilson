// High scores for the memory games (Speed round on the Beatitudes to start).
//
// GET ?email=&token=&challenge=&game= ->
//   { best: N, leaderboard: [{name, email_masked, score, you}] }
//   The leaderboard only exists if the user is in a group for that
//   challenge: scores stay between friends, never site-wide.
//
// POST {email, token, challenge, game, score} ->
//   saves the score if it beats the user's best. Returns the new best and
//   the refreshed leaderboard so the game can show "you passed Rachel".

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

const GAMES = new Set(["speed"]);

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS memory_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      challenge TEXT NOT NULL,
      game TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      plays INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT '',
      UNIQUE(email, challenge, game)
    )
  `).run();
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const email = (url.searchParams.get("email") || "").trim().toLowerCase();
    const token = url.searchParams.get("token") || "";
    const challenge = url.searchParams.get("challenge") || "";
    const game = url.searchParams.get("game") || "speed";
    if (!email || !token || !challenge) return json({ error: "Missing email, token, or challenge" }, 400);
    if (!GAMES.has(game)) return json({ error: "Unknown game" }, 400);
    if (!(await verifyToken(context.env, email, token))) return json({ error: "Unauthorized" }, 401);

    await ensureTable(context.env.DB);
    const mine = await context.env.DB.prepare(
      "SELECT score FROM memory_scores WHERE email = ? AND challenge = ? AND game = ?"
    ).bind(email, challenge, game).first();

    const leaderboard = await buildLeaderboard(context.env.DB, email, challenge, game);
    return json({ success: true, best: (mine && mine.score) || 0, leaderboard });
  } catch (e) {
    return json({ error: "failed" }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const token = String(body.token || "");
    const challenge = String(body.challenge || "");
    const game = String(body.game || "speed");
    const score = parseInt(body.score, 10);

    if (!email || !token || !challenge) return json({ error: "Missing required field." }, 400);
    if (!GAMES.has(game)) return json({ error: "Unknown game" }, 400);
    // 60 seconds of play cannot honestly produce more than ~120 answers;
    // anything above that is someone poking at the API, not a real game.
    if (!Number.isFinite(score) || score < 0 || score > 200) return json({ error: "Bad score" }, 400);
    if (!(await verifyToken(context.env, email, token))) return json({ error: "Unauthorized" }, 401);

    const signup = await context.env.DB.prepare(
      "SELECT email FROM challenge_signups WHERE email = ? AND challenge = ?"
    ).bind(email, challenge).first();
    if (!signup) return json({ error: "You are not signed up." }, 403);

    await ensureTable(context.env.DB);
    await context.env.DB.prepare(`
      INSERT INTO memory_scores (email, challenge, game, score, plays, updated_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(email, challenge, game) DO UPDATE SET
        score = MAX(score, excluded.score),
        plays = plays + 1,
        updated_at = datetime('now')
    `).bind(email, challenge, game, score).run();

    const mine = await context.env.DB.prepare(
      "SELECT score FROM memory_scores WHERE email = ? AND challenge = ? AND game = ?"
    ).bind(email, challenge, game).first();

    const leaderboard = await buildLeaderboard(context.env.DB, email, challenge, game);
    return json({ success: true, best: (mine && mine.score) || score, leaderboard });
  } catch (e) {
    const why = String((e && e.message) || e).slice(0, 80);
    return json({ error: "Could not save score (" + why + ")" }, 500);
  }
}

// Scores are only ever shown inside the user's own group for the challenge.
async function buildLeaderboard(db, email, challenge, game) {
  try {
    const grp = await db.prepare(`
      SELECT g.id FROM challenge_groups g
      INNER JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.email = ? AND g.challenge = ? LIMIT 1
    `).bind(email, challenge).first();
    if (!grp) return null;

    const rows = await db.prepare(`
      SELECT gm.email AS email, gm.name AS name, COALESCE(ms.score, 0) AS score
      FROM group_members gm
      LEFT JOIN memory_scores ms
        ON ms.email = gm.email AND ms.challenge = ? AND ms.game = ?
      WHERE gm.group_id = ?
      ORDER BY score DESC, gm.name ASC
      LIMIT 30
    `).bind(challenge, game, grp.id).all();

    return (rows.results || []).map((r) => ({
      name: r.name || "Friend",
      score: r.score || 0,
      you: (r.email || "").trim().toLowerCase() === email,
    }));
  } catch (e) {
    return null;
  }
}

async function verifyToken(env, email, token) {
  const secret = env.NOTIFY_SECRET || "challenge-secret";
  const validUntil = "2027-07-01";
  const expected = await hmacHex(secret, email + ":challenge:" + validUntil);
  return token === expected;
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
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
