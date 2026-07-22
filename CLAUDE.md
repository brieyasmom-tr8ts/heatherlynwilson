# Heather Lyn Wilson - Personal Site

This is the codebase for **heatherlynwilson.com** — Heather's personal author, speaker, and blog site.

## About Heather

- Author of Built to Shine, Are You That Dude's Girlfriend, You Can't Hide the Fruit, I Am NOT a Banana, and a leather Journal
- **Built to Shine** is the upcoming book launch — for women leading with faith in the business world
- Public speaker on faith, leadership, identity, generosity, courage
- Co-founder and co-CEO of GiveSendGo (10 years)
- One of twelve siblings
- Lives on the Eastern Shore of Maryland with husband Dan and kids (Rachel, Brieya, Harmony, Kenzie, and more)

## Voice Guidelines

- Plain, sturdy, honest writing
- **Minimize em dashes.** AI overuses them in prose, so avoid them in body copy.
  An occasional one is fine where it reads naturally (like a subject line).
  Never do bulk removal sweeps.
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

### Typography
- Headlines: **Lora** (warm, modern serif)
- Body: **Inter** (clean sans-serif, weights 300-700)
- Use serif italic only for genuine emphasis, not as decoration on every headline

### Important Style Notes
- Heather dislikes when every headline has the same one-word-italic pattern (AI tell)
- Vary headline styles
- Subtitles should be CLEAN SANS-SERIF, not italic serif
- Keep buttons simple, not too many CTAs per section

## Tech Stack

- **Static HTML/CSS/JS** (no framework)
- **Cloudflare Pages** for hosting — auto-deploy is BROKEN, use `cloudflare-deploy.yml` workflow
- **Cloudflare Workers** for cron (daily emails) — deploy via `worker-deploy.yml` workflow
- **Cloudflare D1** database `blog-engagement` for all data
- **Brevo** for transactional email
- **GitHub repo:** `heatherlynwilson` under `brieyasmom-tr8ts` org
- **Domain:** heatherlynwilson.com

## Site Structure

```
heatherlynwilson/
├── index.html              # Home page
├── about.html              # About Heather
├── books.html              # 5 books
├── speaking.html           # Speaking topics + booking form
├── blog.html               # Blog landing page with category filter
├── blog/                   # Individual blog posts (60+)
├── contact.html            # Contact form
├── booking.html            # Book a call
├── projects.html           # Other projects / ventures
├── challenge.html          # Bible challenge hub + signup (all challenges)
├── challenge-james.html    # One Book Deep: James signup
├── challenge-beatitudes.html # Hide It In Your Heart signup
├── challenge-proverbs.html # Around the Table signup
├── challenge/
│   ├── dashboard.html      # Combined challenge dashboard (all challenges)
│   ├── login.html          # Magic link login
│   └── ...                 # Certificates, email preview, etc.
├── launch-team.html        # Invite-only book launch team signup (noindex)
├── admin.html              # HeatherLyn Dashboard (admin, noindex)
├── admin-emails.html       # Challenge email editor (admin)
├── content-queue/          # Queued blog posts (auto-publish MWF)
│   └── schedule.json       # Publish schedule (skip in publish script)
├── functions/api/          # Cloudflare Pages Functions (API endpoints)
├── workers/blog-cron/      # Daily email cron worker
├── css/main.css            # Brand system, nav, footer, buttons
├── css/post.css            # Blog post styles
├── scripts/publish_queue.py # Blog auto-publisher
└── CLAUDE.md               # This file
```

## Tracking & Analytics

- **Facebook Meta Pixel** (ID: 1583361526832203) installed on all public pages
  - PageView on every page load
  - Lead event on challenge signups
  - Contact event on contact/speaking forms
  - Subscribe event on email signups
  - ViewContent on books page
- **Google Analytics** (G-FKRFZVG2JN) on all pages
- **Custom page_views table** in D1 with path, referrer, visitor_id, country, region
- **Signup source tracking** — `document.referrer` captured at signup, stored in `source` column
- **State/region tracking** — Cloudflare `cf.region` captured on page views and signups

## Bible Challenges

All challenges run on Cloudflare (Pages Functions + D1 + a cron Worker).

### The challenges

1. **Bible Reading Challenge** (`july-2026`): five tracks: `full-bible`, `new-testament`,
   `chronological` (31 days each), `bible-90`, `chrono-90` (3 months, weekly emails).
   Evergreen: anyone can join any time. Signup: `challenge.html`.
