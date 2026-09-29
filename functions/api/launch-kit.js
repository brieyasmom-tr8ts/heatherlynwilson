// Launch team kit: the Launch Team tab at the end of the Built to Shine
// manuscript reader. One row per reader device holds their name, how to
// credit them, their quote about the book, and whether they gave Heather
// permission to use what they send. Their photo lives in D1 (it is resized
// in the browser first, so it fits in a row). Videos are too big for D1 and
// live in R2; see launch-kit-video.js.
//
// GET  ?pass_hash=...&rid=...     - this reader's submission, photo flag, videos
// GET  ?key=ADMIN_KEY             - every submission with its videos (admin)
// GET  ?photo=RID&key=ADMIN_KEY   - serve one reader's photo (admin)
// POST { pass_hash, rid, reader, name, email, credit, quote, permission }
// POST { pass_hash, rid, photo: base64, content_type }   - save or replace photo
// DELETE { pass_hash, rid, photo: true }                 - remove own photo
// DELETE ?key=ADMIN_KEY { rid }                          - remove a whole submission

const PASS_HASH = "c3fa377aff2ba553896eaeff28252495d31c0cf5b612cbaf506ab35a01c3ceec";

// The exact words the reader agreed to. Stored on the row with the time they
// ticked the box, so if the wording ever changes the old agreement still reads
// the way it did when they gave it.
export const PERMISSION_TEXT =
  "I give Heather Lyn Wilson and her team permission to use my quote, my name as I wrote it above, " +
  "my photo and my videos to promote Built to Shine, on social media, websites, emails, ads and printed " +
  "materials, without payment. Heather may shorten my quote or trim my video, but will not change what I meant. " +
  "I can ask for anything to be taken down from future use at any time.";

// base64 of a photo must fit in one D1 row (about 2MB). The page shrinks
// photos to well under this before sending.
const MAX_PHOTO_B64 = 1900000;

const RID_RE = /^[a-f0-9]{16,64}$/;

