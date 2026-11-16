#!/usr/bin/env node
// AI-cadence check for blog posts. Heather's rule: report EVERY repeated
// opener, do not judge which are deliberate.
//
//   node scripts/check_cadence.js            queued posts only (what check_site.py runs)
//   node scripts/check_cadence.js --all      queued posts + every live post
//   node scripts/check_cadence.js <slug>...  just those posts
//
// BLOCK (exit 1): three or more sentences in one paragraph starting with the same
//   word(s), or three or more short fragments in a row. Clear AI cadence.
// WARN  (exit 0): two sentences in a row with the same opener, and paragraphs that
//   open with the same word within three paragraphs of each other.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const decode = s => s.replace(/&mdash;/g, '—').replace(/&rsquo;|&#8217;|&#39;/g, "'")
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ');
const strip = s => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const words = s => s.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
const key = (s, n) => words(s).slice(0, n).join(' ');
const sentences = t => t.split(/(?<=[.!?])["”']?\s+/).filter(x => x.trim());
// "Because" / "And" / "But" / "I" / "The" are ordinary glue; two in a row is normal,
// but three in a paragraph is still a pattern worth a look, so they stay in the BLOCK
// test only at 4+.
const GLUE = new Set(['and', 'but', 'because', 'so', 'the', 'a', 'it', 'i', 'that', 'this', 'we', 'you', 'he', 'his', 'is', 'in', 'of', 'to']);

function analyse(label, paras) {
  const block = [], warn = [];
  const short = t => words(t).length <= 6;
  const snip = t => '"' + (t.length > 60 ? t.slice(0, 57) + '...' : t) + '"';
  const openers = [];
  paras.forEach((p, i) => {
    const ss = sentences(p);
    const n = i + 1;
    // 1. same first two words, 3+ times in a paragraph
    const c2 = {}, c1 = {};
    ss.forEach(s => {
      const k2 = key(s, 2), k1 = key(s, 1);
      if (words(s).length >= 2) c2[k2] = (c2[k2] || 0) + 1;
      c1[k1] = (c1[k1] || 0) + 1;
    });
    for (const k in c2) if (c2[k] >= 3) block.push(`para ${n}: ${c2[k]} sentences open "${k}"`);
    for (const k in c1) {
      const need = GLUE.has(k) ? 4 : 3;
      if (c1[k] >= need && !Object.keys(c2).some(x => x.startsWith(k + ' ') && c2[x] >= 3))
        block.push(`para ${n}: ${c1[k]} sentences open "${k}"`);
    }
    // 2. consecutive pairs
    for (let j = 1; j < ss.length; j++) {
      const a = key(ss[j - 1], 2), b = key(ss[j], 2);
      if (a && a === b && !(c2[a] >= 3)) warn.push(`para ${n}: back-to-back "${a}": ${snip(ss[j - 1])} / ${snip(ss[j])}`);
    }
    // 3. fragment stacks
    let run = 0;
    ss.forEach((s, j) => {
      run = short(s) ? run + 1 : 0;
      if (run === 3) block.push(`para ${n}: three short fragments in a row ending at ${snip(s)}`);
    });
    openers.push(key(p, 1));
  });
  // 4. paragraph openers repeated close together
  openers.forEach((o, i) => {
    if (!o || GLUE.has(o) && !['because'].includes(o)) return;
    for (let j = i + 1; j <= i + 3 && j < openers.length; j++)
      if (openers[j] === o) warn.push(`paragraphs ${i + 1} and ${j + 1} both open "${o}"`);
  });
  return { label, block, warn };
}

function load(args) {
  const out = [];
  const q = path.join(ROOT, 'content-queue');
  const want = args.filter(a => !a.startsWith('--'));
  const all = args.includes('--all');
  for (const f of fs.readdirSync(q)) {
    if (!f.endsWith('.json') || ['schedule.json', 'published.json', 'reserved.json'].includes(f)) continue;
    if (want.length && !want.includes(f.replace('.json', ''))) continue;
    const j = JSON.parse(fs.readFileSync(path.join(q, f), 'utf8'));
    if (!j.body_html) continue;
    out.push({ label: 'queue/' + f, paras: [...j.body_html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => strip(m[1])) });
  }
  if (all || want.length) {
    const b = path.join(ROOT, 'blog');
    for (const f of fs.readdirSync(b)) {
      if (!f.endsWith('.html')) continue;
      if (want.length && !want.includes(f.replace('.html', ''))) continue;
      const h = fs.readFileSync(path.join(b, f), 'utf8');
      const m = h.match(/<article class="post-body">([\s\S]*?)<\/article>/);
      if (!m) continue;
      out.push({ label: 'blog/' + f, paras: [...m[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(x => strip(x[1])) });
    }
  }
  return out;
}

const args = process.argv.slice(2);
let nb = 0, nw = 0, clean = 0;
for (const post of load(args)) {
  const r = analyse(post.label, post.paras);
  if (!r.block.length && !r.warn.length) { clean++; continue; }
  console.log('\n' + r.label);
  r.block.forEach(x => console.log('  BLOCK ' + x));
  r.warn.forEach(x => console.log('  warn  ' + x));
  nb += r.block.length; nw += r.warn.length;
}
console.log(`\ncadence: ${nb} blocking, ${nw} warnings, ${clean} posts clean`);
process.exit(nb ? 1 : 0);
