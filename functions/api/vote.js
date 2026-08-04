// Two truths and a lie votes (about page). The table is created on first
// use and everything is wrapped, so a missing table can never crash the
// page the way the comments table once did.
export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Bad request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const choice = parseInt(body.choice);

  if (!choice || choice < 1 || choice > 3) {
    return new Response(JSON.stringify({ error: "Invalid choice" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await context.env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS truth_votes (choice INTEGER PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0)"
    ).run();
    await context.env.DB.prepare(
      "INSERT INTO truth_votes (choice, count) VALUES (?, 1) ON CONFLICT(choice) DO UPDATE SET count = count + 1"
    ).bind(choice).run();

    const { results } = await context.env.DB.prepare(
      "SELECT choice, count FROM truth_votes"
    ).all();

    const votes = {};
    (results || []).forEach(function (r) { votes[r.choice] = r.count; });

    return new Response(JSON.stringify({ votes: votes }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Could not record your vote. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
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
