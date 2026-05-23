export async function onRequestPost(context) {
  const body = await context.request.json();
  const email = (body.email || "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return new Response(JSON.stringify({ error: "Invalid email" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Save to D1
  try {
    await context.env.DB.prepare(
      "INSERT OR IGNORE INTO subscribers (email) VALUES (?)"
    ).bind(email).run();
  } catch (e) {
    // already subscribed, that's fine
  }

  // Email Heather via Brevo
  if (context.env.BREVO_API_KEY) {
    try {
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": context.env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "HeatherLynWilson.com", email: "Heather@HeatherLynWilson.com" },
          to: [{ email: "Heather@HeatherLynWilson.com", name: "Heather Wilson" }],
          subject: "New Subscriber: " + email,
          textContent: "Someone just subscribed to your site!\n\nEmail: " + email + "\nDate: " + new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
        }),
      });
    } catch (e) {}
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
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
