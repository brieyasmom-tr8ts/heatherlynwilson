// Keeps Heather's Brevo list "Website Subscribers - Challenges and Blog" in
// step with the site. Added October 13, 2026, after the first import was done
// by hand from the admin export.
//
// Every run (at most every 20 minutes, from the cron worker):
//   - everyone who joined a challenge or the blog/book list and has not opted
//     out of anything is added to the list, or updated if their details changed
//   - people are taken off the list when they turn off "Announcements and
//     news" on the email settings page, turn off every email they were
//     getting (blog and every challenge they are in), or are on Brevo's own
//     block list (hard bounces, spam reports, unsubscribes from a link).
//   - turning off ONE kind of email does not take them off the list (Heather,
//     October 13: that is not opting out of everything). It takes that label
//     off instead, so an email in Brevo to blog readers, or to one
//     challenge's readers, skips them.
//   - PREFS_URL on each contact is their own email settings link, for the
//     footer of Brevo emails.
//   - each contact carries labels so Heather can email a group in Brevo:
//     BLOG_SUBSCRIBER, BOOK_LIST, CHALLENGES (names, readable) and one
//     yes/no per challenge (CH_...).
//
// Only people this list has a reason to hold are touched. Someone Heather
// added in Brevo by hand, who is not in the site database, is left alone.
// Nothing here ever un-blocks a contact: emailBlacklisted is never sent.
// Results go to /api/diag as counts only, because that endpoint is public.

export const BREVO_LIST_NAME = "Website Subscribers - Challenges and Blog";

// challenge id -> [Brevo attribute, readable name]. check_site.py fails the
// build if a challenge in the registry is missing here.
export const BREVO_CHALLENGES = {
  "july-2026": ["CH_BIBLE_READING", "Bible Reading Challenge"],
  "august-james-2026": ["CH_JAMES", "One Book Deep: James"],
  "obd-first-peter": ["CH_FIRST_PETER", "Living Hope: 1 Peter"],
  "september-beatitudes-2026": ["CH_BEATITUDES", "Hide It In Your Heart"],
  "october-proverbs-2026": ["CH_AROUND_THE_TABLE", "Around the Table"],
  "november-thanks-2026": ["CH_GIVE_THANKS", "Give Thanks"],
  "december-gospels-2026": ["CH_GOD_WITH_US", "God With Us"],
  "abc-memory-2027": ["CH_ABC_MEMORY", "ABC Memory Challenge"],
  "beginnings-genesis": ["CH_BEGINNINGS", "Beginnings: Genesis"],
};

const BOOL_ATTRS = ["BLOG_SUBSCRIBER", "BOOK_LIST", ...Object.values(BREVO_CHALLENGES).map(v => v[0])];
const TEXT_ATTRS = ["CHALLENGES", "PREFS_URL"];
const ATTRS_VERSION = "attrs_v2";   // bump when an attribute is added

const RUN_EVERY_MS = 20 * 60 * 1000;
const MAX_UPSERTS_PER_RUN = 200;   // first run finishes over a few ticks
const REMOVE_CHUNK = 150;          // Brevo's limit per remove call

// Addresses that cannot be real, so they never go in. The first hand import
// held out typos like "gmail.vom" and Heather's test rows.
const BIG_PROVIDERS = /^(gmail|googlemail|hotmail|icloud|aol|outlook|live|msn|yahoo|comcast|verizon)\.(con|vom|cpm|xom|cim|comm|co|om|cm|cmo|ocm|cmm|coom|c|ccom)$/;
const TYPO_DOMAINS = new Set([
  "gmial.com", "gmal.com", "gamil.com", "gnail.com", "gmaill.com", "gmali.com", "gmai.com", "gmail.cm",
  "yaho.com", "yahooo.com", "yhoo.com", "hotmal.com", "hotmial.com", "iclod.com", "icoud.com", "outlok.com",
  "example.com", "example.org", "example.net", "test.com",
]);
const HEATHER_ADDRS = new Set(["brieyasmom@gmail.com", "heather@givesendgo.com", "heather@heatherlynwilson.com"]);

export function brevoAddressProblem(email) {
  const m = /^([^@\s]+)@([^@\s]+\.[a-z]{2,})$/i.exec(email);
  if (!m) return "bad";
  const local = m[1], domain = m[2].toLowerCase();
  if (BIG_PROVIDERS.test(domain) || TYPO_DOMAINS.has(domain) || domain.endsWith(".test")) return "bad";
  // Heather's own address with a +tag is one of her test signups.
  if (local.includes("+") && HEATHER_ADDRS.has(local.split("+")[0].toLowerCase() + "@" + domain)) return "test";
  return "";
}

const norm = (e) => String(e || "").trim().toLowerCase();

