export async function onRequestPost(context) {
  const body = await context.request.json();
  const choice = parseInt(body.choice);

  if (!choice || choice < 1 || choice > 3) {
    return new Response(JSON.stringify({ error: "Invalid choice" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const key = "truth_vote_" + choice;
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
