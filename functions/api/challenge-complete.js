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
};

const CHALLENGE_META = {
  "july-2026": {
    name: "31-Day Bible Challenge",
    subject: "You finished the Bible challenge",
    body: (name) => `${name},\n\n31 days. You showed up every single one.\n\nThat kind of faithfulness does not happen by accident. You built something real this month.\n\nIf you want to keep going, there are more challenges waiting for you — One Book Deep in James, memorizing the Beatitudes, family devotionals in Proverbs, and more.\n\nHead to your dashboard to see what is next: https://heatherlynwilson.com/challenge/dashboard\n\nHeather`,
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
    const total = CHALLENGE_TOTALS[challenge];
    if (total) {
      let done = 0;
      try {
        const row = await db.prepare(
          "SELECT COUNT(DISTINCT day) AS n FROM challenge_checkins WHERE email = ? AND challenge = ? AND day >= 1 AND day <= ?"
        ).bind(email, challenge, total).first();
        done = (row && row.n) || 0;
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

    // Get the reader's name
    const signup = await db.prepare(
      "SELECT name FROM challenge_signups WHERE email = ? AND challenge = ?"
    ).bind(email, challenge).first();
    const name = (signup && signup.name) ? signup.name.split(" ")[0] : "friend";

    const meta = CHALLENGE_META[challenge];

    // The certificate was only reachable by going back to the dashboard and
    // scrolling to the bottom of a finished challenge, so most people never
    // found the thing they were promised. It goes in the email instead.
    const certUrl = "https://heatherlynwilson.com/challenge/certificate.html?email=" +
      encodeURIComponent(email) + "&token=" + encodeURIComponent(token) +
      "&challenge=" + encodeURIComponent(challenge);
    const bodyText = meta.body(name) +
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
