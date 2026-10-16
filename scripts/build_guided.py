#!/usr/bin/env python3
"""Build guided.html, the password-protected reader for Heather's novel Guided.

Usage:
  python3 -I scripts/build_guided.py path/to/guided-export.html
      Rebuild the book from a Google Doc "download as web page (.html)" export.
  python3 -I scripts/build_guided.py --keep-book
      Keep the chapters already in guided.html and only refresh the reader
      around them from manuscript.html (after a fix to the Built to Shine
      reader, so both readers stay the same).

guided.html is made from manuscript.html, the Built to Shine reader, so the two
work the same way. What differs, and why:
  - Its own title, password screen text and chapter list.
  - No Launch Team tab: Heather shares Guided only with individual readers.
  - Every localStorage key starts gd_ instead of bts_, so someone who reads both
    books on the same phone keeps a separate reading spot, font size, reader id
    and highlights for each.
  - Every call to /api/manuscript-notes and /api/manuscript-progress carries
    book: 'guided', so notes and reading records stay with this book. The admin
    switch "Manuscript feedback for:" shows one book at a time.
  - Same password as Built to Shine (Ilovetoread), Heather's choice.

The Google Docs export marks formatting with inline styles, not tags. Kept:
  - italic -> <em>, bold (weight 600+) -> <strong>
  - red text (the countdown markers, e.g. "23 days until Guide30.") -> .g-red
  - the two handwriting fonts Heather uses for journal entries (Caveat and
    Indie Flower) -> p.g-hand-a / p.g-hand-b, shown in those fonts
  - centered paragraphs -> p.g-center
  - h1 "Chapter N" -> a new .chapter; h3 -> h3.r-sub; horizontal rules -> divider
Dropped: empty paragraphs and headings, and a paragraph that only repeats the
chapter heading right under it (Chapter 20 has one in the doc). A line of only
dashes ("—--------") is Heather's scene break and becomes the same divider.

It refuses to write if the text that comes out differs from the doc's text by
anything other than what it is meant to drop. Run python3 scripts/check_site.py after.
"""
import html
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(ROOT, "manuscript.html")
OUT = os.path.join(ROOT, "guided.html")
TITLE = "Guided"

HAND_A = "Caveat"
HAND_B = "Indie Flower"


def text_of(fragment):
    t = html.unescape(re.sub(r"<[^>]+>", "", fragment))
    return re.sub(r"\s+", " ", t).strip()


def esc(t):
    return html.escape(t, quote=False)


def convert_inline(fragment):
    """Google Docs spans with inline styles -> <em>/<strong>/<span class="g-red">.
    Returns (html, chars_in_caveat, chars_in_indie, total_chars)."""
    out = []
    cav = ind = tot = 0
    pos = 0
    for m in re.finditer(r"<span\b([^>]*)>(.*?)</span>|<br\s*/?>", fragment, re.S):
        between = fragment[pos:m.start()]
        if text_of(between):
            out.append(esc(html.unescape(re.sub(r"<[^>]+>", "", between))))
        pos = m.end()
        if m.group(0).startswith("<br"):
            out.append("<br>")
            continue
        attrs, inner = m.group(1), m.group(2)
        style = html.unescape((re.search(r'style="([^"]*)"', attrs) or [None, ""])[1])
        # A span can hold <br> or <a>; keep breaks, drop link tags.
        pieces = re.split(r"(<br\s*/?>)", inner)
        seg = ""
        for p in pieces:
            if re.match(r"<br\s*/?>", p):
                seg += "<br>"
            else:
                seg += esc(html.unescape(re.sub(r"<[^>]+>", "", p)))
        n = len(re.sub(r"\s", "", html.unescape(re.sub(r"<[^>]+>", "", inner))))
        tot += n
        if HAND_A in style:
            cav += n
        if HAND_B in style:
            ind += n
        if not seg.strip() and "<br>" not in seg:
            out.append(seg)
            continue
        italic = "font-style:italic" in style
        w = re.search(r"font-weight:(\d+)", style)
        bold = bool(w and int(w.group(1)) >= 600)
        red = re.search(r"(?<![-\w])color:#ff0000", style) is not None
        # Keep leading/trailing spaces outside the tags.
        lead = re.match(r"^\s*", seg).group(0)
        trail = re.search(r"\s*$", seg).group(0)
        core = seg[len(lead):len(seg) - len(trail)] if trail else seg[len(lead):]
        if italic:
            core = "<em>" + core + "</em>"
        if bold:
            core = "<strong>" + core + "</strong>"
        if red:
            core = '<span class="g-red">' + core + "</span>"
        out.append(lead + core + trail)
    rest = fragment[pos:]
    if text_of(rest):
        out.append(esc(html.unescape(re.sub(r"<[^>]+>", "", rest))))
    f = "".join(out)
    for _ in range(3):
        f = re.sub(r"</(em|strong)>(\s*)<\1>", r"\2", f)
    f = re.sub(r"[ \t\r\n ]+", " ", f)
    f = re.sub(r"^(\s|<br>)+|(\s|<br>)+$", "", f)
    return f, cav, ind, tot