async function brevo(env, method, path, body) {
  const res = await fetch("https://api.brevo.com/v3" + path, {
    method,
    headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", "Accept": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { const t = await res.text(); data = t ? JSON.parse(t) : null; } catch (e) {}
  return { status: res.status, ok: res.ok, data };
}

async function stateGet(env, k) {
  try { const r = await env.DB.prepare("SELECT v FROM brevo_sync_state WHERE k = ?").bind(k).first(); return r ? r.v : null; } catch (e) { return null; }
}
async function stateSet(env, k, v) {
  await env.DB.prepare("INSERT INTO brevo_sync_state (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, String(v)).run();
}

async function findListId(env) {
  for (let offset = 0; offset < 500; offset += 50) {
    const r = await brevo(env, "GET", "/contacts/lists?limit=50&offset=" + offset);
    if (!r.ok) return { error: "lists HTTP " + r.status };
    const lists = (r.data && r.data.lists) || [];
    const hit = lists.find(l => String(l.name || "").trim().toLowerCase() === BREVO_LIST_NAME.toLowerCase());
    if (hit) return { id: hit.id };
    if (lists.length < 50) break;
  }
  return { error: "list not found" };
}

async function ensureAttributes(env) {
  let made = 0, existed = 0, failed = 0;
  const want = [...BOOL_ATTRS.map(a => [a, "boolean"]), ...TEXT_ATTRS.map(a => [a, "text"])];
  for (const [name, type] of want) {
    const r = await brevo(env, "POST", "/contacts/attributes/normal/" + name, { type });
    if (r.ok) made++;
    else if (r.status === 400 && /exist/i.test(JSON.stringify(r.data || ""))) existed++;
    else failed++;
  }
  return { made, existed, failed };
}

// Who should be on the list, who should be off it, and why.
async function buildWanted(env, loadBlockedEmails, prefsUrl) {
  const rows = async (sql) => { try { return (await env.DB.prepare(sql).all()).results || []; } catch (e) { return []; } };
  const people = new Map();
  const person = (e) => {
    if (!people.has(e)) people.set(e, { name: "", chs: new Set(), blog: false, blogUnsub: false, book: false });
    return people.get(e);
  };
  for (const r of await rows("SELECT email, name, challenge FROM challenge_signups ORDER BY created_at")) {
    const e = norm(r.email); if (!e) continue;
    const p = person(e);
    p.chs.add(r.challenge || "july-2026");
    if (r.name && String(r.name).trim()) p.name = String(r.name).trim();
  }
  for (const r of await rows("SELECT email, unsubscribed_at FROM subscribers")) {
    const e = norm(r.email); if (!e) continue;
    const p = person(e);
    if (r.unsubscribed_at) p.blogUnsub = true; else p.blog = true;
  }
  for (const r of await rows("SELECT email FROM subscriber_lists WHERE list = 'built-to-shine'")) {
    const e = norm(r.email); if (e && people.has(e)) people.get(e).book = true;
  }
  const announceOff = new Set((await rows("SELECT email FROM email_prefs WHERE announce_optout = 1")).map(r => norm(r.email)));
  const optAll = new Set((await rows("SELECT email FROM email_prefs WHERE challenge_optout = 1")).map(r => norm(r.email)));
  const optPair = new Set((await rows("SELECT email, challenge FROM challenge_email_optouts")).map(r => norm(r.email) + "|" + r.challenge));
  const blocked = await loadBlockedEmails(env);

  const on = new Map(), off = new Set();
  const why = { announceOff: 0, everythingOff: 0, brevoBlocked: 0, blogOffKept: 0, oneOff: 0, bad: 0, test: 0 };
  for (const [e, p] of people) {
    const prob = brevoAddressProblem(e);
    if (prob) { why[prob]++; continue; }
    // Which challenges they still get emails for. The old "all challenge
    // emails off" flag mutes every one of them.
    const live = [...p.chs].filter(id => !optAll.has(e) && !optPair.has(e + "|" + id));
    const everythingOff = !p.blog && live.length === 0;
    if (announceOff.has(e) || everythingOff || blocked.has(e)) {
      if (announceOff.has(e)) why.announceOff++;
      else if (blocked.has(e)) why.brevoBlocked++;
      else why.everythingOff++;
      off.add(e);
      continue;
    }
    if (p.blogUnsub) why.blogOffKept++;
    if (live.length < p.chs.size) why.oneOff++;
    const attrs = { BLOG_SUBSCRIBER: p.blog, BOOK_LIST: p.book };
    const names = [];
    for (const [id, [attr, label]] of Object.entries(BREVO_CHALLENGES)) {
      attrs[attr] = live.includes(id);
      if (attrs[attr]) names.push(label);
    }
    attrs.CHALLENGES = names.join(", ");
    if (p.name) attrs.FIRSTNAME = p.name.split(/\s+/)[0];
    const link = prefsUrl ? await prefsUrl(e) : "";
    if (link) attrs.PREFS_URL = link;
    on.set(e, attrs);
  }
  return { on, off, why, total: people.size };
}

export async function brevoListSync(env, { loadBlockedEmails, diagPut, prefsUrl }) {
  if (!env.BREVO_API_KEY || !env.DB) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS brevo_sync_state (k TEXT PRIMARY KEY, v TEXT)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS brevo_sync (email TEXT PRIMARY KEY, state TEXT, hash TEXT, at TEXT DEFAULT (datetime('now')))").run();

  const last = Number(await stateGet(env, "last_run") || 0);
  if (Date.now() - last < RUN_EVERY_MS) return;
  await stateSet(env, "last_run", Date.now());

  const found = await findListId(env);
  if (!found.id) { await diagPut(env, "brevo sync", "stopped: " + found.error + " (\"" + BREVO_LIST_NAME + "\")"); return; }
  const listId = found.id;

  if (await stateGet(env, ATTRS_VERSION) !== "done") {
    const a = await ensureAttributes(env);
    await diagPut(env, "brevo sync labels", "made " + a.made + ", already there " + a.existed + ", failed " + a.failed);
    if (a.failed) return;   // try again next run rather than send labels Brevo would drop
    await stateSet(env, ATTRS_VERSION, "done");
  }

  const { on, off, why, total } = await buildWanted(env, loadBlockedEmails, prefsUrl);
  const prev = new Map();
  for (const r of ((await env.DB.prepare("SELECT email, state, hash FROM brevo_sync").all()).results || [])) prev.set(r.email, r);

  // Removals first, so an opt-out never waits behind a long run of adds.
  const toRemove = [...off].filter(e => { const p = prev.get(e); return !p || p.state !== "off"; });
  let removed = 0, removeErr = 0;
  for (let i = 0; i < toRemove.length; i += REMOVE_CHUNK) {
    const chunk = toRemove.slice(i, i + REMOVE_CHUNK);
    const r = await brevo(env, "POST", "/contacts/lists/" + listId + "/contacts/remove", { emails: chunk });
    // 400 here means none of them were on the list, which is the goal.
    const fine = r.ok || (r.status === 400 && /removed|not exist|does not/i.test(JSON.stringify(r.data || "")));
    if (!fine) { removeErr++; continue; }
    if (r.ok && r.data && r.data.contacts && Array.isArray(r.data.contacts.success)) removed += r.data.contacts.success.length;
    for (const e of chunk) {
      await env.DB.prepare("INSERT INTO brevo_sync (email, state, hash, at) VALUES (?, 'off', '', datetime('now')) ON CONFLICT(email) DO UPDATE SET state = 'off', hash = '', at = datetime('now')").bind(e).run();
    }
  }

  const toUpsert = [];
  for (const [e, attrs] of on) {
    const hash = JSON.stringify([listId, attrs]);
    const p = prev.get(e);
    if (p && p.hash === hash && (p.state === "on" || p.state === "rejected")) continue;
    toUpsert.push([e, attrs, hash]);
  }
  let added = 0, upErr = 0, rejected = 0;
  for (const [e, attrs, hash] of toUpsert.slice(0, MAX_UPSERTS_PER_RUN)) {
    // updateEnabled: create or update. emailBlacklisted is deliberately not
    // sent, so a contact Brevo has blocked stays blocked.
    const r = await brevo(env, "POST", "/contacts", { email: e, attributes: attrs, listIds: [listId], updateEnabled: true });
    if (r.ok) {
      added++;
      await env.DB.prepare("INSERT INTO brevo_sync (email, state, hash, at) VALUES (?, 'on', ?, datetime('now')) ON CONFLICT(email) DO UPDATE SET state = 'on', hash = excluded.hash, at = datetime('now')").bind(e, hash).run();
    } else if (r.status === 400) {
      // Brevo refused the address itself. Remember it so it is not retried
      // every run; a change in their details tries again.
      rejected++;
      await env.DB.prepare("INSERT INTO brevo_sync (email, state, hash, at) VALUES (?, 'rejected', ?, datetime('now')) ON CONFLICT(email) DO UPDATE SET state = 'rejected', hash = excluded.hash, at = datetime('now')").bind(e, hash).run();
    } else {
      upErr++;
      if (r.status === 429) break;   // rate limited: stop, next run picks up
    }
  }
  const waiting = Math.max(0, toUpsert.length - added - rejected);

  // Two rows because each diag value is cut at 300 characters.
  await diagPut(env, "brevo sync",
    "list " + listId + " | people " + total + ", should be on " + on.size + ", off " + off.size +
    " | this run: added/updated " + added + ", removed " + removed + " of " + toRemove.length + " checked" +
    ", Brevo refused " + rejected + ", errors " + (upErr + removeErr) + ", still to do " + waiting);
  await diagPut(env, "brevo sync reasons",
    "off because: announcements off " + why.announceOff + ", everything off " + why.everythingOff +
    ", Brevo blocked " + why.brevoBlocked +
    " | kept on with a label off: blog off " + why.blogOffKept + ", a challenge off " + why.oneOff +
    " | never added: bad address " + why.bad + ", test " + why.test);
}
