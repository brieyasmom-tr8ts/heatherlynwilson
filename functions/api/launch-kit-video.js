// Launch team video testimonials. Phone videos run to hundreds of MB, far past
// what one request can carry, so the page sends each file in 10MB pieces and
// R2's multipart upload stitches them back together.
//
// Needs an R2 bucket bound to the Pages project as LAUNCH_MEDIA. Until that
// binding exists every call answers { error, video_ready: false } and the page
// shows "video uploads open soon" instead of a broken upload box.
//
// POST { action: "start", pass_hash, rid, filename, content_type, size, prompt } -> { id, upload_id }
// PUT  ?id=&upload_id=&part=N&pass_hash=&rid=   (body = the piece)             -> { etag }
// POST { action: "complete", pass_hash, rid, id, upload_id, parts: [{partNumber, etag}] }
// POST { action: "abort", pass_hash, rid, id, upload_id }
// DELETE { pass_hash, rid, id }                 - reader removes their own video
// DELETE ?key=ADMIN_KEY { id }                  - Heather removes one
// GET  ?id=&key=ADMIN_KEY[&download=1]          - play or download (supports Range)

import { ensureTables, json } from "./launch-kit.js";

const PASS_HASH = "c3fa377aff2ba553896eaeff28252495d31c0cf5b612cbaf506ab35a01c3ceec";
const RID_RE = /^[a-f0-9]{16,64}$/;
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024; // 1GB, about 5 minutes of 4K phone video
const MAX_VIDEOS_PER_READER = 6;
const MAX_PART_BYTES = 50 * 1024 * 1024; // the page sends 10MB; this is headroom

function notReady() {
  return json({ error: "Video uploads are not switched on yet.", video_ready: false }, 503);
}

function extFor(filename, ct) {
  const m = /\.([a-z0-9]{2,5})$/i.exec(filename || "");
  if (m) return m[1].toLowerCase();
  if (/quicktime/.test(ct)) return "mov";
  if (/webm/.test(ct)) return "webm";
  return "mp4";
}

