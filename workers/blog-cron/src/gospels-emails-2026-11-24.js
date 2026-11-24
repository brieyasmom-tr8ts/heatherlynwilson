// God With Us email fixes, Heather, November 24, 2026.
// One-time task: runs once on the next cron tick after deploy (marker row in apology_log).
//
// Every find text is checked against the live email right before it is changed. An item whose
// find text is not there exactly once is skipped, not guessed at, and the skip is reported in
// /api/diag as "gospels email fixes". Each UPDATE also requires the field to still hold the
// value just read, so an edit Heather makes in the Email Editor at the same moment is never
// overwritten. Every row touched is copied to gospels_email_fix_backup first.
//
// Curly quotes are written as \u escapes on purpose: the editor has turned straight quotes
// into curly ones before, and the live text uses curly ones.

const MARKER = "__gospels_email_fixes_2026_11_24__";

// [label, plan, day, field, find, replace]. find must occur exactly once in the live field.
const FIND_REPLACE = [
  ["1a", "luke", 2, "body",
    "\n\nAdd this after what you already wrote:\n\n",
    "\n\n"],
  ["1b", "luke", 2, "body",
    "You get the Christmas story on December 2, and you will get to read it again with new eyes on Christmas Eve when you finish the book.",
    "You get the Christmas story on December 2, and you will get to read it again with new eyes on Christmas morning, when you have finished the book."],
  ["3", "luke", 24, "body",
    "Then uncover the final square on your Advent calendar and take one last step to carry what you have read beyond this month.",
    "Then uncover today’s square on your Advent calendar and take one step to carry what you have read beyond this month."],
  ["4", "luke", 28, "body",
    "everything lasting grows from there.\n\nHeather",
    "everything lasting grows from there.\n\nChapter 16 adds this: the Spirit is coming, and your sorrow will turn to joy.\n\nHeather"],
  ["5", "luke", 30, "body",
    "The cross and the empty tomb, John’s telling.\n\n",
    "The cross and the empty tomb, John’s telling.\n\nIf you have a few extra minutes, read John 18 first. It is the arrest and the trial, the night between His prayer and His cross.\n\n"],
  ["6", "gospels-drip", 7, "body",
    "And then Luke sits you down at the manger on Christmas Eve, when you know exactly who that baby is.",
    "And then Luke sits you down at the manger, when you know exactly who that baby is."],
  ["7s", "gospels-drip", 2, "subject",
    "Tomorrow: Mark, chapter one",
    "Tomorrow we start"],
  ["7b", "gospels-drip", 2, "body",
    "Tomorrow morning we start with Mark, the fastest gospel, and his favorite word: immediately.",
    "Tomorrow morning we start. If you are reading all four Gospels, you begin with Mark, the fastest gospel, and his favorite word: immediately. If you are reading Luke with me, you begin with an old priest, an angel, and a promise."],
];

// Item 2: Christmas week on the Luke track.
const NEW_DAY_25 = {
  subject: "Day 25: The manger, with new eyes",
  reading: "Luke 2",
  title: "The manger, with new eyes",
  focus: "Christmas Day",
  body: "Good morning.\n\nMerry Christmas.\n\nToday we go back to Luke 2, the chapter you read on December 2. When you read it then, the story was just beginning. Now you have read his whole life: his teaching, his miracles, his cross, his empty tomb, and two travelers on the Emmaus road whose hearts burned.\n\nRead the manger again. It does not read like a children's story anymore, does it?\n\nYou know exactly who was born.\n\nHeather",
};

// Day 26 is the current Day 25 body with its one Christmas-Day-only line taken out.
const DAY_26_REMOVE = "\n\nMerry Christmas.\n\n";
const NEW_DAY_26 = {
  subject: "Day 26: The Word became flesh",
  reading: "John 1",
  title: "The Word became flesh",
  focus: "A week in John",
};

// Day 27 blends the current Day 26 (John 13) and Day 27 (John 14) emails.
const NEW_DAY_27 = {
  subject: "Day 27: He washed their feet",
  reading: "John 13-14",
  title: "He washed their feet",
  focus: "A week in John",
  body: "Good morning.\n\n" +
    "This week, we sit with Jesus in the upper room.\n\n" +
    "John 13 tells us that Jesus knew He had come from God and was returning to God. He knew exactly who He was, and from that place of security, He picked up a towel and washed His disciples’ feet, even the feet of those who would fail Him.\n\n" +
    "Love looks like that. It does not always need a platform or recognition. Sometimes it kneels, serves, and does the work no one else wants to do.\n\n" +
    "Then, in John 14, He speaks to frightened friends on the night before the cross:\n\n" +
    "“Do not let your hearts be troubled.”\n\n" +
    "“I go to prepare a place for you.”\n\n" +
    "“I am the way and the truth and the life.”\n\n" +
    "“Peace I leave with you.”\n\n" +
    "He knew they would soon feel confused, alone, and afraid. So He gave them promises: a place, His presence, the Holy Spirit, and a peace the world could never give. These are not shallow words for easy days. They are strong enough to hold us when life feels uncertain.\n\n" +
    "Read both chapters slowly, and ask Him to show you what picking up the towel could look like in your own life.\n\n" +
    "Heather",
};

