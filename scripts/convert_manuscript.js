// Convert Google Doc content to manuscript.html chapter HTML
const fs = require('fs');

const gdocFile = 'C:/Users/Heather/.claude/projects/C--Users-Heather-heatherlynwilson/e4992cb9-accb-4e7f-83b5-4194a36d3a5c/tool-results/mcp-claude_ai_Google_Drive-read_file_content-1787935435481.txt';
const manuscriptFile = 'C:/Users/Heather/heatherlynwilson/manuscript.html';

const data = JSON.parse(fs.readFileSync(gdocFile, 'utf8'));
const gdoc = data.fileContent;

// Unescape Google Docs markdown escapes (e.g. \! -> !)
function unesc(s) {
  return s.replace(/\\(.)/g, '$1');
}

// HTML-escape
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const chapterIds = {
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
const chapterNames = {
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

// Split doc into sections by chapter headings
const lines = gdoc.split('\n');
const sections = []; // each: { id, rawLines }
let currentId = 'front';
let currentLines = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();

  // Chapter heading: # CHAPTER ONE, # CHAPTER TWO, etc.
  const chMatch = trimmed.match(/^# (CHAPTER [A-Z]+)$/);
  if (chMatch) {
    sections.push({ id: currentId, rawLines: currentLines });
    currentId = chapterIds[chMatch[1]] || chMatch[1].toLowerCase();
    currentLines = [line];
    continue;
  }

  // Commissioning
  if (trimmed === '# A Commissioning') {
    sections.push({ id: currentId, rawLines: currentLines });
    currentId = 'commissioning';
    currentLines = [line];
    continue;
  }

  currentLines.push(line);
}
sections.push({ id: currentId, rawLines: currentLines });

console.log('Sections:', sections.map(s => s.id + '(' + s.rawLines.length + ')').join(', '));

// Convert a section's lines to HTML content (just the inner content, no outer div)
function sectionToHtml(id, rawLines) {
  const html = [];
  let i = 0;

  // The first line of non-front sections is the # CHAPTER X line
  if (id !== 'front' && id !== 'commissioning') {
    // line 0: # CHAPTER X  → r-title
    // line 1 (next non-empty): # The Lie of X → r-subtitle
    // We need to find and emit these
    while (i < rawLines.length) {
      const trimmed = rawLines[i].trim();
      const chMatch = trimmed.match(/^# (CHAPTER [A-Z]+)$/);
      if (chMatch) {
        html.push('<h2 class="r-title">' + esc(chapterNames[chMatch[1]] || chMatch[1]) + '</h2>');
        i++;
        // Next non-empty line should be the subtitle
        while (i < rawLines.length && rawLines[i].trim() === '') i++;
        if (i < rawLines.length) {
          const subtitleLine = rawLines[i].trim();
          const subtitleMatch = subtitleLine.match(/^# (.+)$/);
          if (subtitleMatch) {
            html.push('<p class="r-subtitle">' + esc(unesc(subtitleMatch[1])) + '</p>');
            i++;
          }
        }
        break;
      }
      i++;
    }
  } else if (id === 'commissioning') {
    // First line: # A Commissioning
    while (i < rawLines.length) {
      const trimmed = rawLines[i].trim();
      if (trimmed === '# A Commissioning') {
        html.push('<h2 class="r-title">A Commissioning</h2>');
        i++;
        break;
      }
      i++;
    }
  } else {
    // front matter: skip until after "A Note Before We Begin"
    // The front section has dedication + title + "A Note Before We Begin" header
    // We render it all as paragraphs (no special headings needed, matching existing HTML)
    i = 0; // process all lines
  }

  // Now process the remaining lines
  let paraBuffer = [];

  const flushPara = () => {
    if (paraBuffer.length > 0) {
      const text = unesc(paraBuffer.join(' ').trim());
      if (text) html.push('<p>' + esc(text) + '</p>');
      paraBuffer = [];
    }
  };

  while (i < rawLines.length) {
    const raw = rawLines[i];
    const trimmed = raw.trim();
    i++;

    if (trimmed === '') {
      flushPara();
      continue;
    }

    // Scene break (diamond stars)
    if (trimmed === '✦ ✦ ✦') {
      flushPara();
      html.push('<div class="r-break">✦ ✦ ✦</div>');
      continue;
    }

    // Star break (appears in Google Doc before FROM A WOMEN sections)
    if (trimmed === '★ ★ ★') {
      flushPara();
      html.push('<p>★ ★ ★</p>');
      continue;
    }

    // FROM A WOMAN/WOMEN WHO SHINES (## or ### heading) — no extra star, Google Doc already has one before it
    // Skip if the last item emitted was already this heading (duplicate in Google Doc)
    if (trimmed.match(/^#{2,3} FROM A WOM/)) {
      flushPara();
      const label = trimmed.replace(/^#{2,3} /, '').replace(/:$/, '');
      const newTag = '<h3 class="r-sub">' + esc(label) + '</h3>';
      if (html[html.length - 1] !== newTag) html.push(newTag);
      continue;
    }

    // ## The Truth That Replaces the Lie (only in ch5 Google Doc) → r-sub heading
    if (trimmed.match(/^## The Truth That Replaces/)) {
      flushPara();
      html.push('<h3 class="r-sub">' + esc(unesc(trimmed.replace(/^## /, ''))) + '</h3>');
      continue;
    }

    // # heading (should not appear mid-section, but handle gracefully)
    if (trimmed.match(/^# /)) {
      flushPara();
      html.push('<p>' + esc(unesc(trimmed.replace(/^# /, ''))) + '</p>');
      continue;
    }

    // Lie: or Truth: lines → r-callout
    if (trimmed.match(/^(Lie:|Truth:)/)) {
      flushPara();
      html.push('<p class="r-callout">' + esc(unesc(trimmed)) + '</p>');
      continue;
    }

    // Regular paragraph line — accumulate
    paraBuffer.push(trimmed);
  }

  flushPara();
  return html.join('\n');
}

// Build all chapter divs
const chapterDivs = sections.map(({ id, rawLines }) => {
  const inner = sectionToHtml(id, rawLines);
  return '<div class="chapter" id="' + id + '">\n' + inner + '\n</div>';
}).join('\n');

// Read existing manuscript.html
const existingHtml = fs.readFileSync(manuscriptFile, 'utf8');

// Replace the reader content: from <main class="reader" to </main>
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

// Write output
fs.writeFileSync(manuscriptFile, newHtml, 'utf8');
console.log('Done! Wrote', newHtml.length, 'chars to manuscript.html');

// Quick sanity check: count chapters
const ch1count = (newHtml.match(/id="ch1"/g) || []).length;
const breakCount = (newHtml.match(/r-break/g) || []).length;
const calloutCount = (newHtml.match(/r-callout/g) || []).length;
console.log('ch1 divs:', ch1count, '| r-breaks:', breakCount, '| callouts:', calloutCount);
