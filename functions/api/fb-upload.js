// FB image upload API
// POST /api/fb-upload?key=ADMIN_KEY — upload image, returns URL
// GET  /api/fb-upload?id=123 — serve an uploaded image

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);

  try {
    const row = await context.env.DB.prepare("SELECT data, content_type FROM fb_images WHERE id = ?").bind(id).first();
    if (!row) return json({ error: "not found" }, 404);

    const binary = Uint8Array.from(atob(row.data), c => c.charCodeAt(0));
    return new Response(binary, {
      headers: {
        "Content-Type": row.content_type,
        "Cache-Control": "public, max-age=31536000",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) return json({ error: "Unauthorized" }, 401);

  try {
    const formData = await context.request.formData();
    const file = formData.get("image");
    if (!file) return json({ error: "no image provided" }, 400);

    // Max 2MB
    const MAX_SIZE = 2 * 1024 * 1024;
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > MAX_SIZE) return json({ error: "Image too large (max 2MB)" }, 400);

    // Encode in chunks: spreading a whole image into String.fromCharCode
    // blows the call stack on anything past ~100KB
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const CHUNK = 32768;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    const base64 = btoa(binary);
    const contentType = file.type || "image/png";
    const filename = file.name || "upload.png";

    const result = await context.env.DB.prepare(
      "INSERT INTO fb_images (filename, data, content_type) VALUES (?, ?, ?)"
    ).bind(filename, base64, contentType).run();

    const imageId = result.meta.last_row_id;
    const imageUrl = `https://heatherlynwilson.com/api/fb-upload?id=${imageId}`;

    return json({ success: true, id: imageId, url: imageUrl });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