const FIELDS = ["subject", "reading", "title", "focus", "body"];

function countOf(hay, needle) {
  if (!hay || !needle) return 0;
  let n = 0, i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}

async function getRow(env, plan, day) {
  return env.DB.prepare(
    "SELECT plan, day, subject, reading, title, focus, body FROM challenge_emails WHERE plan = ? AND day = ?"
  ).bind(plan, day).first();
}

export async function gospelsEmailFixesOnce(env, diagPut) {
  if (!env.DB) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS apology_log (email TEXT PRIMARY KEY)").run();
  const ins = await env.DB.prepare("INSERT OR IGNORE INTO apology_log (email) VALUES (?)").bind(MARKER).run();
  if (!ins.meta || ins.meta.changes === 0) return;

  const out = [];
  try {
    // Backup first: every row this task can touch, as it is right now.
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS gospels_email_fix_backup (plan TEXT, day INTEGER, subject TEXT, reading TEXT, title TEXT, focus TEXT, body TEXT, saved_at TEXT)"
    ).run();
    const touched = [["luke", 2], ["luke", 24], ["luke", 25], ["luke", 26], ["luke", 27], ["luke", 28], ["luke", 30], ["gospels-drip", 2], ["gospels-drip", 7]];
    let backed = 0;
    for (const [plan, day] of touched) {
      const r = await getRow(env, plan, day);
      if (!r) continue;
      await env.DB.prepare(
        "INSERT INTO gospels_email_fix_backup (plan, day, subject, reading, title, focus, body, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))"
      ).bind(plan, day, r.subject || "", r.reading || "", r.title || "", r.focus || "", r.body || "").run();
      backed++;
    }
    out.push("backup " + backed + "/9");

    // Items 1, 3, 4, 5, 6, 7: exact find and replace.
    for (const [label, plan, day, field, find, repl] of FIND_REPLACE) {
      const r = await getRow(env, plan, day);
      const cur = r ? (r[field] || "") : null;
      if (cur === null) { out.push(label + " no row"); continue; }
      const n = countOf(cur, find);
      if (n !== 1) { out.push(label + " SKIP found " + n); continue; }
      const next = cur.replace(find, repl);
      const u = await env.DB.prepare(
        `UPDATE challenge_emails SET ${field} = ?, updated_at = datetime('now') WHERE plan = ? AND day = ? AND ${field} = ?`
      ).bind(next, plan, day, cur).run();
      out.push(label + (u.meta && u.meta.changes > 0 ? " ok" : " SKIP changed"));
    }

    // Item 2: (b) and (c) are built from the current rows before (a) overwrites Day 25.
    const d25 = await getRow(env, "luke", 25);
    const d26 = await getRow(env, "luke", 26);
    const d27 = await getRow(env, "luke", 27);
    if (!d25 || !d26 || !d27) {
      out.push("2 SKIP missing row");
    } else if (d25.reading !== "John 1" || d26.reading !== "John 13" || d27.reading !== "John 14") {
      out.push("2 SKIP readings not as expected");
    } else if (countOf(d25.body, DAY_26_REMOVE) !== 1 || countOf(d26.body, "picked up a towel") !== 1 || countOf(d27.body, "Peace I leave with you") !== 1) {
      out.push("2 SKIP body text not as expected");
    } else {
      const day26Body = d25.body.replace(DAY_26_REMOVE, "\n\n");
      const upd = (day, v, old) => env.DB.prepare(
        "UPDATE challenge_emails SET subject = ?, reading = ?, title = ?, focus = ?, body = ?, updated_at = datetime('now') " +
        "WHERE plan = 'luke' AND day = ? AND body = ? AND reading = ?"
      ).bind(v.subject, v.reading, v.title, v.focus, v.body, day, old.body, old.reading);
      const res = await env.DB.batch([
        upd(26, Object.assign({}, NEW_DAY_26, { body: day26Body }), d26),
        upd(27, NEW_DAY_27, d27),
        upd(25, NEW_DAY_25, d25),
      ]);
      const c = res.map(x => (x.meta && x.meta.changes) || 0);
      out.push("2b " + (c[0] ? "ok" : "SKIP changed") + ", 2c " + (c[1] ? "ok" : "SKIP changed") + ", 2a " + (c[2] ? "ok" : "SKIP changed"));
    }
  } catch (e) {
    out.push("exception: " + String(e.message || e).slice(0, 120));
  }
  await diagPut(env, "gospels email fixes", out.join(" | "));
}

// Exported so the change can be dry-run against a copy of the live text before deploy.
export const _forTest = { FIND_REPLACE, NEW_DAY_25, NEW_DAY_26, NEW_DAY_27, DAY_26_REMOVE, FIELDS };