2. **One Book Deep: James + Prayer** (`august-james-2026`): read James every day for 31 days
   plus prayer focus and Lectio Divina journal. Official start August 1, 2026.
3. **Hide It In Your Heart** (`september-beatitudes-2026`): memorize the Beatitudes in 30 days.
   Translation stored in `track` (niv/nlt/esv/kjv). Official start September 1, 2026.
4. **Around the Table** (`october-proverbs-2026`): family devotional, one Proverbs chapter/day.
   Track is `family`. Official start October 1, 2026.

Launch model: first 7 days after official start = fixed cohort; after that = evergreen.

### "Do it with Friends" Group System

Full group challenge feature allowing friends to read together:

**Database tables:**
- `challenge_groups` — id, name, challenge, track, created_by_email, created_at
- `group_members` — group_id, email, name, joined_at (UNIQUE group_id+email)
- `group_messages` — group_id, email, name, message, created_at (280 char limit)

**API endpoints** (all in `functions/api/`):
- `group-create.js` — POST: create group, returns invite URL
- `group-join.js` — GET: public group info for invite page; POST: join a group
- `group-dashboard.js` — GET: members, check-in status, streak, messages
- `group-message.js` — POST: post to encouragement wall (rate limited 20/day)
- `group-list.js` — GET: all groups a user belongs to
- `group-leave.js` — POST: leave a group (auto-deletes empty groups)

