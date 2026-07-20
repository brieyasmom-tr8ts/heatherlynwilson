#!/usr/bin/env python3
"""
Scheduled blog publisher for heatherlynwilson.com.

Posts wait in content-queue/ as JSON files. Each file has a publish_date.
This script publishes any post whose date has arrived (Eastern Time):
it writes the post page into blog/, adds a card to blog.html, bumps the
Highlighted count, then deletes the queue file.

Run with no arguments to publish everything that is due (used by the
GitHub Action). Other modes:

    python3 scripts/publish_queue.py --next-slot
        Print the next open Monday/Wednesday/Friday date (for scheduling).

    python3 scripts/publish_queue.py --dry-run
        Show what would publish today without changing any files.
"""

import argparse
import datetime as dt
import json
import os
import re
import sys
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUEUE_DIR = os.path.join(ROOT, "content-queue")
BLOG_DIR = os.path.join(ROOT, "blog")
BLOG_INDEX = os.path.join(ROOT, "blog.html")
ET = ZoneInfo("America/New_York")

# Monday=0 ... Sunday=6. Heather publishes Mon / Wed / Fri.
PUBLISH_WEEKDAYS = {0, 2, 4}

# Posts go live at 8:30am Eastern. A run before this time holds off.
PUBLISH_HOUR_ET = 8
PUBLISH_MINUTE_ET = 30

# Used for absolute share-preview (Open Graph) URLs.
SITE_URL = "https://heatherlynwilson.com"
HIGHLIGHTED_SHARE_IMAGE = "highlighted-share.jpg"
DEFAULT_SHARE_IMAGE = "headshot-primary.jpeg"

# Fixed description shown on Facebook every time a Highlighted post is shared.
# (The per-post meta description is kept for search engines.)
HIGHLIGHTED_OG_DESCRIPTION = (
    "In January I read the Bible cover to cover and highlighted the verses "
    "that stood out to me along the way. These are my thoughts."
)

HIGHLIGHTED_MARKER = '<div class="category-section" data-category="highlighted">'
NEXT_SECTION_MARKER = '<div class="category-section" data-category="christian-living">'

POST_TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-FKRFZVG2JN"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-FKRFZVG2JN');</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>%%PAGE_TITLE%% &mdash; Heather Lyn Wilson</title>
<meta name="description" content="%%DESCRIPTION%%">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/main.css">
<link rel="stylesheet" href="../css/post.css">
%%OG_TAGS%%</head>
<body>

<div class="topbar">
<div class="wrap-wide">
<div class="topbar-row">
<div class="social-row">
<a href="https://www.facebook.com/HLWWilson" target="_blank">Facebook</a>
<a href="https://instagram.com/heatherlynwilson" target="_blank">Instagram</a>
<a href="https://www.amazon.com/stores/Heather-L-Wilson/author/B0FDBQVGR5" target="_blank">Amazon</a>
</div>
<a href="../blog.html" class="blog-btn">Read My Blog</a>
</div>
</div>
</div>

<header class="masthead">
<div class="wrap-wide">
<div class="masthead-row">
<a href="../index.html" class="wordmark">HeatherLynWilson<span class="com">.com</span></a>
<button class="menu-btn" aria-label="Menu" onclick="document.querySelector('.main-nav').classList.toggle('open')">
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
</button>
<nav class="main-nav">
<div class="nav-dropdown"><a href="../about.html">About</a><div class="nav-dropdown-menu" style="display:none"><a href="../about.html">About Me</a><a href="../projects.html">Projects</a></div></div>
<a href="../books.html">Books</a>
<a href="../speaking.html">Speaking</a>
<a href="../blog.html">Blog</a>
<div class="nav-dropdown"><a href="../challenge.html">Challenge</a><div class="nav-dropdown-menu" style="display:none"><a href="../challenge.html">Bible Reading Challenge</a><a href="../challenge-james.html">One Book Deep: James</a><a href="../challenge-beatitudes.html">Hide It In Your Heart</a><a href="../challenge-proverbs.html">Around the Table</a><a href="../challenge/login.html">My Dashboard</a></div></div>
<div class="nav-dropdown"><a href="../contact.html">Contact</a><div class="nav-dropdown-menu" style="display:none"><a href="../contact.html">Contact Me</a><a href="../booking.html">Book a Call</a></div></div>
</nav>
</div>
</div>
</header>