DIVIDER = '<p class="divider">&#10022;&#10022;&#10022;</p>'

NUM = {str(i): w for i, w in enumerate(
    "Zero One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen "
    "Fifteen Sixteen Seventeen Eighteen Nineteen Twenty".split())}


def build_main(src):
    raw = open(src, encoding="utf-8").read()
    body = raw[raw.index("<body"):]
    body = body[body.index(">") + 1:]
    if "</body>" in body:
        body = body[:body.rindex("</body>")]

    chapters = []      # [(id, heading, [html blocks])]
    dropped = []       # text that is dropped on purpose, for the check
    kept_text = []
    for m in re.finditer(r"<(p|h[1-6])\b([^>]*)>(.*?)</\1>|<(ul|ol)\b[^>]*>(.*?)</\4>|<hr\b[^>]*>", body, re.S):
        if m.group(0).startswith("<hr"):
            if chapters and (not chapters[-1][2] or chapters[-1][2][-1] != DIVIDER):
                chapters[-1][2].append(DIVIDER)
            continue
        if m.group(4):
            items = []
            for li in re.finditer(r"<li\b[^>]*>(.*?)</li>", m.group(5), re.S):
                h, _, _, _ = convert_inline(li.group(1))
                if text_of(h):
                    items.append("<li>" + h + "</li>")
                    kept_text.append(text_of(h))
            if items and chapters:
                chapters[-1][2].append("<%s>%s</%s>" % (m.group(4), "".join(items), m.group(4)))
            continue
        tag, attrs, inner = m.group(1), m.group(2), m.group(3)
        t = text_of(inner)
        if not t:
            continue
        # A "Chapter N" line typed as a normal paragraph instead of a heading
        # (Chapter 19, October 16, 2026) still starts a chapter, but only when N
        # is the next chapter in order, so a stray line can never split one.
        if tag == "p" and re.fullmatch(r"Chapter\s+%d" % (len(chapters) + 1), t):
            tag = "h1"
        if tag == "h1":
            mm = re.match(r"^Chapter\s+(\d+)$", t)
            if not mm:
                raise SystemExit("Unexpected top-level heading: %r" % t)
            chapters.append(("ch" + mm.group(1), t, []))
            kept_text.append(t)
            continue
        if not chapters:
            raise SystemExit("Text before Chapter 1, which this book does not have yet: %r" % t[:80])
        cid, heading, blocks = chapters[-1]
        if tag == "p" and t == heading and not blocks:
            dropped.append(t)
            continue
        # A line of only dashes is Heather's scene break. She asked for the
        # same divider as Built to Shine (October 16, 2026).
        if tag == "p" and re.fullmatch(r"[-\u2010-\u2015\u2212]{3,}", t.replace(" ", "")):
            dropped.append(t)
            if not blocks or blocks[-1] != DIVIDER:
                blocks.append(DIVIDER)
            continue
        h, cav, ind, tot = convert_inline(inner)
        kept_text.append(text_of(h))
        if tag.startswith("h"):
            blocks.append('<h3 class="r-sub">' + h + "</h3>")
            continue
        cls = []
        if tot and cav * 2 > tot:
            cls.append("g-hand g-hand-a")
        elif tot and ind * 2 > tot:
            cls.append("g-hand g-hand-b")
        style = html.unescape((re.search(r'style="([^"]*)"', attrs) or [None, ""])[1])
        if "text-align:center" in style:
            cls.append("g-center")
        blocks.append(("<p class=\"%s\">" % " ".join(cls) if cls else "<p>") + h + "</p>")

    nums = [int(c[0][2:]) for c in chapters]
    if nums != list(range(1, len(nums) + 1)):
        raise SystemExit("Chapters are not numbered 1 to N in order: %r" % nums)

    # Text check: everything in the doc must come out, except what is dropped on purpose.
    doc_text = []
    for m in re.finditer(r"<(p|h[1-6]|li)\b[^>]*>(.*?)</\1>", body, re.S):
        t = text_of(m.group(2))
        if t:
            doc_text.append(t)
    norm = lambda xs: re.sub(r"\s+", " ", " ".join(xs)).replace(" ", " ").split()
    want = norm(doc_text)
    for d in [x for x in dropped if re.fullmatch(r"[-\u2010-\u2015\u2212 ]{3,}", x)]:
        dw = d.split()
        for i in range(len(want)):
            if want[i:i + len(dw)] == dw:
                del want[i:i + len(dw)]
                break
    for d in [x for x in dropped if not re.fullmatch(r"[-\u2010-\u2015\u2212 ]{3,}", x)]:
        # a repeated heading: remove the copy that follows the heading
        dw = d.split()
        for i in range(len(want)):
            if want[i:i + len(dw)] == dw and i > 0 and want[i - len(dw):i] == dw:
                del want[i:i + len(dw)]
                break
    got = norm(kept_text)
    if want != got:
        for i, (a, b) in enumerate(zip(want, got)):
            if a != b:
                raise SystemExit("Text differs at word %d: doc %r vs reader %r" % (i, " ".join(want[i-5:i+5]), " ".join(got[i-5:i+5])))
        raise SystemExit("Text length differs: doc %d words, reader %d" % (len(want), len(got)))

    main = ['<main class="reader" id="reader">']
    for cid, heading, blocks in chapters:
        main.append('<div class="chapter" id="%s">' % cid)
        main.append('<h2 class="r-title">%s</h2>' % esc(heading))
        main.extend(blocks)
        main.append("</div>")
    main.append("</main>")
    words = len(got)
    return "\n".join(main), chapters, dropped, words


