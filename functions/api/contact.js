export async function onRequestPost(context) {
  const body = await context.request.json();
  const { name, email, reason, organization, message } = body;

  if (!name || !email || !message) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Store in D1 so Heather can see submissions
  await context.env.DB.prepare(
    "INSERT INTO contact_submissions (name, email, reason, organization, message) VALUES (?, ?, ?, ?, ?)"
  ).bind(name, email, reason || "", organization || "", message).run();

  // Send email via MailChannels (free on Cloudflare Workers)
  try {
    await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: "Heather@HeatherLynWilson.com", name: "Heather Wilson" }] }],
        from: { email: "noreply@heatherlynwilson.com", name: "HeatherLynWilson.com" },
        reply_to: { email: email, name: name },
        subject: "Contact Form: " + (reason || "New Message") + " from " + name,
        content: [{
          type: "text/plain",
          value: "Name: " + name + "\nEmail: " + email + "\nReason: " + (reason || "N/A") + "\nOrganization: " + (organization || "N/A") + "\n\nMessage:\n" + message
        }],
      }),
    });
  } catch (e) {
    // Email send failed but submission is saved in D1
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
