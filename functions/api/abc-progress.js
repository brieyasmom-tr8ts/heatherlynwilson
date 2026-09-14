// GET: fetch all abc_progress rows for a user
// POST: upsert one or more letter progress records

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyToken(email, token, secret) {
  const expected = await hmacHex(secret, email + ":challenge:2027-07-01");
  if (token === expected) return true;
  const legacy = await hmacHex(secret, email + ":challenge:2026-10-01");
  return token === legacy;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = url.searchParams.get("token") || "";

  if (!email || !token) {
    return new Response(JSON.stringify({ error: "Missing email or token" }), { status: 400 });
  }
  const ok = await verifyToken(email, token, context.env.NOTIFY_SECRET);
  if (!ok) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const rows = await context.env.DB.prepare(
    "SELECT letter, status, flagged, last_practiced_at FROM abc_progress WHERE email = ?"
  ).bind(email).all();

  return new Response(JSON.stringify({ progress: rows.results || [] }), {
    headers: { "Content-Type": "application/json" }
  });
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  const email = (body.email || "").trim().toLowerCase();
  const token = body.token || "";

  if (!email || !token) {
    return new Response(JSON.stringify({ error: "Missing email or token" }), { status: 400 });
  }
  const ok = await verifyToken(email, token, context.env.NOTIFY_SECRET);
  if (!ok) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // updates: array of { letter, status?, flagged? }
  const updates = Array.isArray(body.updates) ? body.updates : [];
  if (updates.length === 0) {
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  }

  const now = new Date().toISOString();

  const stmts = updates.map(u => {
    const letter = (u.letter || "").toUpperCase();
    const status = u.status != null ? parseInt(u.status, 10) : 0;
    const flagged = u.flagged != null ? (u.flagged ? 1 : 0) : 0;
    return context.env.DB.prepare(
      `INSERT INTO abc_progress (email, letter, status, flagged, last_practiced_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(email, letter) DO UPDATE SET
         status = excluded.status,
         flagged = CASE WHEN excluded.flagged != flagged THEN excluded.flagged ELSE abc_progress.flagged END,
         last_practiced_at = excluded.last_practiced_at`
    ).bind(email, letter, status, flagged, now);
  });

  await Promise.allSettled(stmts.map(s => s.run()));

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" }
  });
}