def chapters_from_main(main_html):
    out = []
    for m in re.finditer(r'<div class="chapter" id="(ch\d+)">\s*<h2 class="r-title">(.*?)</h2>', main_html):
        out.append((m.group(1), html.unescape(m.group(2)), None))
    return out


def build_page(main_html, chapters):
    t = open(TEMPLATE, encoding="utf-8").read()

    def cut(s, start_marker, end_marker, label, keep_end=False):
        a = s.find(start_marker)
        b = s.find(end_marker, a)
        if a < 0 or b < 0:
            raise SystemExit("Template changed: could not find " + label)
        return s[:a] + (s[b:] if keep_end else s[b + len(end_marker):])

    # 1. Launch Team: sidebar entries, the two panels, and its script block.
    t = cut(t, '<div class="sidebar-title lt-side-title">', "\n</nav>", "launch team sidebar", keep_end=True)
    a = t.find("<!-- Launch Team tab.")
    p2 = t.find('<section class="lt-panel" id="ltPosts"', a)
    if a < 0 or p2 < 0:
        raise SystemExit("Template changed: launch team panels not found")
    t = t[:a] + t[t.index("</section>\n", p2) + len("</section>\n"):]
    a = t.find("<script>\n// ─── Launch Team tab")
    if a < 0:
        raise SystemExit("Template changed: launch team script not found")
    b = t.index("</script>\n", a) + len("</script>\n")
    t = t[:a] + t[b:]

    # 2. The book itself.
    a, b = t.index('<main class="reader" id="reader">'), t.index("</main>") + len("</main>")
    t = t[:a] + main_html + t[b:]

    # 3. Chapter list.
    a = t.index('<div class="sidebar-title">')
    b = t.index("\n</nav>", a)
    links = ['<div class="sidebar-title">%s</div>' % TITLE]
    for cid, heading, _ in chapters:
        links.append('<a href="#" class="nav-ch" data-ch="%s">%s</a>' % (cid, esc(heading)))
    t = t[:a] + "\n".join(links) + "\n" + t[b:]

    # 4. Title and password screen.
    t = re.sub(r"<title>.*?</title>", "<title>%s - Manuscript Preview</title>" % TITLE, t, count=1)
    old_gate = re.search(r'(<div class="gate-box">\s*<h1>)(.*?)(</h1>\s*<p>)(.*?)(</p>)', t, re.S)
    if not old_gate:
        raise SystemExit("Template changed: password screen not found")
    t = t[:old_gate.start()] + old_gate.group(1) + TITLE + old_gate.group(3) + \
        "Manuscript preview.<br>Enter the password to read." + old_gate.group(5) + t[old_gate.end():]

    # 5. Its own storage, so the two books never share a reading spot or highlights.
    n_before = len(re.findall(r"bts_", t))
    t = re.sub(r"(['\"])bts_", r"\1gd_", t)
    left = re.findall(r".{0,40}bts_.{0,20}", t)
    left = [x for x in left if "BTS_" not in x]
    if left:
        raise SystemExit("Some storage keys still say bts_: %r" % left[:5])

    # 6. Label every notes and progress call with the book.
    # Bodies: every object that carries the password also carries the book.
    t, n_body = re.subn(r"pass_hash:(BTS_HASH|passHash)\b", r"pass_hash:\1,book:'guided'", t)
    # Query strings on the two manuscript APIs.
    t, n_query = re.subn(r"(/api/manuscript-(?:notes|progress))\?pass_hash=", r"\1?book=guided&pass_hash=", t)
    # Prove it: no password-carrying object or manuscript API query is left unlabeled.
    for m in re.finditer(r"pass_hash:[A-Za-z_]+\b", t):
        if not t[m.end():m.end() + 15].startswith(",book:'guided'"):
            raise SystemExit("A manuscript API body does not say book: guided near: %r" % t[m.start() - 80:m.end() + 80])
    for m in re.finditer(r"/api/manuscript-(notes|progress)\?(?!book=guided)", t):
        raise SystemExit("A manuscript API query does not say book=guided near: %r" % t[m.start() - 40:m.end() + 80])
    if "/api/launch-kit" in t:
        raise SystemExit("Launch kit code is still in the page")

    # 7. Fonts and styles for the journal entries and red markers.
    t = t.replace("family=Inter:wght@300;400;500;600&display=swap",
                  "family=Inter:wght@300;400;500;600&family=Caveat:wght@400;600&family=Indie+Flower&display=swap", 1)
    style = (".g-red{color:#c0392b;}\n"
             ".chapter p.g-hand{font-size:1.25em;line-height:1.5;margin-bottom:6px;color:#2b3a55;}\n"
             ".chapter p.g-hand-a{font-family:'Caveat',cursive;}\n"
             ".chapter p.g-hand-b{font-family:'Indie Flower',cursive;font-size:1.1em;}\n"
             ".chapter p.g-center{text-align:center;}\n")
    t = t.replace("</style>", style + "</style>", 1)

    header = ("<!-- Built by scripts/build_guided.py from manuscript.html. Do not edit by hand:\n"
              "     change manuscript.html or the script and rebuild. -->\n")
    t = t.replace("<!DOCTYPE html>\n", "<!DOCTYPE html>\n" + header, 1)
    return t, n_before, n_body, n_query


def main():
    args = sys.argv[1:]
    if args == ["--keep-book"]:
        cur = open(OUT, encoding="utf-8").read()
        a, b = cur.index('<main class="reader" id="reader">'), cur.index("</main>") + len("</main>")
        main_html = cur[a:b]
        chapters = chapters_from_main(main_html)
        dropped, words = [], len(text_of(main_html).split())
    elif len(args) == 1:
        main_html, chapters, dropped, words = build_main(args[0])
    else:
        raise SystemExit(__doc__)
    page, n_keys, n_body, n_query = build_page(main_html, chapters)
    open(OUT, "w", encoding="utf-8").write(page)
    print("wrote guided.html: %d chapters, %d words" % (len(chapters), words))
    print("dropped on purpose: %r" % dropped)
    print("storage keys moved to gd_: %d; API calls labeled: %d body, %d query" % (n_keys, n_body, n_query))


if __name__ == "__main__":
    main()
