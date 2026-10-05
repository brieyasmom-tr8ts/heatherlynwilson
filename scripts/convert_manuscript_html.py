#!/usr/bin/env python3
"""Rebuild the book inside manuscript.html from an HTML export of the manuscript.

Usage:  python3 scripts/convert_manuscript_html.py path/to/built-to-shine-manuscript.html

Heather's working copy comes as an HTML file (a Google Doc "download as web
page" style export: <h1> chapter headings, <p> paragraphs, <strong>/<em>
inline). This turns it into the reader's own markup and replaces only what is
inside <main class="reader"> ... </main>. Everything outside <main> (the
Launch Team tab, the page scripts) is left alone.

The older scripts/convert_manuscript.js read a Google Drive JSON export and
cannot keep bold or italics. This one keeps them.

What it does, matching the live reader as it was in September 2026:
  - Dedication lines (before the BUILT TO SHINE title) -> .r-dedication block,
    last line as .dedication-close broken after "belong to,"
  - Title, subtitle, editor credit and the Scripture permission notices ->
    .r-front block after the dedication (Heather wanted the NLT/NIV notices in
    the reader, October 1 2026)
  - The table of contents and the BUILT TO SHINE page header repeated before
    each chapter are print furniture and are dropped
  - "A Note Before We Begin" -> h2.r-title in the front section
  - CHAPTER X + next heading -> new .chapter, h2.r-title "Chapter X",
    p.r-subtitle "The Lie of ..."
  - "Lie: ..." and "Truth: ..." lines -> p.r-callout (plain text)
  - ✦✦✦ and ★★★ -> p.divider
  - FROM A WOMAN WHO SHINES -> h3.r-sub; the repeated "The Lie of ..." line
    under it is dropped; "By ..." -> p.byline; the line after -> p.contrib-title
  - "The Truth That Replaces the Lie" heading -> h3.r-sub
  - Empty headings dropped; lists kept as lists
  - A Commissioning -> its own .chapter; About the Author -> p.r-subtitle in it

It prints a summary. Run python3 scripts/check_site.py afterwards.
"""
import html
import re
import sys

MANUSCRIPT = "manuscript.html"

NUMBERS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN",
           "ELEVEN", "TWELVE"]


def text_of(fragment):
    t = html.unescape(re.sub(r"<[^>]+>", "", fragment))
    return re.sub(r"\s+", " ", t).strip()


def clean_inline(fragment):
    """Keep <strong>, <em>, <br>; drop anchors, spans and anything else."""
    f = re.sub(r"<a\b[^>]*>|</a>", "", fragment)
    f = re.sub(r"<(?!/?(strong|em|br)\b)[^>]+>", "", f)
    f = re.sub(r"<br\s*/?>", "<br>", f)
    # Collapse empty or doubled inline tags left behind by the export.
    # An empty tag that only held a space still has to leave the space,
    # or "the<em> </em><strong>best" reads "thebest".
    for _ in range(3):
        f = re.sub(r"<(strong|em)>(\s*)</\1>", lambda m: " " if m.group(2) else "", f)
        f = re.sub(r"</(strong|em)>(\s*)<\1>", r"\2", f)
    f = re.sub(r"[ \t\r\n]+", " ", f).strip()
    # Line breaks at the very start or end of a paragraph are leftovers from
    # the export; breaks in the middle are the author's and stay.
    for _ in range(3):
        f = re.sub(r"^(<(?:strong|em)>)*\s*(<br>\s*)+", lambda m: m.group(1) or "", f)
        f = re.sub(r"(\s*<br>)+\s*((?:</(?:strong|em)>)*)$", r"\2", f)
    # A space just inside an opening tag belongs before it: "the<em> best</em>"
    # must stay "the <em>best</em>", not become "thebest".
    f = re.sub(r"(<(?:strong|em)>)\s+", r" \1", f)
    f = re.sub(r"(\s|^)\s+(<(?:strong|em)>)", r"\1\2", f)
    f = re.sub(r"\s+(</(?:strong|em)>)", r"\1 ", f).strip()
    f = re.sub(r"  +", " ", f)
    return f