**How groups work:**
- Create a group during signup or from the dashboard
- Groups are tied to a challenge and a track (invitees get the same reading plan)
- Invite via shareable link: `challenge?group=XXXXXXXX` or by entering code on dashboard
- Group invite banner shows at top of signup page with member names
- Track picker is hidden for invitees (locked to group's track)
- Already-signed-up users can still join groups
- Dashboard shows group section at top: today's check-ins (avatar circles), group streak,
  member progress cards, encouragement wall, invite link with native share
- Celebration state when everyone checks in: "Everyone read today!"
- Group completion: "Your whole group finished" with gold badge
- Shareable progress card (1080x1080 PNG via canvas, Web Share API on mobile)
- Leave group link at bottom

**Daily emails include group status:**
- Subject line: "Day 18: Genesis 40-43 | Tuesday Bible Study"
- Body: warm card showing "Your group: [name] — 3 of 5 friends read yesterday"
- Group invite URL in welcome emails instead of generic challenge link
- Join notifications emailed to existing members when someone new joins

### Combined dashboard

`challenge/dashboard.html` is a single dashboard for ALL challenges:
- Magic link auth (email + HMAC token)
- Hash routing: `#july-2026`, `#august-james-2026`, etc.
- Group section moves into the active challenge view via insertBefore
- No-group state shows "Start a group" / "Join by code" options
- Group refreshes after any check-in (July, James, Beatitudes, Proverbs)

### Backend pieces

- **D1 database `blog-engagement`** — all tables
- **APIs** in `functions/api/` — challenge-signup, challenge-login, challenge-checkin,
  challenge-journal, group-*, contact, subscribe, stats, etc.
- **Daily emails**: `workers/blog-cron/src/index.js` sends at 6:05am ET
- **Magic link token**: HMAC of `email + ":challenge:" + "2026-10-01"` with NOTIFY_SECRET
- **Signup API returns dashboard token** so frontend can call group-create without
  needing the HMAC secret client-side

### Email content is editable in D1

Challenge emails live in `challenge_emails` table. Edit at `/admin-emails.html`.
The cron worker and dashboards read from DB first, fall back to packaged JSON.

## Scheduled Blog Publishing

MWF at 7am Eastern. `scripts/publish_queue.py` publishes from `content-queue/`.
**Important:** `schedule.json` in content-queue is skipped by the publish script
(it crashed before this fix was added).

## Book Launch

### Built to Shine Launch Team

Invite-only signup page at `launch-team.html` (noindex, nofollow).

- Heather shares the link with specific people she wants on the team
- Signups stored in `launch_team` table with `book` column (default: `built-to-shine`)
- Captures: name, email, social handle, why they want in, 3 commitment checkboxes
- Reusable for future books (just change the `book` value in the form)
- Heather gets email notification for each signup
- Admin dashboard shows Launch Team section with member cards

### Launch Team API

`/api/launch-team` — POST: signup; GET with admin key: list all members.
Duplicate check is per-book (same person can join teams for different books).

## Admin Dashboard (HeatherLyn Dashboard)

`admin.html` — beautiful single-page admin dashboard. Auth via admin key in localStorage.

### Sections (scrollable with sticky nav):
1. **Health Check** — green/yellow status bar
2. **Milestone** — celebration banner at 25/50/75/100/150/200/250/500 signups
3. **Summary Cards** — Visitors, Signups, Subscribers, Groups with trend arrows
4. **Insights for Heather** — plain-language bullets computed from data
5. **Challenge Performance** — per-challenge cards with today/total/source/active
6. **Conversion Funnel** — visitors → signups → active → completed with rate
7. **Best Signup Hours** — bar chart by hour with peak highlighted
8. **Where People Are** — US state tile grid map + state/country lists
9. **Traffic Sources** — horizontal bar chart (Instagram pink, Facebook blue, etc.)
10. **Groups** — group cards with members and invite codes
11. **Signups** — searchable, sortable, paginated table with source/group/state columns
12. **Subscribers** — sortable, paginated with resubscribe/remove
13. **Upcoming Content** — queued blog posts with publish dates
14. **Launch Team** — members with social handles and "why" responses
15. **Contact Inquiries** — booking/contact submissions, speaking inquiries highlighted

### Date filter: Today / 7 Days / 30 Days
### Tables: 25 per page, sortable columns, CSV export, copy emails

### API endpoints used:
- `/api/challenge-admin` — signups, groups, contacts, content queue, page views,
  signup hours, countries, states, signup states
- `/api/stats` — traffic (visitors, views, daily, pages, referrers, countries)
- `/api/subscribers` — email subscriber management
- `/api/challenge-stats` — analytics (active, completed, checkins, streaks)
- `/api/download-leads` — guide downloads
- `/api/launch-team` — launch team members

## Deploy Commands

- **Pages:** `git push origin main` then `gh workflow run cloudflare-deploy.yml --ref main`
- **Worker:** `gh workflow run worker-deploy.yml --ref main`
- **D1 query:** `cd C:\Users\Heather && npx wrangler d1 execute blog-engagement --remote --command "SQL"`

## Deploy Gotchas

- Cloudflare Pages auto-deploy from GitHub is BROKEN. Always trigger manually.
- Worker changes need the separate workflow.
- The Edit tool has corrupted straight quotes into curly quotes in inline JS before.
  After editing dashboard JS, extract the script block and run `node --check` on it.
- `publish_queue.py` skips `schedule.json` in content-queue (was crashing on it).
- D1 crashes on `undefined` in .bind() — always use `|| ""` or `|| null` fallbacks.

## What's Done

- [x] Full website (home, about, books, speaking, blog, contact, projects, booking)
- [x] 60+ blog posts with MWF auto-publishing
- [x] 4 Bible challenges with signups, dashboards, daily emails, journals
- [x] "Do it with Friends" group system (create, join, invite, wall, streak, share card)
- [x] Facebook Meta Pixel with conversion events
- [x] HeatherLyn Dashboard (admin) with full analytics
- [x] Launch team signup page for Built to Shine
- [x] Source tracking (Instagram/Facebook/Direct/etc.)
- [x] State/region tracking with tile map
- [x] Contact form submissions tracked in admin
- [x] Content queue visible in admin

## What's Still To Do (priority order)

### 1. Book Launch Preparation
- [ ] Built to Shine book landing page with pre-order link
- [ ] Post-challenge email sequence leading to the book
- [ ] QR code generator for speaking events (trackable per-event URLs)

### 2. Site Polish
- [ ] Confirm which books sell direct vs Amazon
- [ ] YouTube URL for social links
- [ ] Consider killing old WordPress site (d9b.09a.myftpupload.com)

### 4. Future Features (when ready)
- [ ] Public groups (browse and join open groups for people without a friend circle)
- [ ] Server-side profile photos for group avatars (currently initials only)
- [ ] Email open/click rate tracking (Brevo API integration)
- [ ] Mobile vs desktop breakdown in admin (track user agent)
- [ ] Post-challenge follow-up email sequence

## Heather's Preferences (always follow)

- **Always deploy to main** after working on code
- **Separate code blocks per command** (don't combine multiple deploy commands in one box)
- **Call her Heather**
- **Plain sturdy writing**, no AI-sounding prose
- **Minimize em dashes** (avoid in prose, occasional use like subject lines is fine)
- **Honest estimates** over optimistic ones
- Heather is not a developer — explain things clearly, not in jargon
- **Prefer robust/scalable architecture** over simple/fast options
- **Auto-commit and push** changes to main without asking
