// Convert Built-to-Shine Word HTML export to manuscript.html
// Usage: node scripts/convert_manuscript_html.js
// Source: C:/Users/Heather/Downloads/built-to-shine-manuscript (1).html
const fs = require('fs');

const SRC_PATH = 'C:/Users/Heather/Downloads/built-to-shine-manuscript (2).html';
const MANUSCRIPT_PATH = 'C:/Users/Heather/heatherlynwilson/manuscript.html';

const CHAPTER_IDS = {
  'CHAPTER ONE':   'ch1',  'CHAPTER TWO':   'ch2',  'CHAPTER THREE': 'ch3',
  'CHAPTER FOUR':  'ch4',  'CHAPTER FIVE':  'ch5',  'CHAPTER SIX':   'ch6',
  'CHAPTER SEVEN': 'ch7',  'CHAPTER EIGHT': 'ch8',  'CHAPTER NINE':  'ch9',
  'CHAPTER TEN':   'ch10',
};
const CHAPTER_NAMES = {
  'CHAPTER ONE':   'Chapter One',   'CHAPTER TWO':   'Chapter Two',
  'CHAPTER THREE': 'Chapter Three', 'CHAPTER FOUR':  'Chapter Four',
  'CHAPTER FIVE':  'Chapter Five',  'CHAPTER SIX':   'Chapter Six',
  'CHAPTER SEVEN': 'Chapter Seven', 'CHAPTER EIGHT': 'Chapter Eight',
  'CHAPTER NINE':  'Chapter Nine',  'CHAPTER TEN':   'Chapter Ten',
};

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '').trim();
}

// Clean inline HTML: keep <em> and <strong>, strip everything else
function cleanInline(s) {
  return s
    .replace(/<(?!\/?(?:em|strong)\b)[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&hellip;/g, '\u2026')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Parse the source HTML into an array of line objects
function parseSource(html) {
  const rawLines = html.split('\n');
  const items = [];
  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) continue;

    // h1 tags: chapter headings and subtitles and commissioning
    const h1Match = line.match(/^<h1[^>]*>([\s\S]*?)<\/h1>$/);
    if (h1Match) {
      const text = stripTags(h1Match[1]).trim();
      if (CHAPTER_IDS[text]) {
        items.push({ type: 'chapter', key: text });
      } else if (text === 'A Commissioning') {
        items.push({ type: 'commissioning' });
      } else {
        items.push({ type: 'subtitle', text });
      }
      continue;
    }

    // h2 tags: FROM A WOMAN, The Truth That Replaces the Lie
    const h2Match = line.match(/^<h2[^>]*>([\s\S]*?)<\/h2>$/);
    if (h2Match) {
      const text = stripTags(h2Match[1]).trim();
      items.push({ type: 'rsub', text });
      continue;
    }

    // h3 tags: also FROM A WOMAN in some chapters
    const h3Match = line.match(/^<h3[^>]*>([\s\S]*?)<\/h3>$/);
    if (h3Match) {
      const text = stripTags(h3Match[1]).trim();
      items.push({ type: 'rsub', text });
      continue;
    }

    // p tags
    const pMatch = line.match(/^<p[^>]*>([\s\S]*?)<\/p>$/);
    if (pMatch) {
      const inner = pMatch[1];
      const text = stripTags(inner).trim();

      // "A Note Before We Begin" bold paragraph
      if (text === 'A Note Before We Begin') {
        items.push({ type: 'note_heading' });
        continue;
      }

      // BUILT TO SHINE title — skip
      if (text === 'BUILT TO SHINE') continue;

      // "For the Woman Leading..." subtitle — skip
      if (text.startsWith('For the Woman Leading with Faith')) continue;

      // Lie: or Truth: callout (appears as <em>Lie: ...</em>)
      if (text.match(/^(Lie:|Truth:)/)) {
        items.push({ type: 'callout', text });
        continue;
      }

      // Dedication lines: bold+italic (<strong><em>...)
      if (inner.startsWith('<strong><em>') || inner.startsWith('<em><strong>')) {
        items.push({ type: 'dedication', text });
        continue;
      }

      // The "May you always know..." dedication closing line (plain p right after italic ded lines)
      // Detected by surrounding context, so just tag as para and handle in build phase
      items.push({ type: 'para', inner: cleanInline(inner), text });
      continue;
    }
  }
  return items;
}

