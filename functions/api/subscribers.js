// Admin-only endpoint to list (and remove) blog subscribers.
// Auth: pass ?key=<ADMIN_KEY> matching the env var.

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");

  if (key !== context.env.ADMIN_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const { results } = await context.env.DB.prepare(
    "SELECT id, email, created_at, unsubscribed_at FROM subscribers ORDER BY created_at DESC"
  ).all();

  const all = results || [];
  const active = all.filter(r => !r.unsubscribed_at);
  const unsubscribed = all.filter(r => r.unsubscribed_at);

  // Addresses Brevo has blocked: hard bounces and spam complaints. These
  // are the bad emails worth cleaning out of the list.
  let badEmails = [];
  if (context.env.BREVO_API_KEY) {
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/blockedContacts?limit=100&offset=0", {
        headers: { "api-key": context.env.BREVO_API_KEY, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        const activeSet = new Set(active.map(r => String(r.email || "").toLowerCase()));
        badEmails = (data.contacts || [])
          .map(c => ({ email: c.email, reason: c.reason && c.reason.code ? c.reason.code : "blocked", blocked_at: c.blockedAt || "" }))
          .filter(c => c.email && activeSet.has(String(c.email).toLowerCase()));
      }
    } catch (e) {}
  }

  return new Response(JSON.stringify({
    total: all.length,
    active_count: active.length,
    unsubscribed_count: unsubscribed.length,
    bad_count: badEmails.length,
    bad_emails: badEmails,
    subscribers: all,
  }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export async function onRequestDelete(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");
  const key = url.searchParams.get("key");

  if (!id || key !== context.env.ADMIN_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  await context.env.DB.prepare("DELETE FROM subscribers WHERE id = ?").bind(id).run();

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

// Re-activate an unsubscribed person (clear unsubscribed_at)
export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");
  const key = url.searchParams.get("key");
  const action = url.searchParams.get("action");

  if (!id || action !== "reactivate" || key !== context.env.ADMIN_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  await context.env.DB.prepare(
    "UPDATE subscribers SET unsubscribed_at = NULL WHERE id = ?"
  ).bind(id).run();

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
