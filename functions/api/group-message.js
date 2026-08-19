// POST /api/group-message - post an encouragement to the group wall

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
  const message = (body.message || "").trim().slice(0, 400);

  // Auth
  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const expected = await hmacHex(secret, email + ":challenge:2027-07-01");
  const legacyExpected = await hmacHex(secret, email + ":challenge:2026-10-01"); // pre-Aug-19 links, grace until Oct 2026
  if (!email || token !== expected && token !== legacyExpected) {
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

// PUT /api/group-message - edit your own message
export async function onRequestPut(context) {
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: "Invalid request." }, 400); }
  const email = (body.email || "").trim().toLowerCase();
  const token = body.token || "";
  const messageId = body.message_id;
  const newMessage = (body.message || "").trim().slice(0, 400);

  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const expected = await hmacHex(secret, email + ":challenge:2027-07-01");
  const legacyExpected = await hmacHex(secret, email + ":challenge:2026-10-01"); // pre-Aug-19 links, grace until Oct 2026
  if (!email || token !== expected && token !== legacyExpected) return json({ error: "Unauthorized" }, 403);
  if (!messageId || !newMessage) return json({ error: "Missing message_id or message." }, 400);

  // Only allow editing your own messages
  const msg = await context.env.DB.prepare(
    "SELECT id FROM group_messages WHERE id = ? AND email = ?"
  ).bind(messageId, email).first();
  if (!msg) return json({ error: "Message not found or not yours." }, 404);

  await context.env.DB.prepare(
    "UPDATE group_messages SET message = ? WHERE id = ?"
  ).bind(newMessage, messageId).run();

  return json({ success: true });
}

// DELETE /api/group-message - delete your own message
export async function onRequestDelete(context) {
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: "Invalid request." }, 400); }
  const email = (body.email || "").trim().toLowerCase();
  const token = body.token || "";
  const messageId = body.message_id;

  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const expected = await hmacHex(secret, email + ":challenge:2027-07-01");
  const legacyExpected = await hmacHex(secret, email + ":challenge:2026-10-01"); // pre-Aug-19 links, grace until Oct 2026
  if (!email || token !== expected && token !== legacyExpected) return json({ error: "Unauthorized" }, 403);
  if (!messageId) return json({ error: "Missing message_id." }, 400);

  const msg = await context.env.DB.prepare(
    "SELECT id FROM group_messages WHERE id = ? AND email = ?"
  ).bind(messageId, email).first();
  if (!msg) return json({ error: "Message not found or not yours." }, 404);

  await context.env.DB.prepare(
    "DELETE FROM group_messages WHERE id = ?"
  ).bind(messageId).run();

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
      "Access-Control-Allow-Methods": "POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
