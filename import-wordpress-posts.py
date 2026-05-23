#!/usr/bin/env python3
"""
WordPress Post Import Script
Pulls remaining blog posts from the old WordPress site and converts them
to static HTML files matching the new site's blog post template.

Usage:
    python3 import-wordpress-posts.py

Requires: pip install beautifulsoup4 requests
"""

import os
import re
import sys

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Installing dependencies...")
    os.system("pip install requests beautifulsoup4 --break-system-packages")
    import requests
    from bs4 import BeautifulSoup

WORDPRESS_BASE = "https://d9b.09a.myftpupload.com"
OUTPUT_DIR = "blog"

# Posts to import (slug, category, date, prev_slug, next_slug)
POSTS_TO_IMPORT = [
    # Highlighted series (in reverse chronological order so navigation works)
    ('highlighted-2-samuel-226-27', '2-samuel-2-26', 'Highlighted', 'February 25, 2026', '2-samuel-5-19', '1-samuel-30-24'),
    ('highlighted-1-samuel-3024', '1-samuel-30-24', 'Highlighted', 'February 23, 2026', '2-samuel-2-26', '1-samuel-22-1'),
    ('highlighted-1-samuel-221-2', '1-samuel-22-1', 'Highlighted', 'February 20, 2026', '1-samuel-30-24', '1-samuel-16-18'),
    ('highlighted-1-samuel-1618', '1-samuel-16-18', 'Highlighted', 'February 18, 2026', '1-samuel-22-1', '1-samuel-15-17'),
    ('highlighted-1-samuel-1517', '1-samuel-15-17', 'Highlighted', 'February 16, 2026', '1-samuel-16-18', '1-samuel-14-8'),
    ('highlighted-1-samuel-148', '1-samuel-14-8', 'Highlighted', 'February 13, 2026', '1-samuel-15-17', 'judges-2-10'),
    ('highlighted-judges-210', 'judges-2-10', 'Highlighted', 'February 11, 2026', '1-samuel-14-8', 'deuteronomy-21-23'),
    ('deuteronomy-2123', 'deuteronomy-21-23', 'Highlighted', 'February 8, 2026', 'judges-2-10', 'exodus-24-11'),
    ('highlighted-exodus-2411', 'exodus-24-11', 'Highlighted', 'February 6, 2026', 'deuteronomy-21-23', 'exodus-20-20'),
    ('highlighted-exodus-2020', 'exodus-20-20', 'Highlighted', 'February 4, 2026', 'exodus-24-11', 'exodus-14-15'),
    ('highlighted-exodus-1415', 'exodus-14-15', 'Highlighted', 'February 2, 2026', 'exodus-20-20', None),
    # Christian Living essays
    ('the-two-hardest-words-in-the-english-language', 'two-hardest-words', 'Christian Living', '2026', None, None),
    ('teach-your-children-generosity', 'teach-your-children-generosity', 'Christian Living', '2026', None, None),
    ('grace', 'grace', 'Christian Living', '2026', None, None),
    ('shhh-hes-sleeping', 'shhh-hes-sleeping', 'Christian Living', '2026', None, None),
    ('the-stupid-elevator', 'the-stupid-elevator', 'Christian Living', '2026', None, None),
]

TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} — Heather Lyn Wilson</title>
<meta name="description" content="{description}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,500&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/main.css">
<link rel="stylesheet" href="../css/post.css">
</head>
<body>

<div class="topbar">
<div class="wrap-wide">
<div class="topbar-row">
<div class="social-row">
<a href="https://www.facebook.com/HLWWilson" target="_blank">Facebook</a>
<a href="https://instagram.com/heatherlynwilson" target="_blank">Instagram</a>
<a href="https://www.amazon.com/stores/Heather-L-Wilson/author/B0FDBQVGR5" target="_blank">Amazon</a>
<a href="mailto:Heather@HeatherLynWilson.com">Email</a>
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
<a href="../index.html">Home</a>
<a href="../about.html">About</a>
<a href="../books.html">Books</a>
<a href="../speaking.html">Speaking</a>
<a href="../blog.html" class="active">Blog</a>
<a href="../contact.html">Contact</a>
</nav>
</div>
</div>
</header>

<main>

<section class="post-hero">
<div class="wrap">
<a href="../blog.html" class="cat-link">{category}</a>
<h1>{display_title}</h1>
<div class="post-date">{date}</div>
</div>
</section>

<article class="post-body">
<div class="post-body-inner">
{verse_block}
{body}
{question_block}
</div>
</article>

{post_nav}

<div class="back-to-blog">
<a href="../blog.html">← Back to all posts</a>
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
<span>© 2026 HeatherLynWilson.com</span>
<span>Eastern Shore, Maryland</span>
</div>
</div>
</footer>

