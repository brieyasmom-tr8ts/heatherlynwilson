// Give Thanks group cloud (Heather, October 28, 2026).
//
// POST /api/thanks-cloud  { email, token, day, share }   a reader turns sharing on or off
//                                                        for one day's three thanks
// GET  /api/thanks-cloud?email=&token=&mine=1             the days this reader has shared
// GET  /api/thanks-cloud?email=&token=&group=<id>         word counts for that group's cloud
//
// Sharing is off unless the reader ticks the box for that day. The group cloud
// only counts words from days marked shared, only by members of the group, and
// only for a reader who is in that group. It returns words and counts, never
// sentences, names or who wrote what.

const CHALLENGE = "november-thanks-2026";

// Small words that carry no meaning in a cloud. Kept in step with tkCloudWords()
// in challenge/js/thanks.js, which builds the reader's own cloud the same way.
const STOP = new Set(("a an and are as at in if be been being but by can could did do does doing for from had has have " +
  "having he her here hers him his how i i'm im is it it's its just me more most my myself no not now of on " +
  "one or our ours out over she so some such than that that's the their them then there these they this " +
  "those through to too up us very was we were what when where which while who whom why will with would " +
  "you your yours today day got get really also all about after again am any because before both each few " +
  "into off only other own same should until down being let lets thing things lot lots im ive i've").split(" "));

function wordCounts(lines) {
  const counts = {};
  for (const line of lines) {
    const words = String(line || "").toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/[^a-z' ]+/g, " ")
      .split(/\s+/)
      .map((w) => w.replace(/^'+|'+$/g, "").replace(/'s$/, ""))
      .filter((w) => w.length > 1 && !STOP.has(w));
    for (const w of words) counts[w] = (counts[w] || 0) + 1;
  }
  // "friend" and "friends" are one word in the cloud, under whichever form is used more.
  for (const w of Object.keys(counts)) {
    if (!w.endsWith("s") || w.endsWith("ss")) continue;
    const single = w.slice(0, -1);
    if (counts[single] && counts[w]) {
      const keep = counts[w] > counts[single] ? w : single;
      const drop = keep === w ? single : w;
      counts[keep] += counts[drop];
      delete counts[drop];
    }
  }
  return counts;
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Same check as challenge-journal.js.
async function verifyToken(email, token, secret) {
  if (!email || !token) return false;
  if (token === await hmacHex(secret, email + ":challenge:2027-07-01")) return true;
  return token === await hmacHex(secret, email + ":challenge:2026-10-01");
}

async function ensureTable(DB) {
  await DB.prepare(
    "CREATE TABLE IF NOT EXISTS gratitude_shares (email TEXT NOT NULL, challenge TEXT NOT NULL, day INTEGER NOT NULL, shared INTEGER NOT NULL DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (email, challenge, day))"
  ).run();
}

export async function onRequestPost(context) {
  let body = {};
  try { body = await context.request.json(); } catch (e) {}
  const email = String(body.email || "").trim().toLowerCase();
  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  if (!await verifyToken(email, body.token || "", secret)) return json({ error: "Unauthorized" }, 403);
  const day = parseInt(body.day, 10);
  if (!(day >= 1 && day <= 31)) return json({ error: "Invalid day" }, 400);
  await ensureTable(context.env.DB);
  await context.env.DB.prepare(
    "INSERT INTO gratitude_shares (email, challenge, day, shared, updated_at) VALUES (?, ?, ?, ?, datetime('now')) ON CONFLICT(email, challenge, day) DO UPDATE SET shared = excluded.shared, updated_at = datetime('now')"
  ).bind(email, CHALLENGE, day, body.share ? 1 : 0).run();
  return json({ success: true });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  if (!await verifyToken(email, url.searchParams.get("token") || "", secret)) return json({ error: "Unauthorized" }, 403);
  const DB = context.env.DB;
  await ensureTable(DB);

  if (url.searchParams.get("mine")) {
    const rows = (await DB.prepare(
      "SELECT day FROM gratitude_shares WHERE email = ? AND challenge = ? AND shared = 1"
    ).bind(email, CHALLENGE).all()).results || [];
    return json({ success: true, days: rows.map((r) => r.day) });
  }

  const groupId = String(url.searchParams.get("group") || "").trim().toLowerCase();
  if (!groupId) return json({ error: "Missing group" }, 400);
  const group = await DB.prepare("SELECT id FROM challenge_groups WHERE id = ? AND challenge = ?").bind(groupId, CHALLENGE).first();
  if (!group) return json({ error: "Group not found" }, 404);
  const member = await DB.prepare("SELECT 1 AS ok FROM group_members WHERE group_id = ? AND LOWER(email) = ?").bind(groupId, email).first();
  if (!member) return json({ error: "Not in this group" }, 403);

  const rows = (await DB.prepare(
    `SELECT j.email, j.stood_out FROM challenge_journal j
       INNER JOIN gratitude_shares s ON s.email = LOWER(j.email) AND s.challenge = j.challenge AND s.day = j.day AND s.shared = 1
       INNER JOIN group_members gm ON LOWER(gm.email) = LOWER(j.email) AND gm.group_id = ?
     WHERE j.challenge = ?`
  ).bind(groupId, CHALLENGE).all()).results || [];

  const sharers = new Set(rows.map((r) => String(r.email).toLowerCase()));
  const counts = wordCounts(rows.flatMap((r) => String(r.stood_out || "").split("\n")));
  const words = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 80).map(([w, n]) => ({ w, n }));
  return json({ success: true, sharers: sharers.size, words });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
