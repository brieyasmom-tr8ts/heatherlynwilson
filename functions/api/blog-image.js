// GET /api/blog-image?title=...&verse=...&ref=...
// Returns an SVG image (1080x1080) with the blog post title and verse rendered
// on the branded blog template. Facebook can fetch this as a photo URL.

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function wrap(text, max) {
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (cur.length + w.length + 1 > max && cur) { lines.push(cur); cur = w; }
    else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const title = url.searchParams.get("title") || "New Blog Post";
  const verse = url.searchParams.get("verse") || "";
  const ref = url.searchParams.get("ref") || "";

  // Wrap title lines
  const titleLines = wrap(title, 28);
  const titleSize = titleLines.length > 3 ? 42 : titleLines.length > 2 ? 48 : 56;
  const titleLH = titleSize * 1.4;
  const titleStartY = verse ? 240 : 400;
  const titleSvg = titleLines.map((line, i) =>
    `<text x="540" y="${titleStartY + i * titleLH}" font-family="Lora,serif" font-weight="bold" font-size="${titleSize}" fill="#1f2937" text-anchor="middle">${esc(line)}</text>`
  ).join("\n");

  // Verse section
  let verseSvg = "";
  if (verse) {
    const verseClean = verse.replace(/^[""\u201C]|[""\u201D]$/g, "");
    const verseLines = wrap(verseClean, 42);
    const verseSize = verseLines.length > 6 ? 22 : verseLines.length > 4 ? 26 : 30;
    const verseLH = verseSize * 1.5;
    const verseStartY = titleStartY + titleLines.length * titleLH + 60;

    verseSvg = verseLines.map((line, i) =>
      `<text x="540" y="${verseStartY + i * verseLH}" font-family="Lora,serif" font-style="italic" font-size="${verseSize}" fill="#4b5563" text-anchor="middle">${esc(line)}</text>`
    ).join("\n");

    if (ref) {
      const refY = verseStartY + verseLines.length * verseLH + 20;
      verseSvg += `\n<text x="540" y="${refY}" font-family="Inter,sans-serif" font-size="16" fill="#9ca3af" text-anchor="middle">${esc(ref)}</text>`;
    }
  }

  const svg = `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#faf6ef"/>
      <stop offset="100%" stop-color="#f0ebe0"/>
    </linearGradient>
  </defs>

  <rect width="1080" height="1080" fill="url(#bg)"/>
  <rect x="0" y="0" width="1080" height="6" fill="#b85638"/>
  <rect x="60" y="80" width="4" height="920" rx="2" fill="#b85638" opacity="0.15"/>

  <text x="540" y="140" font-family="Inter,sans-serif" font-weight="700" font-size="18"
        fill="#b85638" text-anchor="middle" letter-spacing="6">NEW ON THE BLOG</text>
  <line x1="380" y1="160" x2="700" y2="160" stroke="#c8a365" stroke-width="1.5" opacity="0.5"/>
  <rect x="533" y="153" width="14" height="14" rx="2" fill="#c8a365" opacity="0.4" transform="rotate(45, 540, 160)"/>

  ${titleSvg}
  ${verseSvg}

  <rect x="0" y="1074" width="1080" height="6" fill="#b85638"/>
  <text x="540" y="1050" font-family="Inter,sans-serif" font-size="15"
        fill="#6b7280" text-anchor="middle" letter-spacing="3" opacity="0.5">heatherlynwilson.com/blog</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
