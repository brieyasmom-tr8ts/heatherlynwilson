// Fallback handler for blog posts that haven't been published as static HTML yet.
// Cloudflare Pages serves static files first. This function only runs when no
// static blog/slug.html exists, so it checks the content-queue JSON and renders
// the post on the fly. This lets the worker send notification emails on time
// without waiting for the GitHub Actions workflow to generate the static HTML.

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const match = url.pathname.match(/^\/blog\/([a-z0-9-]+)\.html$/);
  if (!match) return context.next();

  const slug = match[1];

  // Try fetching the queued post JSON from the same deployment
  const queueUrl = new URL(`/content-queue/${slug}.json`, url.origin);
  let data;
  try {
    const res = await fetch(queueUrl, { headers: { "User-Agent": "hlw-fallback" } });
    if (!res.ok) return context.next();
    data = await res.json();
  } catch (e) {
    return context.next();
  }

  const category = data.category || "Highlighted";
  // Same rendering as the published static page: the series label and intro
  // carry the "Highlighted" context, so the title itself drops any prefix
  // (older queue files baked it into card_title).
  const displayTitle = String(data.card_title || "").replace(/^Highlighted:\s*/, "");
  const isHighlighted = category === "Highlighted";
  const catClass = isHighlighted ? " series-title" : "";
  const introBlock = isHighlighted
    ? `<p style="font-size:12px;color:var(--ink-soft);font-weight:300;font-style:italic;line-height:1.5;margin:8px auto 16px;max-width:520px;">I read the entire Bible in January. Now I'm revisiting my highlights and blogging about why each verse stood out.</p>`
    : "";

  let verseBlock = "";
  if (data.verse) {
    verseBlock = `<div class="verse">${esc(data.verse)}`;
    if (data.verse_ref) verseBlock += `<span class="ref">${esc(data.verse_ref)}</span>`;
    verseBlock += `</div>`;
  }

  let questionBlock = "";
  if (data.question) {
    questionBlock = `<div class="question">${esc(data.question)}</div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(displayTitle)} — Heather Lyn Wilson</title>
<meta name="description" content="${esc(data.description || "")}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/main.css">
<link rel="stylesheet" href="../css/post.css">
</head>
<body>

<div class="topbar">
<div class="wrap-wide">
<div class="topbar-row">
<div class="social-row">
<a href="https://www.facebook.com/HLWWilson" target="_blank">Facebook</a>
<a href="https://instagram.com/heatherlynwilson" target="_blank">Instagram</a>
<a href="https://www.amazon.com/stores/Heather-L-Wilson/author/B0FDBQVGR5" target="_blank">Amazon</a>
</div>
<a href="../blog.html" class="blog-btn">Read My Blog</a>
</div>
</div>
</div>

<header class="masthead">
<div class="wrap-wide">
<div class="masthead-row">
<a href="../index.html" class="wordmark">HeatherLynWilson<span class="com">.com</span></a>
<nav class="main-nav">
<a href="../about.html">About</a>
<a href="../books.html">Books</a>
<a href="../speaking.html">Speaking</a>
<a href="../blog.html">Blog</a>
<a href="../challenge.html">Challenge</a>
<a href="../contact.html">Contact</a>
</nav>
</div>
</div>
</header>

<main>
<section class="post-hero">
<div class="wrap">
<a href="../blog.html" class="cat-link${catClass}">${esc(category)}</a>
${introBlock}
<h1>${esc(displayTitle)}</h1>
<div class="post-date">${esc(data.date_display || "")}</div>
</div>
</section>

<article class="post-body">
<div class="post-body-inner">
${verseBlock}
${data.body_html || ""}
${questionBlock}
</div>
</article>

<div class="back-to-blog">
<a href="../blog.html">&larr; Back to all posts</a>
</div>
</main>

<footer class="site-foot">
<div class="wrap">
<div class="foot-bottom">
<span>&copy; 2026 HeatherLynWilson.com</span>
<span>Eastern Shore, Maryland</span>
</div>
</div>
</footer>

<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<script src="../js/engagement.js?v=6"></script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html;charset=utf-8" },
  });
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
