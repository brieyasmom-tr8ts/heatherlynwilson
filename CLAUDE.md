# Heather Lyn Wilson - Personal Site

This is the codebase for **heatherlynwilson.com** — Heather's personal author, speaker, and blog site.

## About Heather

- Author of Built to Shine, Are You That Dude's Girlfriend, You Can't Hide the Fruit, I Am NOT a Banana, and a leather Journal
- Public speaker on faith, leadership, identity, generosity, courage
- Co-founder and co-CEO of GiveSendGo (10 years)
- One of twelve siblings
- Lives on the Eastern Shore of Maryland with husband Dan and kids (Rachel, Brieya, Harmony, Kenzie, and more)
- Site replaces the old WordPress site at d9b.09a.myftpupload.com

## Voice Guidelines

- Plain, sturdy, honest writing
- **NO em dashes anywhere**
- No AI-sounding phrases
- Direct and warm, not corporate
- Faith woven in naturally, not preachy
- Honest estimates over optimistic ones

## Design System

Clean, professional, warm — matching the Kadence WordPress aesthetic but elevated.

### Colors (in css/main.css as CSS variables)
- `--bg: #ffffff` — main background
- `--bg-soft: #f7f4ee` — subtle warm tint
- `--bg-warm: #faf6ef` — section backgrounds
- `--ink: #1f2937` — body text, dark sections
- `--ink-soft: #4b5563` — secondary text
- `--ink-quiet: #6b7280` — captions
- `--accent: #b85638` — primary terracotta accent
- `--accent-deep: #8d3e26` — accent hover
- `--gold: #c8a365` — secondary warm accent
- `--border: #e5e0d5` — borders
- `--shadow-dark: #1a1108` — dark sections

### Typography
- Headlines: **Lora** (warm, modern serif) — was previously Fraunces but Heather didn't like it
- Body: **Inter** (clean sans-serif, weights 300-700)
- Use serif italic only for genuine emphasis, not as decoration on every headline

### Important Style Notes
- Heather dislikes when every headline has the same one-word-italic pattern (AI tell)
- Vary headline styles - some plain, some with italic, some with no decoration
- Subtitles should be CLEAN SANS-SERIF, not italic serif
- Keep buttons simple, not too many CTAs per section

## Tech Stack

- **Static HTML/CSS/JS** (no framework)
- **Cloudflare Pages** for hosting
- **GitHub repo:** to be created as `heatherlynwilson` under the `brieyasmom-tr8ts` org
- **Domain:** heatherlynwilson.com

## Site Structure

```
heatherlynwilson/
├── index.html              # Home page
├── about.html              # About Heather
├── books.html              # 5 books with descriptions
├── speaking.html           # Speaking topics + booking form
├── blog.html               # Blog landing page with category filter
├── contact.html            # Contact form
├── blog/
│   ├── 2-samuel-14-14.html # Highlighted Scripture posts
│   ├── 2-samuel-7-18.html
│   ├── 2-samuel-6-9.html
│   ├── 2-samuel-5-19.html
│   └── love-is.html        # Christian Living essay
├── css/
│   ├── main.css            # Brand system, nav, footer, buttons
│   └── post.css            # Individual blog post styles
├── images/                 # Photos
├── import-wordpress-posts.py  # Script to import remaining blog posts
├── CLAUDE.md               # This file
└── README.md
```

## Scheduled Blog Publishing (auto-publish queue)

Heather drafts blog posts and they publish automatically on a
**Monday / Wednesday / Friday** rhythm at roughly **7am Eastern**. She does
not format anything herself. The workflow:

1. **Heather sends drafts** (one or a batch, any time). For each one, just the
   raw words are fine. She can give a title, a Scripture reference, and a
   reflection question if she has them, but is not required to.
2. **Claude formats and schedules each post.** For every draft:
   - Build a queue file at `content-queue/<slug>.json` (format below).
   - Assign `publish_date` to the **next open Mon/Wed/Fri** by running
     `python3 scripts/publish_queue.py --next-slot`. Schedule a batch in order,
     one per available slot, so they space out across MWF dates.
   - Default category is **Highlighted** unless Heather says otherwise.
   - Follow the voice guidelines (plain, sturdy, no em dashes, no AI phrases).
   - Commit and push the queue files to `main`.
