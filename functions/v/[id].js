// Share pages for Heather's videos. Facebook's and iMessage's preview
// builders read the tags here, so the title and thumbnail come live from
// Vimeo: whatever the video is called there is what the share card says.
// Human visitors are forwarded to the blog page aimed at that video.
// Works for any video id, so new videos need no setup at all.

export async function onRequestGet(context) {
  const id = String(context.params.id || "").replace(/\.html$/, "");
  if (!/^\d{6,15}$/.test(id)) {
    return Response.redirect("https://heatherlynwilson.com/blog", 302);
  }

  let title = "Straight from My Bible Reading";
  let thumb = "https://vumbnail.com/" + id + ".jpg";
  try {
    const r = await fetch(
      "https://vimeo.com/api/oembed.json?url=" + encodeURIComponent("https://vimeo.com/" + id),
      { headers: { "User-Agent": "hlw-share" }, cf: { cacheTtl: 3600, cacheEverything: true } }
    );
    if (r.ok) {
      const d = await r.json();
      if (d.title) title = d.title;
      if (d.thumbnail_url) thumb = d.thumbnail_url;
    }
  } catch (e) {}

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)} | Heather Lyn Wilson</title>
<meta name="robots" content="noindex">
<meta property="og:type" content="video.other">
<meta property="og:site_name" content="Heather Lyn Wilson">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="Heather sharing what stood out from her morning Bible reading. Same Bible, same lessons, just out loud.">
<meta property="og:url" content="https://heatherlynwilson.com/v/${id}">
<meta property="og:image" content="${esc(thumb)}">
<meta property="og:video" content="https://player.vimeo.com/video/${id}">
<meta property="og:video:secure_url" content="https://player.vimeo.com/video/${id}">
<meta property="og:video:type" content="text/html">
<meta property="og:video:width" content="640">
<meta property="og:video:height" content="360">
<meta name="twitter:card" content="player">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:image" content="${esc(thumb)}">
<meta name="twitter:player" content="https://player.vimeo.com/video/${id}">
<meta name="twitter:player:width" content="640">
<meta name="twitter:player:height" content="360">
<script>location.replace('/blog?v=${id}');</script>
</head>
<body style="font-family:sans-serif;padding:40px;text-align:center;">
<p>Taking you to the video&hellip; <a href="/blog?v=${id}">tap here if nothing happens</a>.</p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
