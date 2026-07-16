// Admin API for challenge email content. Same ?key= auth as the other admin
// endpoints (checked against env.ADMIN_KEY).
//
//   GET  /api/admin-emails?key=...            -> plans with email counts
//   GET  /api/admin-emails?key=...&plan=x     -> all emails for a plan
//   POST /api/admin-emails?key=...            -> upsert one email {plan, day, ...}
//   POST /api/admin-emails?key=...&action=seed -> import challenge/email-seed.json
//        from the site for any (plan, day) not already in the table. Never
//        overwrites edits.

const FIELDS = ["subject", "reading", "title", "focus", "verse_ref", "beatitude", "hide_pct", "prayer_focus", "prayer_verse", "practice", "body"];

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS challenge_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan TEXT NOT NULL,
      day INTEGER NOT NULL,
      subject TEXT DEFAULT '',
      reading TEXT DEFAULT '',
      title TEXT DEFAULT '',
      focus TEXT DEFAULT '',
      verse_ref TEXT DEFAULT '',
      beatitude INTEGER,
      hide_pct INTEGER,
      prayer_focus TEXT DEFAULT '',
      prayer_verse TEXT DEFAULT '',
      practice TEXT DEFAULT '',
      body TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(plan, day)
    )
  `).run();
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (url.searchParams.get("key") !== context.env.ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 403);
  }
  await ensureTable(context.env.DB);
  const plan = url.searchParams.get("plan");
  if (!plan) {
    const { results } = await context.env.DB.prepare(
      "SELECT plan, COUNT(*) as count, MAX(updated_at) as updated_at FROM challenge_emails GROUP BY plan ORDER BY plan"
    ).all();
    return json({ plans: results || [] });
  }
  const { results } = await context.env.DB.prepare(
    "SELECT * FROM challenge_emails WHERE plan = ? ORDER BY day"
  ).bind(plan).all();
  return json({ plan, emails: results || [] });
}

export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  if (url.searchParams.get("key") !== context.env.ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 403);
  }
  const db = context.env.DB;
  await ensureTable(db);

  // Seed: import the packaged content for any plan/day not yet in the table
  if (url.searchParams.get("action") === "seed") {
    const origin = url.origin;
    let seed;
    try {
      const r = await fetch(origin + "/challenge/email-seed.json", { headers: { "User-Agent": "hlw-admin" } });
      if (!r.ok) return json({ error: "Could not load the seed file (" + r.status + ")." }, 500);
      seed = await r.json();
    } catch (e) {
      return json({ error: "Could not load the seed file." }, 500);
    }
    let inserted = 0, skipped = 0;
    for (const plan of Object.keys(seed)) {
      for (const row of seed[plan]) {
        const existing = await db.prepare(
          "SELECT id FROM challenge_emails WHERE plan = ? AND day = ?"
        ).bind(plan, row.day).first();
        if (existing) { skipped++; continue; }
        await db.prepare(
          `INSERT INTO challenge_emails (plan, day, ${FIELDS.join(", ")}) VALUES (?, ?, ${FIELDS.map(() => "?").join(", ")})`
        ).bind(plan, row.day, ...FIELDS.map(f => row[f] !== undefined ? row[f] : (f === "beatitude" || f === "hide_pct" ? null : ""))).run();
        inserted++;
      }
    }
    return json({ success: true, inserted, skipped });
  }

  // Upsert a single email
  const body = await context.request.json();
  const plan = (body.plan || "").trim();
  const day = parseInt(body.day, 10);
  if (!plan || !day || day < 1 || day > 120) {
    return json({ error: "Missing plan or day." }, 400);
  }
  const values = FIELDS.map(f => {
    if (f === "beatitude" || f === "hide_pct") {
      return (body[f] === null || body[f] === undefined || body[f] === "") ? null : parseInt(body[f], 10);
    }
    return body[f] !== undefined ? String(body[f]) : "";
  });
  await db.prepare(
    `INSERT INTO challenge_emails (plan, day, ${FIELDS.join(", ")}, updated_at)
     VALUES (?, ?, ${FIELDS.map(() => "?").join(", ")}, datetime('now'))
     ON CONFLICT(plan, day) DO UPDATE SET
     ${FIELDS.map(f => f + " = excluded." + f).join(", ")}, updated_at = datetime('now')`
  ).bind(plan, day, ...values).run();
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
