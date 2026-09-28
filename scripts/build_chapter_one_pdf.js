// Extracts Chapter One from manuscript.html and writes a clean,
// print-ready HTML file. Open chapter-one-free.html in a browser
// and use Print → Save as PDF to produce the final file.
// The styling is set up for standard US letter paper.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manuscriptPath = path.join(root, 'manuscript.html');
const outPath = path.join(root, 'chapter-one-free.html');

const src = fs.readFileSync(manuscriptPath, 'utf8');

// Extract chapter 1 div (everything from id="ch1" up to id="ch2")
const ch1Match = src.match(/<div class="chapter" id="ch1">([\s\S]*?)<\/div>\s*<div class="chapter" id="ch2"/);
if (!ch1Match) {
  console.error('Could not find Chapter 1 in manuscript.html');
  process.exit(1);
}

const chapterContent = ch1Match[1].trim();

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Chapter One: The Lie of Permission — Built to Shine by Heather Wilson</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@300;400;500;600;700&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

@page {
  size: letter;
  margin: 1in 1in 1in 1in;
}

body {
  font-family: 'Lora', Georgia, serif;
  font-size: 11pt;
  line-height: 1.8;
  color: #1f2937;
  background: #fff;
  max-width: 6.5in;
  margin: 0 auto;
  padding: 48px 0;
}

/* Cover / header */
.cover {
  text-align: center;
  padding: 60px 0 48px;
  border-bottom: 2px solid #c8a365;
  margin-bottom: 48px;
}
.cover-eyebrow {
  font-family: 'Inter', sans-serif;
  font-size: 9pt;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #b85638;
  margin-bottom: 12px;
}
.cover-title {
  font-family: 'Lora', serif;
  font-size: 28pt;
  font-weight: 700;
  color: #1f2937;
  line-height: 1.15;
  margin-bottom: 10px;
}
.cover-subtitle {
  font-family: 'Lora', serif;
  font-size: 12pt;
  font-style: italic;
  color: #4b5563;
  margin-bottom: 20px;
}
.cover-author {
  font-family: 'Inter', sans-serif;
  font-size: 10pt;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #6b7280;
}
.cover-note {
  font-family: 'Inter', sans-serif;
  font-size: 9pt;
  color: #6b7280;
  margin-top: 24px;
  font-style: italic;
}

/* Chapter content */
.r-title {
  font-family: 'Lora', serif;
  font-size: 22pt;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 6px;
  margin-top: 0;
}
.r-subtitle {
  font-family: 'Inter', sans-serif;
  font-size: 11pt;
  font-weight: 600;
  color: #b85638;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  margin-bottom: 24px;
  display: block;
}
.r-callout {
  font-family: 'Lora', serif;
  font-size: 11pt;
  font-style: italic;
  color: #4b5563;
  background: #faf6ef;
  border-left: 3px solid #c8a365;
  padding: 14px 18px;
  margin-bottom: 28px;
  page-break-inside: avoid;
}
p {
  margin-bottom: 14px;
}
.divider {
  text-align: center;
  color: #c8a365;
  font-size: 14pt;
  margin: 28px 0;
  letter-spacing: 6px;
}
strong { font-weight: 700; }
em { font-style: italic; }
.r-sub {
  font-family: 'Inter', sans-serif;
  font-size: 9pt;
  font-weight: 700;
  color: #b85638;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin: 36px 0 12px;
  page-break-after: avoid;
}
.byline {
  font-size: 10pt;
  margin-bottom: 4px;
}
.contrib-title {
  font-family: 'Inter', sans-serif;
  font-size: 9pt;
  color: #6b7280;
  margin-bottom: 18px;
}

/* Back page CTA */
.back-cover {
  margin-top: 60px;
  padding-top: 40px;
  border-top: 2px solid #c8a365;
  text-align: center;
  page-break-before: always;
}
.back-cover h2 {
  font-family: 'Lora', serif;
  font-size: 18pt;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 12px;
}
.back-cover p {
  font-family: 'Inter', sans-serif;
  font-size: 10pt;
  color: #4b5563;
  max-width: 4in;
  margin: 0 auto 20px;
  line-height: 1.6;
}
.back-cover .url {
  font-family: 'Inter', sans-serif;
  font-size: 12pt;
  font-weight: 700;
  color: #b85638;
  display: block;
  margin-top: 8px;
}
.back-cover .release {
  font-family: 'Inter', sans-serif;
  font-size: 9pt;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #6b7280;
  margin-top: 28px;
}

@media print {
  body { padding: 0; }
  a { color: inherit; text-decoration: none; }
}
</style>
</head>
<body>

<div class="cover">
  <div class="cover-eyebrow">Free Preview</div>
  <div class="cover-title">Built to Shine</div>
  <div class="cover-subtitle">For the Woman Leading with Faith in the Business World</div>
  <div class="cover-author">Heather Wilson</div>
  <div class="cover-note">This is Chapter One. The full book releases October 15, 2026.</div>
</div>

${chapterContent}

<div class="back-cover">
  <h2>The full book releases October 15, 2026.</h2>
  <p>Join the list at the link below to be notified the moment it is available and to receive launch updates.</p>
  <span class="url">heatherlynwilson.com/built-to-shine</span>
  <div class="release">Built to Shine &nbsp;·&nbsp; Heather Wilson &nbsp;·&nbsp; October 15, 2026</div>
</div>

</body>
</html>`;

fs.writeFileSync(outPath, html, 'utf8');
console.log('Written: chapter-one-free.html');
console.log('Open it in Chrome and use File → Print → Save as PDF.');
console.log('Set paper size to Letter, margins to None (the @page rule handles margins).');
