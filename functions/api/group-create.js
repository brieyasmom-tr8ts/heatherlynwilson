// POST /api/group-create - create a reading group and get an invite link

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateId() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let id = "";
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 8; i++) id += chars[arr[i] % chars.length];
  return id;
}

export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: "Invalid request." }, 400); }
  const email = (body.email || "").trim().toLowerCase();
  const token = body.token || "";
  const groupName = (body.name || "").trim().slice(0, 60);
  const challenge = body.challenge || "july-2026";

  // Auth
  const secret = context.env.NOTIFY_SECRET || "challenge-secret";
  const expected = await hmacHex(secret, email + ":challenge:2026-10-01");
  if (!email || token !== expected) {
    return json({ error: "Unauthorized" }, 403);
  }

  if (!groupName) {
    return json({ error: "Please give your group a name." }, 400);
  }

  // Look up the user's name and track from their signup
  const signup = await context.env.DB.prepare(
    "SELECT name, track FROM challenge_signups WHERE email = ? AND challenge = ?"
  ).bind(email, challenge).first();
  const userName = signup ? signup.name : "Friend";
  const userTrack = signup ? (signup.track || "") : "";

  // Create group (store the creator's track so invitees match)
  const groupId = generateId();
  await context.env.DB.prepare(
    "INSERT INTO challenge_groups (id, name, challenge, created_by_email, track) VALUES (?, ?, ?, ?, ?)"
  ).bind(groupId, groupName, challenge, email, userTrack).run();

  // Add creator as first member
  await context.env.DB.prepare(
    "INSERT OR IGNORE INTO group_members (group_id, email, name) VALUES (?, ?, ?)"
  ).bind(groupId, email, userName).run();

  const origin = new URL(context.request.url).origin;
  const challengeSlug = challenge === "august-james-2026" ? "challenge-james"
    : challenge === "september-beatitudes-2026" ? "challenge-beatitudes"
    : challenge === "october-proverbs-2026" ? "challenge-proverbs"
    : challenge === "november-thanks-2026" ? "challenge-thanks"
    : challenge === "december-gospels-2026" ? "challenge-gospels"
    : "challenge-bible";
  const inviteUrl = origin + "/" + challengeSlug + "?group=" + groupId;

  // Send group-created welcome email
  if (context.env.BREVO_API_KEY) {
    const notifySecret = context.env.NOTIFY_SECRET || "challenge-secret";
    const dashToken = await hmacHex(notifySecret, email + ":challenge:2026-10-01");
    const dashUrl = origin + "/challenge/dashboard.html?email=" + encodeURIComponent(email) + "&token=" + dashToken;
    const unsubToken = notifySecret ? await hmacHex(notifySecret, email) : "";
    const unsubUrl = unsubToken ? origin + "/api/unsubscribe?email=" + encodeURIComponent(email) + "&token=" + unsubToken : "";
    try {
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": context.env.BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: "Heather Lyn Wilson", email: "heather@heatherlynwilson.com" },
          to: [{ email: email, name: userName }],
          subject: "Your group \"" + groupName + "\" is ready! Here is your invite link.",
          htmlContent: buildGroupCreatedEmail(userName, groupName, groupId, inviteUrl, dashUrl, unsubUrl),
        }),
      });
    } catch (e) {}
  }

  return json({ success: true, group_id: groupId, invite_url: inviteUrl });
}