3. **Publishing is automatic.** `.github/workflows/publish-blog.yml` runs each
   morning, and `scripts/publish_queue.py` publishes any post whose date has
   arrived: it writes `blog/<slug>.html`, adds a card to the top of the
   Highlighted section in `blog.html`, bumps the post count, and deletes the
   queue file. Posts in `content-queue/` are inert data, so they are NOT live
   until their date.

Posts go live at 7am Eastern. The script holds a post until it is actually 7am
ET, and the job is scheduled at both 11:00 and 12:00 UTC so it hits 7am in both
daylight saving and standard time. GitHub's scheduler can still run a few
minutes late now and then. The MWF cadence comes from the dates assigned to
each post, so even a delayed run publishes the right post.

### Queue file format (`content-queue/<slug>.json`)

```json
{
  "slug": "stay-in-the-word",
  "card_title": "Stay in the Word",
  "category": "Highlighted",
  "publish_date": "2026-05-25",
  "date_display": "May 25, 2026",
  "description": "One sentence for search results and link previews.",
  "excerpt": "The teaser shown on the blog listing card.",
  "verse": "\"Optional opening Scripture quote.\"",
  "verse_ref": "1 Kings 13:23 (NLT)",
  "body_html": "<p>First paragraph.</p>\n<p>Second paragraph.</p>",
  "question": "Optional reflection question shown at the end."
}
```

`verse`, `verse_ref`, and `question` are optional. `publish_date` is the real
scheduling date (ISO); `date_display` is what readers see.

### What Heather has to do in the repo (one time)

The scheduled job needs permission to publish (commit) on its own. In GitHub:

1. Open the repo, go to **Settings → Actions → General**.
2. Scroll to **Workflow permissions**.
3. Select **Read and write permissions** and click **Save**.

That is the only setup. Actions are on by default. After that, Heather just
sends drafts and posts go live on the MWF schedule with nothing else to do.

## What's Done

