// GET /api/group-join?code=XXX - get group info (public, no auth)
// POST /api/group-join - join a group (auth required)

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// GET: public info about the group (for invite page)
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const code = (url.searchParams.get("code") || "").trim().toLowerCase();

  if (!code) return json({ error: "No group code." }, 400);

  const group = await context.env.DB.prepare(
    "SELECT g.id, g.name, g.challenge, g.track, m.name as creator_name FROM challenge_groups g LEFT JOIN group_members m ON m.group_id = g.id AND m.email = g.created_by_email WHERE g.id = ?"
  ).bind(code).first();

  if (!group) return json({ error: "Group not found." }, 404);

  // Get member names and count
  const membersResult = await context.env.DB.prepare(
    "SELECT name FROM group_members WHERE group_id = ? ORDER BY joined_at ASC LIMIT 20"
  ).bind(code).all();
  const memberNames = (membersResult.results || []).map(m => m.name);

  return json({
    success: true,
    group: {
      id: group.id,
      name: group.name,
      challenge: group.challenge,
      track: group.track || "",
      creator_name: group.creator_name || "Someone",
      member_count: memberNames.length,
      member_names: memberNames,
    },
  });
}

// POST: join the group
export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: "Invalid request." }, 400); }
  const email = (body.email || "").trim().toLowerCase();
  const token = body.token || "";
  const code = (body.code || "").trim().toLowerCase();
  const userName = (body.name || "").trim();

  // Auth
  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const expected = await hmacHex(secret, email + ":challenge:2027-07-01");
  if (!email || token !== expected) {
    return json({ error: "Unauthorized" }, 403);
  }

  if (!code) return json({ error: "No group code." }, 400);

  // Verify group exists
  const group = await context.env.DB.prepare(
    "SELECT id, name, challenge, created_by_email FROM challenge_groups WHERE id = ?"
  ).bind(code).first();

  if (!group) return json({ error: "Group not found." }, 404);

  // Get user name from signup if not provided
  let name = userName;
  if (!name) {
    const signup = await context.env.DB.prepare(
      "SELECT name FROM challenge_signups WHERE email = ? ORDER BY created_at DESC LIMIT 1"
    ).bind(email).first();
    name = signup ? (signup.name || "Friend") : "Friend";
  }

  // Add to group (ignore if already a member)
  await context.env.DB.prepare(
    "INSERT OR IGNORE INTO group_members (group_id, email, name) VALUES (?, ?, ?)"
  ).bind(code, email, name).run();

  // Joining a group puts you on the group's calendar: your start date resets
  // to the creator's so everyone reads the same chapters the same day.
  let syncedStart = null;
  if (email !== group.created_by_email) {
    try {
      const cs = await context.env.DB.prepare(
        "SELECT personal_start_date FROM challenge_signups WHERE email = ? AND challenge = ?"
      ).bind(group.created_by_email, group.challenge).first();
      if (cs && cs.personal_start_date) {
        await context.env.DB.prepare(
          "UPDATE challenge_signups SET personal_start_date = ? WHERE email = ? AND challenge = ?"
        ).bind(cs.personal_start_date, email, group.challenge).run();
        syncedStart = cs.personal_start_date;
      }
    } catch (e) {}
  }

  const countRow = await context.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ?"
  ).bind(code).first();

  return json({
    success: true,
    group_name: group.name,
    member_count: countRow ? countRow.cnt : 0,
    start_date: syncedStart,
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