function buildHtml(items) {
  const sections = []; // { id, lines[] }
  let current = { id: 'front', lines: [] };

  let inDedication = false;
  let noteHeadingEmitted = false;
  const dedLines = [];

  for (const item of items) {
    if (item.type === 'chapter') {
      // Close current section
      sections.push(current);
      current = { id: CHAPTER_IDS[item.key], lines: [] };
      current.lines.push('<h2 class="r-title">' + esc(CHAPTER_NAMES[item.key]) + '</h2>');
      continue;
    }

    if (item.type === 'commissioning') {
      sections.push(current);
      current = { id: 'commissioning', lines: [] };
      current.lines.push('<h2 class="r-title">A Commissioning</h2>');
      continue;
    }

    if (current.id === 'front') {
      if (item.type === 'dedication') {
        dedLines.push(item.text);
        continue;
      }

      if (item.type === 'note_heading') {
        // Flush dedication block
        if (dedLines.length) {
          current.lines.push('<div class="r-dedication">');
          dedLines.forEach((line, idx) => {
            const body = esc(line);
            if (idx === dedLines.length - 1) {
              current.lines.push('<p class="dedication-close">' + body.replace('belong to, ', 'belong to,<br>') + '</p>');
            } else {
              current.lines.push('<p>' + body + '</p>');
            }
          });
          current.lines.push('</div>');
          dedLines.length = 0;
        }
        current.lines.push('<h2 class="r-title">A Note Before We Begin</h2>');
        noteHeadingEmitted = true;
        continue;
      }

      // "May you always know..." — last dedication closing line (comes before BUILT TO SHINE in source)
      if (!noteHeadingEmitted && item.type === 'para' && item.text.includes('Built to Shine')) {
        dedLines.push(item.text);
        continue;
      }

      // Scripture credit or other front matter paragraph
      if (noteHeadingEmitted && item.type === 'para') {
        current.lines.push('<p>' + item.inner + '</p>');
        continue;
      }

      // Any other front matter (scripture credit before note heading)
      if (!noteHeadingEmitted && item.type === 'para') {
        // Skip — it's between dedication and note heading (like scripture credit if moved)
        // Actually include it as a regular para after note heading
        // For now just skip items that appear before note heading that aren't ded lines
        continue;
      }
      continue;
    }

    // Inside a chapter or commissioning
    if (item.type === 'subtitle') {
      current.lines.push('<p class="r-subtitle">' + esc(item.text) + '</p>');
      continue;
    }

    if (item.type === 'callout') {
      current.lines.push('<p class="r-callout">' + esc(item.text) + '</p>');
      continue;
    }

    if (item.type === 'rsub') {
      const tag = '<h3 class="r-sub">' + esc(item.text) + '</h3>';
      if (current.lines[current.lines.length - 1] !== tag) {
        current.lines.push(tag);
      }
      continue;
    }

    if (item.type === 'para') {
      current.lines.push('<p>' + item.inner + '</p>');
      continue;
    }
  }

  sections.push(current);
  return sections;
}

function main() {
  const src = fs.readFileSync(SRC_PATH, 'utf8');
  const items = parseSource(src);
  const sections = buildHtml(items);

  console.log('Sections:', sections.map(s => s.id + '(' + s.lines.length + ')').join(', '));

  const chapterDivs = sections.map(({ id, lines }) => {
    return '<div class="chapter" id="' + id + '">\n' + lines.join('\n') + '\n</div>';
  }).join('\n');

  const existingHtml = fs.readFileSync(MANUSCRIPT_PATH, 'utf8');
  const readerStart = existingHtml.indexOf('<main class="reader"');
  const readerEnd = existingHtml.indexOf('</main>') + '</main>'.length;

  if (readerStart === -1 || readerEnd === -1) {
    console.error('Could not find <main class="reader"> in manuscript.html');
    process.exit(1);
  }

  const newMain = '<main class="reader" id="reader">\n' + chapterDivs + '\n</main>';
  const newHtml = existingHtml.slice(0, readerStart) + newMain + existingHtml.slice(readerEnd);

  fs.writeFileSync(MANUSCRIPT_PATH, newHtml, 'utf8');
  console.log('Done! Wrote', newHtml.length, 'chars to manuscript.html');

  // Sanity checks
  for (let n = 1; n <= 10; n++) {
    const count = (newHtml.match(new RegExp('id="ch' + n + '"', 'g')) || []).length;
    if (count !== 1) console.warn('WARNING: id="ch' + n + '" appears', count, 'times');
  }
  console.log('r-callouts:', (newHtml.match(/r-callout/g) || []).length);
  console.log('r-sub (FROM A WOMAN):', (newHtml.match(/class="r-sub"/g) || []).length);
  console.log('r-subtitles:', (newHtml.match(/r-subtitle/g) || []).length);
}

main();
