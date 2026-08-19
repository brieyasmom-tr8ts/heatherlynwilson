// Brevo webhook receiver. Brevo calls this when someone opens or clicks a
// transactional email; we remember the moment per address so the daily
// challenge emails can tell engaged readers from silent ones. Registered
// automatically by the cron worker (see brevoWebhookSetupOnce).
//
// Deliberately forgiving: unknown payloads are ignored, and the only thing
// an outsider could do by posting here is mark an address as engaged.

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return new Response("ok");
  }

  const event = String(body.event || "");
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return new Response("ok");

  const counts = ["unique_opened", "opened", "click", "proxy_open"];
  if (!counts.includes(event)) return new Response("ok");

  try {
    try {
      await context.env.DB.prepare("ALTER TABLE email_prefs ADD COLUMN last_engaged TEXT DEFAULT ''").run();
    } catch (e) {}
    await context.env.DB.prepare(
      "INSERT INTO email_prefs (email, last_engaged) VALUES (?, datetime('now')) ON CONFLICT(email) DO UPDATE SET last_engaged = datetime('now')"
    ).bind(email).run();
  } catch (e) {}

  return new Response("ok");
}
