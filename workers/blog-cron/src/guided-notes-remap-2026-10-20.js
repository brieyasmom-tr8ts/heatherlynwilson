// One-time task: move Guided reader notes to the right chapter after the book
// was split into 42 chapters on October 20, 2026.
//
// Notes are saved against a chapter id ("ch12"). Every time Heather merged or
// split chapters, the ids shifted, so a note left on the old Chapter 12 now
// shows under a different part of the book. For each Guided note saved before
// the 42-chapter version went live:
//
//   1. If it has highlighted text (or the paragraph it came from), find that
//      text in the live /guided page and use the chapter it is in now.
//   2. Otherwise (a whole-chapter note), use the chapter layout that was live
//      when the note was written, mapped to today's chapters. The maps below
//      come from matching each old chapter's opening paragraphs against the
//      current text, so a chapter that was later split maps to the new
//      chapter holding its start.
//
// The old chapter of every moved note is kept in guided_notes_remap_backup so
// the move can be undone. Reports counts only to diag_log (it is public).

const MARKER = "__guided_notes_remap_2026_10_20__";
const CUTOFF = "2026-10-20 11:49:40"; // 42-chapter version went live

// Chapter layouts, oldest first: each applies from its time until the next.
const LAYOUTS = [
  { from: "2026-10-16 16:53:13", map: { 9: 8, 12: 13, 13: 14, 14: 16, 15: 18, 16: 20, 17: 21, 18: 23, 19: 24, 20: 26, 21: 28, 22: 28, 23: 30, 24: 33, 25: 34, 26: 38, 27: 40 } },
  { from: "2026-10-16 21:13:44", map: { 9: 10, 10: 11, 11: 13, 12: 14, 13: 16, 14: 18, 15: 20, 16: 21, 17: 23, 18: 24, 19: 26, 20: 28, 21: 28, 22: 30, 23: 33, 24: 34, 25: 38, 26: 40 } },
  { from: "2026-10-17 17:02:59", map: { 9: 10, 10: 11, 11: 13, 12: 14, 13: 16, 14: 18, 15: 20, 16: 21, 17: 23, 18: 24, 19: 26, 20: 28, 21: 28, 22: 30, 23: 32, 24: 33, 25: 34, 26: 38, 27: 40 } },
  { from: "2026-10-17 18:20:24", map: { 9: 10, 10: 11, 11: 13, 12: 14, 13: 16, 14: 18, 15: 20, 16: 21, 17: 23, 18: 24, 19: 26, 20: 28, 21: 28, 22: 30, 23: 32, 24: 33, 25: 34, 26: 37, 27: 38, 28: 40 } },
  { from: "2026-10-20 10:14:24", map: { 9: 10, 10: 11, 11: 13, 12: 14, 13: 16, 14: 18, 15: 20, 16: 21, 17: 23, 18: 24, 19: 26, 20: 28, 21: 30, 22: 32, 23: 33, 24: 34, 25: 37, 26: 38, 27: 40 } },
];

function norm(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chapterTexts(page) {
  const main = page.slice(page.indexOf("<main"), page.indexOf("</main>"));
  const re = /<div class="chapter" id="(ch\d+)">/g;
  const starts = [];
  let m;
  while ((m = re.exec(main))) starts.push([m.index, m[1]]);
  return starts.map(([at, id], i) => {
    const end = i + 1 < starts.length ? starts[i + 1][0] : main.length;
    return { id, text: norm(main.slice(at, end).replace(/<br\s*\/?>/g, " ")) };
  });
}

function findByText(chapters, s) {
  const n = norm(s);
  if (n.length < 12) return null;
  const probe = n.slice(0, 160);
  const hit = chapters.find((c) => c.text.includes(probe));
  return hit ? hit.id : null;
}

function findByLayout(createdAt, chapter) {
  const num = parseInt(String(chapter || "").replace(/^ch/, ""), 10);
  if (!num) return null;
  let layout = null;
  for (const l of LAYOUTS) if (String(createdAt) >= l.from) layout = l;
  if (!layout) layout = LAYOUTS[0];
  const to = layout.map[num] || num; // chapters not listed kept their number
  return "ch" + to;
}

export async function remapGuidedNotesOnce(env) {
  if (!env.DB) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS apology_log (email TEXT PRIMARY KEY)").run();
  const done = await env.DB.prepare("SELECT email FROM apology_log WHERE email = ?").bind(MARKER).first();
  if (done) return;
  const put = async (v) => {
    try {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS diag_log (k TEXT PRIMARY KEY, v TEXT, at TEXT)").run();
      await env.DB.prepare(
        "INSERT INTO diag_log (k, v, at) VALUES ('guided notes remap', ?, datetime('now')) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = datetime('now')"
      ).bind(String(v).slice(0, 300)).run();
    } catch (e) {}
  };

  // Today's chapters, from the live page, so the match is against what readers see.
  let chapters;
  try {
    const r = await fetch("https://heatherlynwilson.com/guided", { headers: { "Cache-Control": "no-cache" } });
    chapters = chapterTexts(await r.text());
  } catch (e) {
    await put("could not load /guided, will retry");
    return;
  }
  if (chapters.length !== 42) {
    await put("found " + chapters.length + " chapters, expected 42; not changing anything");
    return;
  }
  const titleOf = (id) => "Chapter " + id.replace(/^ch/, "");

  let rows = [];
  try {
    const q = await env.DB.prepare(
      "SELECT id, chapter, chapter_title, highlight, paragraph_text, created_at FROM manuscript_notes_v2 WHERE COALESCE(book, 'built-to-shine') = 'guided' AND created_at < ?"
    ).bind(CUTOFF).all();
    rows = q.results || [];
  } catch (e) {
    await put("notes table not readable, will retry");
    return;
  }

  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS guided_notes_remap_backup (note_id INTEGER PRIMARY KEY, old_chapter TEXT, old_title TEXT, new_chapter TEXT, how TEXT, at TEXT DEFAULT (datetime('now')))"
  ).run();

  let byText = 0, byLayout = 0, same = 0, unknown = 0;
  for (const n of rows) {
    let to = findByText(chapters, n.highlight) || findByText(chapters, n.paragraph_text);
    let how = to ? "text" : "layout";
    if (!to) to = findByLayout(n.created_at, n.chapter);
    if (!to || !chapters.some((c) => c.id === to)) { unknown++; continue; }
    if (to === n.chapter && titleOf(to) === (n.chapter_title || "")) { same++; continue; }
    await env.DB.prepare(
      "INSERT OR IGNORE INTO guided_notes_remap_backup (note_id, old_chapter, old_title, new_chapter, how) VALUES (?, ?, ?, ?, ?)"
    ).bind(n.id, n.chapter || "", n.chapter_title || "", to, how).run();
    await env.DB.prepare("UPDATE manuscript_notes_v2 SET chapter = ?, chapter_title = ? WHERE id = ?")
      .bind(to, titleOf(to), n.id).run();
    if (how === "text") byText++; else byLayout++;
  }

  await env.DB.prepare("INSERT OR IGNORE INTO apology_log (email) VALUES (?)").bind(MARKER).run();
  await put(
    "done: " + rows.length + " Guided notes checked; moved " + byText + " by highlighted text, " +
    byLayout + " by old chapter layout; " + same + " already right; " + unknown + " left alone"
  );
}
