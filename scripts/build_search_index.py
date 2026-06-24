#!/usr/bin/env python3
"""Build a JSON search index from blog posts + main pages.

Writes /search-index.json at the repo root. The frontend (js/search.js)
fetches this file on first search and does plain substring matching
client-side.

Run automatically after each publish from publish_queue.py, and can be
run by hand:

    python3 scripts/build_search_index.py
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "search-index.json")
BLOG_DIR = os.path.join(ROOT, "blog")

# Top-level pages we want findable.
TOP_PAGES = [
    ("about.html", "About Heather", "Author, speaker, mom, and co-founder of GiveSendGo."),
    ("books.html", "Books", "Built to Shine, Are You That Dude's Girlfriend, You Can't Hide the Fruit, I Am NOT a Banana, the Journal."),
    ("speaking.html", "Speaking", "Heather speaks on faith, leadership, and courage. Booking information."),
    ("projects.html", "Projects", "GiveSendGo, Film Launcher, tr8ts, GiverGames, Connectly, Read.that, Wired, My Story Quests."),
    ("blog.html", "Blog", "Highlighted Scripture reflections and Christian Living essays."),
    ("contact.html", "Contact", "Get in touch with Heather."),
    ("booking.html", "Book a Call", "Schedule a 30 or 60 minute call."),
    ("challenge.html", "Bible Challenge", "Read the Bible in a month with Heather."),
    ("31-days-in-the-word.html", "31 Days in the Word", "Free guide for reading the Bible in a month."),
]


def strip_html(html):
    # Drop scripts, styles
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
    # Replace tags with spaces
    text = re.sub(r"<[^>]+>", " ", html)
    # Decode a handful of entities
    for old, new in [("&nbsp;", " "), ("&amp;", "&"), ("&mdash;", "—"),
                     ("&ndash;", "–"), ("&lt;", "<"), ("&gt;", ">"),
                     ("&quot;", "\""), ("&#39;", "'"), ("&apos;", "'")]:
        text = text.replace(old, new)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract(field, html):
    m = re.search(r'<' + field + r'[^>]*>([^<]+)</' + field + r'>', html, re.I)
    return strip_html(m.group(1)) if m else ""


def extract_meta(name, html):
    m = re.search(r'<meta\s+name=["\']' + re.escape(name) + r'["\']\s+content=["\']([^"\']+)["\']', html, re.I)
    return m.group(1).strip() if m else ""


def category_from_html(html):
    m = re.search(r'<a[^>]*class="cat-link"[^>]*>([^<]+)</a>', html, re.I)
    return strip_html(m.group(1)) if m else ""


def index_blog_post(path):
    slug = os.path.splitext(os.path.basename(path))[0]
    with open(path, encoding="utf-8") as f:
        html = f.read()
    title_full = extract("title", html)
    # Strip the site suffix
    title = re.sub(r"\s*[—-]\s*Heather Lyn Wilson\s*$", "", title_full).strip()
    description = extract_meta("description", html)
    category = category_from_html(html)
    # Pull body text from inside the post body
    body_match = re.search(r'<div class="post-body-inner">(.*?)</div>\s*</article>', html, re.S | re.I)
    body_html = body_match.group(1) if body_match else html
    body = strip_html(body_html)
    return {
        "url": "/blog/" + slug + ".html",
        "title": title,
        "category": category or "Blog",
        "description": description,
        "body": body[:6000],  # cap to keep index small
    }


def index_top_page(rel_path, title, description):
    abs_path = os.path.join(ROOT, rel_path)
    body = ""
    if os.path.exists(abs_path):
        with open(abs_path, encoding="utf-8") as f:
            html = f.read()
        # Take the first <main>...</main> block as primary text
        m = re.search(r"<main[^>]*>(.*?)</main>", html, re.S | re.I)
        body = strip_html(m.group(1) if m else html)
    return {
        "url": "/" + rel_path,
        "title": title,
        "category": "Page",
        "description": description,
        "body": body[:4000],
    }


def main():
    entries = []
    if os.path.isdir(BLOG_DIR):
        for name in sorted(os.listdir(BLOG_DIR)):
            if name.endswith(".html"):
                entries.append(index_blog_post(os.path.join(BLOG_DIR, name)))
    for rel, title, desc in TOP_PAGES:
        entries.append(index_top_page(rel, title, desc))

    payload = {"version": 1, "entries": entries}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {OUT} with {len(entries)} entries ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    main()
