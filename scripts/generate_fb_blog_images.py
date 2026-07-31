#!/usr/bin/env python3
"""Generate the branded Facebook image for each queued blog post.

Reads content-queue/schedule.json, and for every post that does not yet have
images/blog-fb/<slug>.png, draws the post title and verse onto the blog
template (images/fb-template-blog.png) using the brand fonts in fonts/.

The blog-cron Worker posts to Facebook at 8:05am ET, before the publish
workflow runs, so these images must exist ahead of publish day. This script
is idempotent: existing images are left alone. Run it any time posts are
added to the queue.
"""

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(ROOT, "images", "fb-template-blog.png")
OUT_DIR = os.path.join(ROOT, "images", "blog-fb")
FONTS = os.path.join(ROOT, "fonts")

INK = (31, 41, 55)
INK_SOFT = (75, 85, 99)
INK_QUIET = (140, 134, 122)


def font(path, size, weight=None):
    f = ImageFont.truetype(os.path.join(FONTS, path), size)
    if weight is not None:
        f.set_variation_by_axes([weight])
    return f


def wrap(draw, text, fnt, max_width):
    lines, cur = [], ""
    for word in text.split():
        trial = (cur + " " + word).strip()
        if draw.textlength(trial, font=fnt) <= max_width or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def draw_centered(draw, lines, fnt, start_y, line_height, fill):
    y = start_y
    for line in lines:
        w = draw.textlength(line, font=fnt)
        draw.text(((1080 - w) / 2, y), line, font=fnt, fill=fill)
        y += line_height
    return y


def render(post, out_path):
    img = Image.open(TEMPLATE).convert("RGB")
    draw = ImageDraw.Draw(img)

    title = post.get("title") or post.get("card_title") or "New on the Blog"
    verse = (post.get("verse") or "").strip().strip('"“”')
    ref = (post.get("verse_ref") or "").strip()
    highlighted = (post.get("category") or "").lower() == "highlighted"

    # Highlighted series posts get the torn-paper series photo as a framed
    # header, covering the generic "NEW ON THE BLOG" eyebrow.
    content_top = 230
    if highlighted:
        banner_path = os.path.join(ROOT, "images", "highlighted-share.jpg")
        if os.path.exists(banner_path):
            banner = Image.open(banner_path).convert("RGB")
            bw = 560
            bh = round(banner.height * bw / banner.width)
            banner = banner.resize((bw, bh), Image.LANCZOS)
            frame = Image.new("RGB", (bw + 28, bh + 28), (255, 255, 255))
            frame.paste(banner, (14, 14))
            fx = (1080 - frame.width) // 2
            fy = 64
            # soft drop shadow
            shadow = Image.new("RGB", (frame.width + 12, frame.height + 12), (222, 216, 204))
            img.paste(shadow, (fx - 2, fy + 2))
            img.paste(frame, (fx, fy))
            content_top = fy + frame.height + 50

    # Title in Lora bold, sized down as it gets longer
    for size in (72, 64, 56, 48):
        t_font = font("Lora-Variable.ttf", size, 700)
        t_lines = wrap(draw, title, t_font, 860)
        if len(t_lines) <= 3:
            break
    t_lh = int(size * 1.3)

    # Verse in Lora italic, sized to fit
    max_v_lines = 5 if highlighted else 8
    v_lines, v_font, v_lh = [], None, 0
    if verse:
        for v_size in (40, 36, 32, 28, 24, 22):
            v_font = font("Lora-Italic-Variable.ttf", v_size, 500)
            v_lines = wrap(draw, "“" + verse + "”", v_font, 840)
            if len(v_lines) <= max_v_lines:
                break
        v_lh = int(v_size * 1.5)

    gap = 50 if highlighted else 70
    block = len(t_lines) * t_lh
    if v_lines:
        block += gap + len(v_lines) * v_lh
    if ref:
        block += 46
    avail_bottom = 1020
    start_y = max(content_top, content_top + (avail_bottom - content_top - block) / 2)

    y = draw_centered(draw, t_lines, t_font, start_y, t_lh, INK)
    if v_lines:
        y = draw_centered(draw, v_lines, v_font, y + gap, v_lh, INK_SOFT)
    if ref:
        r_font = font("Inter-Variable.ttf", 26, 500)
        r_text = ref.upper()
        w = draw.textlength(r_text, font=r_font)
        draw.text(((1080 - w) / 2, y + 24), r_text, font=r_font, fill=INK_QUIET)

    img.save(out_path, optimize=True)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(ROOT, "content-queue", "schedule.json")) as f:
        schedule = json.load(f)

    made = []
    for entry in schedule.get("posts", []):
        slug = entry["slug"]
        out_path = os.path.join(OUT_DIR, slug + ".png")
        if os.path.exists(out_path):
            continue
        post = dict(entry)
        queue_file = os.path.join(ROOT, "content-queue", slug + ".json")
        if os.path.exists(queue_file):
            with open(queue_file) as qf:
                post.update(json.load(qf))
        try:
            render(post, out_path)
            made.append(slug)
        except Exception as e:
            print(f"FAILED {slug}: {e}", file=sys.stderr)

    print(f"generated {len(made)} image(s)" + (": " + ", ".join(made) if made else ""))


if __name__ == "__main__":
    main()
