// POST: a signed-in reader switches their Bible reading plan before (or
// without) restarting. Body: { email, token, track }. Only the track
// changes: start date, progress, name, and prayer flag stay untouched.
// Mid-challenge plan changes still go through Start Over so the day
// counts stay honest; this is for readers who have not started yet.

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  const email = (body.email || "").trim().toLowerCase();
  const token = body.token || "";
  const track = body.track || "";

  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const expected = await hmacHex(secret, email + ":challenge:" + "2026-10-01");
  if (!email || !token || token !== expected) {
    return json({ error: "Unauthorized" }, 403);
  }

  const BIBLE_TRACKS = ["full-bible", "new-testament", "chronological", "bible-90", "chrono-90", "ot-90", "nt-90"];
  if (!BIBLE_TRACKS.includes(track)) {
    return json({ error: "Pick a plan first." }, 400);
  }

  const row = await context.env.DB.prepare(
    "SELECT id FROM challenge_signups WHERE email = ? AND challenge = ?"
  ).bind(email, "july-2026").first();
  if (!row) return json({ error: "No Bible challenge signup found for this email." }, 404);

  await context.env.DB.prepare(
    "UPDATE challenge_signups SET track = ? WHERE email = ? AND challenge = ?"
  ).bind(track, email, "july-2026").run();

  return json({ success: true, track: track });
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
