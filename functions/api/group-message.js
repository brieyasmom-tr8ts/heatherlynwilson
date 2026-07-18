// POST /api/group-message — post an encouragement to the group wall

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
  const groupId = (body.group_id || "").trim();
  const message = (body.message || "").trim().slice(0, 280);

  // Auth
  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const expected = await hmacHex(secret, email + ":challenge:2026-10-01");
  if (!email || token !== expected) {
    return json({ error: "Unauthorized" }, 403);
  }

  if (!groupId || !message) {
    return json({ error: "Missing group_id or message." }, 400);
  }

  // Verify membership
  const member = await context.env.DB.prepare(
    "SELECT name FROM group_members WHERE group_id = ? AND email = ?"
  ).bind(groupId, email).first();
  if (!member) return json({ error: "Not a member of this group." }, 403);

  // Rate limit: max 20 messages per day per user per group
  const today = new Date().toISOString().slice(0, 10);
  const countRow = await context.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM group_messages WHERE group_id = ? AND email = ? AND created_at >= ?"
  ).bind(groupId, email, today + "T00:00:00").first();
  if (countRow && countRow.cnt >= 20) {
    return json({ error: "You have sent enough encouragement for today!" }, 429);
  }

  await context.env.DB.prepare(
    "INSERT INTO group_messages (group_id, email, name, message) VALUES (?, ?, ?, ?)"
  ).bind(groupId, email, member.name, message).run();

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
