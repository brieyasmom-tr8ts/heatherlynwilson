// POST: a signed-in reader moves their own start date.
// Body: { email, token, challenge, start_date }
// Any past date is allowed (catch up with a group, backdate a restart,
// whatever they need); future dates up to a year out.

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
  const challenge = body.challenge || "";
  const startDate = body.start_date || "";

  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const expected = await hmacHex(secret, email + ":challenge:" + "2027-07-01");
  if (!email || !token || token !== expected) {
    return json({ error: "Unauthorized" }, 403);
  }

  if (!challenge) return json({ error: "Missing challenge." }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return json({ error: "Pick a date first." }, 400);
  }

  const easternToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const today = new Date(easternToday + "T00:00:00");
  const picked = new Date(startDate + "T00:00:00");
  const diffDays = Math.round((picked - today) / 86400000);
  if (diffDays > 366) {
    return json({ error: "That date is too far out. Pick something within the next year." }, 400);
  }

  const row = await context.env.DB.prepare(
    "SELECT id FROM challenge_signups WHERE email = ? AND challenge = ?"
  ).bind(email, challenge).first();
  if (!row) return json({ error: "No signup found for this challenge." }, 404);

  await context.env.DB.prepare(
    "UPDATE challenge_signups SET personal_start_date = ? WHERE email = ? AND challenge = ?"
  ).bind(startDate, email, challenge).run();

  return json({ success: true, start_date: startDate });
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