<main>

<section class="post-hero">
<div class="wrap">
<a href="../blog.html" class="cat-link%%CAT_CLASS%%">%%CATEGORY%%</a>
%%HIGHLIGHTED_INTRO%%
<h1>%%DISPLAY_TITLE%%</h1>
<div class="post-date">%%DATE_DISPLAY%%</div>
</div>
</section>

<article class="post-body">
<div class="post-body-inner">
%%VERSE_BLOCK%%%%BODY%%%%QUESTION_BLOCK%%
</div>
</article>
%%POST_NAV%%
<div class="back-to-blog">
<a href="../blog.html">&larr; Back to all posts</a>
</div>

</main>

<footer class="site-foot">
<div class="wrap">
<div class="foot-grid">
<div class="foot-brand">
<h3>HeatherLynWilson.com</h3>
<p>Helping women lead with faith, courage, and purpose. Author, speaker, and co-founder of GiveSendGo.</p>
</div>
<div class="foot-col">
<h4>Site</h4>
<ul>
<li><a href="../about.html">About Me</a></li>
<li><a href="../books.html">Books</a></li>
<li><a href="../speaking.html">Speaking</a></li>
<li><a href="../blog.html">Blog</a></li>
</ul>
</div>
<div class="foot-col">
<h4>Connect</h4>
<ul>
<li><a href="../contact.html">Contact</a></li>
<li><a href="../booking.html">Book a Call</a></li>
<li><a href="../booking.html">Book a Call</a></li>
<li><a href="https://www.givesendgo.com" target="_blank">GiveSendGo</a></li>
</ul>
</div>
<div class="foot-col">
<h4>Follow</h4>
<ul>
<li><a href="https://www.facebook.com/HLWWilson" target="_blank">Facebook</a></li>
<li><a href="https://instagram.com/heatherlynwilson" target="_blank">Instagram</a></li>
<li><a href="https://www.amazon.com/stores/Heather-L-Wilson/author/B0FDBQVGR5" target="_blank">Amazon</a></li>
</ul>
</div>
</div>
<div class="foot-bottom">
<span>&copy; 2026 HeatherLynWilson.com</span>
<span>Eastern Shore, Maryland</span>
</div>
</div>
</footer>