- [x] Homepage with hero, offerings, GiveSendGo, featured book, story strip, footer
- [x] About page
- [x] Books page (5 books with descriptions and Amazon + direct sale buttons)
- [x] Speaking page (topics, audiences, photos, booking form)
- [x] Blog landing page with category filtering (Highlighted, Christian Living)
- [x] 5 blog posts imported from WordPress (4 Highlighted + 1 Christian Living)
- [x] Contact page
- [x] Font swapped from Fraunces to Lora (Heather's preference)
- [x] Speaking photo updated to the smiling blue-jacket shot with GiveSendGo chyron

## What's Still To Do (in priority order)

### 1. Import remaining blog posts from WordPress
Run the import script:
```bash
pip install requests beautifulsoup4
python3 import-wordpress-posts.py
```

This will pull these 16 remaining posts from d9b.09a.myftpupload.com:

**Highlighted (11 more):**
- 2 Samuel 2:26-27, 1 Samuel 30:24, 1 Samuel 22:1-2, 1 Samuel 16:18, 1 Samuel 15:17, 1 Samuel 14:8, Judges 2:10, Deuteronomy 21:23, Exodus 24:11, Exodus 20:20, Exodus 14:15

**Christian Living (5 more):**
- The Two Hardest Words in the English Language, Teach Your Children Generosity, Grace, Shhh He's Sleeping, The Stupid Elevator

After running, **update blog.html** to add cards for each new post (remove the "coming soon" notices).

### 2. Add a "Like" / "Was this helpful?" button to blog posts
Heather wants engagement on blog posts. Build on her Cloudflare D1 stack (she has this set up — she uses it for GiverGames).

**Suggested approach:**
- Cloudflare Worker endpoint `/api/like` that accepts POST with post slug
- D1 table `post_likes (slug TEXT PRIMARY KEY, count INTEGER, updated_at TIMESTAMP)`
- Frontend button on each blog post that shows count and increments on click
- Anonymous (no login), uses localStorage to prevent same-user double-likes
- Style: heart icon + count + "Found this helpful?" text
- Match the terracotta accent color

### 3. Build the "Other Projects" page

Heather wants a page showcasing the other ventures she has built. This is important for credibility — moves her from "author + speaker" to "CEO who builds things." Big for booking speaking engagements.

**Page name:** "Other Projects"
**Link from:** Main navigation AND About page

**Add to main nav** (in this order):
Home, About, Books, Speaking, Other Projects, Blog, Contact

**Add to About page:** A prominent section near the bottom titled something like "Beyond the books" with a link to the Other Projects page.

**Projects to feature on the page:**

1. **GiveSendGo** — Co-founder and co-CEO. Crowdfunding platform built on generosity and hope. The flagship venture, 10 years in. https://www.givesendgo.com

2. **Film Launcher** — Crowdfunding meets streaming for independent films. The only platform that walks a film from funding through streaming with creator ownership intact. Founded by Heather.

3. **tr8ts** — A DISC-based personality assessment app for high schoolers, with **tr8ts Jr** for middle schoolers. Built to help students discover how they are wired and how to understand the people around them. Designed for school settings and youth events. https://tr8ts.com

4. **GiverGames** — Gamified generosity platform. Weekly challenges, leaderboards, stories tab. Built to make generosity a daily practice.

5. **Connectly.social** — A relationship engine, not a contact app. Replaces paper business cards with a digital card shared by link or QR code. After the handshake: scan a card, snap a photo of who you met, and Connectly remembers them for you. Smart nudges remind you to follow up, AI drafts the messages, and your timeline keeps every conversation, voice note, and meeting in one place. Free to start, Pro unlocks unlimited everything at $9.99/month. Tagline: "Build relationships that last." https://connectly.social

Key features to mention:
- Digital business card shared with a tap or QR code
- AI scans paper cards with auto-fill
- Smart nudges so no relationship goes cold
- AI drafts follow-ups, intros, and meeting prep
- Voice notes after every conversation
- Tracks network, meetings, follow-through

6. **Read.that** — A personal reading journal app. Add books, check in with your mood as you read, and when you finish, get a personalized AI summary of your entire reading experience. Not a generic plot summary. Yours. Based on how you actually felt page by page. Fast, pretty, lives on your phone.

7. **Wired** — A Culture Index style behavioral profiling tool for companies and teams. Built because Heather did not want to pay $300 a seat for the corporate version. Take a 10-minute survey, get an AI-written coaching report on how you are wired: your strengths, your kryptonite, how you communicate, and what burns you out. Helps leaders see how their team fits together. Also works for families. Free hobby project for GiveSendGo plus friends and family. Personal note Heather could share: "That is how I found out my husband and I are wired completely opposite. Turns out that is why we argue about chores."

**Note: tr8ts and Wired are intentionally separate products.** tr8ts = DISC for students (high school + middle school). Wired = Culture Index style for adults at companies/teams. Different audiences, different methodologies. Both belong on the page.

8. **My Story Quests** — A choose-your-own-adventure reading app built for families with multiple kids spread across reading levels. Built to inspire kids to read at every age. Each child can explore stories that meet them where they are.

9. **Built to Shine** — Could be listed here too as her book + speaking platform, or kept separate.

**Page layout suggestion:**
- Hero with eyebrow "Other Projects" and headline like "What I am building."
- Brief intro paragraph explaining that beyond writing and speaking, Heather builds platforms aligned with her calling
- Each project as a card or row with: project name, what it is, who it is for, a link to visit it
- Group/order them logically (flagship first, then by category or impact)
- Keep voice consistent with rest of site — plain, sturdy, no AI phrases, no em dashes

**IMPORTANT - ask Heather these questions before building:**
1. Are there any other ventures she wants to add?
2. Which ones should link out to live sites, and which are still in development?
3. Should Built to Shine be on this page or kept separate as a book?
4. Does she want logos or visuals for each, or just text descriptions?

### 4. Add a Press/Media page and Speaker Kit

This is the single highest-ROI addition for booking more speaking engagements. Event organizers vetting Heather will want to see legitimacy.

**Page name:** "Press" or "Media" (add to main nav, or as a subpage of Speaking)

**What to include:**
- "As seen in" or "Featured in" strip with logos of media outlets that have covered Heather or GiveSendGo
- Podcast appearances she's been on (linked, ideally with embedded audio or thumbnails)
- A downloadable speaker kit (PDF) with:
  - Short bio (50 words)
  - Medium bio (150 words)
  - Long bio (400 words)
  - High-resolution headshot options
  - Speaking topics summary
  - Past venues / event types
  - Booking contact info
- Press release contact (her email)
- Suggested interview questions (helps podcast hosts and journalists)

**Ask Heather these questions before building:**
1. Which media outlets has she or GiveSendGo been featured in? (TV, podcasts, print, online)
2. Which podcasts has she appeared on? (links to episodes if possible)
3. Does she have existing press logos saved anywhere?
4. Does she want a "Watch Heather Speak" section with embedded video clips?
5. Does she have an existing speaker one-sheet PDF or should we make one?

### 5. Add testimonials/endorsements to Speaking page (and maybe Books page)

Right now the Speaking page lists topics but has zero social proof. Testimonials transform conversion rate. Without them, Heather is a stranger asking event organizers to trust her. With 3-5 strong quotes, she's someone other leaders already trust.

**Where to add testimonials:**
- Speaking page (top priority) — quotes from event organizers, retreat leaders, conference hosts
- Books page (secondary) — quotes from readers or endorsers
- Home page (consider) — one or two carefully chosen pull quotes near the "Other Projects" section

**Layout suggestion for Speaking page:**
- A section called "What people are saying" with 3-4 cards
- Each card has: pull quote, person's name, title, organization, optional photo
- Could be a horizontal carousel or a grid of 3

**Ask Heather these questions before building:**
1. Can she gather 4-6 testimonial quotes from people who have heard her speak?
2. From whom? (event organizers, retreat leaders, attendees, fellow CEOs, pastors)
3. Does she have written endorsements saved anywhere from past speaking gigs?
4. Any written endorsements for her books she could repurpose?
5. Permission status on each — does she need to confirm with the person before publishing?

### 6. Replace book cover placeholders
All 5 book covers are currently styled colored blocks. Heather needs to upload real book cover images:
- Built to Shine
- Are You That Dude's Girlfriend?
- You Can't Hide the Fruit
- I Am NOT a Banana
- The Journal

Once she sends them, replace the `.book-cover-large` div placeholders in books.html and the homepage's featured book section with actual `<img>` tags.

### 7. Confirm which books sell direct vs Amazon
Heather said it would be a mix. She'll tell you which is which. Update the buttons on books.html accordingly:
- Direct sale = Venmo/PayPal link or form
- Amazon = link to her Amazon author page

### 8. Wire up the forms
Currently all forms use `mailto:Heather@HeatherLynWilson.com`. Upgrade to:
- Either Formspree (easiest)
- Or build a Cloudflare Worker that handles form submission and emails her

Forms to wire up:
- Email signup (homepage, blog, contact, about pages)
- Booking inquiry (speaking page)
- Contact form (contact page)

### 9. Replace placeholder social links
Currently homepage and footer link to Heather's actual:
- Facebook: https://www.facebook.com/HLWWilson ✓
- Instagram: https://instagram.com/heatherlynwilson ✓
- Amazon: https://www.amazon.com/stores/Heather-L-Wilson/author/B0FDBQVGR5 ✓
- Email: Heather@HeatherLynWilson.com ✓
- YouTube: Need to add URL (Heather to provide)
- X/Twitter: Was broken on WordPress site (heathgivesendgo handle but malformed URL). Confirm if needed.

### 10. Deploy to Cloudflare Pages

```bash
git init
```

```bash
git add .
```

```bash
git commit -m "Initial site build"
```

Create repo `heatherlynwilson` on GitHub under `brieyasmom-tr8ts` org. Then:

```bash
git remote add origin https://github.com/brieyasmom-tr8ts/heatherlynwilson.git
```

```bash
git branch -M main
```

```bash
git push -u origin main
```

Then in Cloudflare dashboard:
- Workers & Pages → Create → Pages → Connect to Git
- Select the `heatherlynwilson` repo
- Build command: (leave blank, static site)
- Output directory: `/`
- Deploy
- Add custom domain `heatherlynwilson.com` in Custom Domains tab

### 11. After verification, kill the old WordPress site
At d9b.09a.myftpupload.com — only do this AFTER confirming the new site is live and all blog content is migrated.

## Heather's Preferences (always follow)

- **Always deploy to main** after working on code
- **Separate code blocks per command** (don't combine multiple deploy commands in one box)
- **Call her Heather**
- **Plain sturdy writing**, no AI-sounding prose
- **No em dashes anywhere**
- **Honest estimates** over optimistic ones
- Heather is not a developer — explain things clearly, not in jargon
