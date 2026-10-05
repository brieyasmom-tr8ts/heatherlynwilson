// Reading progress from the Built to Shine manuscript reader, so Heather can
// see who has opened the book and how far they got, even if they never left a
// note. One row per reader device (the same private rid the notes use).
//
// POST { pass_hash, rid, reader, chapter_idx, chapter_id, chapter_title,
//        total, seconds, launch }                     - a heartbeat
// GET  ?key=ADMIN_KEY                                  - every reader (admin),
//                                                        each with their sittings
//
// Sittings: a heartbeat within SITTING_GAP_MIN of the reader's last one
// extends the current sitting; a longer gap starts a new one. So a phone
// call or a page refresh does not split a sitting, but coming back the next
// morning does. A sitting's stop time is its last heartbeat, which lands at
// most about a minute after they last scrolled or tapped.
//
// seconds is active reading time since the last heartbeat: the page counts it
// only while the tab is visible and the reader has scrolled, tapped or typed
// in the last minute. It is capped per heartbeat so a stuck tab cannot run up
// hours.

const PASS_HASH = "c3fa377aff2ba553896eaeff28252495d31c0cf5b612cbaf506ab35a01c3ceec";
const RID_RE = /^[a-f0-9]{16,64}$/;
const MAX_SECONDS_PER_BEAT = 180;
const SITTING_GAP_MIN = 30;

async function ensureTable(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS manuscript_readers (
      rid TEXT PRIMARY KEY,
      reader TEXT DEFAULT '',
      first_seen TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now')),
      current_idx INTEGER DEFAULT 0,
      current_title TEXT DEFAULT '',
      furthest_idx INTEGER DEFAULT 0,
      furthest_title TEXT DEFAULT '',
      total_sections INTEGER DEFAULT 12,
      active_seconds INTEGER DEFAULT 0,
      chapter_seconds TEXT DEFAULT '{}',
      launch_tab INTEGER DEFAULT 0,
      visits INTEGER DEFAULT 1
    )
  `).run();
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS manuscript_sittings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rid TEXT NOT NULL,
      started_at TEXT DEFAULT (datetime('now')),
      last_at TEXT DEFAULT (datetime('now')),
      active_seconds INTEGER DEFAULT 0,
      chapters TEXT DEFAULT '{}'
    )
  `).run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_ms_sittings_rid ON manuscript_sittings (rid, last_at)").run();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export async function onRequestPost(context) {
  const { env } = context;
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: "Bad request." }, 400); }
  const rid = String(body.rid || "").trim();
  if (body.pass_hash !== PASS_HASH) return json({ error: "Unauthorized" }, 403);
  if (!RID_RE.test(rid)) return json({ error: "Missing reader id." }, 400);

  const reader = String(body.reader || "").trim().slice(0, 60);
  const total = Math.max(1, Math.min(50, parseInt(body.total, 10) || 12));
  const idx = Math.max(0, Math.min(total - 1, parseInt(body.chapter_idx, 10) || 0));
  const chId = String(body.chapter_id || "").replace(/[^a-z0-9-]/gi, "").slice(0, 30);
  const title = String(body.chapter_title || "").trim().slice(0, 120);
  const seconds = Math.max(0, Math.min(MAX_SECONDS_PER_BEAT, parseInt(body.seconds, 10) || 0));
  const launch = body.launch === true ? 1 : 0;
  const newVisit = body.visit === true ? 1 : 0;

  await ensureTable(env.DB);
  const row = await env.DB.prepare(
    "SELECT furthest_idx, chapter_seconds FROM manuscript_readers WHERE rid = ?"
  ).bind(rid).first();

  let perChapter = {};
  try { perChapter = JSON.parse((row && row.chapter_seconds) || "{}") || {}; } catch (e) {}
  // Time on the Launch Team tab is kept apart from reading time in a chapter.
  const bucket = launch ? "launch-team" : chId;
  if (seconds && bucket) perChapter[bucket] = (perChapter[bucket] || 0) + seconds;

  if (!row) {
    await env.DB.prepare(`
      INSERT INTO manuscript_readers (rid, reader, current_idx, current_title, furthest_idx, furthest_title,
        total_sections, active_seconds, chapter_seconds, launch_tab, visits)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(rid, reader, idx, title, idx, title, total, seconds, JSON.stringify(perChapter), launch).run();
  } else {
    const further = idx > (row.furthest_idx || 0);
    await env.DB.prepare(`
      UPDATE manuscript_readers SET
        reader = CASE WHEN ? <> '' THEN ? ELSE reader END,
        last_seen = datetime('now'),
        current_idx = ?, current_title = ?,
        furthest_idx = CASE WHEN ? THEN ? ELSE furthest_idx END,
        furthest_title = CASE WHEN ? THEN ? ELSE furthest_title END,
        total_sections = ?,
        active_seconds = active_seconds + ?,
        chapter_seconds = ?,
        launch_tab = MAX(launch_tab, ?),
        visits = visits + ?
      WHERE rid = ?
    `).bind(reader, reader, idx, title, further ? 1 : 0, idx, further ? 1 : 0, title, total, seconds,
      JSON.stringify(perChapter), launch, newVisit, rid).run();
  }
  // The sitting this heartbeat belongs to. Chapters are kept in the order
  // they were first opened in the sitting, with seconds in each; a chapter
  // opened but not read yet is still listed with 0.
  const sit = await env.DB.prepare(
    "SELECT id, chapters FROM manuscript_sittings WHERE rid = ? AND last_at >= datetime('now', ?) ORDER BY last_at DESC LIMIT 1"
  ).bind(rid, "-" + SITTING_GAP_MIN + " minutes").first();
  let sitCh = {};
  if (sit) { try { sitCh = JSON.parse(sit.chapters || "{}") || {}; } catch (e) {} }
  if (bucket) sitCh[bucket] = (sitCh[bucket] || 0) + seconds;
  if (sit) {
    await env.DB.prepare(
      "UPDATE manuscript_sittings SET last_at = datetime('now'), active_seconds = active_seconds + ?, chapters = ? WHERE id = ?"
    ).bind(seconds, JSON.stringify(sitCh), sit.id).run();
  } else {
    await env.DB.prepare(
      "INSERT INTO manuscript_sittings (rid, active_seconds, chapters) VALUES (?, ?, ?)"
    ).bind(rid, seconds, JSON.stringify(sitCh)).run();
  }

  return json({ success: true });
}

export async function onRequestGet(context) {
  const { env } = context;
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (!key || key !== env.ADMIN_KEY) return json({ error: "Unauthorized" }, 401);
  await ensureTable(env.DB);
  const rows = (await env.DB.prepare(
    "SELECT rid, reader, first_seen, last_seen, current_idx, current_title, furthest_idx, furthest_title, total_sections, active_seconds, chapter_seconds, launch_tab, visits FROM manuscript_readers ORDER BY last_seen DESC"
  ).all()).results || [];
  const sits = (await env.DB.prepare(
    "SELECT rid, started_at, last_at, active_seconds, chapters FROM manuscript_sittings ORDER BY started_at DESC"
  ).all()).results || [];
  const byRid = {};
  sits.forEach((x) => { (byRid[x.rid] = byRid[x.rid] || []).push({ started_at: x.started_at, stopped_at: x.last_at, active_seconds: x.active_seconds, chapters: x.chapters }); });
  // The rid is a private key; the admin only needs a short label to tell two
  // devices with the same name apart.
  rows.forEach((r) => { r.sittings = byRid[r.rid] || []; r.device = (r.rid || "").slice(0, 4); delete r.rid; });
  return json({ success: true, readers: rows });
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
