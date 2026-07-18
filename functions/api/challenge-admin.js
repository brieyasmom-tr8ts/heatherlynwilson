// Admin endpoint for challenge signups
// GET /api/challenge-admin?key=ADMIN_KEY — list all signups with stats
// DELETE /api/challenge-admin?key=ADMIN_KEY&id=123 — remove a signup

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const { results } = await context.env.DB.prepare(
      "SELECT id, name, email, track, prayer, challenge, created_at FROM challenge_signups ORDER BY created_at DESC"
    ).all();

    const all = results || [];

    // Per-challenge breakdown
    const byCh = {};
    for (const r of all) {
      const ch = r.challenge || "july-2026";
      if (!byCh[ch]) byCh[ch] = { total: 0, full_bible: 0, new_testament: 0, prayer: 0 };
      byCh[ch].total++;
      if (r.track === "full-bible") byCh[ch].full_bible++;
      if (r.track === "new-testament") byCh[ch].new_testament++;
      if (r.prayer === 1) byCh[ch].prayer++;
    }

    // Fetch groups and their members
    let groups = [];
    try {
      const gr = await context.env.DB.prepare(
        "SELECT g.id, g.name, g.challenge, g.track, g.created_by_email, g.created_at, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count FROM challenge_groups g ORDER BY g.created_at DESC"
      ).all();
      const groupRows = gr.results || [];
      for (const g of groupRows) {
        const membersResult = await context.env.DB.prepare(
          "SELECT name, email, joined_at FROM group_members WHERE group_id = ? ORDER BY joined_at ASC"
        ).bind(g.id).all();
        groups.push({
          id: g.id,
          name: g.name,
          challenge: g.challenge,
          track: g.track || "",
          created_by: g.created_by_email,
          created_at: g.created_at,
          member_count: g.member_count,
          members: (membersResult.results || []).map(m => ({ name: m.name, email: m.email, joined: m.joined_at })),
        });
      }
    } catch (e) {}

    // Add group info to each signup
    const memberGroupMap = {};
    for (const g of groups) {
      for (const m of g.members) {
        if (!memberGroupMap[m.email + ":" + g.challenge]) {
          memberGroupMap[m.email + ":" + g.challenge] = g.name;
        }
      }
    }
    const signupsWithGroups = all.map(s => ({
      ...s,
      group_name: memberGroupMap[s.email + ":" + (s.challenge || "july-2026")] || "",
    }));

    return json({
      total: all.length,
      full_bible_count: all.filter(r => r.track === "full-bible").length,
      new_testament_count: all.filter(r => r.track === "new-testament").length,
      prayer_count: all.filter(r => r.prayer === 1).length,
      by_challenge: byCh,
      signups: signupsWithGroups,
      groups: groups,
    });
  } catch (e) {
    return json({ total: 0, full_bible_count: 0, new_testament_count: 0, prayer_count: 0, signups: [] });
  }
}

export async function onRequestDelete(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");
  const key = url.searchParams.get("key");

  if (!id || key !== context.env.ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  await context.env.DB.prepare("DELETE FROM challenge_signups WHERE id = ?").bind(id).run();
  return json({ success: true });
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
      "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
