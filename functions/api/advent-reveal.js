// Advent Calendar scratch-off state, saved per reader so doors stay
// revealed across devices. GET returns the revealed days; POST records one.
// The dashboard still keeps a localStorage copy so previews work and the
// doors render instantly before this loads.

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verify(context, email, token) {
  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const expected = await hmacHex(secret, email + ":challenge:" + "2027-07-01");
  const legacyExpected = await hmacHex(secret, email + ":challenge:2026-10-01"); // pre-Aug-19 links, grace until Oct 2026
  return !!email && !!token && (token === expected || token === legacyExpected);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = url.searchParams.get("token") || "";
  if (!(await verify(context, email, token))) {
    return json({ error: "Unauthorized" }, 403);
  }
  let days = [];
  try {
    const q = await context.env.DB.prepare(
      "SELECT day FROM advent_reveals WHERE email = ? AND challenge = ?"
    ).bind(email, "december-gospels-2026").all();
    days = (q.results || []).map(r => r.day);
  } catch (e) {}
  return json({ success: true, days: days });
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  const email = (body.email || "").trim().toLowerCase();
  const token = body.token || "";
  const day = parseInt(body.day, 10);
  if (!(await verify(context, email, token))) {
    return json({ error: "Unauthorized" }, 403);
  }
  if (!(day >= 1 && day <= 31)) return json({ error: "Bad day." }, 400);
  try {
    await context.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS advent_reveals (
        email TEXT NOT NULL,
        challenge TEXT NOT NULL,
        day INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (email, challenge, day)
      )
    `).run();
    await context.env.DB.prepare(
      "INSERT OR IGNORE INTO advent_reveals (email, challenge, day) VALUES (?, ?, ?)"
    ).bind(email, "december-gospels-2026", day).run();
  } catch (e) {
    return json({ error: "Could not save." }, 500);
  }
  return json({ success: true });
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
