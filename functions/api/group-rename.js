// POST: the group creator renames their own group.
// Body: { email, token, group_id, name }
//
// Why this exists: Melissa named her Around the Table group after her Bible
// study, then people started joining who were not from there. There was no way
// to change it, so she had to email Heather and Heather had to ask for a
// database edit. Naming a group and then changing your mind is an ordinary
// thing to do, and it should not cost two people an evening.
//
// Only the person who created the group can rename it, checked against
// created_by_email the same way the group start-date endpoint does it. The
// group id is never touched, so invite links and codes keep working and every
// member stays in. The name lives only in challenge_groups, and the dashboard,
// the daily emails, the group digests and the join notices all read it live,
// so one update renames it everywhere at once.

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

  // Same 60 character ceiling the signup and create paths use, so a name made
  // here cannot be one the rest of the site refuses to store. Strip control
  // characters and collapse runs of whitespace; the name is escaped wherever
  // it is rendered, but there is no reason to keep a tab in a group name.
  const name = (body.name || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const expected = await hmacHex(secret, email + ":challenge:" + "2027-07-01");
  const legacyExpected = await hmacHex(secret, email + ":challenge:2026-10-01"); // pre-Aug-19 links, grace until Oct 2026
  if (!email || !token || token !== expected && token !== legacyExpected) {
    return json({ error: "Unauthorized" }, 403);
  }

  if (!groupId) return json({ error: "Missing group." }, 400);
  if (!name) return json({ error: "Give your group a name." }, 400);

  const group = await context.env.DB.prepare(
    "SELECT id, name, created_by_email FROM challenge_groups WHERE id = ?"
  ).bind(groupId).first();
  if (!group) return json({ error: "Group not found." }, 404);
  if (group.created_by_email !== email) {
    return json({ error: "Only the person who created the group can rename it." }, 403);
  }

  if (group.name === name) return json({ success: true, name: name, unchanged: true });

  await context.env.DB.prepare(
    "UPDATE challenge_groups SET name = ? WHERE id = ?"
  ).bind(name, groupId).run();

  return json({ success: true, name: name });
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
