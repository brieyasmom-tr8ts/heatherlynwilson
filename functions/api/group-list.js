// GET /api/group-list?email=XXX&token=XXX - list all groups a user belongs to

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = url.searchParams.get("token") || "";

  // Auth
  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const expected = await hmacHex(secret, email + ":challenge:2027-07-01");
  const legacyExpected = await hmacHex(secret, email + ":challenge:2026-10-01"); // pre-Aug-19 links, grace until Oct 2026
  if (!email || token !== expected && token !== legacyExpected) {
    return json({ error: "Unauthorized" }, 403);
  }

  // Get all groups this user is in
  const result = await context.env.DB.prepare(
    "SELECT g.id, g.name, g.challenge, g.created_by_email, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count FROM challenge_groups g INNER JOIN group_members m ON m.group_id = g.id WHERE m.email = ? ORDER BY g.created_at DESC"
  ).bind(email).all();

  return json({
    success: true,
    groups: (result.results || []).map(g => ({
      id: g.id,
      name: g.name,
      challenge: g.challenge,
      is_creator: g.created_by_email === email,
      member_count: g.member_count,
    })),
  });
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
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
