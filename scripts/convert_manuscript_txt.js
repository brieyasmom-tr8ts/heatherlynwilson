// Rebuild manuscript.html from a plain-text .docx export.
// Usage: node scripts/convert_manuscript_txt.js
//
// The plain-text export keeps each Word paragraph on its own line.
// Empty lines are paragraph separators; consecutive non-empty lines
// each become their own <p>.

const fs = require('fs');
const path = require('path');

const TXT_FILE = 'C:/Users/Heather/Downloads/FinalBuilttoshine_Final.docx.txt';
const MANUSCRIPT = 'C:/Users/Heather/heatherlynwilson/manuscript.html';

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const CHAPTER_MAP = {
  'CHAPTER ONE':   { id: 'ch1',  name: 'Chapter One'   },
  'CHAPTER TWO':   { id: 'ch2',  name: 'Chapter Two'   },
  'CHAPTER THREE': { id: 'ch3',  name: 'Chapter Three' },
  'CHAPTER FOUR':  { id: 'ch4',  name: 'Chapter Four'  },
  'CHAPTER FIVE':  { id: 'ch5',  name: 'Chapter Five'  },
  'CHAPTER SIX':   { id: 'ch6',  name: 'Chapter Six'   },
  'CHAPTER SEVEN': { id: 'ch7',  name: 'Chapter Seven' },
  'CHAPTER EIGHT': { id: 'ch8',  name: 'Chapter Eight' },
  'CHAPTER NINE':  { id: 'ch9',  name: 'Chapter Nine'  },
  'CHAPTER TEN':   { id: 'ch10', name: 'Chapter Ten'   },
};

// ─── 1. Split into sections ───────────────────────────────────────────────────
const rawText = fs.readFileSync(TXT_FILE, 'utf8');
const lines = rawText.split('\n');

const sections = [];
let curId = 'front';
let curLines = [];

for (const line of lines) {
  const t = line.trim();
  const ch = CHAPTER_MAP[t];
  if (ch) {
    sections.push({ id: curId, lines: curLines });
    curId = ch.id;
    curLines = [line];
    continue;
  }
  if (t === 'A Commissioning') {
    sections.push({ id: curId, lines: curLines });
    curId = 'commissioning';
    curLines = [line];
    continue;
  }
  curLines.push(line);
}
sections.push({ id: curId, lines: curLines });

console.log('Sections:', sections.map(s => `${s.id}(${s.lines.length})`).join(', '));

