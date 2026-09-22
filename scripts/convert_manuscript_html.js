// Convert Built-to-Shine Word HTML export to manuscript.html
// Usage: node scripts/convert_manuscript_html.js
// Update SRC_PATH below to point to the latest downloaded HTML file
const fs = require('fs');

const SRC_PATH = 'C:/Users/Heather/Downloads/built-to-shine-manuscript-v2026-09-22-d.html';
const MANUSCRIPT_PATH = 'C:/Users/Heather/heatherlynwilson/manuscript.html';

const CHAPTER_IDS = {
  'CHAPTER ONE': 'ch1', 'CHAPTER TWO': 'ch2', 'CHAPTER THREE': 'ch3',
  'CHAPTER FOUR': 'ch4', 'CHAPTER FIVE': 'ch5', 'CHAPTER SIX': 'ch6',
  'CHAPTER SEVEN': 'ch7', 'CHAPTER EIGHT': 'ch8', 'CHAPTER NINE': 'ch9',
  'CHAPTER TEN': 'ch10',
};
const CHAPTER_NAMES = {
  'CHAPTER ONE': 'Chapter One', 'CHAPTER TWO': 'Chapter Two',
  'CHAPTER THREE': 'Chapter Three', 'CHAPTER FOUR': 'Chapter Four',
  'CHAPTER FIVE': 'Chapter Five', 'CHAPTER SIX': 'Chapter Six',
  'CHAPTER SEVEN': 'Chapter Seven', 'CHAPTER EIGHT': 'Chapter Eight',
  'CHAPTER NINE': 'Chapter Nine', 'CHAPTER TEN': 'Chapter Ten',
};

function stripTags(s) { return s.replace(/<[^>]+>/g, '').trim(); }

