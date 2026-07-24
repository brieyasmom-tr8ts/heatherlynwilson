// Notes from the Built to Shine manuscript reader, saved per reader so
// Heather can read them in the admin dashboard and readers keep their notes
// across devices.
//
// POST { pass_hash, rid, reader, chapter, chapter_title, note }       - create a new note
// POST { pass_hash, rid, reader, chapter, chapter_title, note, id }   - update existing note
// DELETE { pass_hash, rid, id }                                        - delete a note
// GET  ?key=ADMIN_KEY          - all notes, newest first (admin)
// GET  ?pass_hash=...&rid=...  - that device's notes (sync)

const PASS_HASH = "c3fa377aff2ba553896eaeff28252495d31c0cf5b612cbaf506ab35a01c3ceec";

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS manuscript_notes_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reader_key TEXT NOT NULL,
    chapter TEXT NOT NULL,
    reader TEXT NOT NULL,
    chapter_title TEXT DEFAULT '',
    note TEXT DEFAULT '',
    highlight TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`;

// One-time migration: copy old table rows into v2 if they exist
async function ensureTable(DB) {
  await DB.prepare(ENSURE_TABLE).run();
  try { await DB.prepare("ALTER TABLE manuscript_notes_v2 ADD COLUMN highlight TEXT DEFAULT ''").run(); } catch (e) {}
  try {
    const old = await DB.prepare("SELECT reader_key, chapter, reader, chapter_title, note, updated_at FROM manuscript_notes LIMIT 1").first();
    if (old) {
      await DB.prepare(`
        INSERT OR IGNORE INTO manuscript_notes_v2 (reader_key, chapter, reader, chapter_title, note, created_at, updated_at)
        SELECT reader_key, chapter, reader, chapter_title, note, updated_at, updated_at FROM manuscript_notes
      `).run();
      await DB.prepare("DROP TABLE manuscript_notes").run();
    }
  } catch (e) { /* old table doesn't exist, that's fine */ }
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  const passHash = url.searchParams.get("pass_hash") || "";

  await ensureTable(context.env.DB);

  if (key && key === context.env.ADMIN_KEY) {
    let notes = [];
    try {
      const q = await context.env.DB.prepare(
        "SELECT id, reader, chapter, chapter_title, note, highlight, created_at, updated_at FROM manuscript_notes_v2 ORDER BY updated_at DESC"
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
        "SELECT id, chapter, chapter_title, note, highlight, created_at, updated_at FROM manuscript_notes_v2 WHERE reader_key = ? ORDER BY created_at ASC"
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
  const highlight = String(body.highlight || "").slice(0, 2000);
  const noteId = body.id != null ? parseInt(body.id, 10) : null;

  if (passHash !== PASS_HASH) return json({ error: "Unauthorized" }, 403);
  if (!/^[a-f0-9]{16,64}$/.test(rid)) return json({ error: "Missing reader id." }, 400);
  if (!reader || !chapter) return json({ error: "Missing reader or chapter." }, 400);
  if (!note.trim() && !highlight.trim()) return json({ error: "Note or highlight required." }, 400);

  await ensureTable(context.env.DB);

  try {
    if (noteId) {
      // Update existing note (only if it belongs to this reader)
      await context.env.DB.prepare(`
        UPDATE manuscript_notes_v2 SET note = ?, highlight = ?, updated_at = datetime('now')
        WHERE id = ? AND reader_key = ?
      `).bind(note, highlight, noteId, rid).run();
    } else {
      // Create new note
      await context.env.DB.prepare(`
        INSERT INTO manuscript_notes_v2 (reader_key, chapter, reader, chapter_title, note, highlight)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(rid, chapter, reader, chapterTitle, note, highlight).run();
    }
  } catch (e) {
    return json({ error: "Could not save." }, 500);
  }
  return json({ success: true });
}

export async function onRequestDelete(context) {
  const body = await context.request.json();
  const passHash = body.pass_hash || "";
  const rid = (body.rid || "").trim();
  const noteId = body.id != null ? parseInt(body.id, 10) : null;

  if (passHash !== PASS_HASH) return json({ error: "Unauthorized" }, 403);
  if (!/^[a-f0-9]{16,64}$/.test(rid)) return json({ error: "Missing reader id." }, 400);
  if (!noteId) return json({ error: "Missing note id." }, 400);

  await ensureTable(context.env.DB);

  try {
    await context.env.DB.prepare(
      "DELETE FROM manuscript_notes_v2 WHERE id = ? AND reader_key = ?"
    ).bind(noteId, rid).run();
  } catch (e) {
    return json({ error: "Could not delete." }, 500);
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
