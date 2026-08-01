// GET /api/group-dashboard?group_id=XXX&email=XXX&token=XXX
// Returns members, their progress, group streak, and messages

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
  const groupId = (url.searchParams.get("group_id") || "").trim();
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = url.searchParams.get("token") || "";

  // Auth
  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const expected = await hmacHex(secret, email + ":challenge:2026-10-01");
  if (!email || token !== expected) {
    return json({ error: "Unauthorized" }, 403);
  }

  if (!groupId) return json({ error: "Missing group_id" }, 400);

  // Verify user is a member
  const membership = await context.env.DB.prepare(
    "SELECT id FROM group_members WHERE group_id = ? AND email = ?"
  ).bind(groupId, email).first();
  if (!membership) return json({ error: "Not a member of this group." }, 403);

  // Get group info
  const group = await context.env.DB.prepare(
    "SELECT id, name, challenge, created_by_email FROM challenge_groups WHERE id = ?"
  ).bind(groupId).first();
  if (!group) return json({ error: "Group not found." }, 404);

  const challenge = group.challenge;

  // Get all members
  const membersResult = await context.env.DB.prepare(
    "SELECT email, name FROM group_members WHERE group_id = ? ORDER BY joined_at ASC"
  ).bind(groupId).all();
  const members = membersResult.results || [];

  // Get every member's signup and check-ins in two batched queries. The old
  // two-queries-per-member loop meant 140 sequential D1 round trips for a
  // 70-person group, which is why big groups loaded slowly.
  const memberEmails = members.map(m => m.email);
  const memberData = [];

  const ph = memberEmails.map(() => "?").join(",");
  const signupsByEmail = {};
  const checkinsByEmail = {};
  if (memberEmails.length) {
    const sq = await context.env.DB.prepare(
      "SELECT email, personal_start_date, track FROM challenge_signups WHERE challenge = ? AND email IN (" + ph + ")"
    ).bind(challenge, ...memberEmails).all();
    for (const r of (sq.results || [])) signupsByEmail[String(r.email).toLowerCase()] = r;

    const cq = await context.env.DB.prepare(
      "SELECT email, day FROM challenge_checkins WHERE challenge = ? AND email IN (" + ph + ")"
    ).bind(challenge, ...memberEmails).all();
    for (const r of (cq.results || [])) {
      const k = String(r.email).toLowerCase();
      (checkinsByEmail[k] = checkinsByEmail[k] || []).push(r.day);
    }
  }

  for (const member of members) {
    const key = String(member.email).toLowerCase();
    const signup = signupsByEmail[key];

    const startDate = (signup && signup.personal_start_date) || getDefaultStart(challenge);
    const track = signup ? signup.track : "full-bible";
    const totalDays = String(track || "").endsWith("-90") ? 90 : (challenge === "november-thanks-2026" || challenge === "september-beatitudes-2026" ? 30 : 31);

    const days = (checkinsByEmail[key] || []).sort((a, b) => a - b);
    const daySet = new Set(days);

    // Current day for this member
    const currentDay = getCurrentDayFor(startDate, totalDays);

    // Streak
    let streak = 0;
    let checkFrom = currentDay;
    if (!daySet.has(checkFrom) && checkFrom > 1) checkFrom = currentDay - 1;
    for (let d = checkFrom; d >= 1; d--) {
      if (daySet.has(d)) streak++;
      else break;
    }

    // Checked in today?
    const checkedToday = daySet.has(currentDay);

    memberData.push({
      name: member.name,
      email: group.created_by_email === email ? member.email : undefined,
      is_you: member.email === email,
      days_completed: days.length,
      total_days: totalDays,
      current_day: currentDay,
      streak: streak,
      checked_today: checkedToday,
      initials: getInitials(member.name),
    });
  }

  // Group streak: consecutive days where ALL members checked in
  // Use the earliest common day range
  let groupStreak = 0;
  if (members.length > 0) {
    const allCheckins = await context.env.DB.prepare(
      "SELECT day, COUNT(DISTINCT email) as cnt FROM challenge_checkins WHERE challenge = ? AND email IN (" +
      memberEmails.map(() => "?").join(",") +
      ") GROUP BY day ORDER BY day DESC"
    ).bind(challenge, ...memberEmails).all();

    const memberCount = members.length;
    const fullDays = new Set();
    (allCheckins.results || []).forEach(r => {
      if (r.cnt >= memberCount) fullDays.add(r.day);
    });

    // Current streak: count backward from today (or yesterday if today isn't complete yet)
    const maxMemberDay = Math.max(...memberData.map(m => m.current_day), 0);
    let startFrom = maxMemberDay;
    if (!fullDays.has(startFrom) && startFrom > 1) startFrom = startFrom - 1;
    for (let d = startFrom; d >= 1; d--) {
      if (fullDays.has(d)) groupStreak++;
      else break;
    }
  }

  // Get recent messages (last 50)
  const messagesResult = await context.env.DB.prepare(
    "SELECT id, email, name, message, created_at FROM group_messages WHERE group_id = ? ORDER BY id DESC LIMIT 50"
  ).bind(groupId).all();

  // Get reactions for these messages
  const msgIds = (messagesResult.results || []).map(m => m.id);
  let reactionsMap = {};
  if (msgIds.length > 0) {
    try {
      const reactionsResult = await context.env.DB.prepare(
        "SELECT message_id, email, name FROM message_reactions WHERE message_id IN (" + msgIds.map(() => "?").join(",") + ")"
      ).bind(...msgIds).all();
      (reactionsResult.results || []).forEach(r => {
        if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = [];
        reactionsMap[r.message_id].push({ email: r.email, name: r.name });
      });
    } catch (e) {
      // Table may not exist yet, that's ok
    }
  }

  const messagesWithReactions = (messagesResult.results || []).reverse().map(m => ({
    ...m,
    reactions: reactionsMap[m.id] || [],
  }));

  // The group's calendar is the creator's start date
  let groupStart = null;
  try {
    const cs = await context.env.DB.prepare(
      "SELECT personal_start_date FROM challenge_signups WHERE email = ? AND challenge = ?"
    ).bind(group.created_by_email, challenge).first();
    if (cs && cs.personal_start_date) groupStart = cs.personal_start_date;
  } catch (e) {}

  return json({
    success: true,
    group: {
      id: group.id,
      name: group.name,
      challenge: group.challenge,
      is_creator: group.created_by_email === email,
    },
    group_start: groupStart,
    members: memberData,
    group_streak: groupStreak,
    messages: messagesWithReactions,
  });
}

function getDefaultStart(challenge) {
  const defaults = {
    "july-2026": "2026-07-01",
    "august-james-2026": "2026-08-01",
    "september-beatitudes-2026": "2026-09-01",
    "october-proverbs-2026": "2026-10-01",
    "november-thanks-2026": "2026-11-01",
    "december-gospels-2026": "2026-12-01"
  };
  return defaults[challenge] || "2026-07-01";
}

function getCurrentDayFor(startDate, totalDays) {
  const now = new Date();
  const eastern = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const today = new Date(eastern + "T00:00:00");
  const start = new Date(startDate + "T00:00:00");
  const diffMs = today - start;
  if (diffMs < 0) return 0;
  return Math.min(totalDays, Math.floor(diffMs / 86400000) + 1);
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
