// Notes from the Built to Shine manuscript reader, saved per reader so
// Heather can read them in the admin dashboard and readers keep their notes
// across devices.
//
// POST { pass_hash, rid, reader, chapter, chapter_title, note } - save one.
//   pass_hash must match the reader page's password hash. Empty note deletes.
//   rid is a private random id generated on the reader's device; notes are
//   keyed by it so readers can never look up each other's notes and two
//   people with the same first name never collide. reader is just the label
//   Heather sees.
// GET  ?key=ADMIN_KEY          - all notes, newest first (admin)
// GET  ?pass_hash=...&rid=...  - that device's notes (sync)

const PASS_HASH = "c3fa377aff2ba553896eaeff28252495d31c0cf5b612cbaf506ab35a01c3ceec";

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  const passHash = url.searchParams.get("pass_hash") || "";
  const reader = (url.searchParams.get("reader") || "").trim();

  if (key && key === context.env.ADMIN_KEY) {
    let notes = [];
    try {
      const q = await context.env.DB.prepare(
        "SELECT reader, chapter, chapter_title, note, updated_at FROM manuscript_notes ORDER BY updated_at DESC"
      ).all();
      notes = q.results || [];
    } catch (e) {}
    return json({ success: true, notes: notes });
  }

  const rid = (url.searchParams.get("rid") || "").trim();
  if (passHash === PASS_HASH && /^[a-f0-9]{16,64}$/.test(rid)) {
    let notes = [];
    try {
      const q = await context.env.DB.prepare(
        "SELECT chapter, chapter_title, note FROM manuscript_notes WHERE reader_key = ?"
      ).bind(rid).all();
      notes = q.results || [];
    } catch (e) {}
    return json({ success: true, notes: notes });
  }

  return json({ error: "Unauthorized" }, 403);
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  const passHash = body.pass_hash || "";
  const rid = (body.rid || "").trim();
  const reader = (body.reader || "").trim().slice(0, 60);
  const chapter = (body.chapter || "").trim().slice(0, 60);
  const chapterTitle = (body.chapter_title || "").trim().slice(0, 120);
  const note = String(body.note || "").slice(0, 8000);

  if (passHash !== PASS_HASH) return json({ error: "Unauthorized" }, 403);
  if (!/^[a-f0-9]{16,64}$/.test(rid)) return json({ error: "Missing reader id." }, 400);
  if (!reader || !chapter) return json({ error: "Missing reader or chapter." }, 400);

  try {
    await context.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS manuscript_notes (
        reader_key TEXT NOT NULL,
        chapter TEXT NOT NULL,
        reader TEXT NOT NULL,
        chapter_title TEXT DEFAULT '',
        note TEXT DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (reader_key, chapter)
      )
    `).run();
    if (note.trim()) {
      await context.env.DB.prepare(`
        INSERT INTO manuscript_notes (reader_key, chapter, reader, chapter_title, note, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(reader_key, chapter) DO UPDATE SET
          reader = excluded.reader,
          chapter_title = excluded.chapter_title,
          note = excluded.note,
          updated_at = datetime('now')
      `).bind(rid, chapter, reader, chapterTitle, note).run();
    } else {
      await context.env.DB.prepare(
        "DELETE FROM manuscript_notes WHERE reader_key = ? AND chapter = ?"
      ).bind(rid, chapter).run();
    }
  } catch (e) {
    return json({ error: "Could not save." }, 500);
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