export async function ensureTables(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS launch_kit_submissions (
      rid TEXT PRIMARY KEY,
      reader TEXT DEFAULT '',
      name TEXT DEFAULT '',
      email TEXT DEFAULT '',
      credit TEXT DEFAULT '',
      quote TEXT DEFAULT '',
      permission INTEGER DEFAULT 0,
      permission_text TEXT DEFAULT '',
      permission_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS launch_kit_photos (
      rid TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      content_type TEXT DEFAULT 'image/jpeg',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS launch_kit_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rid TEXT NOT NULL,
      r2_key TEXT NOT NULL,
      upload_id TEXT DEFAULT '',
      filename TEXT DEFAULT '',
      content_type TEXT DEFAULT '',
      size INTEGER DEFAULT 0,
      prompt TEXT DEFAULT '',
      status TEXT DEFAULT 'uploading',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export async function onRequestGet(context) {
  const { env } = context;
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  const isAdmin = !!key && key === env.ADMIN_KEY;

  await ensureTables(env.DB);

  const photoRid = url.searchParams.get("photo");
  if (photoRid) {
    if (!isAdmin) return json({ error: "Unauthorized" }, 401);
    const row = await env.DB.prepare("SELECT data, content_type FROM launch_kit_photos WHERE rid = ?").bind(photoRid).first();
    if (!row) return json({ error: "not found" }, 404);
    const bin = Uint8Array.from(atob(row.data), (c) => c.charCodeAt(0));
    const ext = (row.content_type || "").indexOf("png") !== -1 ? "png" : "jpg";
    return new Response(bin, {
      headers: {
        "Content-Type": row.content_type || "image/jpeg",
        "Content-Disposition": 'inline; filename="launch-team-photo-' + photoRid.slice(0, 8) + "." + ext + '"',
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  const videoReady = !!env.LAUNCH_MEDIA;

  if (isAdmin) {
    const subs = (await env.DB.prepare(
      "SELECT s.*, (SELECT 1 FROM launch_kit_photos p WHERE p.rid = s.rid) AS has_photo FROM launch_kit_submissions s ORDER BY s.updated_at DESC"
    ).all()).results || [];
    const vids = (await env.DB.prepare(
      "SELECT id, rid, filename, content_type, size, prompt, status, created_at FROM launch_kit_videos WHERE status = 'ready' ORDER BY created_at ASC"
    ).all()).results || [];
    return json({ success: true, video_ready: videoReady, submissions: subs, videos: vids });
  }

  const rid = (url.searchParams.get("rid") || "").trim();
  if (url.searchParams.get("pass_hash") !== PASS_HASH || !RID_RE.test(rid)) {
    return json({ error: "Unauthorized" }, 403);
  }
  const sub = await env.DB.prepare(
    "SELECT name, email, credit, quote, permission, permission_at, updated_at FROM launch_kit_submissions WHERE rid = ?"
  ).bind(rid).first();
  const photo = await env.DB.prepare("SELECT 1 AS x FROM launch_kit_photos WHERE rid = ?").bind(rid).first();
  const vids = (await env.DB.prepare(
    "SELECT id, filename, size, prompt, created_at FROM launch_kit_videos WHERE rid = ? AND status = 'ready' ORDER BY created_at ASC"
  ).bind(rid).all()).results || [];
  return json({ success: true, video_ready: videoReady, submission: sub || null, has_photo: !!photo, videos: vids });
}

export async function onRequestPost(context) {
  const { env } = context;
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: "Bad request." }, 400); }
  const rid = String(body.rid || "").trim();
  if (body.pass_hash !== PASS_HASH) return json({ error: "Unauthorized" }, 403);
  if (!RID_RE.test(rid)) return json({ error: "Missing reader id." }, 400);

  await ensureTables(env.DB);

  // Photo upload
  if (body.photo) {
    const sub = await env.DB.prepare("SELECT permission FROM launch_kit_submissions WHERE rid = ?").bind(rid).first();
    if (!sub || !sub.permission) return json({ error: "Please save your details and tick the permission box first." }, 400);
    const data = String(body.photo);
    const ct = String(body.content_type || "image/jpeg");
    if (!/^image\/(jpeg|png|webp)$/.test(ct)) return json({ error: "That photo type is not supported. Try a JPG or PNG." }, 400);
    if (data.length > MAX_PHOTO_B64) return json({ error: "That photo is too large. Try a smaller one." }, 400);
    if (!/^[A-Za-z0-9+/=]+$/.test(data)) return json({ error: "The photo did not come through. Try again." }, 400);
    await env.DB.prepare(
      "INSERT INTO launch_kit_photos (rid, data, content_type) VALUES (?, ?, ?) ON CONFLICT(rid) DO UPDATE SET data = excluded.data, content_type = excluded.content_type, created_at = datetime('now')"
    ).bind(rid, data, ct).run();
    await env.DB.prepare("UPDATE launch_kit_submissions SET updated_at = datetime('now') WHERE rid = ?").bind(rid).run();
    return json({ success: true });
  }

  const name = String(body.name || "").trim().slice(0, 100);
  const email = String(body.email || "").trim().slice(0, 200);
  const credit = String(body.credit || "").trim().slice(0, 200);
  const quote = String(body.quote || "").trim().slice(0, 4000);
  const reader = String(body.reader || "").trim().slice(0, 60);
  const permission = body.permission === true;

  if (!name) return json({ error: "Please add your name." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Please add an email address Heather can reach you at." }, 400);
  if (!permission) return json({ error: "Please tick the permission box so Heather can use what you share." }, 400);

  // permission_at is set the first time they agree and kept after that, so
  // editing a quote later does not move the date they gave permission.
  await env.DB.prepare(`
    INSERT INTO launch_kit_submissions (rid, reader, name, email, credit, quote, permission, permission_text, permission_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, datetime('now'))
    ON CONFLICT(rid) DO UPDATE SET
      reader = excluded.reader, name = excluded.name, email = excluded.email,
      credit = excluded.credit, quote = excluded.quote, permission = 1,
      permission_text = CASE WHEN launch_kit_submissions.permission = 1 THEN launch_kit_submissions.permission_text ELSE excluded.permission_text END,
      permission_at = CASE WHEN launch_kit_submissions.permission = 1 THEN launch_kit_submissions.permission_at ELSE excluded.permission_at END,
      updated_at = datetime('now')
  `).bind(rid, reader, name, email, credit, quote, PERMISSION_TEXT).run();

  return json({ success: true });
}

export async function onRequestDelete(context) {
  const { env } = context;
  const url = new URL(context.request.url);
  let body = {};
  try { body = await context.request.json(); } catch (e) {}
  await ensureTables(env.DB);

  const key = url.searchParams.get("key");
  if (key && key === env.ADMIN_KEY) {
    const rid = String(body.rid || "").trim();
    if (!rid) return json({ error: "rid required" }, 400);
    const vids = (await env.DB.prepare("SELECT r2_key FROM launch_kit_videos WHERE rid = ?").bind(rid).all()).results || [];
    if (env.LAUNCH_MEDIA) {
      for (const v of vids) { try { await env.LAUNCH_MEDIA.delete(v.r2_key); } catch (e) {} }
    }
    await env.DB.prepare("DELETE FROM launch_kit_videos WHERE rid = ?").bind(rid).run();
    await env.DB.prepare("DELETE FROM launch_kit_photos WHERE rid = ?").bind(rid).run();
    await env.DB.prepare("DELETE FROM launch_kit_submissions WHERE rid = ?").bind(rid).run();
    return json({ success: true });
  }

  const rid = String(body.rid || "").trim();
  if (body.pass_hash !== PASS_HASH || !RID_RE.test(rid)) return json({ error: "Unauthorized" }, 403);
  if (body.photo) {
    await env.DB.prepare("DELETE FROM launch_kit_photos WHERE rid = ?").bind(rid).run();
    return json({ success: true });
  }
  return json({ error: "Nothing to delete." }, 400);
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
