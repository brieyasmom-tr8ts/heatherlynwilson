export async function onRequestPost(context) {
  const body = await context.request.json();
  const { name, email, reason, organization, message } = body;

  if (!name || !email || !message) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify Turnstile
  const token = body["cf-turnstile-response"] || "";
  if (context.env.TURNSTILE_SECRET) {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(context.env.TURNSTILE_SECRET)}&response=${encodeURIComponent(token)}`,
    });
    const result = await res.json();
    if (!result.success) {
      return new Response(JSON.stringify({ error: "Captcha failed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Store in D1 so Heather can see submissions
  await context.env.DB.prepare(
    "INSERT INTO contact_submissions (name, email, reason, organization, message) VALUES (?, ?, ?, ?, ?)"
  ).bind(name, email, reason || "", organization || "", message).run();

  // Send email notification to Heather via Brevo
  if (context.env.BREVO_API_KEY) {
    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": context.env.BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "HeatherLynWilson.com", email: "Heather@HeatherLynWilson.com" },
        to: [{ email: "Heather@HeatherLynWilson.com", name: "Heather Wilson" }],
        replyTo: { email: email, name: name },
        subject: "Contact Form: " + (reason || "New Message") + " from " + name,
        textContent: "Name: " + name + "\nEmail: " + email + "\nReason: " + (reason || "N/A") + "\nOrganization: " + (organization || "N/A") + "\n\nMessage:\n" + message,
      }),
    });
    const brevoBody = await brevoRes.text();
    return new Response(JSON.stringify({ success: true, brevo_status: brevoRes.status, brevo_body: brevoBody }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, brevo_status: "no_key" }), {
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