def main(src):
    raw = open(src, encoding="utf-8").read()
    # Some exports are a full page, some are just the body content.
    if "<body" in raw:
        body = raw[raw.index("<body"):]
        body = body[body.index(">") + 1:]
    else:
        body = raw
    if "</body>" in body:
        body = body[:body.rindex("</body>")]

    blocks = []
    for m in re.finditer(r"<(p|h1|h2|h3|h4|ul|ol)\b[^>]*>(.*?)</\1>", body, re.S):
        blocks.append((m.group(1), m.group(2)))

    chapters = []           # list of (id, [html lines])
    cur = ("front", [])
    chapters.append(cur)
    out = cur[1]

    i = 0
    n = len(blocks)
    dedication = []
    front_matter = []
    in_front_preamble = True
    pending_subtitle = False
    after_from_woman = 0    # 0 none, 1 expect lie-name/byline, 2 expect contrib title
    chapter_subtitles = set()
    dropped = []

    def new_chapter(cid, title):
        nonlocal cur, out
        cur = (cid, [])
        chapters.append(cur)
        out = cur[1]
        out.append('<h2 class="r-title">' + html.escape(title, quote=False) + "</h2>")

    while i < n:
        tag, inner = blocks[i]
        i += 1
        t = text_of(inner)

        # Front matter up to "A Note Before We Begin".
        if in_front_preamble:
            if t.lower() == "a note before we begin":
                in_front_preamble = False
                if dedication:
                    out.append('<div class="r-dedication">')
                    for k, line in enumerate(dedication):
                        if k == len(dedication) - 1:
                            line = line.replace("belong to, ", "belong to,<br>")
                            out.append('<p class="dedication-close">' + line + "</p>")
                        else:
                            out.append("<p>" + line + "</p>")
                    out.append("</div>")
                if front_matter:
                    out.append('<div class="r-front">')
                    for k, (ftag, fhtml, ftext) in enumerate(front_matter):
                        if k == 0:
                            out.append('<p class="r-front-title">' + html.escape(ftext, quote=False) + "</p>")
                        elif k == 1:
                            out.append('<p class="r-front-sub">' + html.escape(ftext, quote=False) + "</p>")
                        else:
                            out.append('<p class="r-front-note">' + fhtml + "</p>")
                    out.append("</div>")
                out.append('<h2 class="r-title">A Note Before We Begin</h2>')
                continue
            if t.upper() == "BUILT TO SHINE":
                # Title page through the Scripture permissions: kept as a short
                # front page. Anything that is clearly a print instruction stays out.
                front_matter.append(("p", html.escape(t, quote=False), t))
                while i < n and text_of(blocks[i][1]).lower() != "a note before we begin":
                    ft = text_of(blocks[i][1])
                    if ft and ft != "Contents" and not ft.startswith("Right-click this text"):
                        front_matter.append((blocks[i][0], clean_inline(blocks[i][1]), ft))
                    elif ft:
                        dropped.append(ft[:60])
                    i += 1
                continue
            if t:
                dedication.append(html.escape(t, quote=False))
            continue

        if not t:
            continue  # empty headings and paragraphs

        # Print furniture repeated through the body.
        if t.upper() == "BUILT TO SHINE" and i < n and \
                text_of(blocks[i][1]).lower().startswith("for the woman leading"):
            i += 1
            continue
        if t == "Contents" or t.startswith("Right-click this text"):
            dropped.append(t[:60])
            continue

        m = re.match(r"^CHAPTER ([A-Z]+)$", t)
        if tag in ("h1", "h2") and m and m.group(1) in NUMBERS:
            num = NUMBERS.index(m.group(1)) + 1
            new_chapter("ch%d" % num, "Chapter " + m.group(1).capitalize())
            pending_subtitle = True
            after_from_woman = 0
            continue
        if pending_subtitle and tag in ("h1", "h2"):
            out.append('<p class="r-subtitle">' + html.escape(t, quote=False) + "</p>")
            chapter_subtitles.add(t.lower())
            pending_subtitle = False
            continue
        pending_subtitle = False

        if tag == "h1" and t.lower() == "a commissioning":
            new_chapter("commissioning", "A Commissioning")
            continue
        if tag == "h1" and t.lower() == "about the author":
            out.append('<p class="r-subtitle">About the Author</p>')
            continue

        if tag in ("h2", "h3") and t.upper().startswith("FROM A WOM"):
            label = t.rstrip(":")
            line = '<h3 class="r-sub">' + html.escape(label, quote=False) + "</h3>"
            if not out or out[-1] != line:
                out.append(line)
            after_from_woman = 1
            continue
        if tag in ("h2", "h3") and t.lower().startswith("the truth that replaces"):
            out.append('<h3 class="r-sub">' + html.escape(t, quote=False) + "</h3>")
            continue

        if after_from_woman == 1 and t.lower() in chapter_subtitles:
            continue  # "The Lie of ..." repeated under the contributor heading
        if after_from_woman == 1 and t.startswith("By "):
            out.append('<p class="byline">' + clean_inline(inner) + "</p>")
            after_from_woman = 2
            continue
        if after_from_woman == 2:
            out.append('<p class="contrib-title">' + clean_inline(inner) + "</p>")
            after_from_woman = 0
            continue
        after_from_woman = 0

        if re.match(r"^(Lie|Truth):", t):
            out.append('<p class="r-callout">' + html.escape(t, quote=False) + "</p>")
            continue
        if re.fullmatch(r"[✦★\s]+", t):
            out.append('<p class="divider">' + t.replace(" ", "") + "</p>")
            continue

        if tag in ("ul", "ol"):
            items = re.findall(r"<li\b[^>]*>(.*?)</li>", inner, re.S)
            out.append("<" + tag + ">" + "".join("<li>" + clean_inline(x) + "</li>" for x in items) + "</" + tag + ">")
            continue
        if tag in ("h1", "h2", "h3", "h4"):
            # A heading we do not know: keep the words as a paragraph rather
            # than lose them.
            out.append("<p><strong>" + html.escape(t, quote=False) + "</strong></p>")
            continue

        out.append("<p>" + clean_inline(inner) + "</p>")

    ids = [c[0] for c in chapters]
    expected = ["front"] + ["ch%d" % k for k in range(1, 11)] + ["commissioning"]
    if ids != expected:
        sys.exit("Stopped: chapters came out as %s, expected %s. Nothing was written." % (ids, expected))

    main_html = '<main class="reader" id="reader">\n' + "\n".join(
        '<div class="chapter" id="%s">\n%s\n</div>' % (cid, "\n".join(lines)) for cid, lines in chapters
    ) + "\n</main>"

    page = open(MANUSCRIPT, encoding="utf-8").read()
    a = page.index('<main class="reader"')
    b = page.index("</main>") + len("</main>")
    page = page[:a] + main_html + page[b:]
    open(MANUSCRIPT, "w", encoding="utf-8").write(page)

    print("Wrote", len(chapters), "sections:", ", ".join("%s(%d)" % (c[0], len(c[1])) for c in chapters))
    if dropped:
        print("Dropped as print furniture:", " | ".join(dropped))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
