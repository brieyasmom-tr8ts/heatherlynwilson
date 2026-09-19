// Convert Built-to-Shine-working-copy.docx to manuscript.html
// Usage: node scripts/convert_manuscript_docx.js
const fs = require('fs');
const mammoth = require('mammoth');

const DOCX_PATH = 'C:/Users/Heather/Desktop/Built to Shine/Built-to-Shine-working-copy.docx';
const MANUSCRIPT_PATH = 'C:/Users/Heather/heatherlynwilson/manuscript.html';

const CHAPTER_IDS = {
  'CHAPTER ONE':   'ch1',
  'CHAPTER TWO':   'ch2',
  'CHAPTER THREE': 'ch3',
  'CHAPTER FOUR':  'ch4',
  'CHAPTER FIVE':  'ch5',
  'CHAPTER SIX':   'ch6',
  'CHAPTER SEVEN': 'ch7',
  'CHAPTER EIGHT': 'ch8',
  'CHAPTER NINE':  'ch9',
  'CHAPTER TEN':   'ch10',
};
const CHAPTER_NAMES = {
  'CHAPTER ONE':   'Chapter One',
  'CHAPTER TWO':   'Chapter Two',
  'CHAPTER THREE': 'Chapter Three',
  'CHAPTER FOUR':  'Chapter Four',
  'CHAPTER FIVE':  'Chapter Five',
  'CHAPTER SIX':   'Chapter Six',
  'CHAPTER SEVEN': 'Chapter Seven',
  'CHAPTER EIGHT': 'Chapter Eight',
  'CHAPTER NINE':  'Chapter Nine',
  'CHAPTER TEN':   'Chapter Ten',
};

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Split raw text lines into sections by chapter headings
function splitSections(lines) {
  const sections = [];
  let currentId = 'front';
  let currentLines = [];

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();

    if (CHAPTER_IDS[t]) {
      sections.push({ id: currentId, rawLines: currentLines });
      currentId = CHAPTER_IDS[t];
      currentLines = [lines[i]];
      continue;
    }

    if (t === 'A Commissioning') {
      sections.push({ id: currentId, rawLines: currentLines });
      currentId = 'commissioning';
      currentLines = [lines[i]];
      continue;
    }

    currentLines.push(lines[i]);
  }
  sections.push({ id: currentId, rawLines: currentLines });
  return sections;
}

