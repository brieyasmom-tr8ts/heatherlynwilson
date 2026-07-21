// POST: the group creator moves the whole group's start date.
// Body: { email, token, group_id, start_date }
// Every member's personal start date for the group's challenge is set to the
// new date, so the group stays on one calendar. Past dates are allowed.

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
  const groupId = (body.group_id || "").trim().toLowerCase();
  const startDate = body.start_date || "";

  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const expected = await hmacHex(secret, email + ":challenge:" + "2026-10-01");
  if (!email || !token || token !== expected) {
    return json({ error: "Unauthorized" }, 403);
  }

  if (!groupId) return json({ error: "Missing group." }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return json({ error: "Pick a date first." }, 400);
  }

  const easternToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const diffDays = Math.round((new Date(startDate + "T00:00:00") - new Date(easternToday + "T00:00:00")) / 86400000);
  if (diffDays > 366) {
    return json({ error: "That date is too far out. Pick something within the next year." }, 400);
  }

  const group = await context.env.DB.prepare(
    "SELECT id, challenge, created_by_email FROM challenge_groups WHERE id = ?"
  ).bind(groupId).first();
  if (!group) return json({ error: "Group not found." }, 404);
  if (group.created_by_email !== email) {
    return json({ error: "Only the person who created the group can move the group's start date." }, 403);
  }

  const membersResult = await context.env.DB.prepare(
    "SELECT email FROM group_members WHERE group_id = ?"
  ).bind(groupId).all();
  const members = membersResult.results || [];

  let updated = 0;
  for (const m of members) {
    try {
      const r = await context.env.DB.prepare(
        "UPDATE challenge_signups SET personal_start_date = ? WHERE email = ? AND challenge = ?"
      ).bind(startDate, m.email, group.challenge).run();
      updated++;
    } catch (e) {}
  }

  return json({ success: true, start_date: startDate, members_updated: updated });
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