export async function onRequestPost(context) {
  const { env } = context;
  if (!env.LAUNCH_MEDIA) return notReady();
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: "Bad request." }, 400); }
  const rid = String(body.rid || "").trim();
  if (body.pass_hash !== PASS_HASH || !RID_RE.test(rid)) return json({ error: "Unauthorized" }, 403);
  await ensureTables(env.DB);

  if (body.action === "start") {
    const sub = await env.DB.prepare("SELECT permission FROM launch_kit_submissions WHERE rid = ?").bind(rid).first();
    if (!sub || !sub.permission) return json({ error: "Please save your details and tick the permission box first." }, 400);
    const ct = String(body.content_type || "");
    const filename = String(body.filename || "video").slice(0, 200);
    const size = parseInt(body.size, 10) || 0;
    if (ct && !/^video\//.test(ct)) return json({ error: "That file is not a video." }, 400);
    if (size > MAX_VIDEO_BYTES) return json({ error: "That video is over 1GB. Try a shorter one, or film at 1080p instead of 4K." }, 400);
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM launch_kit_videos WHERE rid = ? AND status = 'ready'"
    ).bind(rid).first();
    if (count && count.n >= MAX_VIDEOS_PER_READER) return json({ error: "You have sent " + MAX_VIDEOS_PER_READER + " videos, which is the limit. Remove one to send another." }, 400);

    const rand = crypto.getRandomValues(new Uint8Array(6)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
    const r2Key = "launch-team/" + rid + "/" + Date.now() + "-" + rand + "." + extFor(filename, ct);
    const mpu = await env.LAUNCH_MEDIA.createMultipartUpload(r2Key, {
      httpMetadata: { contentType: ct || "video/mp4" },
    });
    const res = await env.DB.prepare(
      "INSERT INTO launch_kit_videos (rid, r2_key, upload_id, filename, content_type, size, prompt) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(rid, r2Key, mpu.uploadId, filename, ct || "video/mp4", size, String(body.prompt || "").slice(0, 300)).run();
    return json({ success: true, id: res.meta.last_row_id, upload_id: mpu.uploadId });
  }

  const id = parseInt(body.id, 10);
  const row = id ? await env.DB.prepare("SELECT * FROM launch_kit_videos WHERE id = ? AND rid = ?").bind(id, rid).first() : null;
  if (!row || row.upload_id !== body.upload_id) return json({ error: "Upload not found." }, 404);
  const mpu = env.LAUNCH_MEDIA.resumeMultipartUpload(row.r2_key, row.upload_id);

  if (body.action === "complete") {
    const parts = Array.isArray(body.parts) ? body.parts.map((p) => ({ partNumber: parseInt(p.partNumber, 10), etag: String(p.etag) })) : [];
    if (!parts.length) return json({ error: "No video pieces arrived." }, 400);
    try {
      const obj = await mpu.complete(parts);
      await env.DB.prepare("UPDATE launch_kit_videos SET status = 'ready', size = ? WHERE id = ?").bind(obj.size || row.size, id).run();
      await env.DB.prepare("UPDATE launch_kit_submissions SET updated_at = datetime('now') WHERE rid = ?").bind(rid).run();
    } catch (e) {
      return json({ error: "The video could not be put back together. Please try again." }, 500);
    }
    return json({ success: true });
  }

  if (body.action === "abort") {
    try { await mpu.abort(); } catch (e) {}
    await env.DB.prepare("DELETE FROM launch_kit_videos WHERE id = ?").bind(id).run();
    return json({ success: true });
  }

  return json({ error: "Unknown action." }, 400);
}

export async function onRequestPut(context) {
  const { env, request } = context;
  if (!env.LAUNCH_MEDIA) return notReady();
  const url = new URL(request.url);
  const rid = (url.searchParams.get("rid") || "").trim();
  if (url.searchParams.get("pass_hash") !== PASS_HASH || !RID_RE.test(rid)) return json({ error: "Unauthorized" }, 403);
  const id = parseInt(url.searchParams.get("id"), 10);
  const part = parseInt(url.searchParams.get("part"), 10);
  const uploadId = url.searchParams.get("upload_id") || "";
  if (!id || !(part >= 1 && part <= 10000)) return json({ error: "Bad piece." }, 400);
  const len = parseInt(request.headers.get("content-length") || "0", 10);
  if (!len || len > MAX_PART_BYTES) return json({ error: "Bad piece size." }, 400);

  await ensureTables(env.DB);
  const row = await env.DB.prepare("SELECT r2_key, upload_id, status FROM launch_kit_videos WHERE id = ? AND rid = ?").bind(id, rid).first();
  if (!row || row.upload_id !== uploadId || row.status !== "uploading") return json({ error: "Upload not found." }, 404);

  try {
    const mpu = env.LAUNCH_MEDIA.resumeMultipartUpload(row.r2_key, row.upload_id);
    const uploaded = await mpu.uploadPart(part, request.body);
    return json({ success: true, etag: uploaded.etag, partNumber: uploaded.partNumber });
  } catch (e) {
    return json({ error: "That piece did not save." }, 500);
  }
}

export async function onRequestDelete(context) {
  const { env } = context;
  const url = new URL(context.request.url);
  let body = {};
  try { body = await context.request.json(); } catch (e) {}
  const id = parseInt(body.id, 10);
  if (!id) return json({ error: "id required" }, 400);
  await ensureTables(env.DB);

  const key = url.searchParams.get("key");
  let row;
  if (key && key === env.ADMIN_KEY) {
    row = await env.DB.prepare("SELECT r2_key FROM launch_kit_videos WHERE id = ?").bind(id).first();
  } else {
    const rid = String(body.rid || "").trim();
    if (body.pass_hash !== PASS_HASH || !RID_RE.test(rid)) return json({ error: "Unauthorized" }, 403);
    row = await env.DB.prepare("SELECT r2_key FROM launch_kit_videos WHERE id = ? AND rid = ?").bind(id, rid).first();
  }
  if (!row) return json({ error: "Not found." }, 404);
  if (env.LAUNCH_MEDIA) { try { await env.LAUNCH_MEDIA.delete(row.r2_key); } catch (e) {} }
  await env.DB.prepare("DELETE FROM launch_kit_videos WHERE id = ?").bind(id).run();
  return json({ success: true });
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key || key !== env.ADMIN_KEY) return json({ error: "Unauthorized" }, 401);
  if (!env.LAUNCH_MEDIA) return notReady();
  const id = parseInt(url.searchParams.get("id"), 10);
  await ensureTables(env.DB);
  const row = id ? await env.DB.prepare("SELECT r2_key, filename, content_type FROM launch_kit_videos WHERE id = ? AND status = 'ready'").bind(id).first() : null;
  if (!row) return json({ error: "not found" }, 404);

  // Safari will not play a video unless the server answers byte ranges.
  const head = await env.LAUNCH_MEDIA.head(row.r2_key);
  if (!head) return json({ error: "not found" }, 404);
  const total = head.size;
  const headers = new Headers({
    "Content-Type": row.content_type || "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=300",
  });
  const safeName = (row.filename || "video.mp4").replace(/[^A-Za-z0-9._-]/g, "_");
  headers.set("Content-Disposition", (url.searchParams.get("download") ? "attachment" : "inline") + '; filename="' + safeName + '"');

  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") || "");
  if (m && (m[1] || m[2])) {
    let start, end;
    if (m[1]) { start = parseInt(m[1], 10); end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1; }
    else { const n = parseInt(m[2], 10); start = Math.max(0, total - n); end = total - 1; }
    if (start > end || start >= total) {
      return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + total } });
    }
    const obj = await env.LAUNCH_MEDIA.get(row.r2_key, { range: { offset: start, length: end - start + 1 } });
    headers.set("Content-Range", "bytes " + start + "-" + end + "/" + total);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(obj.body, { status: 206, headers });
  }
  const obj = await env.LAUNCH_MEDIA.get(row.r2_key);
  headers.set("Content-Length", String(total));
  return new Response(obj.body, { headers });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range",
    },
  });
}
