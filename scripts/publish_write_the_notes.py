#!/usr/bin/env python3
"""One-shot publisher for the scheduled essay "Write the Notes".

The post file blog/write-the-notes.html is already committed but unlinked.
Running this links it into the site: card on the blog page's Christian Living
section, published log entry (so the Monday digest email carries it), RSS feed,
and search index. Idempotent: exits quietly if the card is already there.

Scheduled for Wednesday, August 19, 2026 at 6:30pm Eastern. Safe to delete
after it has run.
"""

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

SLUG = "write-the-notes"
TITLE = "Write the Notes"
EXCERPT = ("It wasn't a huge thing. It wasn't complicated. But almost "
           "immediately, I started coming up with reasons why I didn't need to do it.")

CARD = '''
<a href="blog/write-the-notes.html" class="post-card" data-cat="christian-living">
<div class="post-meta">
<span class="category-tag christian-living">Christian Living</span>
<span class="divider"></span>
<span class="date">2026</span>
</div>
<h2>Write the Notes</h2>
<p class="excerpt">It wasn&rsquo;t a huge thing. It wasn&rsquo;t complicated. But almost immediately, I started coming up with reasons why I didn&rsquo;t need to do it.</p>
<span class="read-more">Read post &rarr;</span>
</a>
'''


def main():
    blog_path = os.path.join(ROOT, "blog.html")
    blog = open(blog_path, encoding="utf-8").read()

    if 'href="blog/write-the-notes.html"' in blog:
        print("Card already present; nothing to do.")
        return

    if not os.path.exists(os.path.join(ROOT, "blog", SLUG + ".html")):
        raise SystemExit("Post file blog/" + SLUG + ".html is missing.")

    # Card at the top of the Christian Living grid, bump the essay count
    marker = '<div class="category-section" data-category="christian-living">'
    start = blog.index(marker)
    grid_open = '<div class="posts-grid">'
    grid_pos = blog.index(grid_open, start) + len(grid_open)
    blog = blog[:grid_pos] + "\n" + CARD.strip() + "\n" + blog[grid_pos:]

    import re
    section_head = blog[start:grid_pos]
    m = re.search(r'<span class="count">Essays (?:&middot;|·) (\d+) posts</span>', section_head)
    if m:
        old = m.group(0)
        new = old.replace(m.group(1) + " posts", str(int(m.group(1)) + 1) + " posts")
        blog = blog[:start] + blog[start:grid_pos].replace(old, new) + blog[grid_pos:]

    open(blog_path, "w", encoding="utf-8").write(blog)
    print("Card added to Christian Living section.")

    # Published log so the Monday digest email includes this post
    pub_path = os.path.join(ROOT, "content-queue", "published.json")
    d = json.load(open(pub_path, encoding="utf-8"))
    if not any(p.get("slug") == SLUG for p in d["posts"]):
        d["posts"].append({
            "slug": SLUG,
            "title": TITLE,
            "excerpt": EXCERPT,
            "publish_date": "2026-08-19",
        })
        d["posts"] = d["posts"][-20:]
        json.dump(d, open(pub_path, "w", encoding="utf-8"), indent=2)
        print("Published log updated.")

    # Feed and search index
    import publish_queue
    publish_queue.write_feed()
    import subprocess
    subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "build_search_index.py")], check=True)
    print("Done. Commit, push, and deploy to make it live.")


if __name__ == "__main__":
    main()
