// POST /api/group-create — create a reading group and get an invite link

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateId() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let id = "";
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 8; i++) id += chars[arr[i] % chars.length];
  return id;
}

export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: "Invalid request." }, 400); }
  const email = (body.email || "").trim().toLowerCase();
  const token = body.token || "";
  const groupName = (body.name || "").trim().slice(0, 60);
  const challenge = body.challenge || "july-2026";

  // Auth
  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const expected = await hmacHex(secret, email + ":challenge:2026-10-01");
  if (!email || token !== expected) {
    return json({ error: "Unauthorized" }, 403);
  }

  if (!groupName) {
    return json({ error: "Please give your group a name." }, 400);
  }

  // Look up the user's name and track from their signup
  const signup = await context.env.DB.prepare(
    "SELECT name, track FROM challenge_signups WHERE email = ? AND challenge = ?"
  ).bind(email, challenge).first();
  const userName = signup ? signup.name : "Friend";
  const userTrack = signup ? (signup.track || "") : "";

  // Create group (store the creator's track so invitees match)
  const groupId = generateId();
  await context.env.DB.prepare(
    "INSERT INTO challenge_groups (id, name, challenge, created_by_email, track) VALUES (?, ?, ?, ?, ?)"
  ).bind(groupId, groupName, challenge, email, userTrack).run();

  // Add creator as first member
  await context.env.DB.prepare(
    "INSERT OR IGNORE INTO group_members (group_id, email, name) VALUES (?, ?, ?)"
  ).bind(groupId, email, userName).run();

  const origin = new URL(context.request.url).origin;
  const inviteUrl = origin + "/challenge?group=" + groupId;

  return json({ success: true, group_id: groupId, invite_url: inviteUrl });
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