<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<script src="../js/engagement.js?v=6"></script>
<script src="/js/tracker.js?v=2" async></script>
</body>
</html>
'''

CARD_TEMPLATE = '''<a href="blog/%%SLUG%%.html" class="post-card" data-cat="%%DATA_CAT%%">
<div class="post-meta">
<span class="category-tag %%DATA_CAT%%">%%CATEGORY%%</span>
<span class="divider"></span>
<span class="date">%%DATE_DISPLAY%%</span>
</div>
<h2>%%CARD_TITLE%%</h2>
<p class="excerpt">%%EXCERPT%%</p>
<span class="read-more">Read post &rarr;</span>
</a>'''


def today_et():
    return dt.datetime.now(ET).date()


def load_queue():
    """Return a list of (path, data) for every queued post, oldest date first."""
    if not os.path.isdir(QUEUE_DIR):
        return []
    items = []
    for name in sorted(os.listdir(QUEUE_DIR)):
        if not name.endswith(".json") or name == "schedule.json":
            continue
        path = os.path.join(QUEUE_DIR, name)
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        data["_publish_date"] = dt.date.fromisoformat(data["publish_date"])
        items.append((path, data))
    items.sort(key=lambda pair: pair[1]["_publish_date"])
    return items


def data_cat(category):
    return category.strip().lower().replace(" ", "-")


def find_highlighted_bounds(blog_html):
    start = blog_html.index(HIGHLIGHTED_MARKER)
    end = blog_html.find(NEXT_SECTION_MARKER, start)
    if end == -1:
        end = len(blog_html)
    return start, end


def newest_card_slug(blog_html):
    """Slug of the current top Highlighted card, used for the new post's prev link."""
    start, end = find_highlighted_bounds(blog_html)
    section = blog_html[start:end]
    match = re.search(r'href="blog/([^"]+)\.html" class="post-card"', section)
    return match.group(1) if match else None


def render_post(data, prev_slug):
    category = data["category"]
    card_title = data["card_title"]
    # Highlighted posts: no prefix on title, add intro sentence and series-title class
    display_title = card_title
    highlighted_intro = ""
    cat_class = ""
    if category == "Highlighted":
        highlighted_intro = '<p style="font-size:14px;color:var(--ink-soft);font-weight:300;line-height:1.5;margin:8px auto 16px;max-width:520px;">I read the entire Bible in January. Now I'm revisiting my highlights and blogging about why each verse stood out.</p>'
        cat_class = " series-title"

    verse_block = ""
    if data.get("verse"):
        verse_block = f'\n<div class="verse">{data["verse"]}'
        if data.get("verse_ref"):
            verse_block += f'<span class="ref">{data["verse_ref"]}</span>'
        verse_block += "</div>\n"

    question_block = ""
    if data.get("question"):
        question_block = f'\n<div class="question">{data["question"]}</div>\n'

    post_nav = ""
    if prev_slug:
        post_nav = (
            '\n<nav class="post-nav"><div class="post-nav-row">'
            f'<a href="{prev_slug}.html" class="prev">'
            '<div class="label">&larr; Previous</div>'
            '<div class="title">Previous Post</div></a>'
            "</div></nav>\n"
        )

    body = "\n" + data["body_html"].strip() + "\n"

    page_title = display_title

    share_image = HIGHLIGHTED_SHARE_IMAGE if category == "Highlighted" else DEFAULT_SHARE_IMAGE
    img_url = f"{SITE_URL}/images/{share_image}"
    post_url = f"{SITE_URL}/blog/{data['slug']}.html"
    og_description = HIGHLIGHTED_OG_DESCRIPTION if category == "Highlighted" else data["description"]
    og_tags = (
        '<meta property="og:type" content="article">\n'
        '<meta property="og:site_name" content="Heather Lyn Wilson">\n'
        f'<meta property="og:title" content="{display_title}">\n'
        f'<meta property="og:description" content="{og_description}">\n'
        f'<meta property="og:url" content="{post_url}">\n'
        f'<meta property="og:image" content="{img_url}">\n'
        '<meta name="twitter:card" content="summary_large_image">\n'
        f'<meta name="twitter:image" content="{img_url}">\n'
    )

    out = POST_TEMPLATE
    replacements = {
        "%%PAGE_TITLE%%": page_title,
        "%%DESCRIPTION%%": data["description"],
        "%%CATEGORY%%": category,
        "%%DISPLAY_TITLE%%": display_title,
        "%%HIGHLIGHTED_INTRO%%": highlighted_intro,
        "%%CAT_CLASS%%": cat_class,
        "%%DATE_DISPLAY%%": data["date_display"],
        "%%VERSE_BLOCK%%": verse_block,
        "%%BODY%%": body,
        "%%QUESTION_BLOCK%%": question_block,
        "%%POST_NAV%%": post_nav,
        "%%OG_TAGS%%": og_tags,
    }
    for token, value in replacements.items():
        out = out.replace(token, value)
    return out


def render_card(data):
    cat = data_cat(data["category"])
    out = CARD_TEMPLATE
    replacements = {
        "%%SLUG%%": data["slug"],
        "%%DATA_CAT%%": cat,
        "%%CATEGORY%%": data["category"],
        "%%DATE_DISPLAY%%": data["date_display"],
        "%%CARD_TITLE%%": data["card_title"],
        "%%EXCERPT%%": data["excerpt"],
    }
    for token, value in replacements.items():
        out = out.replace(token, value)
    return out


def insert_card_and_bump(blog_html, card_html):
    start, end = find_highlighted_bounds(blog_html)
    section = blog_html[start:end]

    grid_open = '<div class="posts-grid">'
    grid_pos = section.index(grid_open) + len(grid_open)
    section = section[:grid_pos] + "\n\n" + card_html + "\n" + section[grid_pos:]

    section = re.sub(
        r'(<span class="count">Scripture Reflections &middot; |<span class="count">Scripture Reflections · )(\d+)( posts</span>)',
        lambda m: f"{m.group(1)}{int(m.group(2)) + 1}{m.group(3)}",
        section,
    )

    return blog_html[:start] + section + blog_html[end:]


def publish_due(dry_run=False):
    force = os.environ.get("FORCE_PUBLISH", "").strip().lower() in ("1", "true", "yes")
    if not force and not dry_run:
        now = dt.datetime.now(ET)
        if (now.hour, now.minute) < (PUBLISH_HOUR_ET, PUBLISH_MINUTE_ET):
            print(f"It is {now:%H:%M} ET; holding until {PUBLISH_HOUR_ET}:{PUBLISH_MINUTE_ET:02d}am ET.")
            return False

    queue = load_queue()
    due = [(p, d) for (p, d) in queue if d["_publish_date"] <= today_et()]

    if not due:
        print("Nothing due today.")
        return False

    with open(BLOG_INDEX, encoding="utf-8") as f:
        blog_html = f.read()

    for path, data in due:
        slug = data["slug"]
        prev_slug = newest_card_slug(blog_html)
        post_html = render_post(data, prev_slug)
        card_html = render_card(data)

        print(f"Publishing {slug} (dated {data['publish_date']})")
        if dry_run:
            continue

        with open(os.path.join(BLOG_DIR, f"{slug}.html"), "w", encoding="utf-8") as f:
            f.write(post_html)

        blog_html = insert_card_and_bump(blog_html, card_html)
        os.remove(path)

    if not dry_run:
        with open(BLOG_INDEX, "w", encoding="utf-8") as f:
            f.write(blog_html)
        print(f"Published {len(due)} post(s).")
        # Rebuild the search index so the new post shows up in site search.
        try:
            import subprocess
            subprocess.run(
                ["python3", os.path.join(os.path.dirname(__file__), "build_search_index.py")],
                check=True,
            )
        except Exception as e:
            print(f"Search index rebuild failed: {e}")

    # Output the last published post's info for subscriber notifications.
    if due and not dry_run:
        last = due[-1][1]
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
                f.write(f"post_title={last['card_title']}\n")
                f.write(f"post_excerpt={last['excerpt']}\n")
                f.write(f"post_slug={last['slug']}\n")

    return not dry_run


def collect_taken_dates():
    """Every date already used by a published card or a queued post."""
    taken = set()

    with open(BLOG_INDEX, encoding="utf-8") as f:
        blog_html = f.read()
    start, end = find_highlighted_bounds(blog_html)
    for raw in re.findall(r'<span class="date">([^<]+)</span>', blog_html[start:end]):
        try:
            taken.add(dt.datetime.strptime(raw.strip(), "%B %d, %Y").date())
        except ValueError:
            pass

    for _, data in load_queue():
        taken.add(data["_publish_date"])

    return taken


def next_slot():
    taken = collect_taken_dates()
    future = [d for d in taken if d >= today_et()]
    cursor = (max(future) if future else today_et()) + dt.timedelta(days=1)
    while cursor.weekday() not in PUBLISH_WEEKDAYS or cursor in taken:
        cursor += dt.timedelta(days=1)
    return cursor


def write_schedule():
    """Write content-queue/schedule.json listing all queued posts by date.

    The blog-cron Cloudflare Worker reads this file to know which post
    is due today so it can send the subscriber notification email
    directly, without needing a GitHub token.
    """
    queue = load_queue()
    entries = []
    for _, data in queue:
        entries.append({
            "slug": data["slug"],
            "publish_date": data["publish_date"],
            "title": data["card_title"],
            "excerpt": data.get("excerpt", ""),
            "description": data.get("description", ""),
        })
    manifest = {"posts": entries}
    path = os.path.join(QUEUE_DIR, "schedule.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"Schedule manifest written with {len(entries)} posts.")


def main():
    parser = argparse.ArgumentParser(description="Publish queued blog posts that are due.")
    parser.add_argument("--next-slot", action="store_true", help="Print the next open Mon/Wed/Fri date.")
    parser.add_argument("--dry-run", action="store_true", help="Show what would publish without writing.")
    args = parser.parse_args()

    if args.next_slot:
        slot = next_slot()
        print(f"{slot.isoformat()} ({slot.strftime('%A, %B %d, %Y')})")
        return

    changed = publish_due(dry_run=args.dry_run)

    # Always regenerate the schedule manifest so the worker knows what
    # is coming up, even after a post was just removed from the queue.
    write_schedule()

    # Signal to the workflow whether anything changed.
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
            f.write(f"published={'true' if changed else 'false'}\n")


if __name__ == "__main__":
    main()