function buildGroupCreatedEmail(name, groupName, groupCode, inviteUrl, dashUrl, unsubUrl) {
  const greeting = name || "friend";
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
'<body style="margin:0;padding:0;background:#f7f4ee;font-family:Georgia,\'Times New Roman\',serif;">' +
'<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:40px 0;"><tr><td align="center">' +
'<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">' +

'<tr><td style="background:#1f2937;padding:28px 32px;">' +
'<span style="color:#ffffff;font-size:20px;font-family:Georgia,serif;letter-spacing:0.5px;">HeatherLynWilson.com</span>' +
'<span style="float:right;color:#c8a365;font-size:13px;font-family:-apple-system,sans-serif;font-weight:600;padding-top:4px;">DO IT WITH FRIENDS</span>' +
'</td></tr>' +

'<tr><td style="padding:36px 32px 12px;">' +
'<h1 style="margin:0 0 16px;font-size:24px;color:#1f2937;font-family:Georgia,serif;line-height:1.3;">Your group is ready, ' + greeting + '!</h1>' +
'<p style="margin:0 0 20px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">I love that you want to do this with people. Reading together changes everything. When someone else is counting on you to show up, you show up. And when you talk about what you are reading, it sticks.</p>' +
'</td></tr>' +

'<tr><td style="padding:0 32px 24px;">' +
'<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ef;border-radius:6px;">' +
'<tr><td style="padding:24px;">' +
'<p style="margin:0 0 6px;font-size:12px;color:#b85638;font-family:-apple-system,sans-serif;font-weight:600;letter-spacing:1px;text-transform:uppercase;">YOUR GROUP</p>' +
'<p style="margin:0 0 16px;font-size:18px;color:#1f2937;font-family:Georgia,serif;font-weight:600;">' + groupName + '</p>' +
'<p style="margin:0 0 6px;font-size:12px;color:#b85638;font-family:-apple-system,sans-serif;font-weight:600;letter-spacing:1px;text-transform:uppercase;">SHARE LINK</p>' +
'<p style="margin:0 0 16px;font-size:16px;font-family:-apple-system,sans-serif;"><a href="' + inviteUrl + '" style="color:#b85638;font-weight:600;word-break:break-all;">' + inviteUrl.replace("https://", "") + '</a></p>' +
'<p style="margin:0 0 6px;font-size:12px;color:#b85638;font-family:-apple-system,sans-serif;font-weight:600;letter-spacing:1px;text-transform:uppercase;">GROUP CODE</p>' +
'<p style="margin:0;font-size:22px;color:#1f2937;font-family:monospace;font-weight:700;letter-spacing:2px;">' + groupCode + '</p>' +
'</td></tr></table>' +
'</td></tr>' +

'<tr><td style="padding:0 32px 28px;">' +
'<p style="margin:0 0 16px;font-size:16px;color:#1f2937;line-height:1.7;font-family:-apple-system,sans-serif;font-weight:600;">Ways to invite people:</p>' +
'<table width="100%" cellpadding="0" cellspacing="0">' +
'<tr><td style="padding:6px 0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#9745; Text your share link to a friend right now</td></tr>' +
'<tr><td style="padding:6px 0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#9745; Drop it in your small group or Bible study chat</td></tr>' +
'<tr><td style="padding:6px 0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#9745; Post it on your Instagram story</td></tr>' +
'<tr><td style="padding:6px 0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#9745; Share it on Facebook with a personal note</td></tr>' +
'<tr><td style="padding:6px 0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#9745; Email it to that one person who came to mind just now</td></tr>' +
'<tr><td style="padding:6px 0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">&#9745; Tell your spouse, your sister, your neighbor</td></tr>' +
'</table>' +
'</td></tr>' +

'<tr><td style="padding:0 32px 28px;">' +
'<p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">When they click your link, they will land on the signup page with your group name at the top. They sign up, and they are in. You will get an email when each person joins.</p>' +
'<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">If someone is already signed up, they can join from their dashboard by entering your group code: <strong style="font-family:monospace;letter-spacing:1px;">' + groupCode + '</strong></p>' +
'</td></tr>' +

'<tr><td style="padding:0 32px 28px;" align="center">' +
'<a href="' + dashUrl + '" style="display:inline-block;padding:16px 36px;background:#b85638;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-family:-apple-system,sans-serif;font-weight:600;">Go to My Dashboard</a>' +
'</td></tr>' +

'<tr><td style="padding:0 32px 28px;">' +
'<p style="margin:0;font-size:16px;color:#4b5563;line-height:1.7;font-family:-apple-system,sans-serif;">Go get your people.</p>' +
'<p style="margin:12px 0 0;font-size:18px;color:#1f2937;font-style:italic;font-family:Georgia,serif;">Heather</p>' +
'</td></tr>' +

'<tr><td style="padding:24px 32px 32px;border-top:1px solid #e5e0d5;">' +
'<p style="margin:0;font-size:12px;color:#6b7280;font-family:-apple-system,sans-serif;line-height:1.5;">' +
'You are receiving this because you created a group at heatherlynwilson.com.' +
(unsubUrl ? ' <a href="' + unsubUrl + '" style="color:#6b7280;">Unsubscribe</a>.' : '') +
'</p></td></tr>' +

'</table></td></tr></table></body></html>';
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
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
