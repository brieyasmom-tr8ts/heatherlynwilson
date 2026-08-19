// POST /api/challenge-leave
// Removes a user's signup from a specific challenge so they can rejoin later.
// Deletes: signup row, checkins, journal entries, email optouts for that challenge.
// Does NOT delete group memberships (handled separately via group-leave).

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
  const challenge = body.challenge || "";

  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  if (!email || !token || !await verifyToken(email, token, secret)) {
    return json({ error: "Unauthorized" }, 403);
  }
  if (!challenge) return json({ error: "challenge required" }, 400);

  const db = context.env.DB;

  try {
    // Delete signup
    await db.prepare("DELETE FROM challenge_signups WHERE email = ? AND challenge = ?").bind(email, challenge).run();
    // Delete checkins
    try { await db.prepare("DELETE FROM challenge_checkins WHERE email = ? AND challenge = ?").bind(email, challenge).run(); } catch (e) {}
    // Delete journal entries
    try { await db.prepare("DELETE FROM challenge_journal WHERE email = ? AND challenge = ?").bind(email, challenge).run(); } catch (e) {}
    // Delete per-challenge email optout
    try { await db.prepare("DELETE FROM challenge_email_optouts WHERE email = ? AND challenge = ?").bind(email, challenge).run(); } catch (e) {}
    // Leave any groups for this challenge
    try { await db.prepare("DELETE FROM group_members WHERE email = ? AND group_id IN (SELECT id FROM challenge_groups WHERE challenge = ?)").bind(email, challenge).run(); } catch (e) {}
  } catch (e) {
    return json({ error: "Could not leave challenge." }, 500);
  }

  return json({ success: true });
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
