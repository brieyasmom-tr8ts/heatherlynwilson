# Blog publishing queue

Each scheduled blog post lives here as one `.json` file until its publish
date arrives. The scheduled GitHub Action (`.github/workflows/publish-blog.yml`)
runs `scripts/publish_queue.py` every morning. When a post's date has come,
it builds the post page in `blog/`, adds a card to `blog.html`, and deletes
the file from this folder.

Posts in this folder are NOT live on the site. They are plain data files,
not pages, so nothing links to them until they publish.

## File format

```json
{
  "slug": "stay-in-the-word",
  "card_title": "Stay in the Word",
  "category": "Highlighted",
  "publish_date": "2026-05-25",
  "date_display": "May 25, 2026",
  "description": "Short sentence used for search results and link previews.",
  "excerpt": "The teaser shown on the blog listing card.",
  "verse": "\"Optional opening Scripture quote.\"",
  "verse_ref": "1 Kings 13:23 (NLT)",
  "body_html": "<p>First paragraph.</p>\n<p>Second paragraph.</p>",
  "question": "Optional reflection question shown at the end."
}
```

`verse`, `verse_ref`, and `question` are optional. Leave them out for a
plain post. `publish_date` is the real date used for scheduling;
`date_display` is what readers see.
