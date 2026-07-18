// POST /api/group-leave — leave a group

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: "Invalid request." }, 400); }
  const email = (body.email || "").trim().toLowerCase();
  const token = body.token || "";
  const groupId = (body.group_id || "").trim();

  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const expected = await hmacHex(secret, email + ":challenge:2026-10-01");
  if (!email || token !== expected) {
    return json({ error: "Unauthorized" }, 403);
  }

  if (!groupId) return json({ error: "Missing group_id" }, 400);

  await context.env.DB.prepare(
    "DELETE FROM group_members WHERE group_id = ? AND email = ?"
  ).bind(groupId, email).run();

  // If group is now empty, delete it and its messages
  const remaining = await context.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ?"
  ).bind(groupId).first();

  if (remaining && remaining.cnt === 0) {
    await context.env.DB.prepare("DELETE FROM challenge_groups WHERE id = ?").bind(groupId).run();
    await context.env.DB.prepare("DELETE FROM group_messages WHERE group_id = ?").bind(groupId).run();
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