</body>
</html>
'''


def fetch_post(slug):
    """Fetch a WordPress post and return parsed content."""
    url = f"{WORDPRESS_BASE}/{slug}/"
    print(f"  Fetching {url}...")
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return BeautifulSoup(response.text, 'html.parser')


def extract_post_content(soup):
    """Extract the post body, verse, and question from the WordPress page."""
    # Find the main article content (Kadence theme uses .entry-content)
    content_div = soup.find('div', class_='entry-content') or soup.find('article')
    if not content_div:
        return None, None, None

    # Get all paragraphs
    paragraphs = content_div.find_all('p')
    if not paragraphs:
        return None, None, None

    # First paragraph might be the date, second is usually the verse
    body_paragraphs = []
    verse = None
    verse_ref = None
    question = None

    for i, p in enumerate(paragraphs):
        text = p.get_text(strip=True)
        if not text:
            continue
        # Skip dates like "March 11, 2026"
        if re.match(r'^[A-Z][a-z]+ \d+,?\s*\d{4}', text) and i < 2:
            continue
        # Verse detection: starts with quote and ends with bible reference
        if i < 3 and text.startswith('"') and ('(NLT)' in text or '(NIV)' in text or '(ESV)' in text):
            # Split verse from reference
            ref_match = re.search(r'([12]?\s*[A-Z][a-z]+\s*\d+:\d+[\d\s&:–\-]*\(NLT\))', text)
            if ref_match:
                verse_ref = ref_match.group(1).strip()
                verse = text.replace(verse_ref, '').strip()
            else:
                verse = text
            continue
        # Question detection: last paragraph that's a question
        if i == len(paragraphs) - 1 and text.endswith('?'):
            question = text
            continue
        body_paragraphs.append(p)

    body_html = '\n'.join(str(p) for p in body_paragraphs)
    return verse, verse_ref, body_html, question


def build_post(wp_slug, new_slug, category, date, prev_slug, next_slug):
    """Build an HTML file for a single post."""
    soup = fetch_post(wp_slug)
    if not soup:
        print(f"  FAIL: Could not fetch {wp_slug}")
        return False

    # Get title
    title_tag = soup.find('h1') or soup.find('title')
    full_title = title_tag.get_text(strip=True) if title_tag else new_slug
    # Strip site suffix
    full_title = full_title.split(' - HeatherLynWilson')[0]
    # Strip "Highlighted " prefix to get clean title
    clean_title = full_title.replace('Highlighted ', '').strip()

    result = extract_post_content(soup)
    if not result or not result[2]:
        print(f"  FAIL: Could not extract content from {wp_slug}")
        return False

    verse, verse_ref, body_html, question = result

    # Build template variables
    verse_block = ''
    if verse:
        verse_block = f'<div class="verse">{verse}'
        if verse_ref:
            verse_block += f'<span class="ref">{verse_ref}</span>'
        verse_block += '</div>'

    question_block = f'<div class="question">{question}</div>' if question else ''

    # Post nav
    nav_items = []
    if prev_slug:
        nav_items.append(f'<a href="{prev_slug}.html" class="prev"><div class="label">← Previous</div><div class="title">Previous Post</div></a>')
    if next_slug:
        nav_items.append(f'<a href="{next_slug}.html" class="next"><div class="label">Next →</div><div class="title">Next Post</div></a>')

    post_nav = ''
    if nav_items:
        post_nav = f'<nav class="post-nav"><div class="post-nav-row">{"".join(nav_items)}</div></nav>'

    # Display title
    if category == 'Highlighted':
        display_title = f'Highlighted: {clean_title}'
    else:
        display_title = clean_title

    description = (verse or body_html)[:150].replace('"','').replace('<p>','').replace('</p>','').strip() + '...'

    html = TEMPLATE.format(
        title=full_title,
        display_title=display_title,
        description=description,
        category=category,
        date=date,
        verse_block=verse_block,
        body=body_html,
        question_block=question_block,
        post_nav=post_nav,
    )

    output_path = os.path.join(OUTPUT_DIR, f'{new_slug}.html')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"  OK: Created {new_slug}.html")
    return True


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print(f"Importing {len(POSTS_TO_IMPORT)} posts from {WORDPRESS_BASE}\n")

    success = 0
    failed = []

    for wp_slug, new_slug, category, date, prev_slug, next_slug in POSTS_TO_IMPORT:
        print(f"Processing {new_slug}...")
        try:
            if build_post(wp_slug, new_slug, category, date, prev_slug, next_slug):
                success += 1
            else:
                failed.append(wp_slug)
        except Exception as e:
            print(f"  ERROR: {e}")
            failed.append(wp_slug)

    print(f"\n{'='*50}")
    print(f"Done. {success}/{len(POSTS_TO_IMPORT)} posts imported.")
    if failed:
        print(f"\nFailed posts (try fetching manually):")
        for s in failed:
            print(f"  - {WORDPRESS_BASE}/{s}/")


if __name__ == '__main__':
    main()