function cleanInline(s) {
  return s
    .replace(/<(?!\/?(?:em|strong)\b)[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&mdash;/g, '\u2014').replace(/&ldquo;/g, '\u201C')
    .replace(/&rdquo;/g, '\u201D').replace(/&lsquo;/g, '\u2018')
    .replace(/&rsquo;/g, '\u2019').replace(/&hellip;/g, '\u2026')
    .replace(/&nbsp;/g, ' ').trim();
}

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function parseSource(html) {
  var items = [];
  var tagPattern = /<(h[1-6]|p)([^>]*)>([\s\S]*?)<\/\1>/g;
  var m;
  while ((m = tagPattern.exec(html)) !== null) {
    var tag = m[1];
    var inner = m[3];
    var text = stripTags(inner).trim();
    if (!text) continue;

    if (tag === 'h1') {
      if (CHAPTER_IDS[text]) { items.push({ type: 'chapter', key: text }); }
      else if (text === 'A Commissioning') { items.push({ type: 'commissioning' }); }
      else { items.push({ type: 'subtitle', text: text }); }
      continue;
    }
    if (tag === 'h2' || tag === 'h3') { items.push({ type: 'rsub', text: text }); continue; }

    if (text === 'A Note Before We Begin') { items.push({ type: 'note_heading' }); continue; }
    if (text === 'BUILT TO SHINE') continue;
    if (text.indexOf('For the Woman Leading with Faith') === 0) continue;
    if (/^(Lie:|Truth:)/.test(text)) { items.push({ type: 'callout', text: text }); continue; }
    if (inner.indexOf('<strong><em>') === 0 || inner.indexOf('<em><strong>') === 0) {
      items.push({ type: 'dedication', text: text }); continue;
    }
    var attrClass = (m[2].match(/class="([^"]*)"/) || [])[1] || '';
    if (attrClass === 'byline' || attrClass === 'contrib-title') {
      items.push({ type: attrClass, inner: cleanInline(inner), text: text });
    } else {
      items.push({ type: 'para', inner: cleanInline(inner), text: text });
    }
  }
  return items;
}

function buildHtml(items) {
  var sections = [];
  var current = { id: 'front', lines: [] };
  var dedLines = [];
  var noteHeadingEmitted = false;

  for (var i = 0; i < items.length; i++) {
    var item = items[i];

    if (item.type === 'chapter') {
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
      if (item.type === 'dedication') { dedLines.push(item.text); continue; }
      if (item.type === 'note_heading') {
        if (dedLines.length) {
          current.lines.push('<div class="r-dedication">');
          for (var d = 0; d < dedLines.length; d++) {
            var body = esc(dedLines[d]);
            if (d === dedLines.length - 1) {
              current.lines.push('<p class="dedication-close">' + body.replace('belong to, ', 'belong to,<br>') + '</p>');
            } else {
              current.lines.push('<p>' + body + '</p>');
            }
          }
          current.lines.push('</div>');
          dedLines = [];
        }
        current.lines.push('<h2 class="r-title">A Note Before We Begin</h2>');
        noteHeadingEmitted = true;
        continue;
      }
      if (!noteHeadingEmitted && item.type === 'para' && item.text.indexOf('Built to Shine') !== -1) {
        dedLines.push(item.text); continue;
      }
      if (noteHeadingEmitted && item.type === 'para') {
        current.lines.push('<p>' + item.inner + '</p>'); continue;
      }
      continue;
    }

    if (item.type === 'subtitle') { current.lines.push('<p class="r-subtitle">' + esc(item.text) + '</p>'); nextIsContrib = false; continue; }
    if (item.type === 'callout') { current.lines.push('<p class="r-callout">' + esc(item.text) + '</p>'); nextIsContrib = false; continue; }
    if (item.type === 'rsub') {
      var rtag = '<h3 class="r-sub">' + esc(item.text) + '</h3>';
      if (current.lines[current.lines.length - 1] !== rtag) current.lines.push(rtag);
      continue;
    }
    if (item.type === 'byline') { current.lines.push('<p class="byline">' + item.inner + '</p>'); continue; }
    if (item.type === 'contrib-title') { current.lines.push('<p class="contrib-title">' + item.inner + '</p>'); continue; }
    if (item.type === 'para') { current.lines.push('<p>' + item.inner + '</p>'); continue; }
  }
  sections.push(current);
  return sections;
}

function main() {
  var src = fs.readFileSync(SRC_PATH, 'utf8');
  var items = parseSource(src);
  var sections = buildHtml(items);
  console.log('Sections:', sections.map(function(s) { return s.id + '(' + s.lines.length + ')'; }).join(', '));

  var chapterDivs = sections.map(function(s) {
    return '<div class="chapter" id="' + s.id + '">\n' + s.lines.join('\n') + '\n</div>';
  }).join('\n');

  var existingHtml = fs.readFileSync(MANUSCRIPT_PATH, 'utf8');
  var readerStart = existingHtml.indexOf('<main class="reader"');
  var readerEnd = existingHtml.indexOf('</main>') + '</main>'.length;
  if (readerStart === -1) { console.error('Cannot find reader main'); process.exit(1); }

  var newHtml = existingHtml.slice(0, readerStart) +
    '<main class="reader" id="reader">\n' + chapterDivs + '\n</main>' +
    existingHtml.slice(readerEnd);

  fs.writeFileSync(MANUSCRIPT_PATH, newHtml, 'utf8');
  console.log('Done! Wrote', newHtml.length, 'chars');
  for (var n = 1; n <= 10; n++) {
    var cnt = (newHtml.match(new RegExp('id="ch' + n + '"', 'g')) || []).length;
    if (cnt !== 1) console.warn('WARNING: ch' + n + ' appears', cnt, 'times');
  }
  console.log('r-callouts:', (newHtml.match(/r-callout/g) || []).length);
  console.log('r-sub:', (newHtml.match(/class="r-sub"/g) || []).length);
  console.log('r-subtitles:', (newHtml.match(/r-subtitle/g) || []).length);
}

main();
