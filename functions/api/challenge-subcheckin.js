// Per-book sub-checkmark endpoint.
//
// GET ?email=&token= -> map of {day: [item_index, item_index, ...]} of every
//   sub-checkin this user has across all days. Caller decides "day complete"
//   client-side using its own knowledge of the reading plan structure.
//
// POST {email, token, day, item_index, total_items, completed_day} ->
//   toggles a single sub-item on/off for this user. If completed_day is
//   true, also writes a row to challenge_checkins so streaks and the live
//   feed reflect the day completion. If completed_day is false, the
//   server clears the day's challenge_checkins row (handles the "I clicked
//   a sub-item undone after marking everything done" edge case).

const CHALLENGE = "july-2026";
const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const email = (url.searchParams.get("email") || "").trim().toLowerCase();
    const token = url.searchParams.get("token") || "";
    if (!email || !token) return json({ error: "Missing email or token" }, 400);
    if (!(await verifyToken(context.env, email, token))) return json({ error: "Unauthorized" }, 401);

    const rows = await context.env.DB.prepare(
      "SELECT day, item_index FROM challenge_subcheckins WHERE challenge = ? AND email = ?"
    ).bind(CHALLENGE, email).all();

    const days = {};
    for (const r of (rows.results || [])) {
      const k = String(r.day);
      if (!days[k]) days[k] = [];
      days[k].push(r.item_index);
    }
    return new Response(JSON.stringify({ days }), { headers: JSON_HEADERS });
  } catch (e) {
    return json({ error: "failed" }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const token = String(body.token || "");
    const day = parseInt(body.day, 10);
    const item_index = parseInt(body.item_index, 10);
    const desired = body.checked === true || body.checked === 1 || body.checked === "true";
    const completed_day = body.completed_day === true;

    if (!email || !token || !day || day < 1 || day > 90 || !Number.isFinite(item_index) || item_index < 0) {
      return json({ error: "Missing required field." }, 400);
    }
    if (!(await verifyToken(context.env, email, token))) return json({ error: "Unauthorized" }, 401);

    const signup = await context.env.DB.prepare(
      "SELECT email FROM challenge_signups WHERE email = ? AND challenge = ?"
    ).bind(email, CHALLENGE).first();
    if (!signup) return json({ error: "You are not signed up." }, 403);

    if (desired) {
      await context.env.DB.prepare(
        "INSERT OR IGNORE INTO challenge_subcheckins (challenge, email, day, item_index) VALUES (?, ?, ?, ?)"
      ).bind(CHALLENGE, email, day, item_index).run();
    } else {
      await context.env.DB.prepare(
        "DELETE FROM challenge_subcheckins WHERE challenge = ? AND email = ? AND day = ? AND item_index = ?"
      ).bind(CHALLENGE, email, day, item_index).run();
    }

    // Mirror day completion into challenge_checkins so the existing streak,
    // feed, and progress logic continues to work without changes.
    if (completed_day) {
      await context.env.DB.prepare(
        "INSERT OR IGNORE INTO challenge_checkins (email, day, challenge) VALUES (?, ?, ?)"
      ).bind(email, day, CHALLENGE).run();
    } else {
      // Day is no longer fully complete - clear the day's main checkin so
      // streaks recompute correctly.
      await context.env.DB.prepare(
        "DELETE FROM challenge_checkins WHERE email = ? AND day = ? AND challenge = ?"
      ).bind(email, day, CHALLENGE).run();
    }

    return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
  } catch (e) {
    return json({ error: "failed" }, 500);
  }
}

async function verifyToken(env, email, token) {
  const secret = env.NOTIFY_SECRET || "challenge-secret";
  // Accept the current token and, as a grace period, tokens minted before
  // August 19 2026 with the old expiry date - otherwise every bookmarked
  // dashboard link broke the moment the date changed. Remove the fallback
  // after October 2026.
  const expected = await hmacHex(secret, email + ":challenge:2027-07-01");
  if (token === expected) return true;
  const legacy = await hmacHex(secret, email + ":challenge:2026-10-01");
  return token === legacy;
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
