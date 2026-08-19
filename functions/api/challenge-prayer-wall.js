// Anonymous prayer wall for the Bible Challenge.
//
// GET /api/challenge-prayer-wall -> all visible prayers (newest first)
// POST /api/challenge-prayer-wall {email, token, content} -> add one (anonymous to others)
// POST /api/challenge-prayer-wall {pray_id} (no email needed) -> +1 pray counter
// DELETE /api/challenge-prayer-wall?id=X&key=ADMIN_KEY -> admin hide

const CHALLENGE = "july-2026";
const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

export async function onRequestGet(context) {
  try {
    const rows = await context.env.DB.prepare(
      "SELECT id, content, pray_count, created_at FROM challenge_prayers " +
      "WHERE challenge = ? AND hidden = 0 " +
      "ORDER BY created_at DESC LIMIT 200"
    ).bind(CHALLENGE).all();
    const prayers = (rows.results || []).map((r) => ({
      id: r.id,
      content: r.content,
      pray_count: r.pray_count,
      created_at: r.created_at,
    }));
    return new Response(JSON.stringify({ prayers }), { headers: JSON_HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ prayers: [] }), { headers: JSON_HEADERS });
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    // Branch A: pray-for-this counter increment. Anyone can tap, no auth.
    if (body.pray_id) {
      const id = parseInt(body.pray_id, 10);
      if (!id) return json({ error: "Missing id" }, 400);
      await context.env.DB.prepare(
        "UPDATE challenge_prayers SET pray_count = pray_count + 1 WHERE id = ? AND hidden = 0"
      ).bind(id).run();
      const row = await context.env.DB.prepare(
        "SELECT pray_count FROM challenge_prayers WHERE id = ?"
      ).bind(id).first();
      return new Response(JSON.stringify({ id, pray_count: row ? row.pray_count : 0 }), { headers: JSON_HEADERS });
    }

    // Branch B: submit a new prayer. Requires signup + token.
    const email = String(body.email || "").trim().toLowerCase();
    const token = String(body.token || "");
    let content = String(body.content || "").trim();

    if (!email || !token || !content) {
      return json({ error: "Missing required field." }, 400);
    }
    if (!(await verifyToken(context.env, email, token))) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (content.length > 1500) content = content.slice(0, 1500);

    const signup = await context.env.DB.prepare(
      "SELECT email FROM challenge_signups WHERE email = ? AND challenge = ?"
    ).bind(email, CHALLENGE).first();
    if (!signup) return json({ error: "You are not signed up." }, 403);

    await context.env.DB.prepare(
      "INSERT INTO challenge_prayers (challenge, email, content) VALUES (?, ?, ?)"
    ).bind(CHALLENGE, email, content).run();

    const rows = await context.env.DB.prepare(
      "SELECT id, content, pray_count, created_at FROM challenge_prayers " +
      "WHERE challenge = ? AND hidden = 0 " +
      "ORDER BY created_at DESC LIMIT 200"
    ).bind(CHALLENGE).all();
    const prayers = (rows.results || []).map((r) => ({
      id: r.id,
      content: r.content,
      pray_count: r.pray_count,
      created_at: r.created_at,
    }));
    return new Response(JSON.stringify({ prayers }), { headers: JSON_HEADERS });
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
      "UPDATE challenge_prayers SET hidden = 1 WHERE id = ?"
    ).bind(id).run();
    return new Response(JSON.stringify({ success: true }), { headers: JSON_HEADERS });
  } catch (e) {
    return json({ error: "failed" }, 500);
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
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
