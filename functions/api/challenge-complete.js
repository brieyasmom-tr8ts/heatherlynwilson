// POST {email, token, challenge}
// Called by the dashboard when a reader finishes the last day of a challenge.
// Sends a one-time congratulations email via Brevo.
// Uses a challenge_completion_emails table to prevent duplicate sends.

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

// How many days each challenge runs. Used to confirm a reader really has
// every day marked off before the congratulations email goes out.
const CHALLENGE_TOTALS = {
  "july-2026": 31,
  "august-james-2026": 31,
  "september-beatitudes-2026": 30,
  "october-proverbs-2026": 31,
  "november-thanks-2026": 30,
  "december-gospels-2026": 31,
  // ABC is counted in verses learned, not days checked off, so its finish line
  // is the 21 verse letters. See countDone below.
  "abc-memory-2027": 21,
};

// The Bible challenge has 31-day and 3-month tracks under one id. The worker
// and the dashboard both work the real length out from the track; this check
// did not, so a 3-month reader only had to tick 31 days to pass a gate meant
// to prove they had done all 90.
function totalFor(challenge, track) {
  if (challenge === "july-2026" && String(track || "").endsWith("-90")) return 90;
  return CHALLENGE_TOTALS[challenge];
}

const CHALLENGE_META = {
  "july-2026": {
    name: "31-Day Bible Challenge",
    subject: "You finished the Bible challenge",
    body: (name, total) => `${name},\n\n${total || 31} days. You showed up every single one.\n\nThat kind of faithfulness does not happen by accident. You built something real.\n\nIf you want to keep going, there are more challenges waiting for you — One Book Deep in James, memorizing the Beatitudes, family devotionals in Proverbs, and more.\n\nHead to your dashboard to see what is next: https://heatherlynwilson.com/challenge/dashboard\n\nHeather`,
  },
  "august-james-2026": {
    name: "One Book Deep: James",
    subject: "You finished One Book Deep",
    body: (name) => `${name},\n\n31 days in James. Every single one.\n\nThere is something different about reading the same book day after day. You start hearing things you missed. That is what you just did.\n\nIf you want to keep going, Hide It In Your Heart starts in September — 30 days memorizing the Beatitudes. Or jump into the Bible challenge any time.\n\nYour dashboard: https://heatherlynwilson.com/challenge/dashboard\n\nHeather`,
  },
  "september-beatitudes-2026": {
    name: "Hide It In Your Heart",
    subject: "You finished Hide It In Your Heart",
    body: (name) => `${name},\n\nThirty days memorizing the Beatitudes. That Word is in you now. Not just read — remembered.\n\nAround the Table is next in October: one chapter of Proverbs a day, as a family. Or browse everything on your dashboard.\n\nhttps://heatherlynwilson.com/challenge/dashboard\n\nHeather`,
  },
  "october-proverbs-2026": {
    name: "Around the Table",
    subject: "You finished Around the Table",
    body: (name) => `${name},\n\n31 chapters of Proverbs. One for every day in October. That is a month of wisdom sitting at your table.\n\nGive Thanks is up next in November — a psalm a day and a gratitude list that will be ninety items long by Thanksgiving.\n\nYour dashboard: https://heatherlynwilson.com/challenge/dashboard\n\nHeather`,
  },
  "november-thanks-2026": {
    name: "Give Thanks",
    subject: "You finished Give Thanks",
    body: (name) => `${name},\n\n30 days of psalms and gratitude. Ninety things you were thankful for by the end.\n\nGod With Us is next in December — reading all four Gospels before Christmas. There is something special about sitting with the birth, life, death, and resurrection of Jesus right in that season.\n\nYour dashboard: https://heatherlynwilson.com/challenge/dashboard\n\nHeather`,
  },
  "december-gospels-2026": {
    name: "God With Us",
    subject: "You finished God With Us",
    body: (name) => `${name},\n\nThe Gospels in December. You made it all the way to Christmas with the whole story in front of you.\n\nWhenever you are ready for what is next, your dashboard has everything — Bible plans, James, memorization, and more.\n\nhttps://heatherlynwilson.com/challenge/dashboard\n\nHeather`,
  },
  "abc-memory-2027": {
    name: "ABC Memory Challenge",
    subject: "You finished the ABC Memory Challenge",
    body: (name) => `${name},\n\nTwenty-one verses. A to Y. All of them learned.\n\nYou did not cram them and you did not lose them. You took one letter at a time for eight weeks, and now they are yours. That is a library you carry everywhere, and nobody can take it off you.\n\nKeep saying them. A verse you review once a week stays for good.\n\nWhenever you are ready for what is next, your dashboard has everything.\n\nhttps://heatherlynwilson.com/challenge/dashboard\n\nHeather`,
  },
};

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const token = String(body.token || "");
    const challenge = String(body.challenge || "");

    if (!email || !token || !challenge) return json({ error: "Missing fields" }, 400);
    if (!CHALLENGE_META[challenge]) return json({ error: "Unknown challenge" }, 400);
    if (!(await verifyToken(context.env, email, token))) return json({ error: "Unauthorized" }, 401);

    const db = context.env.DB;

    // Confirm every day is actually checked off. The dashboard already checks
    // this, but the email says "you showed up every single one", so it must be
    // true no matter what the browser sends. Ticking only the last box is not
    // finishing.
    // The track decides the real length on the Bible challenge, so it has to be
    // read before the count, not after.
    let signupRow = null;
    try {
      signupRow = await db.prepare(
        "SELECT name, track FROM challenge_signups WHERE email = ? AND challenge = ?"
      ).bind(email, challenge).first();
    } catch (e) {}
    const track = (signupRow && signupRow.track) || "";

    const total = totalFor(challenge, track);
    if (total) {
      let done = 0;
      try {
        if (challenge === "abc-memory-2027") {
          // ABC never writes challenge_checkins. It records a status per letter,
          // and 2 means learned, so finishing is 21 learned verses.
          const row = await db.prepare(
            "SELECT COUNT(*) AS n FROM abc_progress WHERE email = ? AND status >= 2"
          ).bind(email).first();
          done = (row && row.n) || 0;
        } else {
          const row = await db.prepare(
            "SELECT COUNT(DISTINCT day) AS n FROM challenge_checkins WHERE email = ? AND challenge = ? AND day >= 1 AND day <= ?"
          ).bind(email, challenge, total).first();
          done = (row && row.n) || 0;
        }
      } catch (e) {
        // If the count cannot be read, do not send on a guess.
        return json({ ok: true, skipped: true, reason: "count unavailable" });
      }
      if (done < total) {
        return json({ ok: true, skipped: true, days_done: done, days_needed: total });
      }
    }

    // Create dedup table if needed
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS challenge_completion_emails (
        email TEXT NOT NULL,
        challenge TEXT NOT NULL,
        sent_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (email, challenge)
      )
    `).run();

    // Try to insert — if already exists, skip
    const result = await db.prepare(
      "INSERT OR IGNORE INTO challenge_completion_emails (email, challenge) VALUES (?, ?)"
    ).bind(email, challenge).run();

    if (!result.meta || result.meta.changes === 0) {
      // Already sent
      return json({ ok: true, skipped: true });
    }

    const name = (signupRow && signupRow.name) ? signupRow.name.split(" ")[0] : "friend";

    const meta = CHALLENGE_META[challenge];

    // The certificate was only reachable by going back to the dashboard and
    // scrolling to the bottom of a finished challenge, so most people never
    // found the thing they were promised. It goes in the email instead.
    const certUrl = "https://heatherlynwilson.com/challenge/certificate.html?email=" +
      encodeURIComponent(email) + "&token=" + encodeURIComponent(token) +
      "&challenge=" + encodeURIComponent(challenge);
    const bodyText = meta.body(name, total) +
      "\n\n---\n\nYour certificate is ready. Open it, print it, put it somewhere you will see it:\n" +
      certUrl;

    if (context.env.BREVO_API_KEY) {
      try {
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": context.env.BREVO_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: { name: "Heather Lyn Wilson", email: "heather@heatherlynwilson.com" },
            to: [{ email, name }],
            replyTo: { email: "heather@heatherlynwilson.com", name: "Heather Lyn Wilson" },
            subject: meta.subject,
            textContent: bodyText,
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          console.error("Brevo completion email failed:", res.status, err);
        }
      } catch (e) {
        console.error("Brevo completion email error:", e);
      }
    }

    return json({ ok: true });
  } catch (e) {
    console.error("challenge-complete error:", e);
    return json({ error: "failed" }, 500);
  }
}

async function verifyToken(env, email, token) {
  const secret = env.NOTIFY_SECRET || "challenge-secret";
  const expected = await hmacHex(secret, email + ":challenge:2027-07-01");
  if (token === expected) return true;
  const legacy = await hmacHex(secret, email + ":challenge:2026-10-01");
  return token === legacy;
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
