// heatherlynwilson.com/preorder: the short link the launch team puts in their
// posts. It counts the click, then sends the reader straight to Amazon.
//
// Posts that are already shared cannot be edited, so they point here rather
// than at Amazon. If the buy link ever changes, change PREORDER_URL and every
// post already out there follows it.
//
// Clicks land in favorite_clicks as "bts-preorder-link", next to the book
// page's own preorder buttons, so the admin dashboard shows them together.
// An optional ?s=instagram (or any short word) is kept on the item name.

const PREORDER_URL = "https://a.co/d/078SQHfT";

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const s = (url.searchParams.get("s") || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20);
  const item = "bts-preorder-link" + (s ? "-" + s : "");
  const ua = context.request.headers.get("user-agent") || "";
  // Link previews (Facebook, iMessage, Slack) fetch the link when a post is
  // written, which is not a person clicking.
  const isBot = /bot|spider|crawler|preview|facebookexternalhit|slack|whatsapp|curl|wget/i.test(ua);
  if (!isBot) {
    const DB = context.env.DB;
    const referrer = context.request.headers.get("referer") || "";
    // favorite_clicks already exists live, but nothing in the code creates
    // it, so make sure it is there rather than lose the click.
    const log = async () => {
      await DB.prepare(
        "CREATE TABLE IF NOT EXISTS favorite_clicks (id INTEGER PRIMARY KEY AUTOINCREMENT, item TEXT, url TEXT, referrer TEXT, created_at TEXT DEFAULT (datetime('now')))"
      ).run();
      await DB.prepare(
        "INSERT INTO favorite_clicks (item, url, referrer) VALUES (?, ?, ?)"
      ).bind(item, PREORDER_URL, referrer).run();
    };
    try { context.waitUntil(log().catch(() => {})); } catch (e) {}
  }
  return new Response(null, {
    status: 302,
    headers: { "Location": PREORDER_URL, "Cache-Control": "no-store" },
  });
}
