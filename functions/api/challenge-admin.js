// Admin endpoint for challenge signups
// GET /api/challenge-admin?key=ADMIN_KEY - list all signups with stats
// DELETE /api/challenge-admin?key=ADMIN_KEY&id=123 - remove a signup

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const { results } = await context.env.DB.prepare(
      "SELECT id, name, email, track, prayer, challenge, created_at, source, region, personal_start_date FROM challenge_signups ORDER BY created_at DESC"
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
        // Get creator's challenge start date
        let creatorStart = null;
        try {
          const cs = await context.env.DB.prepare(
            "SELECT personal_start_date FROM challenge_signups WHERE email = ? AND challenge = ?"
          ).bind(g.created_by_email, g.challenge || "july-2026").first();
          if (cs) creatorStart = cs.personal_start_date;
        } catch (e) {}
        groups.push({
          id: g.id,
          name: g.name,
          challenge: g.challenge,
          track: g.track || "",
          created_by: g.created_by_email,
          created_at: g.created_at,
          challenge_start: creatorStart,
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

    // Fetch contact/booking submissions
    let contacts = [];
    try {
      const cr = await context.env.DB.prepare(
        "SELECT id, name, email, reason, organization, message, created_at FROM contact_submissions ORDER BY created_at DESC LIMIT 50"
      ).all();
      contacts = cr.results || [];
    } catch (e) {}

    // Fetch content queue schedule
    let contentQueue = [];
    try {
      const origin = new URL(context.request.url).origin;
      const qr = await fetch(origin + "/content-queue/schedule.json", { headers: { "User-Agent": "hlw-admin" } });
      if (qr.ok) {
        const qd = await qr.json();
        contentQueue = (qd.posts || []).sort((a, b) => (a.publish_date || "").localeCompare(b.publish_date || ""));
      }
    } catch (e) {}

    // Page views for challenge pages (for conversion funnel)
    let challengePageViews = 0;
    try {
      const pv = await context.env.DB.prepare(
        "SELECT COUNT(DISTINCT visitor_id) as cnt FROM page_views WHERE path LIKE '%challenge%' AND created_at >= datetime('now', '-30 days')"
      ).first();
      challengePageViews = pv ? pv.cnt : 0;
    } catch (e) {}

    // Signup hours distribution (for best times)
    let signupHours = {};
    for (const s of all) {
      if (s.created_at) {
        let h;
        try { h = new Date(s.created_at + (s.created_at.includes("Z") ? "" : "Z")).getUTCHours(); } catch (e) { continue; }
        // Convert UTC to approximate Eastern (UTC-4 in summer)
        h = (h - 4 + 24) % 24;
        signupHours[h] = (signupHours[h] || 0) + 1;
      }
    }

    // Country breakdown from page_views
    let countries = [];
    try {
      const cc = await context.env.DB.prepare(
        "SELECT country, COUNT(*) as cnt FROM page_views WHERE country != '' AND created_at >= datetime('now', '-30 days') GROUP BY country ORDER BY cnt DESC LIMIT 10"
      ).all();
      countries = cc.results || [];
    } catch (e) {}

    // US state breakdown from page_views and signups
    let states = [];
    try {
      const st = await context.env.DB.prepare(
        "SELECT region, COUNT(*) as cnt FROM page_views WHERE country = 'US' AND region != '' AND created_at >= datetime('now', '-30 days') GROUP BY region ORDER BY cnt DESC LIMIT 20"
      ).all();
      states = st.results || [];
    } catch (e) {}

    // Top states this week, plus states seen for the very first time this week
    let statesWeek = [];
    let newStates = [];
    let statesAllTime = 0;
    try {
      const sw = await context.env.DB.prepare(
        "SELECT region, COUNT(*) as cnt FROM page_views WHERE country = 'US' AND region != '' AND created_at >= datetime('now', '-7 days') GROUP BY region ORDER BY cnt DESC LIMIT 20"
      ).all();
      statesWeek = sw.results || [];
    } catch (e) {}
    try {
      const ns = await context.env.DB.prepare(
        "SELECT region, MIN(created_at) as first_seen FROM page_views WHERE country = 'US' AND region != '' GROUP BY region"
      ).all();
      const rows = ns.results || [];
      statesAllTime = rows.length;
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      newStates = rows
        .filter(r => {
          const t = Date.parse(String(r.first_seen).replace(" ", "T") + (String(r.first_seen).includes("Z") ? "" : "Z"));
          return !isNaN(t) && t >= cutoff;
        })
        .sort((a, b) => (a.first_seen < b.first_seen ? 1 : -1));
    } catch (e) {}

    // How many people actually wrote in a journal today (words, not just the
    // read checkbox). Eastern midnight expressed in UTC, summer offset.
    let journalToday = 0;
    let journalTodayByCh = {};
    try {
      const easternToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      const cutoff = new Date(easternToday + "T00:00:00-04:00").toISOString().slice(0, 19).replace("T", " ");
      const jq = await context.env.DB.prepare(
        "SELECT challenge, COUNT(DISTINCT email) as cnt FROM challenge_journal WHERE updated_at >= ? AND (COALESCE(stood_out,'') != '' OR COALESCE(god_speaking,'') != '' OR COALESCE(prayer,'') != '' OR COALESCE(yesterday_reflection,'') != '') GROUP BY challenge"
      ).bind(cutoff).all();
      for (const r of (jq.results || [])) {
        journalTodayByCh[r.challenge] = r.cnt;
        journalToday += r.cnt;
      }
    } catch (e) {}

    // Per-challenge funnel: visitors, signups, who actually started, who is
    // still going, who finished. All on the same 30-day window so the
    // percentages mean something.
    let funnel = {};
    try {
      const PATH_MAP = [
        [/challenge-james/i, "august-james-2026"],
        [/challenge-beatitudes/i, "september-beatitudes-2026"],
        [/challenge-proverbs/i, "october-proverbs-2026"],
        [/challenge-thanks/i, "november-thanks-2026"],
        [/challenge-gospels/i, "december-gospels-2026"],
        [/challenge-bible|^\/challenge\/?$|^\/challenge\.html/i, "july-2026"],
      ];
      const views = await context.env.DB.prepare(
        "SELECT path, COUNT(DISTINCT visitor_id) as cnt FROM page_views WHERE path LIKE '%challenge%' AND created_at >= datetime('now', '-30 days') GROUP BY path"
      ).all();
      const viewsByCh = {};
      for (const r of (views.results || [])) {
        for (const [re, ch] of PATH_MAP) {
          if (re.test(r.path || "")) { viewsByCh[ch] = (viewsByCh[ch] || 0) + r.cnt; break; }
        }
      }

      // One row per person per challenge: how many days and when they last read
      const ck = await context.env.DB.prepare(
        "SELECT challenge, email, COUNT(*) as days, MAX(checked_at) as last_checkin FROM challenge_checkins GROUP BY challenge, email"
      ).all();
      const ckByCh = {};
      for (const r of (ck.results || [])) {
        const c = r.challenge || "july-2026";
        (ckByCh[c] = ckByCh[c] || {})[String(r.email).toLowerCase()] = r;
      }

      const TOTALS = { "july-2026": 31, "august-james-2026": 31, "september-beatitudes-2026": 30, "october-proverbs-2026": 31, "november-thanks-2026": 30, "december-gospels-2026": 31 };
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      for (const s of all) {
        const chId = s.challenge || "july-2026";
        const f = funnel[chId] || (funnel[chId] = { visitors: 0, signups: 0, started: 0, active: 0, completed: 0, never_started: 0 });
        f.signups++;
        const rec = ckByCh[chId] && ckByCh[chId][String(s.email).toLowerCase()];
        if (!rec || !rec.days) { f.never_started++; continue; }
        f.started++;
        const total = String(s.track || "").endsWith("-90") ? 90 : (TOTALS[chId] || 31);
        if (rec.days >= total) f.completed++;
        const t = Date.parse(String(rec.last_checkin).replace(" ", "T") + (String(rec.last_checkin).includes("Z") ? "" : "Z"));
        if (!isNaN(t) && t >= weekAgo) f.active++;
      }
      for (const chId of Object.keys(funnel)) funnel[chId].visitors = viewsByCh[chId] || 0;
    } catch (e) {}

    // Device breakdown from page_views (last 30 days)
    let devices = { mobile: 0, desktop: 0, tablet: 0 };
    try {
      const dv = await context.env.DB.prepare(
        "SELECT device, COUNT(DISTINCT visitor_id) as cnt FROM page_views WHERE device != '' AND created_at >= datetime('now', '-30 days') GROUP BY device"
      ).all();
      for (const r of (dv.results || [])) {
        if (r.device === "mobile" || r.device === "desktop" || r.device === "tablet") {
          devices[r.device] = r.cnt;
        }
      }
    } catch (e) {}

    // States from signups (more meaningful for Heather)
    let signupStates = {};
    for (const s of all) {
      if (s.region) {
        signupStates[s.region] = (signupStates[s.region] || 0) + 1;
      }
    }

    // People starting today
    const today = new Date().toISOString().slice(0, 10);
    const startingToday = all.filter(r => r.personal_start_date === today);
    const startingByTrack = {};
    for (const s of startingToday) {
      const t = s.track || 'full-bible';
      startingByTrack[t] = (startingByTrack[t] || 0) + 1;
    }

    return json({
      total: all.length,
      full_bible_count: all.filter(r => r.track === "full-bible").length,
      new_testament_count: all.filter(r => r.track === "new-testament").length,
      prayer_count: all.filter(r => r.prayer === 1).length,
      by_challenge: byCh,
      starting_today: startingToday.length,
      starting_today_by_track: startingByTrack,
      starting_today_names: startingToday.map(s => ({ name: s.name, track: s.track || 'full-bible', challenge: s.challenge || 'july-2026' })),
      signups: signupsWithGroups,
      groups: groups,
      contacts: contacts,
      content_queue: contentQueue,
      challenge_page_views: challengePageViews,
      signup_hours: signupHours,
      countries: countries,
      states: states,
      states_week: statesWeek,
      new_states: newStates,
      states_all_time: statesAllTime,
      journal_today: journalToday,
      journal_today_by_challenge: journalTodayByCh,
      funnel: funnel,
      signup_states: signupStates,
      devices: devices,
    });
  } catch (e) {
    return json({ total: 0, full_bible_count: 0, new_testament_count: 0, prayer_count: 0, signups: [] });
  }
}

// POST: admin edits a signup's start date. This is Heather's override, so
// any valid date is allowed, including the past, for syncing someone onto
// the same start date as their group.
export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }
  const body = await context.request.json();
  const id = body.id;
  const startDate = body.start_date || "";
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return json({ error: "Need a signup id and a date like 2026-07-20." }, 400);
  }
  await context.env.DB.prepare(
    "UPDATE challenge_signups SET personal_start_date = ? WHERE id = ?"
  ).bind(startDate, id).run();
  return json({ success: true });
}

export async function onRequestDelete(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");
  const key = url.searchParams.get("key");

  if (!id || key !== context.env.ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  const type = url.searchParams.get("type") || "signup";
  if (type === "contact") {
    await context.env.DB.prepare("DELETE FROM contact_submissions WHERE id = ?").bind(id).run();
  } else if (type === "group-member") {
    const email = url.searchParams.get("email") || "";
    if (!email) return json({ error: "Missing email." }, 400);
    await context.env.DB.prepare("DELETE FROM group_members WHERE group_id = ? AND email = ?").bind(id, email).run();
  } else {
    await context.env.DB.prepare("DELETE FROM challenge_signups WHERE id = ?").bind(id).run();
  }
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
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
