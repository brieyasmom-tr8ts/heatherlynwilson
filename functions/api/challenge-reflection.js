// Per-day reflection comment board for the Bible Challenge.
//
// GET /api/challenge-reflection?day=N -> reflections for that day
// POST /api/challenge-reflection {email, token, day, content} -> add one
// DELETE /api/challenge-reflection?id=X&key=ADMIN_KEY -> admin remove

const CHALLENGE = "july-2026";
const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const day = parseInt(url.searchParams.get("day") || "0", 10);
    if (!day || day < 1 || day > 31) {
      return new Response(JSON.stringify({ reflections: [] }), { headers: JSON_HEADERS });
    }
    const rows = await context.env.DB.prepare(
      "SELECT id, name, content, created_at FROM challenge_reflections " +
      "WHERE challenge = ? AND day = ? AND hidden = 0 " +
      "ORDER BY created_at DESC LIMIT 200"
    ).bind(CHALLENGE, day).all();
    const reflections = (rows.results || []).map((r) => ({
      id: r.id,
      name: firstName(r.name || ""),
      content: r.content,
      created_at: r.created_at,
    }));
    return new Response(JSON.stringify({ day, reflections }), { headers: JSON_HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ reflections: [] }), { headers: JSON_HEADERS });
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const token = String(body.token || "");
    const day = parseInt(body.day, 10);
    let content = String(body.content || "").trim();

    if (!email || !token || !day || day < 1 || day > 31 || !content) {
      return json({ error: "Missing required field." }, 400);
    }
    if (!(await verifyToken(context.env, email, token))) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (content.length > 1500) content = content.slice(0, 1500);

    const signup = await context.env.DB.prepare(
      "SELECT name FROM challenge_signups WHERE email = ? AND challenge = ?"
    ).bind(email, CHALLENGE).first();
    if (!signup) return json({ error: "You are not signed up." }, 403);

    await context.env.DB.prepare(
      "INSERT INTO challenge_reflections (challenge, email, name, day, content) VALUES (?, ?, ?, ?, ?)"
    ).bind(CHALLENGE, email, signup.name || "Friend", day, content).run();

    const rows = await context.env.DB.prepare(
      "SELECT id, name, content, created_at FROM challenge_reflections " +
      "WHERE challenge = ? AND day = ? AND hidden = 0 " +
      "ORDER BY created_at DESC LIMIT 200"
    ).bind(CHALLENGE, day).all();
    const reflections = (rows.results || []).map((r) => ({
      id: r.id,
      name: firstName(r.name || ""),
      content: r.content,
      created_at: r.created_at,
    }));
    return new Response(JSON.stringify({ day, reflections }), { headers: JSON_HEADERS });
  } catch (e) {
    return json({ error: "failed" }, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    const key = url.searchParams.get("key");
    if (!id || key !== context.env.ADMIN_KEY) {
      return json({ error: "Unauthorized" }, 401);
    }
    await context.env.DB.prepare(
      "UPDATE challenge_reflections SET hidden = 1 WHERE id = ?"
    ).bind(id).run();
    return new Response(JSON.stringify({ success: true }), { headers: JSON_HEADERS });
  } catch (e) {
    return json({ error: "failed" }, 500);
  }
}

function firstName(full) {
  const t = (full || "").trim();
  if (!t) return "Friend";
  const parts = t.split(/\s+/);
  return parts[0];
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
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
