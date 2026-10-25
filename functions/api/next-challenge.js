// GET  /api/next-challenge            public: the challenge to invite readers to next
// POST /api/next-challenge?key=ADMIN  admin: { challenge: "<id>" } picks one, "" goes back to automatic
//
// The reader dashboard shows a "Coming next" card during the last 7 days of a
// challenge. Which challenge it points at comes from here, so it rolls on its
// own from one month to the next without a code change:
//   - Automatic (the default): the next challenge in challenge/registry.json
//     whose official start is today or later.
//   - Picked in the admin: that challenge, until its start date has passed.
//     After that it falls back to automatic, so a stale pick never lingers.
// Names, dates and signup pages always come from the registry.

const KEY = "next_challenge";

function easternToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

async function ensureTable(DB) {
  await DB.prepare(
    "CREATE TABLE IF NOT EXISTS site_settings (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT DEFAULT (datetime('now')))"
  ).run();
}

async function loadRegistry(origin) {
  const res = await fetch(new URL("/challenge/registry.json", origin), { headers: { "User-Agent": "hlw-next-challenge" } });
  if (!res.ok) throw new Error("registry " + res.status);
  const data = await res.json();
  return data.challenges || [];
}

function describe(c) {
  return { id: c.id, name: c.name, start: c.official || null, signupPage: c.signupPage || null };
}

function resolve(challenges, picked, today) {
  const pick = picked ? challenges.find((c) => c.id === picked) : null;
  if (pick && (!pick.official || pick.official >= today)) return { mode: "picked", next: describe(pick) };
  const auto = challenges
    .filter((c) => c.official && c.official >= today && c.signupPage)
    .sort((a, b) => (a.official < b.official ? -1 : a.official > b.official ? 1 : 0))[0];
  return { mode: pick ? "picked-expired" : "auto", next: auto ? describe(auto) : null };
}

async function readPick(DB) {
  try {
    await ensureTable(DB);
    const row = await DB.prepare("SELECT v FROM site_settings WHERE k = ?").bind(KEY).first();
    return (row && row.v) || "";
  } catch (e) {
    return "";
  }
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  try {
    const challenges = await loadRegistry(url.origin);
    const picked = context.env.DB ? await readPick(context.env.DB) : "";
    const out = resolve(challenges, picked, easternToday());
    return json({ success: true, picked, ...out }, 200, "public, max-age=60");
  } catch (e) {
    return json({ success: false, next: null }, 200, "no-store");
  }
}

export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  if (url.searchParams.get("key") !== context.env.ADMIN_KEY) return json({ error: "Unauthorized" }, 401);
  let body = {};
  try { body = await context.request.json(); } catch (e) {}
  const picked = String(body.challenge || "").trim();
  const challenges = await loadRegistry(url.origin);
  if (picked && !challenges.some((c) => c.id === picked)) return json({ error: "Unknown challenge." }, 400);
  await ensureTable(context.env.DB);
  await context.env.DB.prepare(
    "INSERT INTO site_settings (k, v, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = datetime('now')"
  ).bind(KEY, picked).run();
  return json({ success: true, picked, ...resolve(challenges, picked, easternToday()) });
}

function json(data, status = 200, cache = "no-store") {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": cache },
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
