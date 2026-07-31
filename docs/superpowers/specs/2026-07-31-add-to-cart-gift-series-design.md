# Add to Cart: Saturday Gift Series

## Overview

A new "Add to Cart" Facebook series where Heather recommends real gifts she's bought and loved. Two posts every Saturday — morning and evening — auto-posted to the Facebook Page. Heather writes each post and enters it through the admin dashboard. Optional product photo with each post.

**Schedule:** Every Saturday starting September 5, 2026
- 8:23am ET (12:23 UTC) — morning gift post
- 7:45pm ET (23:45 UTC) — evening gift post

## Database

### New table: `gift_posts`

```sql
CREATE TABLE IF NOT EXISTS gift_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scheduled_date TEXT NOT NULL,        -- '2026-09-05' (always a Saturday)
  slot TEXT NOT NULL,                   -- 'morning' or 'evening'
  message TEXT NOT NULL,               -- full post text including hashtags and affiliate link
  image_url TEXT,                      -- optional product photo URL (uploaded via existing image upload system)
  posted_at TEXT,                      -- ISO timestamp when actually posted to FB, NULL if not yet
  fb_post_id TEXT,                     -- FB post ID returned after posting
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(scheduled_date, slot)
);
```

Key points:
- One row per slot per Saturday. The UNIQUE constraint prevents double-booking.
- `posted_at` is NULL until the cron posts it. This is how the worker knows what's queued vs done.
- `image_url` is optional. If present, post as a photo post. If not, post as text + link (FB auto-generates link preview from the Amazon URL in the message).

## Cron Worker Changes

### Timing

The gift posts fire at 12:23 UTC and 23:45 UTC. The existing cron triggers are:
```
"5 10 * * *"    — 6:05am ET (challenge emails)
"5 12 * * *"    — 8:05am ET (blog + traffic digest)
"5 15,22 * * *" — 11:05am/6:05pm ET (FB promo, Tue/Sat/Thu/Sun)
```

Cloudflare allows only 3 cron triggers per worker. We cannot add new triggers.

**Solution:** Add the two gift times to the existing third trigger. Change:
```
"5 15,22 * * *"
```
to:
```
"23 12,45 23,5 15,22 * * *"
```

Wait — that won't work with cron syntax. Cloudflare cron uses standard `minute hour * * *` format, one expression per slot. We need to fit the gift times into the existing 3 triggers or restructure.

**Better solution:** Merge into the third trigger using a broader cron that fires more often, and filter in code (same pattern already used for Tue/Sat/Thu/Sun filtering):

Change trigger 3 to: `"5,23,45 12,15,22,23 * * *"`

This fires at minutes 5/23/45 of hours 12/15/22/23 UTC daily. The code already filters by day-of-week and hour. We add gift post logic:
- 12:23 UTC (minute 23, hour 12) on Saturdays → morning gift post
- 23:45 UTC (minute 45, hour 23) on Saturdays → evening gift post

The extra firings (e.g., minute 23 at hour 15) just hit the else branch and exit — no wasted work.

Actually, simpler: just use **two separate cron expressions** by restructuring:

Current 3 triggers:
1. `"5 10 * * *"` — challenge emails (6:05am ET)
2. `"5 12 * * *"` — blog (8:05am ET)
3. `"5 15,22 * * *"` — FB promo

New 3 triggers — merge challenge + blog into one (they already run at different hours so code can distinguish), freeing up a slot:

1. `"5 10,12 * * *"` — 6:05am and 8:05am ET (challenge emails at h=10, blog at h=12)
2. `"5 15,22 * * *"` — FB promo (unchanged)
3. `"23 12 * * 6,45 23 * * 6"` — gift posts... no, still can't do two times in one expression cleanly.

**Simplest solution:** Keep 3 triggers, expand the third:

```
"5,23,45 12,15,22,23 * * *"
```

In the else branch (trigger 3), the code currently checks hour+day to decide what to post. We add:

```js
const giftMorning = h === 12 && m === 23 && day === 6;  // 12:23 UTC = 8:23am ET, Saturday
const giftEvening = h === 23 && m === 45 && day === 6;  // 23:45 UTC = 7:45pm ET, Saturday
if (giftMorning) await postGiftPost(env, 'morning');
else if (giftEvening) await postGiftPost(env, 'evening');
else if (morningPost || eveningPost) await postFbPromo(env);
```

The extra cron firings (e.g. minute 23 at hour 15) just fall through and do nothing. This is the same pattern already used for the promo posts.

### New function: `postGiftPost(env, slot)`

```js
async function postGiftPost(env, slot) {
  if (!env.FB_PAGE_TOKEN) return;

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  // Find the gift post for today's date and slot that hasn't been posted yet
  const post = await env.DB.prepare(
    "SELECT * FROM gift_posts WHERE scheduled_date = ? AND slot = ? AND posted_at IS NULL"
  ).bind(today, slot).first();

  if (!post) return;  // nothing scheduled for this slot

  const hasImage = !!post.image_url;
  const endpoint = hasImage
    ? `https://graph.facebook.com/v20.0/${FB_PAGE_ID}/photos`
    : `https://graph.facebook.com/v20.0/${FB_PAGE_ID}/feed`;

  const bodyParts = [
    `message=${encodeURIComponent(post.message)}`,
    `access_token=${encodeURIComponent(env.FB_PAGE_TOKEN)}`
  ];
  if (hasImage) bodyParts.push(`url=${encodeURIComponent(post.image_url)}`);

  const fbRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: bodyParts.join("&"),
  });

  if (fbRes.ok) {
    const result = await fbRes.json();
    const fbId = result.id || result.post_id || "";
    await env.DB.prepare(
      "UPDATE gift_posts SET posted_at = datetime('now'), fb_post_id = ? WHERE id = ?"
    ).bind(fbId, post.id).run();
    console.log("Gift post published: " + slot + " " + today);
  } else {
    const err = await fbRes.text();
    console.error("Gift post failed:", err);
    // Same token-expiry alert as promo posts
  }
}
```

Key differences from promo posts:
- No rotation logic — each gift post is a specific scheduled item
- Marks `posted_at` after success so it won't re-post
- No `withAuthor()` wrapper — Heather writes the full post text herself

## Admin UI

### New section: "Add to Cart" in admin.html

Add a new nav button and section after the Facebook Posts section.

**Layout:**
- Section title: "Add to Cart" with gift emoji
- Queue of upcoming Saturdays (next 8 weeks) shown as cards
- Each Saturday card has two slots: Morning (8:23am) and Evening (7:45pm)
- Each slot shows: post preview (truncated), image thumbnail if set, "Posted" badge if done
- Empty slots have a "Add Post" button
- Click any slot to open the edit modal

**Add/Edit modal** (reuse the existing FB modal pattern):
- Slot indicator: "Saturday Sept 5 — Morning (8:23am)"
- Message textarea (full post text)
- Image: URL input + file upload (reuse existing `handleFbImageUpload` / `uploadFbImage` flow)
- Save / Delete buttons
- Character count (FB limit ~63,206 but practical limit ~500 for engagement)

### API endpoint: `/api/gift-posts`

New Pages Function at `functions/api/gift-posts.js`:

**GET** `?key=ADMIN_KEY` — returns all gift posts ordered by date
**POST** `?key=ADMIN_KEY` — create or update a gift post
- Body: `{ scheduled_date, slot, message, image_url? }`
- If a row exists for that date+slot, update it; otherwise insert

**DELETE** `?key=ADMIN_KEY&id=N` — delete a gift post

## What does NOT change

- Existing FB promo rotation (Tue/Thu/Sat/Sun) continues as-is. On Saturdays, the promo still fires at 11:05am and the two gift posts fire at their own times. Three FB posts on Saturdays total.
- Blog auto-posting (MWF) unchanged.
- No changes to the existing `fb_posts` table or post library.

## Implementation order

1. Create `gift_posts` table in D1
2. Create `functions/api/gift-posts.js` API endpoint
3. Add "Add to Cart" section to admin.html
4. Update cron trigger in wrangler.toml
5. Add `postGiftPost()` function and routing logic to worker
6. Deploy worker + pages
7. Heather queues first posts for September 5
