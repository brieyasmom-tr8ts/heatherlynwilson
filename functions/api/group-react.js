// POST /api/group-react - toggle a heart reaction on a group message

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
  const messageId = body.message_id;

  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const expected = await hmacHex(secret, email + ":challenge:2027-07-01");
  const legacyExpected = await hmacHex(secret, email + ":challenge:2026-10-01"); // pre-Aug-19 links, grace until Oct 2026
  if (!email || token !== expected && token !== legacyExpected) return json({ error: "Unauthorized" }, 403);
  if (!messageId) return json({ error: "Missing message_id." }, 400);

  // Ensure table exists
  try {
    await context.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS message_reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(message_id, email)
      )
    `).run();
  } catch (e) {}

  // Look up user name from group_members via the message's group
  const msg = await context.env.DB.prepare(
    "SELECT group_id FROM group_messages WHERE id = ?"
  ).bind(messageId).first();
  if (!msg) return json({ error: "Message not found." }, 404);

  const member = await context.env.DB.prepare(
    "SELECT name FROM group_members WHERE group_id = ? AND email = ?"
  ).bind(msg.group_id, email).first();
  if (!member) return json({ error: "Not a member of this group." }, 403);

  // Toggle: if already reacted, remove it; otherwise add it
  const existing = await context.env.DB.prepare(
    "SELECT id FROM message_reactions WHERE message_id = ? AND email = ?"
  ).bind(messageId, email).first();

  if (existing) {
    await context.env.DB.prepare(
      "DELETE FROM message_reactions WHERE id = ?"
    ).bind(existing.id).run();
    return json({ success: true, reacted: false });
  } else {
    await context.env.DB.prepare(
      "INSERT INTO message_reactions (message_id, email, name) VALUES (?, ?, ?)"
    ).bind(messageId, email, member.name).run();
    return json({ success: true, reacted: true });
  }
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