// ─── 2. Convert a section's lines to inner HTML ───────────────────────────────
function sectionToHtml(id, sectionLines) {
  const html = [];
  let i = 0;

  // --- Front matter ---
  if (id === 'front') {
    const noteIdx  = sectionLines.findIndex(l => l.trim() === 'A Note Before We Begin');
    const titleIdx = sectionLines.findIndex(l => l.trim() === 'BUILT TO SHINE');

    if (noteIdx !== -1) {
      const dedEnd = (titleIdx !== -1 && titleIdx < noteIdx) ? titleIdx : noteIdx;
      const ded = sectionLines.slice(0, dedEnd).map(l => l.trim()).filter(Boolean);
      if (ded.length) {
        html.push('<div class="r-dedication">');
        ded.forEach((dline, idx) => {
          const body = esc(dline);
          if (idx === ded.length - 1) {
            html.push('<p class="dedication-close">' + body.replace('belong to, ', 'belong to,<br>') + '</p>');
          } else {
            html.push('<p>' + body + '</p>');
          }
        });
        html.push('</div>');
      }
      html.push('<h2 class="r-title">A Note Before We Begin</h2>');
      i = noteIdx + 1;
    }

  // --- Commissioning ---
  } else if (id === 'commissioning') {
    while (i < sectionLines.length && sectionLines[i].trim() !== 'A Commissioning') i++;
    i++; // skip the heading line itself
    html.push('<h2 class="r-title">A Commissioning</h2>');

  // --- Regular chapters ---
  } else {
    const chLine = sectionLines[i] ? sectionLines[i].trim() : '';
    const ch = CHAPTER_MAP[chLine];
    if (ch) {
      html.push('<h2 class="r-title">' + esc(ch.name) + '</h2>');
      i++;
      // Subtitle: next non-empty line that isn't a callout
      while (i < sectionLines.length && !sectionLines[i].trim()) i++;
      if (i < sectionLines.length) {
        const sub = sectionLines[i].trim();
        if (sub && !sub.startsWith('Lie:') && !sub.startsWith('Truth:')) {
          html.push('<p class="r-subtitle">' + esc(sub) + '</p>');
          i++;
        }
      }
      // Callout: next non-empty line that starts with Lie: or Truth:
      while (i < sectionLines.length && !sectionLines[i].trim()) i++;
      if (i < sectionLines.length) {
        const callout = sectionLines[i].trim();
        if (callout.startsWith('Lie:') || callout.startsWith('Truth:')) {
          html.push('<p class="r-callout">' + esc(callout) + '</p>');
          i++;
        }
      }
    }
  }

  // --- Body lines ---
  while (i < sectionLines.length) {
    const t = sectionLines[i].trim();
    i++;

    if (!t) continue; // blank / whitespace-only line

    // Normalize internal whitespace for special-token matching
    const tn = t.replace(/\s+/g, ' ');

    if (tn === '✦ ✦ ✦') {
      html.push('<div class="r-break">✦ ✦ ✦</div>');
      continue;
    }

    if (tn === '★ ★ ★') {
      html.push('<p>★ ★ ★</p>');
      continue;
    }

    if (t === 'FROM A WOMAN WHO SHINES') {
      html.push('<h3 class="r-sub">FROM A WOMAN WHO SHINES</h3>');
      continue;
    }

    // Bullet point — strip the leading "* "
    if (t.startsWith('* ')) {
      html.push('<p>' + esc(t.slice(2).trim()) + '</p>');
      continue;
    }

    // Callout in body (shouldn't normally occur, but handle gracefully)
    if (t.startsWith('Lie:') || t.startsWith('Truth:')) {
      html.push('<p class="r-callout">' + esc(t) + '</p>');
      continue;
    }

    // Regular paragraph — one line = one <p>
    html.push('<p>' + esc(t) + '</p>');
  }

  return html.join('\n');
}

// ─── 3. Build chapter divs ────────────────────────────────────────────────────
const chapterDivs = sections.map(({ id, lines: sl }) => {
  const inner = sectionToHtml(id, sl);
  return `<div class="chapter" id="${id}">\n${inner}\n</div>`;
}).join('\n');

// ─── 4. Splice into manuscript.html ──────────────────────────────────────────
const existingHtml = fs.readFileSync(MANUSCRIPT, 'utf8');

const readerStart = existingHtml.indexOf('<main class="reader"');
const readerEnd   = existingHtml.indexOf('</main>') + '</main>'.length;

if (readerStart === -1 || readerEnd === -1) {
  console.error('ERROR: Could not find <main class="reader"> in manuscript.html');
  process.exit(1);
}

const newMain = `<main class="reader" id="reader">\n${chapterDivs}\n</main>`;
const newHtml = existingHtml.slice(0, readerStart) + newMain + existingHtml.slice(readerEnd);

fs.writeFileSync(MANUSCRIPT, newHtml, 'utf8');

// ─── 5. Sanity check ─────────────────────────────────────────────────────────
const divCount     = (newHtml.match(/class="chapter"/g) || []).length;
const breakCount   = (newHtml.match(/r-break/g) || []).length;
const calloutCount = (newHtml.match(/r-callout/g) || []).length;
const subCount     = (newHtml.match(/r-sub"/g) || []).length;

console.log(`Done! Wrote ${newHtml.length.toLocaleString()} chars to manuscript.html`);
console.log(`  chapters: ${divCount} | r-breaks: ${breakCount} | callouts: ${calloutCount} | r-sub: ${subCount}`);