// Convert section lines to inner HTML
function sectionToHtml(id, rawLines) {
  const html = [];
  let i = 0;
  let paraBuffer = [];

  const flushPara = () => {
    if (paraBuffer.length > 0) {
      const text = paraBuffer.join(' ').trim();
      if (text) html.push('<p>' + esc(text) + '</p>');
      paraBuffer = [];
    }
  };

  // Helper: peek at the next non-empty line index
  const nextNonEmpty = (from) => {
    for (let j = from; j < rawLines.length; j++) {
      if (rawLines[j].trim() !== '') return j;
    }
    return -1;
  };

  // ---- FRONT MATTER ----
  if (id === 'front') {
    // Dedication: lines before 'BUILT TO SHINE'
    const titleIdx = rawLines.findIndex(l => l.trim() === 'BUILT TO SHINE');
    const noteIdx  = rawLines.findIndex(l => l.trim() === 'A Note Before We Begin');

    if (noteIdx !== -1) {
      const dedEnd = (titleIdx !== -1 && titleIdx < noteIdx) ? titleIdx : noteIdx;
      const ded = [];
      for (let j = 0; j < dedEnd; j++) {
        const t = rawLines[j].trim();
        if (t) ded.push(t);
      }
      if (ded.length) {
        html.push('<div class="r-dedication">');
        ded.forEach((line, idx) => {
          const body = esc(line);
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
    } else {
      i = 0;
    }
  }

  // ---- COMMISSIONING ----
  else if (id === 'commissioning') {
    // Skip to past 'A Commissioning' heading line
    while (i < rawLines.length && rawLines[i].trim() !== 'A Commissioning') i++;
    if (i < rawLines.length) {
      html.push('<h2 class="r-title">A Commissioning</h2>');
      i++;
    }
  }

  // ---- CHAPTER ----
  else {
    // First line is the CHAPTER X heading
    const chKey = rawLines[i] ? rawLines[i].trim() : '';
    if (CHAPTER_IDS[chKey]) {
      html.push('<h2 class="r-title">' + esc(CHAPTER_NAMES[chKey]) + '</h2>');
      i++;
      // Next non-empty line is the subtitle (e.g. "The Lie of Permission")
      const si = nextNonEmpty(i);
      if (si !== -1) {
        const subtitleText = rawLines[si].trim();
        // Only treat as subtitle if it's NOT a Lie: callout
        if (!subtitleText.match(/^Lie:/i) && !subtitleText.match(/^Truth:/i)) {
          html.push('<p class="r-subtitle">' + esc(subtitleText) + '</p>');
          i = si + 1;
        }
      }
    }
  }

  // ---- PROCESS REMAINING LINES ----
  while (i < rawLines.length) {
    const raw = rawLines[i];
    const t = raw.trim();
    i++;

    // Skip page headers: "BUILT TO SHINE" followed (soon) by "For the Woman..."
    if (t === 'BUILT TO SHINE') {
      // Look ahead for "For the Woman..."
      const ni = nextNonEmpty(i);
      if (ni !== -1 && rawLines[ni].trim().startsWith('For the Woman')) {
        i = ni + 1; // skip both
      }
      // If not followed by that line, just drop it (still a page header)
      continue;
    }

    // Skip "For the Woman Leading with Faith in the Business World" if it appears alone
    if (t === 'For the Woman Leading with Faith in the Business World') continue;

    if (t === '') {
      flushPara();
      continue;
    }

    // Scene breaks (with or without spaces between diamonds)
    if (t.match(/^✦[\s✦]*✦[\s✦]*✦$/) || t === '✦ ✦ ✦') {
      flushPara();
      html.push('<div class="r-break">✦ ✦ ✦</div>');
      continue;
    }

    // ★★★ separator (before FROM A WOMAN section)
    if (t === '★★★' || t === '★ ★ ★') {
      flushPara();
      html.push('<p>★ ★ ★</p>');
      continue;
    }

    // FROM A WOMAN WHO SHINES heading
    if (t.match(/^FROM A WOM/i)) {
      flushPara();
      const newTag = '<h3 class="r-sub">' + esc(t) + '</h3>';
      if (html[html.length - 1] !== newTag) html.push(newTag);
      continue;
    }

    // Lie: or Truth: callouts
    if (t.match(/^(Lie:|Truth:)/)) {
      flushPara();
      html.push('<p class="r-callout">' + esc(t) + '</p>');
      continue;
    }

    // Regular paragraph line — accumulate
    paraBuffer.push(t);
  }

  flushPara();
  return html.join('\n');
}

async function main() {
  console.log('Extracting text from docx...');
  const result = await mammoth.extractRawText({ path: DOCX_PATH });
  const lines = result.value.split('\n');
  console.log('Total lines:', lines.length);

  const sections = splitSections(lines);
  console.log('Sections:', sections.map(s => s.id + '(' + s.rawLines.length + ')').join(', '));

  const chapterDivs = sections.map(({ id, rawLines }) => {
    const inner = sectionToHtml(id, rawLines);
    return '<div class="chapter" id="' + id + '">\n' + inner + '\n</div>';
  }).join('\n');

  const existingHtml = fs.readFileSync(MANUSCRIPT_PATH, 'utf8');
  const readerStart = existingHtml.indexOf('<main class="reader"');
  const readerEnd = existingHtml.indexOf('</main>') + '</main>'.length;

  if (readerStart === -1 || readerEnd === -1) {
    console.error('Could not find <main class="reader"> in manuscript.html');
    process.exit(1);
  }

  const before = existingHtml.slice(0, readerStart);
  const after = existingHtml.slice(readerEnd);
  const newMain = '<main class="reader" id="reader">\n' + chapterDivs + '\n</main>';
  const newHtml = before + newMain + after;

  fs.writeFileSync(MANUSCRIPT_PATH, newHtml, 'utf8');
  console.log('Done! Wrote', newHtml.length, 'chars to manuscript.html');

  // Sanity checks
  for (let n = 1; n <= 10; n++) {
    const id = 'ch' + n;
    const count = (newHtml.match(new RegExp('id="' + id + '"', 'g')) || []).length;
    if (count !== 1) console.warn('WARNING: id="' + id + '" appears', count, 'times (expected 1)');
  }
  console.log('r-breaks:', (newHtml.match(/r-break/g) || []).length);
  console.log('r-callouts:', (newHtml.match(/r-callout/g) || []).length);
  console.log('r-sub (FROM A WOMAN):', (newHtml.match(/r-sub/g) || []).length);
  console.log('r-subtitles:', (newHtml.match(/r-subtitle/g) || []).length);
}

main().catch(e => { console.error(e); process.exit(1); });
